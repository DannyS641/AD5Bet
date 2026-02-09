import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Brand } from "@/constants/brand";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

export default function WithdrawScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [balance, setBalance] = useState(0);
  const [amount, setAmount] = useState("1000");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      router.replace("/login");
      return;
    }
    let mounted = true;
    const loadWallet = async () => {
      const { data } = await supabase.from("wallets").select("balance").eq("user_id", user.id).single();
      if (!mounted) return;
      setBalance(data?.balance ?? 0);
    };
    loadWallet();
    return () => {
      mounted = false;
    };
  }, [user, router]);

  const handleWithdraw = async () => {
    if (!user) return;
    setError(null);
    setSuccess(null);

    const amountValue = Math.max(0, Number(amount || 0));
    if (!amountValue) {
      setError("Enter a valid amount.");
      return;
    }
    if (amountValue > balance) {
      setError("Insufficient wallet balance.");
      return;
    }
    if (!accountName.trim() || !accountNumber.trim() || !bankName.trim()) {
      setError("Enter bank name, account name, and account number.");
      return;
    }

    setLoading(true);
    const nextBalance = balance - amountValue;
    const { error: updateError } = await supabase
      .from("wallets")
      .upsert({ user_id: user.id, balance: nextBalance }, { onConflict: "user_id" });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    setBalance(nextBalance);
    setAmount("");
    setSuccess("Withdrawal request submitted. (Test simulation)");
    setLoading(false);
  };

  return (
    <View style={[styles.container, { paddingTop: 24 + insets.top }]}>
      <Text style={styles.title}>Withdraw</Text>
      <Text style={styles.subtitle}>Send funds to your bank account.</Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Available balance</Text>
        <Text style={styles.balanceText}>₦{balance.toLocaleString()}</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.cardLabel}>Bank name</Text>
        <TextInput
          placeholder="Bank name"
          placeholderTextColor={Brand.muted}
          style={styles.input}
          value={bankName}
          onChangeText={setBankName}
        />
        <Text style={styles.cardLabel}>Account name</Text>
        <TextInput
          placeholder="Account name"
          placeholderTextColor={Brand.muted}
          style={styles.input}
          value={accountName}
          onChangeText={setAccountName}
        />
        <Text style={styles.cardLabel}>Account number</Text>
        <TextInput
          placeholder="0123456789"
          placeholderTextColor={Brand.muted}
          keyboardType="number-pad"
          style={styles.input}
          value={accountNumber}
          onChangeText={setAccountNumber}
          maxLength={12}
        />
        <Text style={styles.cardLabel}>Withdraw amount</Text>
        <TextInput
          placeholder="1000"
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
    </View>
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
});
