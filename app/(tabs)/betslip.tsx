import { useState } from "react";
import { ScrollView, StyleSheet, Text, View, Pressable, TextInput, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";

import { Brand } from "@/constants/brand";
import { useBetSlip } from "@/context/BetSlipContext";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

export default function BetSlipScreen() {
  const router = useRouter();
  const { selections, stake, setStake, totalOdds, potentialWin, removeSelection, clearSelections } = useBetSlip();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    await supabase.from("wallets").upsert({ user_id: user.id, balance: nextBalance }, { onConflict: "user_id" });

    const { error: betError } = await supabase.from("bets").insert({
      user_id: user.id,
      stake: stakeValue,
      total_odds: totalOdds,
      potential_win: potentialWin,
      selections,
      status: "pending",
    });

    if (betError) {
      setError(betError.message);
      setLoading(false);
      return;
    }

    clearSelections();
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
      <ScrollView contentContainerStyle={styles.content}>
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
});
