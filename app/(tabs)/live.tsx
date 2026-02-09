import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View, Pressable, ActivityIndicator } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Brand } from "@/constants/brand";
import { useBetSlip } from "@/context/BetSlipContext";
import { OddsEvent, fetchFeaturedOdds } from "@/lib/odds-api";
import { BetSlipFab } from "@/components/BetSlipFab";

export default function LiveScreen() {
  const { addSelection } = useBetSlip();
  const insets = useSafeAreaInsets();
  const [liveMatches, setLiveMatches] = useState<OddsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadLive = async () => {
      try {
        setLoading(true);
        const events = await fetchFeaturedOdds("soccer_epl");
        const live = events.filter((event) => new Date(event.commenceTime).getTime() <= Date.now());
        if (!mounted) return;
        setLiveMatches(live);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Unable to load live matches.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadLive();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: 16 + insets.top }]}>
        <Text style={styles.title}>Live Matches</Text>
        <View style={styles.pill}>
          <MaterialIcons name="circle" size={10} color={Brand.green} />
          <Text style={styles.pillText}>Live</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={Brand.navy} />
            <Text style={styles.loadingText}>Checking live games...</Text>
          </View>
        ) : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {!loading && liveMatches.length === 0 ? (
          <Text style={styles.emptyText}>No live fixtures yet.</Text>
        ) : null}
        {liveMatches.map((match) => {
          const h2hMarket = match.markets.find((market) => market.key === "h2h");
          return (
            <View key={match.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.league}>{match.sportTitle}</Text>
                <Text style={styles.minute}>Live</Text>
              </View>
              <Text style={styles.teams}>
                {match.homeTeam} vs {match.awayTeam}
              </Text>
              <View style={styles.actionRow}>
                {h2hMarket?.outcomes?.map((outcome) => (
                  <Pressable
                    key={`${match.id}-${outcome.name}`}
                    style={styles.actionPill}
                    onPress={() =>
                      addSelection({
                        id: `${match.id}-h2h-${outcome.name}`,
                        eventId: match.id,
                        sportKey: match.sportKey,
                        league: match.sportTitle,
                        match: `${match.homeTeam} vs ${match.awayTeam}`,
                        market: "h2h",
                        outcome: outcome.name,
                        odds: outcome.price,
                        commenceTime: match.commenceTime,
                      })
                    }
                  >
                    <Text style={styles.actionText}>{outcome.name}</Text>
                    <Text style={styles.actionOdd}>{outcome.price}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>
      <BetSlipFab />
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: Brand.navy,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "#eef7f0",
  },
  pillText: {
    color: Brand.green,
    fontWeight: "700",
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
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  league: {
    color: Brand.muted,
    fontWeight: "600",
    fontSize: 12,
  },
  minute: {
    color: Brand.muted,
    fontSize: 12,
  },
  teams: {
    fontSize: 15,
    fontWeight: "700",
    color: Brand.text,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
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
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  actionText: {
    color: Brand.navy,
    fontWeight: "700",
    fontSize: 12,
  },
  actionOdd: {
    color: Brand.muted,
    fontWeight: "700",
    fontSize: 12,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  loadingText: {
    color: Brand.muted,
    fontWeight: "600",
  },
  errorText: {
    color: "#d15353",
    fontWeight: "600",
    marginBottom: 12,
  },
  emptyText: {
    color: Brand.muted,
    fontStyle: "italic",
  },
});
