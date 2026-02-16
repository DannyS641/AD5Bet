import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Brand } from "@/constants/brand";
import { useBetSlip } from "@/context/BetSlipContext";
import { OddsEvent, OddsMarketOutcome, fetchEventMarkets } from "@/lib/odds-api";

const MARKET_LABELS: Record<string, string> = {
  h2h: "1X2",
  totals: "Over/Under",
  alternate_totals: "Alternate Goals",
  spreads: "Handicap",
  btts: "BTTS",
  draw_no_bet: "Draw No Bet",
  h2h_3_way: "3-Way",
};

const formatOutcomeLabel = (outcome: OddsMarketOutcome) => {
  if (typeof outcome.point === "number") {
    return `${outcome.name} ${outcome.point}`;
  }
  return outcome.name;
};

export default function MarketsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    eventId?: string | string[];
    sportKey?: string | string[];
    homeTeam?: string | string[];
    awayTeam?: string | string[];
    league?: string | string[];
  }>();

  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
  const sportKey = Array.isArray(params.sportKey) ? params.sportKey[0] : params.sportKey;
  const homeTeam = Array.isArray(params.homeTeam) ? params.homeTeam[0] : params.homeTeam;
  const awayTeam = Array.isArray(params.awayTeam) ? params.awayTeam[0] : params.awayTeam;
  const league = Array.isArray(params.league) ? params.league[0] : params.league;

  const [event, setEvent] = useState<OddsEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { addSelection, selections } = useBetSlip();

  useEffect(() => {
    let mounted = true;

    const loadMarkets = async () => {
      if (!eventId || !sportKey) {
        setError("Missing match details.");
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const data = await fetchEventMarkets(eventId, sportKey);
        if (!mounted) return;
        if (!data) {
          setError("Unable to load markets.");
          setEvent(null);
        } else {
          setEvent(data);
          setError(null);
        }
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Unable to load markets.");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadMarkets();

    return () => {
      mounted = false;
    };
  }, [eventId, sportKey]);

  const matchTitle = useMemo(() => {
    if (event) {
      return `${event.homeTeam} vs ${event.awayTeam}`;
    }
    if (homeTeam && awayTeam) {
      return `${homeTeam} vs ${awayTeam}`;
    }
    return "Match Markets";
  }, [event, homeTeam, awayTeam]);

  const formatOdd = (value?: number) => (typeof value === "number" ? value.toFixed(2) : "--");

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: 18 + insets.top }]}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={20} color={Brand.navy} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>All Markets</Text>
          <Text style={styles.subtitle}>{matchTitle}</Text>
          {league ? <Text style={styles.league}>{league}</Text> : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={Brand.navy} />
            <Text style={styles.loadingText}>Loading markets...</Text>
          </View>
        ) : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {event?.markets.map((market) => (
          <View key={market.key} style={styles.marketCard}>
            <Text style={styles.marketTitle}>{MARKET_LABELS[market.key] ?? market.key}</Text>
            <View style={styles.outcomesRow}>
              {market.outcomes.map((outcome) => {
                const label = formatOutcomeLabel(outcome);
                const selectionId = `${event.id}-${market.key}-${label}`;
                const isSelected = selections.some((item) => item.id === selectionId);
                return (
                  <Pressable
                    key={selectionId}
                    style={[styles.oddCell, isSelected && styles.oddCellActive]}
                    onPress={() =>
                      addSelection({
                        id: selectionId,
                        eventId: event.id,
                        sportKey: event.sportKey,
                        league: event.sportTitle,
                        match: `${event.homeTeam} vs ${event.awayTeam}`,
                        market: market.key,
                        outcome: label,
                        odds: outcome.price,
                        commenceTime: event.commenceTime,
                      })
                    }
                  >
                    <Text style={[styles.oddLabel, isSelected && styles.oddLabelActive]}>
                      {label}
                    </Text>
                    <Text style={[styles.oddValue, isSelected && styles.oddValueActive]}>
                      {formatOdd(outcome.price)}
                    </Text>
                  </Pressable>
                );
              })}
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
    paddingBottom: 12,
    paddingHorizontal: 20,
    backgroundColor: Brand.card,
    borderBottomWidth: 1,
    borderBottomColor: Brand.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.card,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: Brand.navy,
  },
  subtitle: {
    color: Brand.text,
    fontWeight: "700",
    marginTop: 2,
  },
  league: {
    color: Brand.muted,
    fontSize: 12,
    marginTop: 2,
  },
  content: {
    padding: 20,
    gap: 16,
    paddingBottom: 32,
  },
  loadingBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    color: Brand.muted,
    fontWeight: "600",
  },
  errorText: {
    color: "#d15353",
    fontWeight: "600",
  },
  marketCard: {
    backgroundColor: Brand.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Brand.border,
    gap: 12,
  },
  marketTitle: {
    color: Brand.navy,
    fontWeight: "800",
    textTransform: "uppercase",
    fontSize: 12,
  },
  outcomesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  oddCell: {
    minWidth: 110,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.background,
    gap: 4,
  },
  oddCellActive: {
    backgroundColor: Brand.navy,
    borderColor: Brand.navy,
  },
  oddLabel: {
    color: Brand.muted,
    fontWeight: "600",
    fontSize: 12,
  },
  oddLabelActive: {
    color: Brand.card,
  },
  oddValue: {
    color: Brand.navy,
    fontWeight: "800",
    fontSize: 14,
  },
  oddValueActive: {
    color: Brand.card,
  },
});
