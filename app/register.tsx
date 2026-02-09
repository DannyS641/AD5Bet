import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, Pressable, ActivityIndicator } from 'react-native';
import { Link, useRouter } from 'expo-router';

import { Brand } from '@/constants/brand';
import { useAuth } from '@/context/AuthContext';

export default function RegisterScreen() {
  const router = useRouter();
  const { signUpWithPassword } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    setError(null);
    setLoading(true);
    const errorMessage = await signUpWithPassword(email.trim(), password, fullName.trim());
    setLoading(false);
    if (errorMessage) {
      setError(errorMessage);
      return;
    }
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create account</Text>
      <Text style={styles.subtitle}>Join AD5BET to access live odds and jackpots.</Text>

      <View style={styles.form}>
        <TextInput
          placeholder="Full name"
          placeholderTextColor={Brand.muted}
          style={styles.input}
          value={fullName}
          onChangeText={setFullName}
        />
        <TextInput
          placeholder="Email address"
          placeholderTextColor={Brand.muted}
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          placeholder="Password"
          placeholderTextColor={Brand.muted}
          secureTextEntry
          style={styles.input}
          value={password}
          onChangeText={setPassword}
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Pressable style={styles.primaryBtn} onPress={handleRegister} disabled={loading}>
          {loading ? <ActivityIndicator color={Brand.card} /> : <Text style={styles.primaryText}>Register</Text>}
        </Pressable>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account?</Text>
        <Link href="/login" style={styles.linkText}>Login</Link>
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
    fontWeight: '800',
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
  },
  primaryBtn: {
    backgroundColor: Brand.navy,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryText: {
    color: Brand.card,
    fontWeight: '700',
  },
  errorText: {
    color: '#d15353',
    fontWeight: '600',
  },
  footer: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 6,
  },
  footerText: {
    color: Brand.muted,
  },
  linkText: {
    color: Brand.navy,
    fontWeight: '600',
  },
});
