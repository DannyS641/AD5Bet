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
import { useRouter } from 'expo-router';

import { Brand } from '@/constants/brand';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

type Jackpot = {
  id: string;
  title: string;
  pick_count: number;
  prize_pool: number;
  currency: string;
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

export default function JackpotAdminScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const adminEmails = useMemo(
    () =>
      (process.env.EXPO_PUBLIC_ADMIN_EMAILS ?? '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    []
  );
  const isAdmin = Boolean(user?.email && adminEmails.includes(user.email.toLowerCase()));

  const [jackpots, setJackpots] = useState<Jackpot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [events, setEvents] = useState<JackpotEvent[]>([]);
  const [results, setResults] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadJackpots = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase
      .from('jackpots')
      .select('*')
      .order('closes_at', { ascending: true });

    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }

    const items = (data ?? []) as Jackpot[];
    setJackpots(items);
    if (!selectedId && items.length > 0) {
      setSelectedId(items[0].id);
    } else if (selectedId && !items.find((item) => item.id === selectedId)) {
      setSelectedId(items[0]?.id ?? null);
    }
    setLoading(false);
  }, [selectedId]);

  const loadEvents = useCallback(async () => {
    if (!selectedId) {
      setEvents([]);
      return;
    }
    const { data, error: loadError } = await supabase
      .from('jackpot_events')
      .select('*')
      .eq('jackpot_id', selectedId)
      .order('start_time', { ascending: true });

    if (loadError) {
      setError(loadError.message);
      return;
    }

    setEvents((data ?? []) as JackpotEvent[]);
  }, [selectedId]);

  useEffect(() => {
    loadJackpots();
  }, [loadJackpots]);

  useEffect(() => {
    loadEvents();
    setResults({});
    setSuccess(null);
  }, [loadEvents, selectedId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadJackpots();
    await loadEvents();
    setRefreshing(false);
  }, [loadEvents, loadJackpots]);

  const handlePick = useCallback((eventId: string, outcome: string) => {
    setError(null);
    setSuccess(null);
    setResults((prev) => ({ ...prev, [eventId]: outcome }));
  }, []);

  const canSettle = useMemo(
    () => events.length > 0 && events.every((event) => Boolean(results[event.event_id])),
    [events, results]
  );

  const handleSettle = useCallback(async () => {
    if (!selectedId) {
      setError('Select a jackpot.');
      return;
    }

    if (!user) {
      router.push('/login');
      return;
    }

    if (!isAdmin) {
      setError('Admin access required.');
      return;
    }

    if (!canSettle) {
      setError('Select outcomes for every event.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError('Please sign in again.');
      setSubmitting(false);
      return;
    }

    const { data, error: invokeError } = await supabase.functions.invoke('settle-jackpot', {
      body: { jackpotId: selectedId, results },
      headers: { Authorization: `Bearer ${token}` },
    });

    if (invokeError) {
      setError(invokeError.message);
      setSubmitting(false);
      return;
    }

    if (data?.error) {
      setError(data.error);
      setSubmitting(false);
      return;
    }

    setSuccess(`Jackpot settled. Winners: ${data?.winners ?? 0}.`);
    setSubmitting(false);
    await loadJackpots();
  }, [canSettle, isAdmin, loadJackpots, results, router, selectedId, user]);

  if (!adminEmails.length) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.title}>Jackpot Admin</Text>
        <Text style={styles.infoText}>Set EXPO_PUBLIC_ADMIN_EMAILS to enable admin access.</Text>
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.title}>Jackpot Admin</Text>
        <Text style={styles.infoText}>You do not have access to this screen.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingTop: insets.top }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>Jackpot Admin</Text>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={Brand.navy} />
          <Text style={styles.loadingText}>Loading jackpots...</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {success ? <Text style={styles.successText}>{success}</Text> : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Select Jackpot</Text>
        {jackpots.length === 0 ? <Text style={styles.infoText}>No jackpots found.</Text> : null}
        <View style={styles.chipRow}>
          {jackpots.map((item) => {
            const selected = item.id === selectedId;
            return (
              <Pressable
                key={item.id}
                style={[styles.chip, selected && styles.chipActive]}
                onPress={() => setSelectedId(item.id)}
              >
                <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                  {item.title} ({formatCurrency(item.prize_pool, item.currency)})
                </Text>
                <Text style={styles.chipMeta}>Closes {formatTime(item.closes_at)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Set Results</Text>
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
                const selected = results[event.event_id] === outcome;
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
      </View>

      <Pressable
        style={[styles.submitBtn, (!canSettle || submitting) && styles.submitBtnDisabled]}
        onPress={handleSettle}
        disabled={!canSettle || submitting}
      >
        {submitting ? <ActivityIndicator color={Brand.card} /> : <Text style={styles.submitText}>Settle Jackpot</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    backgroundColor: Brand.background,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Brand.navy,
    marginBottom: 12,
  },
  infoText: {
    color: Brand.muted,
    fontWeight: '600',
    marginBottom: 12,
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
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Brand.text,
    marginBottom: 8,
  },
  chipRow: {
    gap: 10,
  },
  chip: {
    backgroundColor: Brand.card,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  chipActive: {
    borderColor: Brand.navy,
  },
  chipText: {
    color: Brand.text,
    fontWeight: '700',
  },
  chipTextActive: {
    color: Brand.navy,
  },
  chipMeta: {
    color: Brand.muted,
    fontSize: 12,
    marginTop: 4,
  },
  eventCard: {
    backgroundColor: Brand.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
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
