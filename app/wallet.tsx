import { useCallback, useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  ScrollView,
  RefreshControl,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Brand } from "@/constants/brand";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

const pendingReferenceKey = "paystack:pendingReference";

type WalletTransaction = {
  id: string;
  reference: string;
  amount: number | string;
  currency: string | null;
  status: string | null;
  provider: string | null;
  created_at: string | null;
};

const normalizeReference = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) return value[0];
  return value;
};

const extractReference = (url?: string | null) => {
  if (!url) return null;
  const parsed = Linking.parse(url);
  const reference = normalizeReference(parsed.queryParams?.reference ?? parsed.queryParams?.trxref);
  return reference ?? null;
};

const clearWebReference = () => {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("reference") && !url.searchParams.has("trxref")) return;
  url.searchParams.delete("reference");
  url.searchParams.delete("trxref");
  window.history.replaceState({}, "", url.toString());
};

export default function WalletScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [balance, setBalance] = useState(0);
  const [amount, setAmount] = useState("2000");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadWallet = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("wallets").select("balance").eq("user_id", user.id).single();
    const nextBalance = Number(data?.balance ?? 0);
    setBalance(Number.isNaN(nextBalance) ? 0 : nextBalance);
  }, [user]);

  const loadTransactions = useCallback(async () => {
    if (!user) return;
    setTransactionsLoading(true);
    setTransactionsError(null);

    const { data, error: txError } = await supabase
      .from("wallet_transactions")
      .select("id, reference, amount, currency, status, provider, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (txError) {
      setTransactionsError(txError.message ?? "Unable to load transactions.");
      setTransactions([]);
      setTransactionsLoading(false);
      return;
    }

    setTransactions((data ?? []) as WalletTransaction[]);
    setTransactionsLoading(false);
  }, [user]);

  const verifyReference = useCallback(
    async (reference: string) => {
      if (!user) return;
      setError(null);
      setLoading(true);

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.access_token) {
        setError("Please sign in again.");
        setLoading(false);
        return;
      }

      const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
        "verify-paystack-transaction",
        {
          body: { reference },
          headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
        },
      );

      if (verifyError || verifyData?.status !== "success") {
        setError(verifyError?.message ?? "Payment verification failed.");
        setLoading(false);
        return;
      }

      if (verifyData?.walletBalance !== null && verifyData?.walletBalance !== undefined) {
        const parsedBalance = Number(verifyData.walletBalance);
        setBalance((prev) => (Number.isNaN(parsedBalance) ? prev : parsedBalance));
      } else {
        await loadWallet();
      }

      await loadTransactions();
      setLoading(false);
    },
    [loadTransactions, loadWallet, user],
  );

  useEffect(() => {
    loadWallet();
    loadTransactions();
  }, [loadTransactions, loadWallet]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadWallet(), loadTransactions()]);
    setRefreshing(false);
  }, [loadTransactions, loadWallet]);

  useEffect(() => {
    if (!user) return;

    const checkPendingPayment = async () => {
      const initialUrl = await Linking.getInitialURL();
      const initialReference = extractReference(initialUrl);
      const storedReference = await AsyncStorage.getItem(pendingReferenceKey);
      const reference = initialReference ?? storedReference;

      if (reference) {
        await AsyncStorage.removeItem(pendingReferenceKey);
        clearWebReference();
        await verifyReference(reference);
      }
    };

    checkPendingPayment();

    const subscription = Linking.addEventListener("url", ({ url }) => {
      const reference = extractReference(url);
      if (!reference) return;
      AsyncStorage.removeItem(pendingReferenceKey).finally(() => {
        clearWebReference();
        verifyReference(reference);
      });
    });

    return () => {
      subscription.remove();
    };
  }, [user, verifyReference]);

  const handleTopUp = async () => {
    if (!user) return;
    setError(null);
    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.access_token) {
      setError("Please sign in again.");
      setLoading(false);
      return;
    }

    const amountValue = Math.max(0, Number(amount || 0));
    if (!amountValue) {
      setError("Enter a valid amount.");
      setLoading(false);
      return;
    }

    const redirectUrl = Linking.createURL("/wallet");

    const { data, error: functionError } = await supabase.functions.invoke("create-paystack-transaction", {
      body: {
        amount: Math.round(amountValue * 100),
        callbackUrl: redirectUrl,
      },
      headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
    });

    if (functionError || !data?.authorizationUrl || !data?.reference) {
      setError(functionError?.message ?? "Unable to start payment.");
      setLoading(false);
      return;
    }

    await AsyncStorage.setItem(pendingReferenceKey, data.reference);

    if (Platform.OS === "web") {
      await Linking.openURL(data.authorizationUrl);
      setLoading(false);
      return;
    }

    const result = await WebBrowser.openAuthSessionAsync(data.authorizationUrl, redirectUrl);
    if (result.type !== "success") {
      setError("Payment was cancelled.");
      setLoading(false);
      return;
    }

    await verifyReference(data.reference);
  };

  const renderAmount = useCallback((rawAmount: WalletTransaction["amount"], currency: string | null) => {
    const numericAmount = typeof rawAmount === "string" ? Number(rawAmount) : Number(rawAmount ?? 0);
    const safeAmount = Number.isNaN(numericAmount) ? 0 : numericAmount;
    const normalizedCurrency = (currency ?? "NGN").toUpperCase();
    if (normalizedCurrency === "NGN") {
      return `NGN ${safeAmount.toLocaleString()}`;
    }
    return `${normalizedCurrency} ${safeAmount.toLocaleString()}`;
  }, []);

  const transactionItems = useMemo(
    () =>
      transactions.map((tx) => {
        const createdAt = tx.created_at ? new Date(tx.created_at) : null;
        const status = (tx.status ?? "unknown").toUpperCase();
        const statusColor = status === "SUCCESS" ? Brand.green : status === "FAILED" ? Brand.red : Brand.muted;

        return (
          <View key={tx.id} style={styles.transactionCard}>
            <View style={styles.transactionRow}>
              <Text style={styles.transactionAmount}>{renderAmount(tx.amount, tx.currency)}</Text>
              <Text style={[styles.transactionStatus, { color: statusColor }]}>{status}</Text>
            </View>
            <View style={styles.transactionRow}>
              <Text style={styles.transactionMeta}>
                {createdAt ? createdAt.toLocaleString() : "Date unavailable"}
              </Text>
              <Text style={styles.transactionMeta}>{(tx.provider ?? "Paystack").toUpperCase()}</Text>
            </View>
            <Text style={styles.transactionRef}>Ref: {tx.reference}</Text>
          </View>
        );
      }),
    [renderAmount, transactions],
  );

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingTop: 24 + insets.top }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>Wallet</Text>
      <Text style={styles.subtitle}>Add funds to place bets instantly.</Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Current balance</Text>
        <Text style={styles.balanceText}>NGN {balance.toLocaleString()}</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.cardLabel}>Top up amount</Text>
        <TextInput
          placeholder="2000"
          placeholderTextColor={Brand.muted}
          keyboardType="number-pad"
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Pressable style={styles.primaryBtn} onPress={handleTopUp} disabled={loading}>
          {loading ? <ActivityIndicator color={Brand.card} /> : <Text style={styles.primaryText}>Pay with Paystack</Text>}
        </Pressable>
      </View>

      <View style={styles.transactions}>
        <Text style={styles.sectionTitle}>Transaction history</Text>
        {transactionsLoading ? <ActivityIndicator color={Brand.navy} /> : null}
        {transactionsError ? <Text style={styles.errorText}>{transactionsError}</Text> : null}
        {!transactionsLoading && !transactionsError && transactions.length === 0 ? (
          <Text style={styles.emptyText}>No transactions yet.</Text>
        ) : null}
        {!transactionsLoading && !transactionsError ? transactionItems : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.background,
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: Brand.navy,
    marginTop: 24,
  },
  subtitle: {
    color: Brand.muted,
    marginTop: 6,
    marginBottom: 24,
  },
  card: {
    backgroundColor: Brand.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  cardLabel: {
    color: Brand.muted,
    fontWeight: "600",
  },
  balanceText: {
    fontSize: 22,
    fontWeight: "800",
    color: Brand.navy,
    marginTop: 8,
  },
  form: {
    marginTop: 20,
    gap: 12,
  },
  input: {
    backgroundColor: Brand.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Brand.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Brand.text,
  },
  primaryBtn: {
    backgroundColor: Brand.navy,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryText: {
    color: Brand.card,
    fontWeight: "700",
  },
  errorText: {
    color: "#d15353",
    fontWeight: "600",
  },
  transactions: {
    marginTop: 28,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Brand.navy,
  },
  emptyText: {
    color: Brand.muted,
    fontWeight: "600",
  },
  transactionCard: {
    backgroundColor: Brand.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Brand.border,
    padding: 14,
    gap: 6,
  },
  transactionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: "800",
    color: Brand.navy,
  },
  transactionStatus: {
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 0.6,
  },
  transactionMeta: {
    color: Brand.muted,
    fontSize: 12,
  },
  transactionRef: {
    color: Brand.text,
    fontSize: 12,
  },
});

