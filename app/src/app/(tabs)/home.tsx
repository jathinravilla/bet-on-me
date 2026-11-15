import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { Category, ChallengeView, SearchResponse } from '../../../../lib/types';
import { ChallengeCard } from '@/components/ChallengeCard';
import { Butterfingers } from '@/components/Butterfingers';
import { Avatar, Gradient, Sheet, Squish, useToast } from '@/components/fx';
import { Banner, Body, Button, Chip, DevnetTag, Icon, CardSkeletons, EmptyState, Label, Muted, Row, Screen, Segmented, type IconName } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { bucketOf, coins, type Bucket } from '@/lib/format';
import { useNow } from '@/lib/useNow';
import { categoryMeta, colors, fonts, gradients, radius, space } from '@/lib/theme';

type Tab = 'mine' | 'public';
type Filter = 'all' | Category;

const FILTERS: { value: Filter; label: string; icon: IconName }[] = [
  { value: 'all', label: 'All', icon: 'view-grid-outline' },
  { value: 'strava', label: 'Running', icon: categoryMeta.strava.icon },
  { value: 'chess', label: 'Chess', icon: categoryMeta.chess.icon },
  { value: 'github', label: 'GitHub', icon: categoryMeta.github.icon },
  { value: 'duolingo', label: 'Duolingo', icon: categoryMeta.duolingo.icon },
  { value: 'dare', label: 'Dares', icon: categoryMeta.dare.icon },
];

const STATUSES: { value: Bucket; label: string }[] = [
  { value: 'current', label: 'Current' },
  { value: 'finished', label: 'Finished' },
  { value: 'closed', label: 'Closed' },
];

const EMPTY_COPY: Record<Bucket, { title: string; body: string }> = {
  current: { title: 'No bets yet', body: 'Start a challenge, join a friend with a code, or browse public challenges.' },
  finished: { title: 'Nothing finished yet', body: 'Bets that end with a winner show up here, with their payout receipts.' },
  closed: { title: 'Nothing closed', body: 'Bets that were refunded or taken down show up here.' },
};

