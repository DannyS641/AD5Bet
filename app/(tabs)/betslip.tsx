import { ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Brand } from '@/constants/brand';

const selections = [
  { match: 'Arsenal vs Chelsea', pick: 'Arsenal', odd: '1.88' },
  { match: 'Barcelona vs Sevilla', pick: 'Over 2.5', odd: '1.72' },
  { match: 'Milan vs Napoli', pick: 'Both Teams Score', odd: '1.64' },
];

export default function BetSlipScreen() {
  const totalOdds = selections.reduce((sum, item) => sum * Number(item.odd), 1).toFixed(2);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Bet Slip</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{selections.length}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {selections.map((selection) => (
          <View key={selection.match} style={styles.card}>
            <Text style={styles.match}>{selection.match}</Text>
            <View style={styles.cardRow}>
              <Text style={styles.pick}>{selection.pick}</Text>
              <Text style={styles.odd}>{selection.odd}</Text>
            </View>
          </View>
        ))}

        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Odds</Text>
            <Text style={styles.summaryValue}>{totalOdds}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Stake</Text>
            <Text style={styles.summaryValue}>₦1,000</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Potential Win</Text>
            <Text style={styles.summaryWin}>₦{(Number(totalOdds) * 1000).toLocaleString()}</Text>
          </View>
          <View style={styles.placeBet}>
            <MaterialIcons name="lock" size={16} color={Brand.card} />
            <Text style={styles.placeBetText}>Login to place bet</Text>
          </View>
        </View>
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
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Brand.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: Brand.card,
    fontWeight: '700',
    fontSize: 12,
  },
  content: {
    padding: 20,
  },
  card: {
    backgroundColor: Brand.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  match: {
    fontSize: 14,
    fontWeight: '700',
    color: Brand.text,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  pick: {
    color: Brand.muted,
  },
  odd: {
    color: Brand.navy,
    fontWeight: '700',
  },
  summary: {
    backgroundColor: Brand.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  summaryLabel: {
    color: Brand.muted,
  },
  summaryValue: {
    color: Brand.text,
    fontWeight: '600',
  },
  summaryWin: {
    color: Brand.navy,
    fontWeight: '800',
  },
  placeBet: {
    marginTop: 10,
    backgroundColor: Brand.navy,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  placeBetText: {
    color: Brand.card,
    fontWeight: '700',
  },
});
