import { useCallback, useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Brand } from "@/constants/brand";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

type Bank = {
  name: string;
  code: string;
};

type WithdrawalRequest = {
  id: string;
  amount: number;
  status: string | null;
  bank_name: string;
  account_name: string;
  account_number: string;
  created_at: string | null;
};

export default function WithdrawScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [balance, setBalance] = useState(0);
  const [amount, setAmount] = useState("100");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankSearch, setBankSearch] = useState("");
  const [bankListOpen, setBankListOpen] = useState(false);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankError, setBankError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [history, setHistory] = useState<WithdrawalRequest[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadWallet = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("wallets").select("balance").eq("user_id", user.id).single();
    setBalance(data?.balance ?? 0);
  }, [user]);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
    setProfileName(data?.full_name ?? user.email ?? "");
  }, [user]);

  const loadBanks = useCallback(async () => {
    setBankLoading(true);
    setBankError(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setBankError("Please sign in again.");
      setBanks([]);
      setBankLoading(false);
      return;
    }
    const { data, error: bankError } = await supabase.functions.invoke("paystack-banks", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (bankError || !data?.banks) {
      setBankError(bankError?.message ?? "Unable to load banks.");
      setBanks([]);
    } else {
      setBanks(data.banks);
    }
    setBankLoading(false);
  }, []);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    setHistoryLoading(true);
    const { data, error: historyError } = await supabase
      .from("withdrawal_requests")
      .select("id, amount, status, bank_name, account_name, account_number, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (historyError) {
      setHistory([]);
      setHistoryLoading(false);
      return;
    }
    setHistory((data ?? []) as WithdrawalRequest[]);
    setHistoryLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadWallet();
    loadProfile();
    loadBanks();
    loadHistory();
  }, [loadBanks, loadHistory, loadProfile, loadWallet, user]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadWallet(), loadHistory(), loadProfile()]);
    setRefreshing(false);
  }, [loadHistory, loadProfile, loadWallet]);

  const filteredBanks = useMemo(() => {
    if (!bankSearch.trim()) return banks;
    const term = bankSearch.trim().toLowerCase();
    return banks.filter((bank) => bank.name.toLowerCase().includes(term));
  }, [bankSearch, banks]);

  const resolveAccountName = useCallback(async () => {
    if (!selectedBank || accountNumber.length !== 10) return;
    setResolving(true);
    setError(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setAccountName("");
      setError("Please sign in again.");
      setResolving(false);
      return;
    }
    const { data, error: resolveError } = await supabase.functions.invoke("resolve-bank-account", {
      body: { accountNumber, bankCode: selectedBank.code },
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resolveError || !data?.accountName) {
      setAccountName("");
      setError(resolveError?.message ?? "Unable to resolve account name.");
    } else {
      setAccountName(data.accountName);
    }
    setResolving(false);
  }, [accountNumber, selectedBank]);

  useEffect(() => {
    if (accountNumber.length === 10 && selectedBank) {
      resolveAccountName();
    } else {
      setAccountName("");
    }
  }, [accountNumber, resolveAccountName, selectedBank]);

  const handleWithdraw = async () => {
    if (!user) return;
    setError(null);
    setSuccess(null);

    const amountValue = Math.max(0, Number(amount || 0));
    if (!amountValue || amountValue < 100) {
      setError("Minimum withdrawal is NGN 100.");
      return;
    }
    if (amountValue > balance) {
      setError("Insufficient wallet balance.");
      return;
    }
    if (!selectedBank || !accountNumber.trim()) {
      setError("Select a bank and enter your account number.");
      return;
    }
    if (!accountName.trim()) {
      setError("Account name could not be resolved.");
      return;
    }
    if (!profileName.trim()) {
      setError("Profile name is missing. Update your profile.");
      return;
    }
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normalize(profileName) !== normalize(accountName)) {
      setError("Account name must match your profile name.");
      return;
    }

    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.access_token) {
      setError("Please sign in again.");
      setLoading(false);
      return;
    }

    const { data: withdrawData, error: withdrawError } = await supabase.functions.invoke(
      "create-withdrawal-request",
      {
        body: {
          amount: amountValue,
          bankCode: selectedBank.code,
          bankName: selectedBank.name,
          accountNumber,
        },
        headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
      },
    );

    if (withdrawError) {
      setError(withdrawError.message ?? "Withdrawal failed.");
      setLoading(false);
      return;
    }

    if (withdrawData?.balance !== null && withdrawData?.balance !== undefined) {
      setBalance(Number(withdrawData.balance));
    } else {
      await loadWallet();
    }

    await loadHistory();
    setAmount("100");
    setSuccess("Withdrawal request submitted.");
    setLoading(false);
  };

  if (!user) {
    return (
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: 16 + insets.top }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Withdraw</Text>
        <Text style={styles.subtitle}>Send funds to your bank account.</Text>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Login required</Text>
          <Text style={styles.cardCopy}>Please login to withdraw funds.</Text>
          <Link href="/login" asChild>
            <Pressable style={styles.primaryBtn}>
              <Text style={styles.primaryText}>Login</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.container, { paddingTop: 16 + insets.top }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>Withdraw</Text>
      <Text style={styles.subtitle}>Send funds to your bank account.</Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Available balance</Text>
        <Text style={styles.balanceText}>₦{balance.toLocaleString()}</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.cardLabel}>Select bank</Text>
        <Pressable
          style={styles.selectInput}
          onPress={() => setBankListOpen((prev) => !prev)}
          disabled={bankLoading}
        >
          <Text style={styles.selectText}>
            {selectedBank ? selectedBank.name : bankLoading ? "Loading banks..." : "Choose bank"}
          </Text>
          <MaterialIcons name="keyboard-arrow-down" size={20} color={Brand.muted} />
        </Pressable>
        {bankError ? <Text style={styles.errorText}>{bankError}</Text> : null}
        {bankListOpen ? (
          <View style={styles.bankList}>
            <TextInput
              placeholder="Search bank"
              placeholderTextColor={Brand.muted}
              style={styles.input}
              value={bankSearch}
              onChangeText={setBankSearch}
            />
            <ScrollView style={styles.bankScroll}>
              {filteredBanks.map((bank, index) => (
                <Pressable
                  key={`${bank.code}-${bank.name}-${index}`}
                  style={styles.bankItem}
                  onPress={() => {
                    setSelectedBank(bank);
                    setBankListOpen(false);
                  }}
                >
                  <Text style={styles.bankItemText}>{bank.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <Text style={styles.cardLabel}>Account number</Text>
        <TextInput
          placeholder="0123456789"
          placeholderTextColor={Brand.muted}
          keyboardType="number-pad"
          style={styles.input}
          value={accountNumber}
          onChangeText={(value) => setAccountNumber(value.replace(/[^0-9]/g, "").slice(0, 10))}
          maxLength={10}
        />

        <Text style={styles.cardLabel}>Account name</Text>
        <View style={styles.readonlyInput}>
          <Text style={styles.readonlyText}>
            {resolving ? "Resolving..." : accountName || "Account name will appear here"}
          </Text>
        </View>

        <Text style={styles.cardLabel}>Withdraw amount (min NGN 100)</Text>
        <TextInput
          placeholder="100"
          placeholderTextColor={Brand.muted}
          keyboardType="number-pad"
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {success ? <Text style={styles.successText}>{success}</Text> : null}
        <Pressable style={styles.primaryBtn} onPress={handleWithdraw} disabled={loading}>
          {loading ? <ActivityIndicator color={Brand.card} /> : <Text style={styles.primaryText}>Withdraw</Text>}
        </Pressable>
      </View>

      <View style={styles.history}>
        <Text style={styles.sectionTitle}>Withdrawal history</Text>
        {historyLoading ? <ActivityIndicator color={Brand.navy} /> : null}
        {!historyLoading && history.length === 0 ? (
          <Text style={styles.emptyText}>No withdrawals yet.</Text>
        ) : null}
        {!historyLoading
          ? history.map((item) => (
              <View key={item.id} style={styles.historyCard}>
                <View style={styles.historyRow}>
                  <Text style={styles.historyAmount}>
                    {"\u20A6"}
                    {Number(item.amount ?? 0).toLocaleString()}
                  </Text>
                  <Text style={styles.historyStatus}>{(item.status ?? "pending").toUpperCase()}</Text>
                </View>
                <Text style={styles.historyMeta}>
                  {item.bank_name} | {item.account_number}
                </Text>
                <Text style={styles.historyMeta}>{item.account_name}</Text>
                <Text style={styles.historyMeta}>
                  {item.created_at ? new Date(item.created_at).toLocaleString() : "Date unavailable"}
                </Text>
              </View>
            ))
          : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Brand.background,
  },
  container: {
    padding: 24,
    paddingBottom: 40,
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
  cardCopy: {
    color: Brand.muted,
    marginTop: 6,
  },
  cardLabel: {
    color: Brand.muted,
    fontWeight: "600",
    marginTop: 8,
  },
  balanceText: {
    fontSize: 22,
    fontWeight: "800",
    color: Brand.navy,
    marginTop: 8,
  },
  form: {
    marginTop: 20,
    gap: 10,
  },
  selectInput: {
    backgroundColor: Brand.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Brand.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Brand.text,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectText: {
    color: Brand.text,
    fontWeight: "600",
  },
  bankList: {
    backgroundColor: Brand.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Brand.border,
    padding: 12,
    gap: 10,
  },
  bankScroll: {
    maxHeight: 200,
  },
  bankItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Brand.border,
  },
  bankItemText: {
    color: Brand.text,
    fontWeight: "600",
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
  readonlyInput: {
    backgroundColor: Brand.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Brand.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  readonlyText: {
    color: Brand.muted,
    fontWeight: "600",
  },
  primaryBtn: {
    backgroundColor: Brand.navy,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 6,
  },
  primaryText: {
    color: Brand.card,
    fontWeight: "700",
  },
  errorText: {
    color: "#d15353",
    fontWeight: "600",
  },
  successText: {
    color: Brand.green,
    fontWeight: "600",
  },
  history: {
    marginTop: 24,
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
  historyCard: {
    backgroundColor: Brand.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Brand.border,
    padding: 14,
    gap: 6,
  },
  historyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  historyAmount: {
    fontSize: 16,
    fontWeight: "800",
    color: Brand.navy,
  },
  historyStatus: {
    color: Brand.muted,
    fontWeight: "700",
    fontSize: 12,
  },
  historyMeta: {
    color: Brand.muted,
    fontSize: 12,
  },
});
