import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { Category, ChallengeView } from '../../../../lib/types';
import { ChallengeCard } from '@/components/ChallengeCard';
import { Butterfingers } from '@/components/Butterfingers';
import { Avatar, Gradient, Squish } from '@/components/fx';
import { Banner, Button, DevnetTag, Heading, Loading, Muted, Row, Screen, Segmented } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { coins } from '@/lib/format';
import { useNow } from '@/lib/useNow';
import { colors, fonts, gradients, radius, space } from '@/lib/theme';

type Tab = 'mine' | 'public';
type Filter = 'all' | Category;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'strava', label: 'Running' },
  { value: 'chess', label: 'Chess' },
  { value: 'dare', label: 'Dares' },
];

export default function Home() {
  const { me, refresh } = useAuth();
  const [tab, setTab] = useState<Tab>('mine');
  const [filter, setFilter] = useState<Filter>('all');
  const [lists, setLists] = useState<Record<Tab, ChallengeView[] | null>>({ mine: null, public: null });
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
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
  const shown = list?.filter((c) => filter === 'all' || c.category === filter) ?? null;
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
          <Butterfingers mood="idle" size={150} />
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }} style={{ marginHorizontal: -space.lg, marginTop: -space.xs }}>
        {FILTERS.map((f) => {
          const on = filter === f.value;
          return (
            <Squish key={f.value} accessibilityRole="radio" accessibilityLabel={`Show ${f.label}`} onPress={() => setFilter(f.value)} style={[styles.filter, on && styles.filterOn]}>
              <Text style={[styles.filterText, on && { color: colors.onPrimary }]}>{f.label}</Text>
            </Squish>
          );
        })}
      </ScrollView>

      {shown === null ? (
        <Loading label="Loading challenges" />
      ) : shown.length === 0 ? (
        <View style={styles.empty}>
          <Butterfingers mood={tab === 'mine' ? 'thinking' : 'idle'} size={110} />
          <Heading center>{tab === 'mine' ? (filter === 'all' ? 'No bets yet' : 'Nothing in this category') : 'No public challenges live'}</Heading>
          <Muted center>{tab === 'mine' ? 'Start a challenge, join a friend with a code, or browse public challenges.' : 'Create a public challenge and anyone can take the other side.'}</Muted>
          <Row gap={space.sm}>
            <Button small title="New challenge" onPress={() => router.push('/create')} />
            {tab === 'mine' ? <Button small variant="secondary" title="Browse public" onPress={() => setTab('public')} /> : null}
          </Row>
        </View>
      ) : (
        <View style={{ gap: space.md }}>
          {shown.map((c) => (
            <Animated.View key={c.id} entering={FadeIn.duration(200)}>
              <ChallengeCard c={c} now={now} onPress={() => router.push(`/challenge/${c.id}`)} onVote={tab === 'public' ? (v) => void vote(c, v) : undefined} />
            </Animated.View>
          ))}
        </View>
      )}

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
  mascot: { position: 'absolute', right: 6, top: 4 },
  heroLabel: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.paperMuted, letterSpacing: 0.3, textTransform: 'uppercase' },
  balance: { fontFamily: fonts.displayHeavy, fontSize: 76, lineHeight: 80, letterSpacing: 0.5, color: colors.paperText, fontVariant: ['tabular-nums'] },
  unit: { fontFamily: fonts.displaySemi, fontSize: 18, color: colors.paperMuted },
  stat: { backgroundColor: 'rgba(10,27,63,0.9)', borderRadius: radius.lg, paddingHorizontal: space.md, paddingVertical: space.sm, minWidth: 86 },
  statLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.primary },
  statValue: { fontFamily: fonts.display, fontSize: 22, lineHeight: 24, letterSpacing: 0.3, color: colors.text, fontVariant: ['tabular-nums'] },
  filter: { paddingHorizontal: 14, height: 34, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderHi, alignItems: 'center', justifyContent: 'center' },
  filterOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.textMuted },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl, paddingHorizontal: space.lg },
});
