import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  FlatList,
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

type AutoTopupSettings = {
  enabled: boolean;
  threshold: number;
  topup_amount: number;
  currency: string | null;
  authorization_status: string | null;
  authorization_reference: string | null;
  authorization_active_at: string | null;
  last_attempt_status: string | null;
};

const defaultAutoTopupSettings: AutoTopupSettings = {
  enabled: false,
  threshold: 10000,
  topup_amount: 10000,
  currency: "NGN",
  authorization_status: "none",
  authorization_reference: null,
  authorization_active_at: null,
  last_attempt_status: null,
};

type AutoTopupAttempt = {
  id: string;
  reference: string;
  amount: number | string;
  currency: string | null;
  status: string | null;
  initiated_at: string | null;
  completed_at: string | null;
  error: string | null;
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const [autoTopupSettings, setAutoTopupSettings] =
    useState<AutoTopupSettings>(defaultAutoTopupSettings);
  const [autoTopupLoading, setAutoTopupLoading] = useState(false);
  const [autoTopupSaving, setAutoTopupSaving] = useState(false);
  const [autoTopupLinking, setAutoTopupLinking] = useState(false);
  const [autoTopupChecking, setAutoTopupChecking] = useState(false);
  const [autoTopupNotice, setAutoTopupNotice] = useState<string | null>(null);
  const [autoTopupError, setAutoTopupError] = useState<string | null>(null);
  const [autoTopupAttempts, setAutoTopupAttempts] = useState<AutoTopupAttempt[]>([]);
  const [autoTopupAttemptsLoading, setAutoTopupAttemptsLoading] = useState(false);
  const [autoTopupAttemptsError, setAutoTopupAttemptsError] = useState<string | null>(null);
  const autoTopupCheckInFlight = useRef(false);
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

  const loadAutoTopupSettings = useCallback(async () => {
    if (!user) return;
    setAutoTopupLoading(true);
    setAutoTopupError(null);

    const { data, error: settingsError } = await supabase
      .from("auto_topup_settings")
      .select(
        "enabled, threshold, topup_amount, currency, authorization_status, authorization_reference, authorization_active_at, last_attempt_status",
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (settingsError) {
      setAutoTopupError(settingsError.message ?? "Unable to load auto top-up settings.");
      setAutoTopupSettings(defaultAutoTopupSettings);
      setAutoTopupLoading(false);
      return;
    }

    if (!data) {
      setAutoTopupSettings(defaultAutoTopupSettings);
      setAutoTopupLoading(false);
      return;
    }

    setAutoTopupSettings({ ...defaultAutoTopupSettings, ...data });
    setAutoTopupLoading(false);
  }, [user]);

  const loadAutoTopupAttempts = useCallback(async () => {
    if (!user) return;
    setAutoTopupAttemptsLoading(true);
    setAutoTopupAttemptsError(null);

    const { data, error: attemptsError } = await supabase
      .from("auto_topup_attempts")
      .select("id, reference, amount, currency, status, initiated_at, completed_at, error")
      .eq("user_id", user.id)
      .order("initiated_at", { ascending: false })
      .limit(5);

    if (attemptsError) {
      setAutoTopupAttemptsError(attemptsError.message ?? "Unable to load auto top-up history.");
      setAutoTopupAttempts([]);
      setAutoTopupAttemptsLoading(false);
      return;
    }

    setAutoTopupAttempts((data ?? []) as AutoTopupAttempt[]);
    setAutoTopupAttemptsLoading(false);
  }, [user]);

  const saveAutoTopupSettings = useCallback(
    async (enabled: boolean) => {
      if (!user) return;
      setAutoTopupSaving(true);
      setAutoTopupError(null);
      setAutoTopupNotice(null);

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.access_token) {
        setAutoTopupError("Please sign in again.");
        setAutoTopupSaving(false);
        return;
      }

      const { data, error: saveError } = await supabase.rpc("upsert_auto_topup_settings", {
        p_enabled: enabled,
        p_threshold: 10000,
        p_topup_amount: 10000,
        p_currency: "NGN",
      });

      if (saveError) {
        setAutoTopupError(saveError.message ?? "Unable to save auto top-up settings.");
        setAutoTopupSaving(false);
        return;
      }

      if (data) {
        setAutoTopupSettings((current) => ({ ...current, ...data, enabled }));
      } else {
        await loadAutoTopupSettings();
      }

      setAutoTopupSaving(false);
    },
    [loadAutoTopupSettings, user],
  );

  const startDirectDebitLink = useCallback(async () => {
    if (!user) return;
    setAutoTopupLinking(true);
    setAutoTopupError(null);
    setAutoTopupNotice(null);

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.access_token) {
      setAutoTopupError("Please sign in again.");
      setAutoTopupLinking(false);
      return;
    }

    const redirectUrl = Linking.createURL("/wallet");
    const { data, error: initError } = await supabase.functions.invoke(
      "paystack-direct-debit-init",
      {
        body: { callbackUrl: redirectUrl },
        headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
      },
    );

    if (initError || !data?.redirectUrl) {
      setAutoTopupError(initError?.message ?? "Unable to start mandate setup.");
      setAutoTopupLinking(false);
      return;
    }

    if (Platform.OS === "web") {
      await Linking.openURL(data.redirectUrl);
    } else {
      await WebBrowser.openAuthSessionAsync(data.redirectUrl, redirectUrl);
    }

    setAutoTopupNotice("Mandate request sent. We'll update once your bank confirms.");
    await Promise.all([loadAutoTopupSettings(), loadAutoTopupAttempts()]);
    setAutoTopupLinking(false);
  }, [loadAutoTopupAttempts, loadAutoTopupSettings, user]);

  const runAutoTopupCheck = useCallback(async () => {
    if (!user || autoTopupCheckInFlight.current) return;
    autoTopupCheckInFlight.current = true;
    setAutoTopupChecking(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.access_token) {
        return;
      }

      const { data, error: checkError } = await supabase.functions.invoke("auto-topup-check", {
        headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
      });

      if (checkError) {
        return;
      }

      const status = String(data?.status ?? "");
      if (status === "initiated") {
        setAutoTopupNotice("Auto top-up requested. We'll update once it confirms.");
      } else if (status === "pending") {
        setAutoTopupNotice("Auto top-up is processing.");
      }

      await loadAutoTopupAttempts();
    } finally {
      autoTopupCheckInFlight.current = false;
      setAutoTopupChecking(false);
    }
  }, [loadAutoTopupAttempts, user]);


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

      const delays = [0, 3000, 5000, 8000, 13000, 21000];

      for (let attempt = 0; attempt < delays.length; attempt += 1) {
        if (delays[attempt] > 0) {
          await sleep(delays[attempt]);
        }

        const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
          "verify-paystack-transaction",
          {
            body: { reference },
            headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
          },
        );

        if (verifyError) {
          setError(verifyError.message ?? "Payment verification failed.");
          setLoading(false);
          return;
        }

        const status = String(verifyData?.status ?? "").toLowerCase();
        if (status === "success") {
          if (verifyData?.walletBalance !== null && verifyData?.walletBalance !== undefined) {
            const parsedBalance = Number(verifyData.walletBalance);
            setBalance((prev) => (Number.isNaN(parsedBalance) ? prev : parsedBalance));
          } else {
            await loadWallet();
          }

          await loadTransactions();
          await AsyncStorage.removeItem(pendingReferenceKey);
          setLoading(false);
          return;
        }

        if (["failed", "abandoned", "reversed"].includes(status)) {
          setError("Payment failed. Please try again.");
          setLoading(false);
          return;
        }
      }

      await AsyncStorage.setItem(pendingReferenceKey, reference);
      setError("Transfer is still pending. We'll update once it confirms.");
      setLoading(false);
    },
    [loadTransactions, loadWallet, user],
  );

  useEffect(() => {
    loadWallet();
    loadTransactions();
    loadAutoTopupSettings();
    loadAutoTopupAttempts();
    runAutoTopupCheck();
  }, [
    loadAutoTopupAttempts,
    loadAutoTopupSettings,
    loadTransactions,
    loadWallet,
    runAutoTopupCheck,
  ]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadWallet(), loadTransactions(), loadAutoTopupSettings(), loadAutoTopupAttempts()]);
    await runAutoTopupCheck();
    setRefreshing(false);
  }, [loadAutoTopupAttempts, loadAutoTopupSettings, loadTransactions, loadWallet, runAutoTopupCheck]);

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

  const renderTransactionItem = useCallback(
    ({ item }: { item: WalletTransaction }) => {
      const createdAt = item.created_at ? new Date(item.created_at) : null;
      const status = (item.status ?? "unknown").toUpperCase();
      const statusColor = status === "SUCCESS" ? Brand.green : status === "FAILED" ? Brand.red : Brand.muted;

      return (
        <View style={styles.transactionCard}>
          <View style={styles.transactionRow}>
            <Text style={styles.transactionAmount}>{renderAmount(item.amount, item.currency)}</Text>
            <Text style={[styles.transactionStatus, { color: statusColor }]}>{status}</Text>
          </View>
          <View style={styles.transactionRow}>
            <Text style={styles.transactionMeta}>
              {createdAt ? createdAt.toLocaleString() : "Date unavailable"}
            </Text>
            <Text style={styles.transactionMeta}>{(item.provider ?? "Paystack").toUpperCase()}</Text>
          </View>
          <Text style={styles.transactionRef}>Ref: {item.reference}</Text>
        </View>
      );
    },
    [renderAmount],
  );

  const autoTopupEnabled = autoTopupSettings.enabled;
  const autoTopupStatusLabel = useMemo(() => {
    if (!autoTopupEnabled) return "Disabled";
    switch (autoTopupSettings.authorization_status) {
      case "active":
        return "Bank linked";
      case "created":
        return "Awaiting activation";
      case "pending":
        return "Mandate pending";
      default:
        return "Not linked";
    }
  }, [autoTopupEnabled, autoTopupSettings.authorization_status]);

  const renderAutoTopupAttempt = useCallback(
    (item: AutoTopupAttempt) => {
      const initiatedAt = item.initiated_at ? new Date(item.initiated_at) : null;
      const status = (item.status ?? "unknown").toUpperCase();
      const statusColor =
        status === "SUCCESS" ? Brand.green : status === "FAILED" ? Brand.red : Brand.muted;

      return (
        <View key={item.id} style={styles.autoTopupAttemptCard}>
          <View style={styles.transactionRow}>
            <Text style={styles.transactionAmount}>{renderAmount(item.amount, item.currency)}</Text>
            <Text style={[styles.transactionStatus, { color: statusColor }]}>{status}</Text>
          </View>
          <Text style={styles.transactionMeta}>
            {initiatedAt ? initiatedAt.toLocaleString() : "Date unavailable"}
          </Text>
          <Text style={styles.transactionRef}>Ref: {item.reference}</Text>
          {item.error ? <Text style={styles.autoTopupErrorText}>{item.error}</Text> : null}
        </View>
      );
    },
    [renderAmount],
  );

  const listHeader = (
    <View>
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

      <View style={styles.autoTopupCard}>
        <Text style={styles.sectionTitle}>Auto top-up</Text>
        <Text style={styles.cardCopy}>
          Top up NGN 10,000 automatically when your balance is NGN 10,000 or below.
        </Text>

        <View style={styles.autoTopupRow}>
          <Text style={styles.cardLabel}>Status</Text>
          <Text style={styles.autoTopupStatus}>{autoTopupStatusLabel}</Text>
        </View>

        {autoTopupLoading ? <ActivityIndicator color={Brand.navy} /> : null}
        {autoTopupError ? <Text style={styles.errorText}>{autoTopupError}</Text> : null}
        {autoTopupNotice ? <Text style={styles.noticeText}>{autoTopupNotice}</Text> : null}

        <Pressable
          style={[styles.toggleBtn, autoTopupEnabled && styles.toggleBtnActive]}
          onPress={() => saveAutoTopupSettings(!autoTopupEnabled)}
          disabled={autoTopupSaving}
        >
          {autoTopupSaving ? (
            <ActivityIndicator color={autoTopupEnabled ? Brand.navy : Brand.card} />
          ) : (
            <Text style={[styles.toggleText, autoTopupEnabled && styles.toggleTextActive]}>
              {autoTopupEnabled ? "Disable auto top-up" : "Enable auto top-up"}
            </Text>
          )}
        </Pressable>

        {autoTopupEnabled && autoTopupSettings.authorization_status !== "active" ? (
          <Pressable style={styles.secondaryBtn} onPress={startDirectDebitLink} disabled={autoTopupLinking}>
            {autoTopupLinking ? (
              <ActivityIndicator color={Brand.navy} />
            ) : (
              <Text style={styles.secondaryText}>Link bank account</Text>
            )}
          </Pressable>
        ) : null}
      </View>

      <View style={styles.autoTopupHistory}>
        <Text style={styles.sectionTitle}>Auto top-up history</Text>
        {autoTopupAttemptsLoading ? <ActivityIndicator color={Brand.navy} /> : null}
        {autoTopupAttemptsError ? <Text style={styles.errorText}>{autoTopupAttemptsError}</Text> : null}
        {!autoTopupAttemptsLoading && autoTopupAttempts.length === 0 ? (
          <Text style={styles.emptyText}>No auto top-ups yet.</Text>
        ) : null}
        {!autoTopupAttemptsLoading
          ? autoTopupAttempts.map((item) => renderAutoTopupAttempt(item))
          : null}
      </View>

      <View style={styles.transactionsHeader}>
        <Text style={styles.sectionTitle}>Transaction history</Text>
        {transactionsLoading ? <ActivityIndicator color={Brand.navy} /> : null}
        {transactionsError ? <Text style={styles.errorText}>{transactionsError}</Text> : null}
      </View>
    </View>
  );

  const isEmpty = !transactionsLoading && !transactionsError && transactions.length === 0;

  return (
    <FlatList
      data={transactions}
      keyExtractor={(item) => item.id}
      renderItem={renderTransactionItem}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={isEmpty ? <Text style={styles.emptyText}>No transactions yet.</Text> : null}
      contentContainerStyle={[styles.listContent, { paddingTop: 16 }]}
      style={styles.list}
      showsVerticalScrollIndicator={false}
      refreshing={refreshing}
      onRefresh={onRefresh}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: Brand.background,
  },
  listContent: {
    padding: 24,
    paddingBottom: 48,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: Brand.navy,
    marginTop: 0,
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
  cardCopy: {
    color: Brand.muted,
    marginTop: 6,
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
  autoTopupCard: {
    marginTop: 24,
    backgroundColor: Brand.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Brand.border,
    gap: 10,
  },
  autoTopupHistory: {
    marginTop: 24,
    gap: 12,
  },
  autoTopupAttemptCard: {
    backgroundColor: Brand.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Brand.border,
    padding: 14,
    gap: 6,
  },
  autoTopupErrorText: {
    color: Brand.red,
    fontWeight: "600",
    fontSize: 12,
  },
  autoTopupRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  autoTopupStatus: {
    color: Brand.navy,
    fontWeight: "700",
  },
  toggleBtn: {
    backgroundColor: Brand.navy,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 6,
  },
  toggleBtnActive: {
    backgroundColor: Brand.card,
    borderWidth: 1,
    borderColor: Brand.navy,
  },
  toggleText: {
    color: Brand.card,
    fontWeight: "700",
  },
  toggleTextActive: {
    color: Brand.navy,
  },
  secondaryBtn: {
    backgroundColor: Brand.card,
    borderWidth: 1,
    borderColor: Brand.navy,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  secondaryText: {
    color: Brand.navy,
    fontWeight: "700",
  },
  errorText: {
    color: "#d15353",
    fontWeight: "600",
  },
  noticeText: {
    color: Brand.muted,
    fontWeight: "600",
  },
  transactionsHeader: {
    marginTop: 28,
    gap: 12,
    marginBottom: 12,
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
    marginBottom: 12,
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




