import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";

import { Brand } from "@/constants/brand";
import { BetSelection, useBetSlip } from "@/context/BetSlipContext";
import { useAuth } from "@/context/AuthContext";
import { useAutoReload } from "@/hooks/use-auto-reload";
import { supabase } from "@/lib/supabase";
import { Config } from "@/lib/config";

type PlacedBet = {
  id: string;
  stake: number;
  total_odds: number;
  potential_win: number;
  payout?: number | null;
  result?: string | null;
  selections: BetSelection[] | null;
  status: string | null;
  created_at: string | null;
  legs?: BetLeg[];
};

type BetLeg = {
  bet_id: string;
  event_id: string;
  market: string;
  outcome: string;
  odds: number;
  point: number | null;
  match_label: string | null;
  status: string | null;
  commence_time?: string | null;
};

export default function BetSlipScreen() {
  const router = useRouter();
  const { selections, stake, setStake, totalOdds, potentialWin, removeSelection, clearSelections, undoLastAction, canUndo } = useBetSlip();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [placedBets, setPlacedBets] = useState<PlacedBet[]>([]);
  const [placedLoading, setPlacedLoading] = useState(false);
  const [placedError, setPlacedError] = useState<string | null>(null);
  const [historyTab, setHistoryTab] = useState<"open" | "settled">("open");
  const [expandedBets, setExpandedBets] = useState<Record<string, boolean>>({});

  const toggleExpanded = useCallback((betId: string) => {
    setExpandedBets((current) => ({ ...current, [betId]: !current[betId] }));
  }, []);

  const formatDateLabel = useCallback((value?: string | null) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString(undefined, {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }, []);

  const getKickoffLabel = useCallback(
    (bet: PlacedBet) => {
      const legs = bet.legs ?? [];
      const times = legs
        .map((leg) => (leg.commence_time ? new Date(leg.commence_time).getTime() : null))
        .filter((value): value is number => typeof value === "number" && !Number.isNaN(value));
      if (times.length === 0) {
        const selectionsList = Array.isArray(bet.selections) ? bet.selections : [];
        const fallbackTimes = selectionsList
          .map((item) => (item.commenceTime ? new Date(item.commenceTime).getTime() : null))
          .filter((value): value is number => typeof value === "number" && !Number.isNaN(value));
        if (fallbackTimes.length === 0) return null;
        times.push(...fallbackTimes);
      }
      const earliest = Math.min(...times);
      return new Date(earliest).toLocaleString(undefined, {
        weekday: "short",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    },
    [],
  );

  const groupBetsByDate = useCallback(
    (bets: PlacedBet[]) => {
      const map = new Map<string, { label: string; items: PlacedBet[] }>();
      bets.forEach((bet) => {
        const createdAt = bet.created_at ? new Date(bet.created_at) : null;
        const key = createdAt && !Number.isNaN(createdAt.getTime())
          ? createdAt.toISOString().slice(0, 10)
          : "unknown";
        const label =
          key === "unknown" ? "Unknown date" : formatDateLabel(createdAt.toISOString()) ?? "Unknown date";
        if (!map.has(key)) {
          map.set(key, { label, items: [] });
        }
        map.get(key)?.items.push(bet);
      });
      return Array.from(map.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([dateKey, value]) => ({ dateKey, label: value.label, items: value.items }));
    },
    [formatDateLabel],
  );

  const [openBets, settledBets] = useMemo(() => {
    const open: PlacedBet[] = [];
    const settled: PlacedBet[] = [];
    placedBets.forEach((bet) => {
      const status = String(bet.status ?? "").toLowerCase();
      if (status === "pending" || status === "open") {
        open.push(bet);
      } else {
        settled.push(bet);
      }
    });
    return [open, settled] as const;
  }, [placedBets]);

  const loadPlacedBets = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!user) {
      setPlacedBets([]);
      setPlacedError(null);
      if (!silent) {
        setPlacedLoading(false);
      }
      return;
    }

    if (!silent) {
      setPlacedLoading(true);
    }
    setPlacedError(null);
    const { data, error: betsError } = await supabase
      .from("bets")
      .select("id, stake, total_odds, potential_win, selections, status, created_at, payout, result")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (betsError) {
      setPlacedError(betsError.message);
    }
    const bets = (data ?? []) as PlacedBet[];

    if (bets.length === 0) {
      setPlacedBets([]);
      if (!silent) {
        setPlacedLoading(false);
      }
      return;
    }

    const betIds = bets.map((bet) => bet.id);
    const { data: legsData } = await supabase
      .from("bet_legs")
      .select(
        "bet_id, event_id, market, outcome, odds, point, status, home_team, away_team, commence_time"
      )
      .in("bet_id", betIds);

    const legs = (legsData ?? []) as Array<
      Omit<BetLeg, "match_label"> & { home_team?: string | null; away_team?: string | null }
    >;
    const legsByBet = new Map<string, BetLeg[]>();
    legs.forEach((leg) => {
      const matchLabel =
        leg.home_team && leg.away_team ? `${leg.home_team} vs ${leg.away_team}` : null;
      const enriched: BetLeg = {
        bet_id: leg.bet_id,
        event_id: leg.event_id,
        market: leg.market,
        outcome: leg.outcome,
        odds: leg.odds,
        point: leg.point ?? null,
        status: leg.status ?? null,
        match_label: matchLabel,
        commence_time: leg.commence_time ?? null,
      };
      const current = legsByBet.get(leg.bet_id) ?? [];
      current.push(enriched);
      legsByBet.set(leg.bet_id, current);
    });

    const withLegs = bets.map((bet) => ({
      ...bet,
      legs: legsByBet.get(bet.id) ?? [],
    }));

    setPlacedBets(withLegs);
    if (!silent) {
      setPlacedLoading(false);
    }
  }, [user]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    await loadPlacedBets();
    setRefreshing(false);
  }, [loadPlacedBets]);

  useEffect(() => {
    loadPlacedBets();
  }, [loadPlacedBets]);

  useAutoReload(() => loadPlacedBets({ silent: true }), {
    intervalMs: 30000,
    enabled: Boolean(user),
  });

  const handlePlaceBet = async () => {
    if (!user) {
      router.push("/login");
      return;
    }
    if (selections.length === 0) {
      setError("Add at least one selection.");
      return;
    }
    const stakeValue = Number(stake || 0);
    if (!stakeValue) {
      setError("Enter a valid stake.");
      return;
    }

    setLoading(true);
    setError(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Please sign in again.");
      setLoading(false);
      return;
    }

    const response = await fetch(`${Config.supabaseUrl}/functions/v1/place-bet`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        stake: stakeValue,
        currency: "NGN",
        selections,
        allowLive: true,
        cutoffMinutes: 2,
        priceTolerance: 0.02,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = payload?.code;
      if (code === "event_not_found") {
        setError("Odds updated. Please refresh matches and re-add your selection.");
      } else if (code === "live_not_supported") {
        setError("Live betting is not available. Please choose a pre-match game.");
      } else if (code === "price_changed") {
        setError("Odds changed. Please refresh and try again.");
      } else if (code === "markets_not_supported") {
        setError("Selected market is not available right now. Please choose a different market.");
      } else if (code === "market_not_supported") {
        setError("Selected market is not supported for this match. Please choose another market.");
      } else {
        setError(payload?.error ?? "Unable to place bet.");
      }
      setLoading(false);
      return;
    }

    if (!payload?.bet_id) {
      setError(payload?.error ?? "Unable to place bet.");
      setLoading(false);
      return;
    }

    clearSelections();
    await loadPlacedBets();
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: 16 + insets.top }]}>
        <Text style={styles.title}>Bet Slip</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{selections.length}</Text>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {selections.length === 0 ? (
          <Text style={styles.emptyText}>Your bet slip is empty. Tap odds to add selections.</Text>
        ) : null}
        {selections.map((selection) => (
          <View key={selection.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.match}>{selection.match}</Text>
              <Pressable onPress={() => removeSelection(selection.id)}>
                <MaterialIcons name="close" size={18} color={Brand.muted} />
              </Pressable>
            </View>
            <View style={styles.cardRow}>
              <Text style={styles.pick}>
                {selection.market.toUpperCase()} • {selection.outcome}
              </Text>
              <Text style={styles.odd}>{selection.odds}</Text>
            </View>
          </View>
        ))}

        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Odds</Text>
            <Text style={styles.summaryValue}>{totalOdds || "--"}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Stake</Text>
            <TextInput
              style={styles.stakeInput}
              keyboardType="number-pad"
              value={stake}
              onChangeText={setStake}
            />
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Potential Win</Text>
            <Text style={styles.summaryWin}>₦{potentialWin.toLocaleString()}</Text>
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {canUndo ? (
            <Pressable style={styles.undoButton} onPress={undoLastAction}>
              <MaterialIcons name="undo" size={16} color={Brand.navy} />
              <Text style={styles.undoText}>Undo</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.placeBet} onPress={handlePlaceBet} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={Brand.card} />
            ) : (
              <>
                <MaterialIcons name={user ? "check-circle" : "lock"} size={16} color={Brand.card} />
                <Text style={styles.placeBetText}>{user ? "Place Bet" : "Login to place bet"}</Text>
              </>
            )}
          </Pressable>
        </View>

        <View style={styles.placedSection}>
          <Text style={styles.sectionTitle}>Bet History</Text>
          <View style={styles.tabs}>
            <Pressable
              style={[styles.tabButton, historyTab === "open" ? styles.tabButtonActive : null]}
              onPress={() => setHistoryTab("open")}
            >
              <Text style={[styles.tabText, historyTab === "open" ? styles.tabTextActive : null]}>
                Open Bets
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tabButton, historyTab === "settled" ? styles.tabButtonActive : null]}
              onPress={() => setHistoryTab("settled")}
            >
              <Text style={[styles.tabText, historyTab === "settled" ? styles.tabTextActive : null]}>
                Settled Bets
              </Text>
            </Pressable>
          </View>
          {!user ? (
            <Text style={styles.emptyText}>Login to see your placed bets.</Text>
          ) : placedLoading ? (
            <ActivityIndicator color={Brand.navy} />
          ) : placedError ? (
            <Text style={styles.errorText}>{placedError}</Text>
          ) : (historyTab === "open" ? openBets : settledBets).length === 0 ? (
            <Text style={styles.emptyText}>
              {historyTab === "open" ? "No open bets yet." : "No settled bets yet."}
            </Text>
          ) : (
            groupBetsByDate(historyTab === "open" ? openBets : settledBets).map((group) => (
              <View key={group.dateKey} style={styles.betGroup}>
                <Text style={styles.betGroupTitle}>{group.label}</Text>
                {group.items.map((bet) => {
                  const selectionsList = Array.isArray(bet.selections) ? bet.selections : [];
                  const isExpanded = Boolean(expandedBets[bet.id]);
                  const kickoffLabel = getKickoffLabel(bet);
                  return (
                <View key={bet.id} style={styles.betCard}>
                  <Pressable style={styles.betHeader} onPress={() => toggleExpanded(bet.id)}>
                    <Text style={styles.betStatus}>{String(bet.status ?? "").toUpperCase()}</Text>
                    <View style={styles.betHeaderRight}>
                      <Text style={styles.betTime}>
                        {bet.created_at ? new Date(bet.created_at).toLocaleString() : ""}
                      </Text>
                      <MaterialIcons
                        name={isExpanded ? "keyboard-arrow-up" : "keyboard-arrow-down"}
                        size={20}
                        color={Brand.muted}
                      />
                    </View>
                  </Pressable>
                  <Text style={styles.betMeta}>
                    Stake: NGN {Number(bet.stake ?? 0).toLocaleString()} | Odds: {bet.total_odds} | Win: NGN{" "}
                    {Number(bet.potential_win ?? 0).toLocaleString()}
                  </Text>
                  {kickoffLabel ? (
                    <Text style={styles.betKickoff}>Kickoff: {kickoffLabel}</Text>
                  ) : null}
                  <Text style={styles.betCount}>{selectionsList.length} picks</Text>
                  {isExpanded ? (
                    <View style={styles.betDetails}>
                      {(bet.legs && bet.legs.length > 0
                        ? bet.legs
                        : selectionsList.map((item: any) => ({
                            bet_id: bet.id,
                            event_id: item.eventId ?? "",
                            market: item.market ?? "",
                            outcome: item.outcome ?? "",
                            odds: item.odds ?? 0,
                            point: item.point ?? null,
                            status: "pending",
                            match_label: item.match ?? null,
                          })))
                        .map((item: BetLeg) => {
                          const statusLabel = String(item.status ?? "pending").toUpperCase();
                          const statusColor =
                            statusLabel === "WON"
                              ? Brand.green
                              : statusLabel === "LOST"
                                ? Brand.red
                                : statusLabel === "PUSH" || statusLabel === "VOID"
                                  ? Brand.gold
                                  : Brand.muted;
                          return (
                            <View
                              key={`${bet.id}-${item.event_id}-${item.market}-${item.outcome}`}
                              style={styles.betPick}
                            >
                              <View style={styles.betPickHeader}>
                                <Text style={styles.betPickMatch}>
                                  {item.match_label ?? "Match"}
                                </Text>
                                <Text style={[styles.betPickStatus, { color: statusColor }]}>
                                  {statusLabel}
                                </Text>
                              </View>
                              <Text style={styles.betPickOutcome}>
                                {String(item.market ?? "").toUpperCase()} | {item.outcome} | {item.odds}
                              </Text>
                            </View>
                          );
                        })}
                    </View>
                  ) : null}
                </View>
              );
                })}
              </View>
            ))
          )}
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: Brand.navy,
  },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Brand.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: Brand.card,
    fontWeight: "700",
    fontSize: 12,
  },
  content: {
    padding: 20,
  },
  emptyText: {
    color: Brand.muted,
    fontStyle: "italic",
    marginBottom: 16,
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
    alignItems: "center",
  },
  match: {
    fontSize: 14,
    fontWeight: "700",
    color: Brand.text,
    flex: 1,
  },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  pick: {
    color: Brand.muted,
  },
  odd: {
    color: Brand.navy,
    fontWeight: "700",
  },
  summary: {
    backgroundColor: Brand.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  summaryLabel: {
    color: Brand.muted,
  },
  summaryValue: {
    color: Brand.text,
    fontWeight: "600",
  },
  summaryWin: {
    color: Brand.navy,
    fontWeight: "800",
  },
  stakeInput: {
    backgroundColor: Brand.background,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Brand.border,
    minWidth: 90,
    textAlign: "right",
    color: Brand.text,
  },
  placeBet: {
    marginTop: 10,
    backgroundColor: Brand.navy,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  placeBetText: {
    color: Brand.card,
    fontWeight: "700",
  },
  errorText: {
    color: "#d15353",
    fontWeight: "600",
    marginTop: 8,
  },
  undoButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: Brand.background,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  undoText: {
    color: Brand.navy,
    fontWeight: "700",
  },
  placedSection: {
    marginTop: 20,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Brand.navy,
  },
  tabs: {
    flexDirection: "row",
    gap: 10,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.card,
    alignItems: "center",
  },
  tabButtonActive: {
    backgroundColor: Brand.navy,
    borderColor: Brand.navy,
  },
  tabText: {
    color: Brand.muted,
    fontWeight: "700",
  },
  tabTextActive: {
    color: Brand.card,
  },
  betCard: {
    backgroundColor: Brand.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Brand.border,
    gap: 8,
  },
  betGroup: {
    gap: 10,
  },
  betGroupTitle: {
    color: Brand.muted,
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  betHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  betHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  betStatus: {
    color: Brand.navy,
    fontWeight: "800",
  },
  betTime: {
    color: Brand.muted,
    fontSize: 12,
  },
  betMeta: {
    color: Brand.text,
    fontWeight: "600",
  },
  betKickoff: {
    color: Brand.muted,
    fontWeight: "600",
  },
  betCount: {
    color: Brand.muted,
    fontWeight: "600",
  },
  betDetails: {
    gap: 8,
  },
  betPick: {
    borderTopWidth: 1,
    borderTopColor: Brand.border,
    paddingTop: 8,
    gap: 4,
  },
  betPickHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  betPickMatch: {
    color: Brand.text,
    fontWeight: "700",
  },
  betPickStatus: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  betPickOutcome: {
    color: Brand.muted,
  },
});
