import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import type { ChallengeView } from '../../../lib/types';
import { Butterfingers } from '@/components/Butterfingers';
import { ChallengeCard } from '@/components/ChallengeCard';
import { Banner, Body, Button, DevnetTag, Heading, Icon, Label, Loading, Row, Screen, Segmented, Title } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { sol } from '@/lib/format';
import { useNow } from '@/lib/useNow';
import { colors, icon, radius, space, touch } from '@/lib/theme';

type Tab = 'mine' | 'public';

export default function Home() {
  const { me, refresh } = useAuth();
  const [tab, setTab] = useState<Tab>('mine');
  const [lists, setLists] = useState<Record<Tab, ChallengeView[] | null>>({ mine: null, public: null });
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const now = useNow();

  const load = useCallback(async (which: Tab) => {
    try {
      const data = await api<ChallengeView[]>(which === 'mine' ? '/challenges/mine' : '/challenges?visibility=public');
      setLists((l) => ({ ...l, [which]: data }));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(tab);
      void refresh();
      const poll = setInterval(() => void load(tab), 15_000);
      return () => clearInterval(poll);
    }, [tab, load, refresh])
  );

  if (!me) return <Redirect href="/login" />;
  const list = lists[tab];

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
      refreshControl={
        <RefreshControl
          tintColor={colors.primary}
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await Promise.all([load(tab), refresh()]);
            setRefreshing(false);
          }}
        />
      }
      footer={
        <Row gap={space.md}>
          <Button title="Join code" icon="ticket-confirmation-outline" variant="secondary" onPress={() => router.push('/join')} style={styles.flex} />
          <Button title="Create" icon="plus-thick" onPress={() => router.push('/create')} style={styles.flex} />
        </Row>
      }>
      <Row style={{ justifyContent: 'space-between' }}>
        <View>
          <Title accessibilityRole="header">
            Bet on <Title color={colors.primary}>me</Title>
          </Title>
          <Label>Hey, {me.username}</Label>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Profile. Balance ${sol(me.wallet.balanceLamports)} SOL, ${me.points} Clout`}
          onPress={() => router.push('/profile')}
          style={({ pressed }) => [styles.wallet, pressed && { opacity: 0.7 }]}>
          <Icon name="wallet" color={colors.primary} size={icon.md} />
          <View>
            <Heading color={colors.primary} style={{ fontVariant: ['tabular-nums'] }}>
              {sol(me.wallet.balanceLamports)} SOL
            </Heading>
            <Label>{me.points} Clout</Label>
          </View>
          <Icon name="chevron-right" color={colors.textMuted} />
        </Pressable>
      </Row>

      <DevnetTag mock={me.chainMock} />
      <Segmented value={tab} onChange={setTab} options={[{ value: 'mine', label: 'My challenges' }, { value: 'public', label: 'Public live' }]} />
      {error ? <Banner text={error} /> : null}

      {list === null ? (
        <Loading label="Loading challenges" />
      ) : list.length === 0 ? (
        <View style={styles.empty}>
          <Butterfingers mood="idle" size={150} />
          <Heading center>{tab === 'mine' ? 'No bets yet' : 'Nothing live right now'}</Heading>
          <Body center color={colors.textMuted}>
            {tab === 'mine' ? 'Create a challenge or join a friend with their code. Butterfingers is getting sweaty waiting.' : 'Be the first — create a public challenge and let anyone jump in.'}
          </Body>
        </View>
      ) : (
        list.map((c, i) => (
          <Animated.View key={c.id} entering={FadeInDown.delay(Math.min(i, 6) * 60).duration(320)}>
            <ChallengeCard c={c} now={now} onPress={() => router.push(`/challenge/${c.id}`)} onVote={tab === 'public' ? (v) => void vote(c, v) : undefined} />
          </Animated.View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wallet: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: touch, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl, paddingHorizontal: space.lg },
});
