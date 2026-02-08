import { StyleSheet, Text, View, Pressable } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Link } from 'expo-router';

import { Brand } from '@/constants/brand';

export default function AccountScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Account</Text>
        <MaterialIcons name="person" size={22} color={Brand.navy} />
      </View>

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

      <View style={styles.menu}>
        {['My Bets', 'Wallet', 'Promotions', 'Help Center'].map((item) => (
          <View key={item} style={styles.menuItem}>
            <Text style={styles.menuText}>{item}</Text>
            <MaterialIcons name="chevron-right" size={20} color={Brand.muted} />
          </View>
        ))}
      </View>
    </View>
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
});
