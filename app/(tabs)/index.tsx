import { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Brand } from "@/constants/brand";
import { useBetSlip } from "@/context/BetSlipContext";
import { useAuth } from "@/context/AuthContext";
import { OddsEvent, OddsMarket, fetchEventMarkets, fetchFeaturedOdds } from "@/lib/odds-api";
import { supabase } from "@/lib/supabase";

const isWeb = Platform.OS === "web";

const marketOptions = [
  { key: "h2h", label: "1X2" },
  { key: "totals", label: "O/U 2.5" },
  { key: "btts", label: "BTTS" },
  { key: "draw_no_bet", label: "Draw No Bet" },
  { key: "h2h_3_way", label: "3-Way" },
  { key: "spreads", label: "Handicap" },
];

function formatMatchTime(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mergeMarkets(primary: OddsMarket[], extra: OddsMarket[]) {
  const map = new Map(primary.map((market) => [market.key, market]));
  extra.forEach((market) => {
    if (!map.has(market.key)) {
      map.set(market.key, market);
    }
  });
  return Array.from(map.values());
}

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const isLargeScreen = width > 768;
  const { addSelection, selections } = useBetSlip();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [featured, setFeatured] = useState<OddsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marketKey, setMarketKey] = useState("h2h");
  const [profileName, setProfileName] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      if (!user) {
        setProfileName(null);
        setWalletBalance(null);
        setProfileLoading(false);
        return;
      }
      setProfileLoading(true);
      const [{ data: profile }, { data: wallet }] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", user.id).single(),
        supabase.from("wallets").select("balance").eq("user_id", user.id).single(),
      ]);
      if (!mounted) return;
      setProfileName(profile?.full_name ?? user.email ?? null);
      setWalletBalance(wallet?.balance ?? 0);
      setProfileLoading(false);
    };

    loadProfile();
    return () => {
      mounted = false;
    };
  }, [user]);

  useEffect(() => {
    let mounted = true;

    const loadOdds = async () => {
      try {
        setLoading(true);
        const baseEvents = await fetchFeaturedOdds("soccer_epl");
        const enriched = await Promise.all(
          baseEvents.slice(0, 8).map(async (event) => {
            try {
              const extra = await fetchEventMarkets(event.id, event.sportKey);
              if (!extra) return event;
              return { ...event, markets: mergeMarkets(event.markets, extra.markets) };
            } catch {
              return event;
            }
          })
        );
        if (!mounted) return;
        setFeatured(enriched);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Unable to load matches.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadOdds();
    return () => {
      mounted = false;
    };
  }, []);

  const liveMatches = useMemo(
    () => featured.filter((match) => new Date(match.commenceTime).getTime() <= Date.now()),
    [featured]
  );

  const dynamicStyles = {
    wrapper: {
      flex: 1,
      backgroundColor: Brand.background,
      alignItems: isWeb && isLargeScreen ? ("center" as const) : undefined,
    },
    innerContainer: {
      flex: 1,
      width: "100%" as const,
      maxWidth: isWeb && isLargeScreen ? 840 : undefined,
      backgroundColor: Brand.background,
    },
    topBar: {
      ...styles.topBar,
      paddingTop: (isWeb ? 24 : 16) + insets.top,
      paddingHorizontal: isWeb && isLargeScreen ? 32 : 20,
    },
    brand: {
      ...styles.brand,
      fontSize: isWeb && isLargeScreen ? 28 : 20,
    },
    hero: {
      ...styles.hero,
      padding: isWeb && isLargeScreen ? 32 : 20,
    },
    heroTitle: {
      ...styles.heroTitle,
      fontSize: isWeb && isLargeScreen ? 28 : 20,
    },
    matchCard: {
      ...styles.matchCard,
      padding: isWeb && isLargeScreen ? 24 : 16,
    },
    matchTeams: {
      ...styles.matchTeams,
      fontSize: isWeb && isLargeScreen ? 18 : 15,
    },
    scrollContent: {
      ...styles.scrollContent,
      padding: isWeb && isLargeScreen ? 32 : 20,
    },
  };

  const renderOdds = (match: OddsEvent) => {
    const market = match.markets.find((item) => item.key === marketKey);
    if (!market) {
      return <Text style={styles.emptyOdds}>Market not available</Text>;
    }

    return (
      <View style={styles.oddsRow}>
        {market.outcomes.map((odd) => {
          const selectionId = `${match.id}-${market.key}-${odd.name}`;
          const isSelected = selections.some((item) => item.id === selectionId);

          return (
            <Pressable
              key={selectionId}
              style={[styles.oddPill, isSelected && styles.oddPillActive]}
              onPress={() =>
                addSelection({
                  id: selectionId,
                  eventId: match.id,
                  sportKey: match.sportKey,
                  league: match.sportTitle,
                  match: `${match.homeTeam} vs ${match.awayTeam}`,
                  market: market.key,
                  outcome: odd.name,
                  odds: odd.price,
                  commenceTime: match.commenceTime,
                })
              }
            >
              <Text style={[styles.oddLabel, isSelected && styles.oddLabelActive]}>{odd.name}</Text>
              <Text style={[styles.oddValue, isSelected && styles.oddValueActive]}>{odd.price}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  };

  return (
    <View style={dynamicStyles.wrapper}>
      <View style={dynamicStyles.innerContainer}>
        <View style={dynamicStyles.topBar}>
          <View>
            <Text style={dynamicStyles.brand}>AD5BET</Text>
            <Text style={styles.subtle}>Fast bets. Smart picks.</Text>
          </View>
          <View style={styles.topActions}>
            {!user ? (
              <>
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
              </>
            ) : (
              <View style={styles.profileWrap}>
                <View style={styles.profileInfo}>
                  <Text style={styles.profileName} numberOfLines={1}>
                    {profileLoading ? "Loading..." : profileName ?? "Account"}
                  </Text>
                  <Text style={styles.profileBalance}>
                    {"\u20A6"}
                    {walletBalance?.toLocaleString() ?? "0"}
                  </Text>
                </View>
                <Link href="/(tabs)/account" asChild>
                  <Pressable style={styles.profileBtn} accessibilityLabel="Open profile">
                    <MaterialIcons name="account-circle" size={20} color={Brand.navy} />
                  </Pressable>
                </Link>
              </View>
            )}
          </View>
        </View>

        <ScrollView contentContainerStyle={dynamicStyles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={dynamicStyles.hero}>
            <View style={styles.heroLeft}>
              <Text style={styles.heroLabel}>Today's Boost</Text>
              <Text style={dynamicStyles.heroTitle}>Super Sunday Combo</Text>
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
            <Text style={styles.sectionTitle}>More Markets</Text>
            <Text style={styles.sectionAction}>Pick a market</Text>
          </View>
          <View style={styles.quickRow}>
            {marketOptions.map((pick) => (
              <Pressable
                key={pick.key}
                style={[styles.quickChip, marketKey === pick.key && styles.quickChipActive]}
                onPress={() => setMarketKey(pick.key)}
              >
                <Text style={[styles.quickText, marketKey === pick.key && styles.quickTextActive]}>
                  {pick.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Featured Matches</Text>
            <Text style={styles.sectionAction}>Top odds</Text>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={Brand.navy} />
              <Text style={styles.loadingText}>Loading matches...</Text>
            </View>
          ) : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {featured.map((match) => (
            <View key={match.id} style={dynamicStyles.matchCard}>
              <View style={styles.matchHeader}>
                <Text style={styles.matchLeague}>{match.sportTitle}</Text>
                <Text style={styles.matchTime}>{formatMatchTime(match.commenceTime)}</Text>
              </View>
              <Text style={dynamicStyles.matchTeams}>
                {match.homeTeam} vs {match.awayTeam}
              </Text>
              {renderOdds(match)}
            </View>
          ))}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Live Now</Text>
            <Text style={styles.sectionAction}>View live</Text>
          </View>
          {liveMatches.length === 0 ? (
            <Text style={styles.emptyOdds}>No live games at the moment.</Text>
          ) : (
            liveMatches.map((match) => (
              <View key={`live-${match.id}`} style={styles.liveCard}>
                <View style={styles.liveHeader}>
                  <View style={styles.liveTag}>
                    <MaterialIcons name="circle" size={10} color={Brand.green} />
                    <Text style={styles.liveText}>LIVE</Text>
                  </View>
                  <Text style={styles.matchLeague}>{match.sportTitle}</Text>
                  <Text style={styles.matchTime}>{formatMatchTime(match.commenceTime)}</Text>
                </View>
                <Text style={dynamicStyles.matchTeams}>
                  {match.homeTeam} vs {match.awayTeam}
                </Text>
                {renderOdds(match)}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: Brand.card,
    borderBottomColor: Brand.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  brand: {
    fontSize: 20,
    fontWeight: "800",
    color: Brand.navy,
    letterSpacing: 1,
  },
  subtle: {
    color: Brand.muted,
    fontSize: 12,
    marginTop: 4,
  },
  topActions: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  profileWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  profileInfo: {
    alignItems: "flex-end",
    maxWidth: 160,
  },
  profileName: {
    color: Brand.navy,
    fontWeight: "700",
    fontSize: 12,
  },
  profileBalance: {
    color: Brand.muted,
    fontWeight: "600",
    fontSize: 12,
    marginTop: 2,
  },
  profileBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Brand.navy,
    alignItems: "center",
    justifyContent: "center",
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
    fontWeight: "600",
  },
  registerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: Brand.navy,
  },
  registerText: {
    color: Brand.card,
    fontWeight: "600",
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  hero: {
    backgroundColor: Brand.navy,
    borderRadius: 18,
    padding: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  heroLeft: {
    flex: 1,
    paddingRight: 12,
  },
  heroLabel: {
    color: Brand.gold,
    fontWeight: "700",
    marginBottom: 6,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  heroTitle: {
    color: Brand.card,
    fontSize: 20,
    fontWeight: "800",
  },
  heroCopy: {
    color: "#d9e2f2",
    marginTop: 8,
    marginBottom: 12,
    lineHeight: 18,
  },
  ctaBtn: {
    backgroundColor: Brand.gold,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
  },
  ctaText: {
    color: Brand.navyDeep,
    fontWeight: "700",
  },
  heroBadge: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: Brand.gold,
    justifyContent: "center",
    alignItems: "center",
  },
  heroBadgeTop: {
    fontWeight: "800",
    fontSize: 16,
    color: Brand.navyDeep,
  },
  heroBadgeBottom: {
    fontSize: 12,
    color: Brand.navyDeep,
    fontWeight: "600",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Brand.text,
  },
  sectionAction: {
    color: Brand.navy,
    fontWeight: "600",
    fontSize: 12,
  },
  quickRow: {
    flexDirection: "row",
    flexWrap: "wrap",
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
  quickChipActive: {
    backgroundColor: Brand.navy,
    borderColor: Brand.navy,
  },
  quickText: {
    color: Brand.navy,
    fontWeight: "600",
    fontSize: 12,
  },
  quickTextActive: {
    color: Brand.card,
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
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  matchLeague: {
    color: Brand.muted,
    fontWeight: "600",
    fontSize: 12,
  },
  matchTime: {
    color: Brand.muted,
    fontSize: 12,
  },
  matchTeams: {
    fontSize: 15,
    fontWeight: "700",
    color: Brand.text,
  },
  oddsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
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
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  oddPillActive: {
    backgroundColor: Brand.navy,
    borderColor: Brand.navy,
  },
  oddLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Brand.muted,
  },
  oddLabelActive: {
    color: Brand.card,
  },
  oddValue: {
    fontSize: 13,
    fontWeight: "700",
    color: Brand.navy,
  },
  oddValueActive: {
    color: Brand.card,
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
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  liveTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: "#eef7f0",
  },
  liveText: {
    fontSize: 10,
    fontWeight: "700",
    color: Brand.green,
  },
  loadingBox: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    marginBottom: 16,
  },
  loadingText: {
    color: Brand.muted,
    fontWeight: "600",
  },
  errorText: {
    color: "#d15353",
    fontWeight: "600",
    marginBottom: 16,
  },
  emptyOdds: {
    color: Brand.muted,
    fontStyle: "italic",
    marginTop: 12,
  },
});
