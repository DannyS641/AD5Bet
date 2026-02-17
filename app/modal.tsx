import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";

import { Brand } from "@/constants/brand";
import { promotions } from "@/constants/promotions";

export default function PromotionsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 400);
  }, []);

  const handlePromoPress = useCallback(
    (href?: string) => {
      if (!href) return;
      router.push(href);
    },
    [router],
  );
  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Promotions</Text>
        <Text style={styles.subtitle}>Fresh boosts and bonuses to power your bets.</Text>
      </View>

      {promotions.map((promo) => {
        const isClickable = Boolean(promo.href);
        return (
          <Pressable
            key={promo.id}
            style={[styles.card, !isClickable && styles.cardDisabled]}
            onPress={() => handlePromoPress(promo.href)}
            disabled={!isClickable}
          >
            <View style={styles.cardLeft}>
              <Text style={styles.label}>{promo.label}</Text>
              <Text style={styles.cardTitle}>{promo.title}</Text>
              <Text style={styles.cardCopy}>{promo.copy}</Text>
              <Pressable
                style={[styles.ctaBtn, !isClickable && styles.ctaBtnDisabled]}
                onPress={() => handlePromoPress(promo.href)}
                disabled={!isClickable}
              >
                <Text style={styles.ctaText}>{promo.cta}</Text>
                <MaterialIcons name="chevron-right" size={18} color={Brand.card} />
              </Pressable>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeTop}>{promo.badgeTop}</Text>
              <Text style={styles.badgeBottom}>{promo.badgeBottom}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 32,
    backgroundColor: Brand.background,
  },
  header: {
    marginBottom: 18,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: Brand.navy,
  },
  subtitle: {
    marginTop: 6,
    color: Brand.muted,
  },
  card: {
    backgroundColor: Brand.navy,
    borderRadius: 18,
    padding: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  cardDisabled: {
    opacity: 0.9,
  },
  cardLeft: {
    flex: 1,
    paddingRight: 12,
  },
  label: {
    color: Brand.gold,
    fontWeight: "700",
    marginBottom: 6,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  cardTitle: {
    color: Brand.card,
    fontSize: 18,
    fontWeight: "800",
  },
  cardCopy: {
    color: "#d9e2f2",
    marginTop: 8,
    marginBottom: 12,
    lineHeight: 18,
  },
  ctaBtn: {
    backgroundColor: Brand.gold,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
  },
  ctaBtnDisabled: {
    opacity: 0.8,
  },
  ctaText: {
    color: Brand.navyDeep,
    fontWeight: "700",
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Brand.gold,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeTop: {
    fontWeight: "800",
    fontSize: 14,
    color: Brand.navyDeep,
  },
  badgeBottom: {
    fontSize: 11,
    color: Brand.navyDeep,
    fontWeight: "600",
  },
});