export default function Home() {
  const { me, refresh } = useAuth();
  const [tab, setTab] = useState<Tab>('mine');
  const [filter, setFilter] = useState<Filter>('all');
  const [status, setStatus] = useState<Bucket>('current');
  const [showHidden, setShowHidden] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<ChallengeView | null>(null);
  const toast = useToast();
  const [lists, setLists] = useState<Record<Tab, ChallengeView[] | null>>({ mine: null, public: null });
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<(SearchResponse & { term: string }) | null>(null);

  // Search public bets (MongoDB Atlas Search) once you pause typing.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const t = setTimeout(() => {
      api<SearchResponse>(`/challenges/search?q=${encodeURIComponent(term)}`)
        .then((r) => setFound({ ...r, term }))
        .catch(() => setFound({ engine: 'basic', results: [], term }));
    }, 350);
    return () => clearTimeout(t);
  }, [q]);
  const now = useNow();

  const load = useCallback(async () => {
    try {
      const [mine, pub] = await Promise.all([api<ChallengeView[]>('/challenges/mine'), api<ChallengeView[]>('/challenges?visibility=public')]);
      setLists({ mine, public: pub });
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      void refresh();
      const poll = setInterval(() => void load(), 15_000);
      return () => clearInterval(poll);
    }, [load, refresh])
  );

  if (!me) return null;
  const list = lists[tab];
  const term = q.trim();
  const searchActive = tab === 'public' && term.length >= 2;
  const source = searchActive ? (found?.term === term ? found.results : null) : list;
  const pool = source?.filter((c) => (filter === 'all' || c.category === filter) && (showHidden || !c.hidden)) ?? null;
  const counts: Record<Bucket, number> = { current: 0, finished: 0, closed: 0 };
  for (const c of pool ?? []) counts[bucketOf(c)]++;
  const shown = pool === null ? null : searchActive ? pool : pool.filter((c) => bucketOf(c) === status);
  const hiddenCount = (list ?? []).filter((c) => c.hidden).length;
  const activeFilter = FILTERS.find((f) => f.value === filter)!;
  const myLive = (lists.mine ?? []).filter((c) => c.status === 'active' && new Date(c.endsAt).getTime() > now);
  const inPlay = myLive.reduce((s, c) => s + c.stakeLamports, 0);
  const atStake = myLive.reduce((s, c) => s + c.potLamports, 0);

  const vote = async (c: ChallengeView, value: 1 | -1 | 0) => {
    try {
      const updated = await api<ChallengeView>(`/challenges/${c.id}/vote`, { body: { value } });
      setLists((l) => ({ ...l, public: (l.public ?? []).map((x) => (x.id === c.id ? updated : x)).filter((x) => x.status !== 'banned') }));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const setHidden = async (c: ChallengeView, hidden: boolean) => {
    setMenuFor(null);
    const mark = (on: boolean) => (x: ChallengeView) => (x.id === c.id ? { ...x, hidden: on } : x);
    setLists((l) => ({ mine: l.mine?.map(mark(hidden)) ?? null, public: l.public?.map(mark(hidden)) ?? null }));
    setFound((f) => (f ? { ...f, results: f.results.map(mark(hidden)) } : f));
    try {
      await api(`/challenges/${c.id}/hide`, { body: { hidden } });
      toast(hidden ? 'Hidden from your home. Find it under Filter → Show hidden bets.' : 'Back on your home.', 'success', hidden ? 'eye-off-outline' : 'eye-outline');
    } catch (e) {
      setLists((l) => ({ mine: l.mine?.map(mark(!hidden)) ?? null, public: l.public?.map(mark(!hidden)) ?? null }));
      setFound((f) => (f ? { ...f, results: f.results.map(mark(!hidden)) } : f));
      toast(errorMessage(e), 'danger');
    }
  };

  return (
    <Screen
      tabbed
      refreshControl={
        <RefreshControl
          tintColor={colors.primary}
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await Promise.all([load(), refresh()]);
            setRefreshing(false);
          }}
        />
      }>
      <Row style={{ justifyContent: 'space-between', minHeight: 44 }}>
        <Text style={styles.wordmark} accessibilityRole="header">
          Bet on me
        </Text>
        <Squish accessibilityLabel="Open your profile" onPress={() => router.navigate('/profile')}>
          <Avatar username={me.username} avatar={me.avatar} size={32} />
        </Squish>
      </Row>

      {/* Hero: glacier card, navy type, mascot */}
      <Gradient colors={gradients.hero} style={styles.hero}>
        <View style={styles.mascot} pointerEvents="none">
          <Butterfingers mood="slip" size={132} />
        </View>
        <Text style={styles.heroLabel}>Your balance</Text>
        <Row gap={6} style={{ alignItems: 'baseline' }}>
          <Text style={styles.balance}>{coins(me.wallet.balanceLamports)}</Text>
          <Text style={styles.unit}>coins</Text>
        </Row>
        <Row gap={space.sm} style={{ marginTop: space.sm, flexWrap: 'wrap' }}>
          <Stat label="In play" value={coins(inPlay)} />
          <Stat label="Pots you’re in" value={coins(atStake)} />
          <Stat label="Open bets" value={String(myLive.length)} />
        </Row>
      </Gradient>
      <Row gap={space.sm}>
        <Button title="New challenge" icon="plus" onPress={() => router.push('/create')} style={styles.flex} />
        <Button variant="secondary" title="Join with code" icon="ticket-outline" onPress={() => router.push('/join')} style={styles.flex} />
      </Row>

      {error ? <Banner text={error} /> : null}

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'mine', label: 'Your bets' },
          { value: 'public', label: 'Public' },
        ]}
      />
      <Row gap={space.sm} style={{ justifyContent: 'space-between' }}>
        {searchActive ? (
          <View style={styles.flex} />
        ) : (
          <Row gap={space.sm} style={styles.flex}>
            {STATUSES.map((st) => {
              const on = status === st.value;
              return (
                <Squish key={st.value} accessibilityRole="radio" selected={on} accessibilityLabel={`${st.label}, ${counts[st.value]} bets`} onPress={() => setStatus(st.value)} style={[styles.filter, styles.statusPill, on && styles.filterOn]}>
                  <Text style={[styles.filterText, on && { color: colors.onPrimary }]}>
                    {st.label}
                    {counts[st.value] ? <Text style={[styles.count, on && { color: colors.onPrimary }]}> {counts[st.value]}</Text> : null}
                  </Text>
                </Squish>
              );
            })}
          </Row>
        )}
        <Squish
          accessibilityLabel={filter === 'all' ? 'Filter by category' : `Filtering by ${activeFilter.label}. Change filter`}
          onPress={() => setFilterOpen(true)}
          style={[styles.filterBtn, (filter !== 'all' || showHidden) && styles.filterOn]}>
          <Icon name="tune-variant" size={18} color={filter !== 'all' || showHidden ? colors.onPrimary : colors.textMuted} />
          {filter !== 'all' ? <Text style={[styles.filterText, { color: colors.onPrimary }]}>{activeFilter.label}</Text> : null}
        </Squish>
      </Row>

      {tab === 'public' ? (
        <View>
          <View style={styles.search}>
            <Icon name="magnify" color={colors.textDim} size={20} />
            <TextInput
              accessibilityLabel="Search public bets"
              value={q}
              onChangeText={setQ}
              placeholder="Search bets, dares, people"
              placeholderTextColor={colors.textDim}
              selectionColor={colors.primary}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              style={styles.searchInput}
            />
            {searchActive && found?.engine === 'atlas' ? <Chip icon="leaf" text="Atlas Search" tone="success" /> : null}
          </View>
        </View>
      ) : null}

      {shown === null ? (
        <CardSkeletons label="Loading challenges" />
      ) : shown.length === 0 ? (
        <EmptyState
          title={searchActive ? `Nothing found for “${term}”` : filter !== 'all' ? `Nothing under ${activeFilter.label}` : tab === 'mine' ? EMPTY_COPY[status].title : status === 'current' ? 'No public challenges live' : EMPTY_COPY[status].title}
          body={
            filter !== 'all'
              ? 'Try another category, or clear the filter.'
              : tab === 'mine'
                ? hiddenCount > 0 && status === 'current'
                  ? `${EMPTY_COPY[status].body} You have ${hiddenCount} hidden — turn on “Show hidden bets” in Filter to see them.`
                  : EMPTY_COPY[status].body
                : status === 'current'
                  ? 'Create a public challenge and anyone can take the other side.'
                  : EMPTY_COPY[status].body
          }
          action={filter !== 'all' ? { title: 'Clear filter', onPress: () => setFilter('all'), variant: 'secondary' } : status === 'current' ? { title: 'New challenge', onPress: () => router.push('/create') } : undefined}
          secondary={filter === 'all' && tab === 'mine' && status === 'current' ? { title: 'Browse public', onPress: () => setTab('public') } : undefined}>
          <Butterfingers mood={tab === 'mine' ? 'thinking' : 'idle'} size={110} />
        </EmptyState>
      ) : (
        <View style={{ gap: space.md }}>
          {shown.map((c) => (
            <Animated.View key={c.id} entering={FadeIn.duration(200)}>
              <ChallengeCard c={c} now={now} onPress={() => router.push(`/challenge/${c.id}`)} onVote={tab === 'public' ? (v) => void vote(c, v) : undefined} onMore={() => setMenuFor(c)} />
            </Animated.View>
          ))}
        </View>
      )}

      <Sheet visible={filterOpen} onClose={() => setFilterOpen(false)} title="Filter">
        <Label>Category</Label>
        <View style={styles.pills}>
          {FILTERS.map((f) => {
            const on = filter === f.value;
            return (
              <Squish key={f.value} accessibilityRole="radio" selected={on} accessibilityLabel={f.label} onPress={() => setFilter(f.value)} style={[styles.filter, styles.pill, on && styles.filterOn]}>
                <Icon name={f.icon} size={16} color={on ? colors.onPrimary : colors.textMuted} />
                <Text style={[styles.filterText, on && { color: colors.onPrimary }]}>{f.label}</Text>
              </Squish>
            );
          })}
        </View>
        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <Body>Show hidden bets</Body>
            <Muted>{hiddenCount === 0 ? 'You haven’t hidden anything.' : `${hiddenCount} hidden in this list.`}</Muted>
          </View>
          <Switch accessibilityLabel="Show hidden bets" value={showHidden} onValueChange={setShowHidden} trackColor={{ true: colors.primary, false: colors.surfaceHi }} thumbColor={colors.text} />
        </View>
        <Button title="Done" onPress={() => setFilterOpen(false)} />
      </Sheet>

      <Sheet visible={menuFor !== null} onClose={() => setMenuFor(null)} title={menuFor?.title}>
        <Muted>Hiding only clears it from your own list. Your stake, the pot and the result don’t change, and others still see it.</Muted>
        {menuFor ? <Button variant="secondary" icon={menuFor.hidden ? 'eye-outline' : 'eye-off-outline'} title={menuFor.hidden ? 'Show on my home' : 'Hide from my home'} onPress={() => void setHidden(menuFor, !menuFor.hidden)} /> : null}
        <Button variant="ghost" title="Open bet" onPress={() => { const id = menuFor?.id; setMenuFor(null); if (id) router.push(`/challenge/${id}`); }} />
      </Sheet>

      <View style={{ alignItems: 'center' }}>
        <DevnetTag mock={me.chainMock} />
      </View>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View accessible accessibilityLabel={`${label} ${value}`} style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wordmark: { fontFamily: fonts.display, fontSize: 28, letterSpacing: 0.3, color: colors.text, textTransform: 'uppercase' },
  hero: { borderRadius: radius.xl + 4, padding: space.xl, paddingRight: space.lg, overflow: 'hidden', gap: 2, minHeight: 190 },
  mascot: { position: 'absolute', right: 0, top: 8 },
  heroLabel: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.paperMuted, letterSpacing: 0.3, textTransform: 'uppercase' },
  balance: { fontFamily: fonts.displayHeavy, fontSize: 76, lineHeight: 80, letterSpacing: 0.5, color: colors.paperText, fontVariant: ['tabular-nums'] },
  unit: { fontFamily: fonts.displaySemi, fontSize: 18, color: colors.paperMuted },
  stat: { backgroundColor: 'rgba(10,27,63,0.9)', borderRadius: radius.lg, paddingHorizontal: space.md, paddingVertical: space.sm, minWidth: 86 },
  statLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.primary },
  statValue: { fontFamily: fonts.display, fontSize: 22, lineHeight: 24, letterSpacing: 0.3, color: colors.text, fontVariant: ['tabular-nums'] },
  filter: { paddingHorizontal: 14, height: 34, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderHi, alignItems: 'center', justifyContent: 'center' },
  filterOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  statusPill: { paddingHorizontal: 12 },
  count: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textDim },
  filterBtn: { minWidth: 36, height: 34, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderHi, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pill: { flexDirection: 'row', gap: 6, height: 38 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  filterText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.textMuted },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderHi, backgroundColor: colors.surface, paddingHorizontal: space.md },
  searchInput: { flex: 1, color: colors.text, fontFamily: fonts.body, fontSize: 15, minHeight: 44 },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl, paddingHorizontal: space.lg },
});
