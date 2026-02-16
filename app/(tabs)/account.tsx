import { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  TextInput,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Link, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';

import { Brand } from '@/constants/brand';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

export default function AccountScreen() {
  const router = useRouter();
  const { user, signOut, refreshMfaStatus } = useAuth();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [enrollData, setEnrollData] = useState<{
    id: string;
    uri: string;
    secret: string;
  } | null>(null);
  const [enrollCode, setEnrollCode] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: profile }, { data: wallet }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', user.id).single(),
      supabase.from('wallets').select('balance').eq('user_id', user.id).single(),
    ]);
    setProfileName(profile?.full_name ?? user.email ?? null);
    setWalletBalance(wallet?.balance ?? 0);
    setLoading(false);
  }, [user]);

  const loadMfa = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.auth.mfa.listFactors();
    setMfaEnabled(Boolean(data.totp?.length));
  }, [user]);

  useEffect(() => {
    loadProfile();
    loadMfa();
  }, [loadMfa, loadProfile]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadProfile(), loadMfa()]);
    setRefreshing(false);
  }, [loadMfa, loadProfile]);

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(tabs)');
  };

  const handleEnroll2fa = async () => {
    setEnrollError(null);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'AD5BET' });
    if (error) {
      setEnrollError(error.message);
      return;
    }
    if (!data?.totp?.uri || !data.id) {
      setEnrollError('Unable to start 2FA enrollment.');
      return;
    }
    setEnrollData({ id: data.id, uri: data.totp.uri, secret: data.totp.secret });
  };

  const handleVerify2fa = async () => {
    if (!enrollData) return;
    setEnrollError(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrollData.id,
      code: enrollCode,
    });
    if (error) {
      setEnrollError(error.message);
      return;
    }
    setEnrollData(null);
    setEnrollCode('');
    setMfaEnabled(true);
    await refreshMfaStatus();
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Text style={styles.title}>Account</Text>
        <MaterialIcons name="person" size={22} color={Brand.navy} />
      </View>

      {!user ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Welcome back</Text>
          <Text style={styles.cardCopy}>Login or create an account to manage your bets.</Text>
          <View style={styles.actions}>
            <Link href="/login" asChild>
              <Pressable style={styles.primaryBtn}>
                <Text style={styles.primaryText}>Login</Text>
              </Pressable>
            </Link>
            <Link href="/register" asChild>
              <Pressable style={styles.secondaryBtn}>
                <Text style={styles.secondaryText}>Register</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{profileName ?? 'Welcome'}</Text>
          <Text style={styles.cardCopy}>Wallet balance</Text>
          <Text style={styles.balanceText}>₦{walletBalance.toLocaleString()}</Text>
          {loading ? <ActivityIndicator color={Brand.navy} /> : null}
          <View style={styles.actions}>
            <Link href="/wallet" asChild>
              <Pressable style={styles.primaryBtn}>
                <Text style={styles.primaryText}>Top up</Text>
              </Pressable>
            </Link>
            <Pressable style={styles.secondaryBtn} onPress={() => router.push('/withdraw')}>
              <Text style={styles.secondaryText}>Withdraw</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={handleSignOut}>
              <Text style={styles.secondaryText}>Sign out</Text>
            </Pressable>
          </View>
        </View>
      )}

      {user ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Security</Text>
          <Text style={styles.cardCopy}>
            Two-factor authentication is {mfaEnabled ? 'enabled' : 'not enabled'}.
          </Text>
          {mfaEnabled ? (
            <View style={styles.statusRow}>
              <MaterialIcons name="verified" size={18} color={Brand.green} />
              <Text style={styles.statusText}>2FA Enabled</Text>
            </View>
          ) : (
            <Pressable style={styles.primaryBtn} onPress={handleEnroll2fa}>
              <Text style={styles.primaryText}>Enable 2FA</Text>
            </Pressable>
          )}

          {enrollData ? (
            <View style={styles.enrollBox}>
              <Text style={styles.cardCopy}>Scan the QR code in your authenticator app.</Text>
              <View style={styles.qrWrap}>
                <QRCode value={enrollData.uri} size={160} />
              </View>
              <Text style={styles.secretText}>Secret: {enrollData.secret}</Text>
              <TextInput
                placeholder="Enter 6-digit code"
                placeholderTextColor={Brand.muted}
                style={styles.input}
                keyboardType="number-pad"
                maxLength={6}
                value={enrollCode}
                onChangeText={setEnrollCode}
              />
              {enrollError ? <Text style={styles.errorText}>{enrollError}</Text> : null}
              <Pressable style={styles.primaryBtn} onPress={handleVerify2fa}>
                <Text style={styles.primaryText}>Verify 2FA</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.menu}>
        {[
          { label: 'My Bets', href: '/(tabs)/betslip' },
          { label: 'Wallet', href: '/wallet' },
          { label: 'Promotions', href: '/modal' },
          { label: 'Help Center', href: '/modal' },
        ].map((item) => (
          <Link key={item.label} href={item.href} asChild>
            <Pressable style={styles.menuItem}>
              <Text style={styles.menuText}>{item.label}</Text>
              <MaterialIcons name="chevron-right" size={20} color={Brand.muted} />
            </Pressable>
          </Link>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.background,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: Brand.navy,
  },
  card: {
    backgroundColor: Brand.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Brand.border,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Brand.text,
  },
  cardCopy: {
    color: Brand.muted,
    marginTop: 6,
  },
  balanceText: {
    fontSize: 20,
    fontWeight: '800',
    color: Brand.navy,
    marginTop: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  primaryBtn: {
    backgroundColor: Brand.navy,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  primaryText: {
    color: Brand.card,
    fontWeight: '700',
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: Brand.navy,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  secondaryText: {
    color: Brand.navy,
    fontWeight: '700',
  },
  menu: {
    backgroundColor: Brand.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Brand.border,
    marginTop: 16,
  },
  menuItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Brand.border,
  },
  menuText: {
    color: Brand.text,
    fontWeight: '600',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  statusText: {
    color: Brand.text,
    fontWeight: '600',
  },
  enrollBox: {
    marginTop: 16,
    gap: 12,
  },
  qrWrap: {
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: Brand.background,
    borderRadius: 12,
  },
  secretText: {
    color: Brand.muted,
    fontSize: 12,
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
  errorText: {
    color: '#d15353',
    fontWeight: '600',
  },
});
