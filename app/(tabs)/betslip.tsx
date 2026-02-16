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
import { supabase } from "@/lib/supabase";

type PlacedBet = {
  id: string;
  stake: number;
  total_odds: number;
  potential_win: number;
  selections: BetSelection[] | null;
  status: string | null;
  created_at: string | null;
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

  const loadPlacedBets = useCallback(async () => {
    if (!user) {
      setPlacedBets([]);
      setPlacedError(null);
      setPlacedLoading(false);
      return;
    }

    setPlacedLoading(true);
    setPlacedError(null);
    const { data, error: betsError } = await supabase
      .from("bets")
      .select("id, stake, total_odds, potential_win, selections, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (betsError) {
      setPlacedError(betsError.message);
    }
    setPlacedBets(data ?? []);
    setPlacedLoading(false);
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

    const { data: wallet } = await supabase.from("wallets").select("balance").eq("user_id", user.id).single();
    const balance = wallet?.balance ?? 0;

    if (balance < stakeValue) {
      setError("Insufficient wallet balance.");
      setLoading(false);
      return;
    }

    const nextBalance = balance - stakeValue;
    const { error: walletError } = await supabase
      .from("wallets")
      .upsert({ user_id: user.id, balance: nextBalance }, { onConflict: "user_id" });

    if (walletError) {
      setError(walletError.message);
      setLoading(false);
      return;
    }

    const { data: newBet, error: betError } = await supabase.from("bets").insert({
      user_id: user.id,
      stake: stakeValue,
      total_odds: totalOdds,
      potential_win: potentialWin,
      selections,
      status: "pending",
    }).select("id, stake, total_odds, potential_win, selections, status, created_at").single();

    if (betError) {
      setError(betError.message);
      setLoading(false);
      return;
    }

    clearSelections();
    if (newBet) {
      setPlacedBets((current) => [newBet as PlacedBet, ...current]);
    } else {
      await loadPlacedBets();
    }
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
            (historyTab === "open" ? openBets : settledBets).map((bet) => {
              const selectionsList = Array.isArray(bet.selections) ? bet.selections : [];
              const isExpanded = Boolean(expandedBets[bet.id]);
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
                  <Text style={styles.betCount}>{selectionsList.length} picks</Text>
                  {isExpanded ? (
                    <View style={styles.betDetails}>
                      {selectionsList.map((item: any) => (
                        <View key={item.id ?? `${item.eventId}-${item.market}-${item.outcome}`} style={styles.betPick}>
                          <Text style={styles.betPickMatch}>{item.match}</Text>
                          <Text style={styles.betPickOutcome}>
                            {String(item.market ?? "").toUpperCase()} | {item.outcome} | {item.odds}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })
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
  betPickMatch: {
    color: Brand.text,
    fontWeight: "700",
  },
  betPickOutcome: {
    color: Brand.muted,
  },
});
