import { StyleSheet, Text, Pressable } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Brand } from "@/constants/brand";
import { useBetSlip } from "@/context/BetSlipContext";

export function BetSlipFab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { selections } = useBetSlip();
  const count = selections.length;

  if (count === 0) return null;

  return (
    <Pressable
      style={[styles.fab, { bottom: 16 + insets.bottom }]}
      onPress={() => router.push("/(tabs)/betslip")}
      accessibilityLabel="Open bet slip"
    >
      <MaterialIcons name="receipt" size={20} color={Brand.card} />
      <Text style={styles.count}>{count}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Brand.navy,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 50,
  },
  count: {
    position: "absolute",
    top: 6,
    right: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Brand.red,
    color: Brand.card,
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
    textAlignVertical: "center",
    overflow: "hidden",
  },
});
