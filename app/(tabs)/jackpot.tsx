import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Brand } from '@/constants/brand';

const jackpots = [
  { title: 'Daily Jackpot', prize: '₦30,000,000', picks: 12, time: 'Closes 19:00' },
  { title: 'Weekend Jackpot', prize: '₦75,000,000', picks: 15, time: 'Closes Sun 12:00' },
  { title: 'Mega Jackpot', prize: '₦200,000,000', picks: 18, time: 'Closes Fri 18:00' },
];

export default function JackpotScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: 16 + insets.top }]}>
        <Text style={styles.title}>Jackpot</Text>
        <MaterialIcons name="emoji-events" size={22} color={Brand.navy} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.banner}>
          <Text style={styles.bannerLabel}>Top Prize</Text>
          <Text style={styles.bannerPrize}>₦200,000,000</Text>
          <Text style={styles.bannerCopy}>Pick 18 matches to win the mega jackpot.</Text>
        </View>
        {jackpots.map((jackpot) => (
          <View key={jackpot.title} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{jackpot.title}</Text>
              <Text style={styles.cardTime}>{jackpot.time}</Text>
            </View>
            <Text style={styles.cardPrize}>{jackpot.prize}</Text>
            <View style={styles.metaRow}>
              <View style={styles.metaPill}>
                <MaterialIcons name="checklist" size={14} color={Brand.navy} />
                <Text style={styles.metaText}>{jackpot.picks} Picks</Text>
              </View>
              <View style={styles.metaPill}>
                <MaterialIcons name="groups" size={14} color={Brand.navy} />
                <Text style={styles.metaText}>10k Winners</Text>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.background,
  },
  header: {
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: Brand.card,
    borderBottomColor: Brand.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: Brand.navy,
  },
  content: {
    padding: 20,
  },
  banner: {
    backgroundColor: Brand.navy,
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
  },
  bannerLabel: {
    color: Brand.gold,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 12,
  },
  bannerPrize: {
    color: Brand.card,
    fontSize: 22,
    fontWeight: '800',
    marginTop: 8,
  },
  bannerCopy: {
    color: '#d7e2f0',
    marginTop: 6,
  },
  card: {
    backgroundColor: Brand.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardTitle: {
    fontWeight: '700',
    color: Brand.text,
  },
  cardTime: {
    color: Brand.muted,
    fontSize: 12,
  },
  cardPrize: {
    fontSize: 18,
    fontWeight: '800',
    color: Brand.navy,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  metaPill: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: Brand.background,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  metaText: {
    fontSize: 12,
    color: Brand.navy,
    fontWeight: '600',
  },
});
