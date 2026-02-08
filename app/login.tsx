import { StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import { Link } from 'expo-router';

import { Brand } from '@/constants/brand';

export default function LoginScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome back</Text>
      <Text style={styles.subtitle}>Login to manage your bets and wallet.</Text>

      <View style={styles.form}>
        <TextInput placeholder="Phone number" placeholderTextColor={Brand.muted} style={styles.input} />
        <TextInput placeholder="Password" placeholderTextColor={Brand.muted} secureTextEntry style={styles.input} />
        <Pressable style={styles.primaryBtn}>
          <Text style={styles.primaryText}>Login</Text>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>New here?</Text>
        <Link href="/register" style={styles.linkText}>Create an account</Link>
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
