import { ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Brand } from '@/constants/brand';

const liveMatches = [
  { league: 'Premier League', minute: "12'", home: 'Everton', away: 'Newcastle', score: '0 - 0' },
  { league: 'La Liga', minute: "44'", home: 'Real Madrid', away: 'Valencia', score: '1 - 0' },
  { league: 'Ligue 1', minute: "58'", home: 'Lyon', away: 'Marseille', score: '2 - 2' },
];

export default function LiveScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Live Matches</Text>
        <View style={styles.pill}>
          <MaterialIcons name="circle" size={10} color={Brand.green} />
          <Text style={styles.pillText}>Live</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {liveMatches.map((match) => (
          <View key={match.home} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.league}>{match.league}</Text>
              <Text style={styles.minute}>{match.minute}</Text>
            </View>
            <Text style={styles.teams}>{match.home} {match.score} {match.away}</Text>
            <View style={styles.actionRow}>
              <View style={styles.actionPill}>
                <Text style={styles.actionText}>1</Text>
              </View>
              <View style={styles.actionPill}>
                <Text style={styles.actionText}>X</Text>
              </View>
              <View style={styles.actionPill}>
                <Text style={styles.actionText}>2</Text>
              </View>
              <View style={[styles.actionPill, styles.actionMore]}>
                <Text style={[styles.actionText, styles.actionTextInverse]}>+ 48</Text>
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
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#eef7f0',
  },
  pillText: {
    color: Brand.green,
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  league: {
    color: Brand.muted,
    fontWeight: '600',
    fontSize: 12,
  },
  minute: {
    color: Brand.muted,
    fontSize: 12,
  },
  teams: {
    fontSize: 15,
    fontWeight: '700',
    color: Brand.text,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  actionPill: {
    backgroundColor: Brand.background,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  actionMore: {
    backgroundColor: Brand.navy,
    borderColor: Brand.navy,
  },
  actionText: {
    color: Brand.navy,
    fontWeight: '700',
    fontSize: 12,
  },
  actionTextInverse: {
    color: Brand.card,
  },
});
