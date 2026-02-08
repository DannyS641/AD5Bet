import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { Brand } from '@/constants/brand';
import { Link } from 'expo-router';

const quickPicks = ['1X2', 'O/U 2.5', 'GG/NG', 'Handicap', '1st Half', 'Corners'];

const featuredMatches = [
  {
    league: 'Premier League',
    time: 'Today 18:30',
    home: 'Arsenal',
    away: 'Chelsea',
    odds: ['1.88', '3.55', '4.20'],
  },
  {
    league: 'La Liga',
    time: 'Today 20:00',
    home: 'Barcelona',
    away: 'Sevilla',
    odds: ['1.52', '4.10', '6.30'],
  },
  {
    league: 'Serie A',
    time: 'Tomorrow 17:00',
    home: 'Milan',
    away: 'Napoli',
    odds: ['2.20', '3.20', '3.40'],
  },
];

const liveMatches = [
  { league: 'UCL', minute: "63'", home: 'PSG', away: 'Inter', score: '1 - 1', odds: ['2.10', '2.60', '3.80'] },
  { league: 'Bundesliga', minute: "78'", home: 'Dortmund', away: 'Leverkusen', score: '2 - 0', odds: ['1.60', '3.80', '5.20'] },
];

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.brand}>AD5BET</Text>
          <Text style={styles.subtle}>Fast bets. Smart picks.</Text>
        </View>
        <View style={styles.topActions}>
          <Link href="/login" asChild>
            <Pressable style={styles.loginBtn}>
              <Text style={styles.loginText}>Login</Text>
            </Pressable>
          </Link>
          <Link href="/register" asChild>
            <Pressable style={styles.registerBtn}>
              <Text style={styles.registerText}>Register</Text>
            </Pressable>
          </Link>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroLeft}>
            <Text style={styles.heroLabel}>Today’s Boost</Text>
            <Text style={styles.heroTitle}>Super Sunday Combo</Text>
            <Text style={styles.heroCopy}>Stake ₦500 and win up to ₦120,000 with boosted odds.</Text>
            <Pressable style={styles.ctaBtn}>
              <Text style={styles.ctaText}>Join Now</Text>
              <MaterialIcons name="chevron-right" size={20} color={Brand.card} />
            </Pressable>
          </View>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeTop}>+12%</Text>
            <Text style={styles.heroBadgeBottom}>Boost</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Quick Picks</Text>
          <Text style={styles.sectionAction}>See all</Text>
        </View>
        <View style={styles.quickRow}>
          {quickPicks.map((pick) => (
            <View key={pick} style={styles.quickChip}>
              <Text style={styles.quickText}>{pick}</Text>
            </View>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Featured Matches</Text>
          <Text style={styles.sectionAction}>Top odds</Text>
        </View>
        {featuredMatches.map((match) => (
          <View key={match.home} style={styles.matchCard}>
            <View style={styles.matchHeader}>
              <Text style={styles.matchLeague}>{match.league}</Text>
              <Text style={styles.matchTime}>{match.time}</Text>
            </View>
            <Text style={styles.matchTeams}>{match.home} vs {match.away}</Text>
            <View style={styles.oddsRow}>
              {match.odds.map((odd, index) => (
                <View key={`${match.home}-${odd}`} style={styles.oddPill}>
                  <Text style={styles.oddLabel}>{index === 0 ? '1' : index === 1 ? 'X' : '2'}</Text>
                  <Text style={styles.oddValue}>{odd}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Live Now</Text>
          <Text style={styles.sectionAction}>View live</Text>
        </View>
        {liveMatches.map((match) => (
          <View key={match.home} style={styles.liveCard}>
            <View style={styles.liveHeader}>
              <View style={styles.liveTag}>
                <MaterialIcons name="circle" size={10} color={Brand.green} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
              <Text style={styles.matchLeague}>{match.league}</Text>
              <Text style={styles.matchTime}>{match.minute}</Text>
            </View>
            <Text style={styles.matchTeams}>{match.home} {match.score} {match.away}</Text>
            <View style={styles.oddsRow}>
              {match.odds.map((odd, index) => (
                <View key={`${match.home}-${odd}`} style={styles.oddPill}>
                  <Text style={styles.oddLabel}>{index === 0 ? '1' : index === 1 ? 'X' : '2'}</Text>
                  <Text style={styles.oddValue}>{odd}</Text>
                </View>
              ))}
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
  topBar: {
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: Brand.card,
    borderBottomColor: Brand.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  brand: {
    fontSize: 20,
    fontWeight: '800',
    color: Brand.navy,
    letterSpacing: 1,
  },
  subtle: {
    color: Brand.muted,
    fontSize: 12,
    marginTop: 4,
  },
  topActions: {
    flexDirection: 'row',
    gap: 10,
  },
  loginBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Brand.navy,
  },
  loginText: {
    color: Brand.navy,
    fontWeight: '600',
  },
  registerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: Brand.navy,
  },
  registerText: {
    color: Brand.card,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  hero: {
    backgroundColor: Brand.navy,
    borderRadius: 18,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  heroLeft: {
    flex: 1,
    paddingRight: 12,
  },
  heroLabel: {
    color: Brand.gold,
    fontWeight: '700',
    marginBottom: 6,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroTitle: {
    color: Brand.card,
    fontSize: 20,
    fontWeight: '800',
  },
  heroCopy: {
    color: '#d9e2f2',
    marginTop: 8,
    marginBottom: 12,
    lineHeight: 18,
  },
  ctaBtn: {
    backgroundColor: Brand.gold,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
  },
  ctaText: {
    color: Brand.navyDeep,
    fontWeight: '700',
  },
  heroBadge: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: Brand.gold,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroBadgeTop: {
    fontWeight: '800',
    fontSize: 16,
    color: Brand.navyDeep,
  },
  heroBadgeBottom: {
    fontSize: 12,
    color: Brand.navyDeep,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Brand.text,
  },
  sectionAction: {
    color: Brand.navy,
    fontWeight: '600',
    fontSize: 12,
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  quickChip: {
    backgroundColor: Brand.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderColor: Brand.border,
    borderWidth: 1,
  },
  quickText: {
    color: Brand.navy,
    fontWeight: '600',
    fontSize: 12,
  },
  matchCard: {
    backgroundColor: Brand.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  matchLeague: {
    color: Brand.muted,
    fontWeight: '600',
    fontSize: 12,
  },
  matchTime: {
    color: Brand.muted,
    fontSize: 12,
  },
  matchTeams: {
    fontSize: 15,
    fontWeight: '700',
    color: Brand.text,
  },
  oddsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  oddPill: {
    backgroundColor: Brand.background,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Brand.border,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  oddLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Brand.muted,
  },
  oddValue: {
    fontSize: 13,
    fontWeight: '700',
    color: Brand.navy,
  },
  liveCard: {
    backgroundColor: Brand.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  liveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: '#eef7f0',
  },
  liveText: {
    fontSize: 10,
    fontWeight: '700',
    color: Brand.green,
  },
});
