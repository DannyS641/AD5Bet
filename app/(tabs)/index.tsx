import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  useWindowDimensions,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Link, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Brand } from "@/constants/brand";
import { promotions } from "@/constants/promotions";
import { useBetSlip } from "@/context/BetSlipContext";
import { useAuth } from "@/context/AuthContext";
import { OddsEvent, OddsMarket, fetchEventMarkets, fetchFeaturedOdds } from "@/lib/odds-api";
import { BetSlipFab } from "@/components/BetSlipFab";
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
  return date.toLocaleTimeString(undefined, {
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
  const router = useRouter();

  const [featured, setFeatured] = useState<OddsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marketKey, setMarketKey] = useState("h2h");
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [promoIndex, setPromoIndex] = useState(0);
  const promoFade = useRef(new Animated.Value(1)).current;
  const [goalLines, setGoalLines] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!user) {
      setWalletBalance(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    try {
      const { data: wallet } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", user.id)
        .single();
      setWalletBalance(wallet?.balance ?? 0);
    } finally {
      setProfileLoading(false);
    }
  }, [user]);

  const loadOdds = useCallback(async () => {
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
      setFeatured(enriched);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load matches.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    loadOdds();
  }, [loadOdds]);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout>;

    const cycle = () => {
      timer = setTimeout(() => {
        Animated.timing(promoFade, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }).start(() => {
          if (!mounted) return;
          setPromoIndex((current) => (current + 1) % promotions.length);
          Animated.timing(promoFade, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }).start(() => {
            if (mounted) cycle();
          });
        });
      }, 10000);
    };

    cycle();

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [promoFade]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadProfile(), loadOdds()]);
    setRefreshing(false);
  }, [loadOdds, loadProfile]);

  const liveMatches = useMemo(
    () => featured.filter((match) => new Date(match.commenceTime).getTime() <= Date.now()),
    [featured]
  );

  const promo = promotions[promoIndex];

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

  const formatOdd = (value?: number) => (typeof value === "number" ? value.toFixed(2) : "--");
  const leftColWidth = isWeb && isLargeScreen ? 220 : 160;

  const getLineOptions = (market?: OddsMarket) => {
    if (!market) return [];
    const points = market.outcomes
      .map((outcome) => outcome.point)
      .filter((point): point is number => typeof point === "number")
      .filter((point) => point >= 0.5 && point <= 5.5);
    return Array.from(new Set(points)).sort((a, b) => a - b);
  };

  const renderOddCell = (
    match: OddsEvent,
    marketKey: string,
    outcome: OddsMarket["outcomes"][number] | undefined,
    outcomeLabel?: string
  ) => {
    const label = outcomeLabel ?? outcome?.name ?? "N/A";
    const selectionId = `${match.id}-${marketKey}-${label}`;
    const isSelected = selections.some((item) => item.id === selectionId);

    return (
      <Pressable
        key={selectionId}
        style={[
          styles.oddCell,
          isSelected && styles.oddCellActive,
          !outcome && styles.oddCellDisabled,
        ]}
        onPress={() =>
          outcome &&
          addSelection({
            id: selectionId,
            eventId: match.id,
            sportKey: match.sportKey,
            league: match.sportTitle,
            homeTeam: match.homeTeam,
            awayTeam: match.awayTeam,
            match: `${match.homeTeam} vs ${match.awayTeam}`,
            market: marketKey,
            outcome: label,
            odds: outcome.price,
            commenceTime: match.commenceTime,
            point: outcome.point ?? null,
          })
        }
        disabled={!outcome}
      >
        <Text
          style={[
            styles.oddText,
            isSelected && styles.oddTextActive,
            !outcome && styles.oddTextDisabled,
          ]}
        >
          {formatOdd(outcome?.price)}
        </Text>
      </Pressable>
    );
  };

  const renderMatchRow = (match: OddsEvent, options?: { live?: boolean; keyPrefix?: string }) => {
    const h2hMarket = match.markets.find((item) => item.key === "h2h");
    const totalsMarket =
      match.markets.find((item) => item.key === "alternate_totals") ??
      match.markets.find((item) => item.key === "totals");
    const bttsMarket = match.markets.find((item) => item.key === "btts");
    const dnbMarket = match.markets.find((item) => item.key === "draw_no_bet");
    const threeWayMarket = match.markets.find((item) => item.key === "h2h_3_way");
    const spreadsMarket = match.markets.find((item) => item.key === "spreads");
    const lineOptions = getLineOptions(totalsMarket);
    const defaultLine = lineOptions.includes(2.5) ? 2.5 : lineOptions[0];
    const storedLine = goalLines[match.id];
    const activeLine =
      lineOptions.length === 0
        ? null
        : storedLine && lineOptions.includes(storedLine)
          ? storedLine
          : defaultLine;
    const lineLabel = activeLine != null ? activeLine.toFixed(1) : "--";
    const totalsKey = totalsMarket?.key ?? "totals";
    const canCycleLine = lineOptions.length > 1;

    const homeOutcome = h2hMarket?.outcomes.find((outcome) => outcome.name === match.homeTeam);
    const drawOutcome = h2hMarket?.outcomes.find(
      (outcome) => outcome.name.toLowerCase() === "draw"
    );
    const awayOutcome = h2hMarket?.outcomes.find((outcome) => outcome.name === match.awayTeam);

    const threeWayHome = threeWayMarket?.outcomes.find((outcome) => outcome.name === match.homeTeam);
    const threeWayDraw = threeWayMarket?.outcomes.find(
      (outcome) => outcome.name.toLowerCase() === "draw"
    );
    const threeWayAway = threeWayMarket?.outcomes.find((outcome) => outcome.name === match.awayTeam);

    const bttsYes = bttsMarket?.outcomes.find((outcome) => outcome.name.toLowerCase() === "yes");
    const bttsNo = bttsMarket?.outcomes.find((outcome) => outcome.name.toLowerCase() === "no");

    const dnbHome = dnbMarket?.outcomes.find((outcome) => outcome.name === match.homeTeam);
    const dnbAway = dnbMarket?.outcomes.find((outcome) => outcome.name === match.awayTeam);

    const spreadHome = spreadsMarket?.outcomes.find((outcome) => outcome.name === match.homeTeam);
    const spreadAway = spreadsMarket?.outcomes.find((outcome) => outcome.name === match.awayTeam);

    const overOutcome =
      activeLine == null
        ? undefined
        : totalsMarket?.outcomes.find(
            (outcome) =>
              outcome.name.toLowerCase().startsWith("over") && outcome.point === activeLine
          );
    const underOutcome =
      activeLine == null
        ? undefined
        : totalsMarket?.outcomes.find(
            (outcome) =>
              outcome.name.toLowerCase().startsWith("under") && outcome.point === activeLine
          );

    const overLabel = activeLine != null ? `Over ${lineLabel}` : "Over";
    const underLabel = activeLine != null ? `Under ${lineLabel}` : "Under";
    const extraCount = match.markets.filter(
      (market) => market.key !== "h2h" && market.key !== totalsKey
    ).length;
    const key = options?.keyPrefix ? `${options.keyPrefix}-${match.id}` : match.id;

    return (
      <View key={key} style={styles.matchRow}>
        <View style={[styles.matchInfo, { width: leftColWidth }]}>
          <View style={styles.timeCol}>
            {options?.live ? (
              <View style={styles.liveTag}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            ) : null}
            <Text style={styles.timeText}>{formatMatchTime(match.commenceTime)}</Text>
          </View>
          <View style={styles.teamsCol}>
            <Text style={styles.teamText} numberOfLines={1}>
              {match.homeTeam}
            </Text>
            <Text style={styles.teamText} numberOfLines={1}>
              {match.awayTeam}
            </Text>
          </View>
          <View style={styles.statsCol}>
            <MaterialIcons name="show-chart" size={18} color={Brand.muted} />
          </View>
        </View>

        <ScrollView
          style={styles.oddsScroll}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.oddsGroup}
        >
          {marketKey === "h2h" ? (
            <>
              {renderOddCell(match, "h2h", homeOutcome)}
              {renderOddCell(match, "h2h", drawOutcome)}
              {renderOddCell(match, "h2h", awayOutcome)}
              <Pressable
                style={[styles.goalsCell, !activeLine && styles.goalsCellDisabled]}
                onPress={() => {
                  if (!canCycleLine || activeLine == null) return;
                  const currentIndex = lineOptions.indexOf(activeLine);
                  const nextLine = lineOptions[(currentIndex + 1) % lineOptions.length];
                  setGoalLines((current) => ({ ...current, [match.id]: nextLine }));
                }}
                disabled={!canCycleLine}
              >
                <Text style={[styles.goalsText, !activeLine && styles.goalsTextDisabled]}>
                  {lineLabel}
                </Text>
                {canCycleLine ? (
                  <MaterialIcons name="keyboard-arrow-down" size={18} color={Brand.muted} />
                ) : null}
              </Pressable>
              {renderOddCell(match, totalsKey, overOutcome, overLabel)}
              {renderOddCell(match, totalsKey, underOutcome, underLabel)}
            </>
          ) : null}
          {marketKey === "totals" ? (
            <>
              <Pressable
                style={[styles.goalsCell, !activeLine && styles.goalsCellDisabled]}
                onPress={() => {
                  if (!canCycleLine || activeLine == null) return;
                  const currentIndex = lineOptions.indexOf(activeLine);
                  const nextLine = lineOptions[(currentIndex + 1) % lineOptions.length];
                  setGoalLines((current) => ({ ...current, [match.id]: nextLine }));
                }}
                disabled={!canCycleLine}
              >
                <Text style={[styles.goalsText, !activeLine && styles.goalsTextDisabled]}>
                  {lineLabel}
                </Text>
                {canCycleLine ? (
                  <MaterialIcons name="keyboard-arrow-down" size={18} color={Brand.muted} />
                ) : null}
              </Pressable>
              {renderOddCell(match, totalsKey, overOutcome, overLabel)}
              {renderOddCell(match, totalsKey, underOutcome, underLabel)}
            </>
          ) : null}
          {marketKey === "btts" ? (
            <>
              {renderOddCell(match, "btts", bttsYes, "Yes")}
              {renderOddCell(match, "btts", bttsNo, "No")}
            </>
          ) : null}
          {marketKey === "draw_no_bet" ? (
            <>
              {renderOddCell(match, "draw_no_bet", dnbHome, "Home")}
              {renderOddCell(match, "draw_no_bet", dnbAway, "Away")}
            </>
          ) : null}
          {marketKey === "h2h_3_way" ? (
            <>
              {renderOddCell(match, "h2h_3_way", threeWayHome, "1")}
              {renderOddCell(match, "h2h_3_way", threeWayDraw, "X")}
              {renderOddCell(match, "h2h_3_way", threeWayAway, "2")}
            </>
          ) : null}
          {marketKey === "spreads" ? (
            <>
              {renderOddCell(match, "spreads", spreadHome, "Home")}
              {renderOddCell(match, "spreads", spreadAway, "Away")}
            </>
          ) : null}
          <Pressable
            style={styles.moreCell}
            onPress={() =>
              router.push({
                pathname: "/markets/[eventId]",
                params: {
                  eventId: match.id,
                  sportKey: match.sportKey,
                  homeTeam: match.homeTeam,
                  awayTeam: match.awayTeam,
                  league: match.sportTitle,
                },
              })
            }
          >
            <Text style={styles.moreText}>+{extraCount}</Text>
            <MaterialIcons name="chevron-right" size={16} color={Brand.muted} />
          </Pressable>
        </ScrollView>
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
            <Pressable style={styles.iconBtn} accessibilityLabel="Search">
              <MaterialIcons name="search" size={20} color={Brand.navy} />
            </Pressable>
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
              <Link href="/(tabs)/account" asChild>
                <Pressable style={styles.balancePill} accessibilityLabel="Open account">
                  <MaterialIcons name="account-circle" size={22} color={Brand.navy} />
                  <View>
                    <Text style={styles.balanceValue}>
                      {"\u20A6"}
                      {profileLoading ? "..." : walletBalance?.toLocaleString() ?? "0"}
                    </Text>
                  </View>
                </Pressable>
              </Link>
            )}
          </View>
        </View>

        <ScrollView
          contentContainerStyle={dynamicStyles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <Animated.View style={[dynamicStyles.hero, { opacity: promoFade }]}>
            <View style={styles.heroLeft}>
              <Text style={styles.heroLabel}>{promo.label}</Text>
              <Text style={dynamicStyles.heroTitle}>{promo.title}</Text>
              <Text style={styles.heroCopy}>{promo.copy}</Text>
              <Pressable style={styles.ctaBtn}>
                <Text style={styles.ctaText}>{promo.cta}</Text>
                <MaterialIcons name="chevron-right" size={20} color={Brand.card} />
              </Pressable>
            </View>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeTop}>{promo.badgeTop}</Text>
              <Text style={styles.heroBadgeBottom}>{promo.badgeBottom}</Text>
            </View>
          </Animated.View>

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

          <View style={styles.marketHeader}>
            <View style={[styles.marketHeaderLeft, { width: leftColWidth }]}>
              <Text style={styles.marketHeaderLabel}>Match</Text>
            </View>
            <ScrollView
              style={styles.oddsScroll}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.oddsGroup}
            >
              {marketKey === "h2h" ? (
                <>
                  <Text style={styles.headerCell}>1</Text>
                  <Text style={styles.headerCell}>X</Text>
                  <Text style={styles.headerCell}>2</Text>
                  <Text style={styles.headerCell}>Goals</Text>
                  <Text style={styles.headerCell}>Over</Text>
                  <Text style={styles.headerCell}>Under</Text>
                </>
              ) : null}
              {marketKey === "totals" ? (
                <>
                  <Text style={styles.headerCell}>Goals</Text>
                  <Text style={styles.headerCell}>Over</Text>
                  <Text style={styles.headerCell}>Under</Text>
                </>
              ) : null}
              {marketKey === "btts" ? (
                <>
                  <Text style={styles.headerCell}>Yes</Text>
                  <Text style={styles.headerCell}>No</Text>
                </>
              ) : null}
              {marketKey === "draw_no_bet" ? (
                <>
                  <Text style={styles.headerCell}>Home</Text>
                  <Text style={styles.headerCell}>Away</Text>
                </>
              ) : null}
              {marketKey === "h2h_3_way" ? (
                <>
                  <Text style={styles.headerCell}>1</Text>
                  <Text style={styles.headerCell}>X</Text>
                  <Text style={styles.headerCell}>2</Text>
                </>
              ) : null}
              {marketKey === "spreads" ? (
                <>
                  <Text style={styles.headerCell}>Home</Text>
                  <Text style={styles.headerCell}>Away</Text>
                </>
              ) : null}
              <Text style={styles.headerCell}>+M</Text>
            </ScrollView>
          </View>

          {featured.map((match) => renderMatchRow(match))}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Live Now</Text>
            <Text style={styles.sectionAction}>View live</Text>
          </View>
          {liveMatches.length === 0 ? (
            <Text style={styles.emptyOdds}>No live games at the moment.</Text>
          ) : (
            <>
              <View style={styles.marketHeader}>
                <View style={[styles.marketHeaderLeft, { width: leftColWidth }]}>
                  <Text style={styles.marketHeaderLabel}>Live Match</Text>
                </View>
                <ScrollView
                  style={styles.oddsScroll}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.oddsGroup}
                >
                  {marketKey === "h2h" ? (
                    <>
                      <Text style={styles.headerCell}>1</Text>
                      <Text style={styles.headerCell}>X</Text>
                      <Text style={styles.headerCell}>2</Text>
                      <Text style={styles.headerCell}>Goals</Text>
                      <Text style={styles.headerCell}>Over</Text>
                      <Text style={styles.headerCell}>Under</Text>
                    </>
                  ) : null}
                  {marketKey === "totals" ? (
                    <>
                      <Text style={styles.headerCell}>Goals</Text>
                      <Text style={styles.headerCell}>Over</Text>
                      <Text style={styles.headerCell}>Under</Text>
                    </>
                  ) : null}
                  {marketKey === "btts" ? (
                    <>
                      <Text style={styles.headerCell}>Yes</Text>
                      <Text style={styles.headerCell}>No</Text>
                    </>
                  ) : null}
                  {marketKey === "draw_no_bet" ? (
                    <>
                      <Text style={styles.headerCell}>Home</Text>
                      <Text style={styles.headerCell}>Away</Text>
                    </>
                  ) : null}
                  {marketKey === "h2h_3_way" ? (
                    <>
                      <Text style={styles.headerCell}>1</Text>
                      <Text style={styles.headerCell}>X</Text>
                      <Text style={styles.headerCell}>2</Text>
                    </>
                  ) : null}
                  {marketKey === "spreads" ? (
                    <>
                      <Text style={styles.headerCell}>Home</Text>
                      <Text style={styles.headerCell}>Away</Text>
                    </>
                  ) : null}
                  <Text style={styles.headerCell}>+M</Text>
                </ScrollView>
              </View>
              {liveMatches.map((match) => renderMatchRow(match, { live: true, keyPrefix: "live" }))}
            </>
          )}
        </ScrollView>
      </View>
      <BetSlipFab />
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
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Brand.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Brand.card,
  },
  balancePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.card,
  },
  balanceValue: {
    fontSize: 12,
    color: Brand.navy,
    fontWeight: "800",
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
  marketHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Brand.border,
    marginBottom: 6,
  },
  marketHeaderLeft: {
    flexShrink: 0,
  },
  marketHeaderLabel: {
    color: Brand.muted,
    fontWeight: "600",
    fontSize: 12,
  },
  headerCell: {
    width: 58,
    textAlign: "center",
    color: Brand.muted,
    fontWeight: "600",
    fontSize: 12,
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Brand.border,
  },
  matchInfo: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    paddingRight: 8,
  },
  oddsScroll: {
    flex: 1,
    minWidth: 0,
  },
  timeCol: {
    width: 62,
  },
  timeText: {
    fontSize: 12,
    fontWeight: "700",
    color: Brand.text,
  },
  teamsCol: {
    flex: 1,
  },
  teamText: {
    fontSize: 13,
    fontWeight: "700",
    color: Brand.text,
  },
  statsCol: {
    width: 28,
    alignItems: "center",
  },
  oddsGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 6,
    paddingRight: 16,
  },
  oddCell: {
    width: 58,
    height: 44,
    borderRadius: 10,
    backgroundColor: Brand.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  oddCellActive: {
    backgroundColor: Brand.gold,
  },
  oddCellDisabled: {
    backgroundColor: Brand.border,
  },
  oddText: {
    color: Brand.card,
    fontWeight: "700",
    fontSize: 13,
  },
  oddTextActive: {
    color: Brand.navyDeep,
  },
  oddTextDisabled: {
    color: Brand.muted,
  },
  goalsCell: {
    width: 58,
    height: 44,
    borderRadius: 10,
    backgroundColor: Brand.card,
    borderWidth: 1,
    borderColor: Brand.border,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 2,
  },
  goalsCellDisabled: {
    backgroundColor: Brand.background,
  },
  goalsText: {
    color: Brand.navy,
    fontWeight: "700",
    fontSize: 13,
  },
  goalsTextDisabled: {
    color: Brand.muted,
  },
  moreCell: {
    width: 54,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Brand.border,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 2,
    backgroundColor: Brand.card,
  },
  moreText: {
    color: Brand.navy,
    fontWeight: "700",
    fontSize: 12,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Brand.green,
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

