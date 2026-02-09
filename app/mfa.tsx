import { useState } from "react";
import { StyleSheet, Text, TextInput, View, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";

import { Brand } from "@/constants/brand";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

export default function MfaScreen() {
  const router = useRouter();
  const { refreshMfaStatus } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    setError(null);
    setLoading(true);
    const { data, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) {
      setError(listError.message);
      setLoading(false);
      return;
    }

    const factor = data.totp?.[0];
    if (!factor) {
      setError("No 2FA method found for this account.");
      setLoading(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code,
    });

    if (verifyError) {
      setError(verifyError.message);
      setLoading(false);
      return;
    }

    await refreshMfaStatus();
    setLoading(false);
    router.replace("/(tabs)");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Two-Factor Verification</Text>
      <Text style={styles.subtitle}>Enter the 6-digit code from your authenticator app.</Text>

      <View style={styles.form}>
        <TextInput
          placeholder="123456"
          placeholderTextColor={Brand.muted}
          style={styles.input}
          keyboardType="number-pad"
          value={code}
          onChangeText={setCode}
          maxLength={6}
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Pressable style={styles.primaryBtn} onPress={handleVerify} disabled={loading}>
          {loading ? <ActivityIndicator color={Brand.card} /> : <Text style={styles.primaryText}>Verify</Text>}
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
  form: {
    gap: 14,
  },
  input: {
    backgroundColor: Brand.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Brand.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Brand.text,
    letterSpacing: 4,
    fontWeight: "700",
    textAlign: "center",
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
