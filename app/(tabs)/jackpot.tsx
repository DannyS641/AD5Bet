import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';

import { Brand } from '@/constants/brand';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

type Jackpot = {
  id: string;
  title: string;
  pick_count: number;
  entry_fee: number;
  currency: string;
  prize_pool: number;
  status: string;
  closes_at: string;
};

type JackpotEvent = {
  id: string;
  event_id: string;
  home_team: string;
  away_team: string;
  start_time: string;
  outcomes: string[];
};

const formatCurrency = (amount: number, currency: string) => {
  const normalized = currency.toUpperCase();
  if (normalized === 'NGN') {
    return `NGN ${amount.toLocaleString()}`;
  }
  return `${normalized} ${amount.toLocaleString()}`;
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });

const labelOutcome = (event: JackpotEvent, outcome: string) => {
  if (outcome === 'home') return event.home_team;
  if (outcome === 'away') return event.away_team;
  if (outcome === 'draw') return 'Draw';
  return outcome.toUpperCase();
};

export default function JackpotScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [jackpot, setJackpot] = useState<Jackpot | null>(null);
  const [events, setEvents] = useState<JackpotEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selections, setSelections] = useState<Record<string, string>>({});

  const pickCount = jackpot?.pick_count ?? 0;
  const selectedCount = useMemo(() => Object.keys(selections).length, [selections]);

  const loadJackpot = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: jackpotData, error: jackpotError } = await supabase
      .from('jackpots')
      .select('*')
      .eq('status', 'open')
      .order('closes_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (jackpotError) {
      setError(jackpotError.message);
      setLoading(false);
      return;
    }

    setJackpot((jackpotData as Jackpot) ?? null);

    if (!jackpotData) {
      setEvents([]);
      setLoading(false);
      return;
    }

    const { data: eventsData, error: eventsError } = await supabase
      .from('jackpot_events')
      .select('*')
      .eq('jackpot_id', jackpotData.id)
      .order('start_time', { ascending: true });

    if (eventsError) {
      setError(eventsError.message);
      setLoading(false);
      return;
    }

    setEvents((eventsData ?? []) as JackpotEvent[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadJackpot();
  }, [loadJackpot]);

  useEffect(() => {
    setSelections({});
    setSuccess(null);
  }, [jackpot?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadJackpot();
    setRefreshing(false);
  }, [loadJackpot]);

  const handlePick = useCallback(
    (eventId: string, outcome: string) => {
      setError(null);
      setSuccess(null);
      setSelections((prev) => {
        const next = { ...prev };
        const alreadySelected = next[eventId];
        if (alreadySelected === outcome) {
          delete next[eventId];
          return next;
        }
        if (!alreadySelected && pickCount > 0 && Object.keys(prev).length >= pickCount) {
          setError(`You already selected ${pickCount} picks.`);
          return prev;
        }
        next[eventId] = outcome;
        return next;
      });
    },
    [pickCount],
  );

  const handleSubmit = useCallback(async () => {
    if (!jackpot) {
      setError('No active jackpot.');
      return;
    }

    if (!user) {
      router.push('/login');
      return;
    }

    if (selectedCount !== pickCount) {
      setError(`Select exactly ${pickCount} picks.`);
      return;
    }

    setSubmitting(true);
    setError(null);

    const { error: submitError } = await supabase.rpc('place_jackpot_entry', {
      p_jackpot_id: jackpot.id,
      p_selections: selections,
    });

    if (submitError) {
      setError(submitError.message);
      setSubmitting(false);
      return;
    }

    setSuccess('Entry submitted successfully.');
    setSelections({});
    setSubmitting(false);
  }, [jackpot, pickCount, router, selectedCount, selections, user]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: 16 + insets.top }]}>
        <Text style={styles.title}>Jackpot</Text>
        <MaterialIcons name="emoji-events" size={22} color={Brand.navy} />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={Brand.navy} />
            <Text style={styles.loadingText}>Loading jackpot...</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {success ? <Text style={styles.successText}>{success}</Text> : null}

        {!loading && !jackpot ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>No open jackpots</Text>
            <Text style={styles.cardCopy}>Please check back later.</Text>
          </View>
        ) : null}

        {jackpot ? (
          <View style={styles.banner}>
            <Text style={styles.bannerLabel}>{jackpot.title}</Text>
            <Text style={styles.bannerPrize}>{formatCurrency(jackpot.prize_pool, jackpot.currency)}</Text>
            <Text style={styles.bannerCopy}>
              Pick {jackpot.pick_count} matches. Entry fee {formatCurrency(jackpot.entry_fee, jackpot.currency)}.
            </Text>
            <Text style={styles.bannerCopy}>Closes {formatTime(jackpot.closes_at)}.</Text>
          </View>
        ) : null}

        {jackpot ? (
          <View style={styles.progressRow}>
            <Text style={styles.progressLabel}>Your picks</Text>
            <Text style={styles.progressValue}>
              {selectedCount}/{pickCount}
            </Text>
          </View>
        ) : null}

        {events.map((event) => (
          <View key={event.id} style={styles.eventCard}>
            <View style={styles.eventHeader}>
              <Text style={styles.eventTeams}>
                {event.home_team} vs {event.away_team}
              </Text>
              <Text style={styles.eventTime}>{formatTime(event.start_time)}</Text>
            </View>
            <View style={styles.outcomeRow}>
              {event.outcomes.map((outcome) => {
                const selected = selections[event.event_id] === outcome;
                return (
                  <Pressable
                    key={`${event.event_id}-${outcome}`}
                    style={[styles.outcomePill, selected && styles.outcomePillActive]}
                    onPress={() => handlePick(event.event_id, outcome)}
                  >
                    <Text style={[styles.outcomeText, selected && styles.outcomeTextActive]}>
                      {labelOutcome(event, outcome)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        {jackpot ? (
          <Pressable
            style={[styles.submitBtn, (submitting || selectedCount !== pickCount) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting || selectedCount !== pickCount}
          >
            {submitting ? (
              <ActivityIndicator color={Brand.card} />
            ) : (
              <Text style={styles.submitText}>
                Submit {pickCount} Picks
              </Text>
            )}
          </Pressable>
        ) : null}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: Brand.navy,
  },
  content: {
    padding: 20,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  loadingText: {
    color: Brand.muted,
    fontWeight: '600',
  },
  errorText: {
    color: '#d15353',
    fontWeight: '600',
    marginBottom: 12,
  },
  successText: {
    color: Brand.green,
    fontWeight: '700',
    marginBottom: 12,
  },
  banner: {
    backgroundColor: Brand.navy,
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
  },
  bannerLabel: {
    color: Brand.gold,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 12,
  },
  bannerPrize: {
    color: Brand.card,
    fontSize: 22,
    fontWeight: '800',
    marginTop: 8,
  },
  bannerCopy: {
    color: '#d7e2f0',
    marginTop: 6,
  },
  card: {
    backgroundColor: Brand.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  cardTitle: {
    fontWeight: '700',
    color: Brand.text,
  },
  cardCopy: {
    color: Brand.muted,
    marginTop: 6,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressLabel: {
    color: Brand.muted,
    fontWeight: '600',
  },
  progressValue: {
    color: Brand.navy,
    fontWeight: '800',
  },
  eventCard: {
    backgroundColor: Brand.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 10,
  },
  eventTeams: {
    flex: 1,
    fontWeight: '700',
    color: Brand.text,
  },
  eventTime: {
    color: Brand.muted,
    fontSize: 12,
  },
  outcomeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  outcomePill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.background,
  },
  outcomePillActive: {
    backgroundColor: Brand.navy,
    borderColor: Brand.navy,
  },
  outcomeText: {
    color: Brand.navy,
    fontWeight: '600',
    fontSize: 12,
  },
  outcomeTextActive: {
    color: Brand.card,
  },
  submitBtn: {
    marginTop: 10,
    backgroundColor: Brand.navy,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: Brand.card,
    fontWeight: '700',
  },
});
