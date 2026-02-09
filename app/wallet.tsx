import { useEffect, useState } from "react";
import { StyleSheet, Text, View, TextInput, Pressable, ActivityIndicator } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";

import { Brand } from "@/constants/brand";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

export default function WalletScreen() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [amount, setAmount] = useState("2000");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadWallet = async () => {
      if (!user) return;
      const { data } = await supabase.from("wallets").select("balance").eq("user_id", user.id).single();
      setBalance(data?.balance ?? 0);
    };
    loadWallet();
  }, [user]);

  const handleTopUp = async () => {
    if (!user) return;
    setError(null);
    setLoading(true);

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
        email: user.email,
        metadata: { userId: user.id },
        callbackUrl: redirectUrl,
      },
    });

    if (functionError || !data?.authorizationUrl || !data?.reference) {
      setError(functionError?.message ?? "Unable to start payment.");
      setLoading(false);
      return;
    }

    const result = await WebBrowser.openAuthSessionAsync(data.authorizationUrl, redirectUrl);
    if (result.type !== "success") {
      setError("Payment was cancelled.");
      setLoading(false);
      return;
    }

    const { data: verifyData, error: verifyError } = await supabase.functions.invoke("verify-paystack-transaction", {
      body: { reference: data.reference },
    });

    if (verifyError || verifyData?.status !== "success") {
      setError(verifyError?.message ?? "Payment verification failed.");
      setLoading(false);
      return;
    }

    const nextBalance = balance + amountValue;
    await supabase.from("wallets").upsert({ user_id: user.id, balance: nextBalance }, { onConflict: "user_id" });
    setBalance(nextBalance);
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Wallet</Text>
      <Text style={styles.subtitle}>Add funds to place bets instantly.</Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Current balance</Text>
        <Text style={styles.balanceText}>₦{balance.toLocaleString()}</Text>
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
});
