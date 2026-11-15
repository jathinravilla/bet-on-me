import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import type { ActivityItem, ChallengeView, FeedView, FriendsView, NotificationView, UserSummary } from '../../../../lib/types';
import { ChallengeCard } from '@/components/ChallengeCard';
import { Avatar, CategoryMark, RatingBadge, Squish, useConfirm, useToast } from '@/components/fx';
import { Butterfingers } from '@/components/Butterfingers';
import { Banner, Body, BodyStrong, Button, Card, Field, Heading, Icon, Label, CardSkeletons, EmptyState, Muted, Row, Screen, Segmented, Title } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { coins, timeLeft } from '@/lib/format';
import { useNow } from '@/lib/useNow';
import { categoryMeta, colors, fonts, radius, space } from '@/lib/theme';

type Tab = 'live' | 'friends' | 'requests';

function ago(iso: string, now: number) {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const KIND = {
  created: { verb: 'started', icon: 'flag-outline', color: colors.primary },
  joined: { verb: 'joined', icon: 'plus', color: colors.primary },
  completed: { verb: 'completed', icon: 'check', color: colors.success },
  won: { verb: 'won', icon: 'trophy-outline', color: colors.success },
  fumbled: { verb: 'missed', icon: 'close', color: colors.danger },
} as const;

function ActivityRow({ a, now }: { a: ActivityItem; now: number }) {
  const k = KIND[a.kind];
  const name = a.user.displayName || a.user.username;
  return (
    <Squish accessibilityLabel={`${name} ${k.verb} ${a.title}, ${ago(a.at, now)}`} onPress={() => router.push(`/challenge/${a.challengeId}`)} style={styles.activity}>
      <View>
        <Avatar username={a.user.username} avatar={a.user.avatar} size={40} />
        <View style={[styles.kindDot, { backgroundColor: k.color }]}>
          <Icon name={k.icon} size={11} color={colors.onPrimary} />
        </View>
      </View>
      <View style={styles.flex}>
        <Body numberOfLines={2}>
          <BodyStrong>{name}</BodyStrong> {k.verb} <BodyStrong color={categoryMeta[a.category].color}>{a.title}</BodyStrong>
        </Body>
        <Muted>
          {ago(a.at, now)}
          {a.kind === 'won' && a.lamports ? ` · +${coins(a.lamports)} coins` : a.kind === 'joined' || a.kind === 'created' ? ` · ${coins(a.lamports ?? 0)} coins stake` : ''}
        </Muted>
      </View>
      <Icon name="chevron-right" color={colors.textDim} />
    </Squish>
  );
}

function PersonRow({ u, right }: { u: UserSummary; right?: React.ReactNode }) {
  return (
    <View style={styles.person}>
      <Squish accessibilityLabel={`Open ${u.username}'s profile`} onPress={() => router.push(`/u/${u.username}`)} style={styles.personMain}>
        <Avatar username={u.username} avatar={u.avatar} size={46} />
        <View style={styles.flex}>
          <BodyStrong numberOfLines={1}>{u.displayName || u.username}</BodyStrong>
          <Row gap={6}>
            <Muted numberOfLines={1}>@{u.username}</Muted>
            <RatingBadge rating={u.rating} size="sm" />
          </Row>
        </View>
      </Squish>
      {right}
    </View>
  );
}

export default function Friends() {
  const { me, refresh } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const now = useNow();
  const [tab, setTab] = useState<Tab>('live');
  const [friends, setFriends] = useState<FriendsView | null>(null);
  const [feed, setFeed] = useState<FeedView | null>(null);
  const [notes, setNotes] = useState<NotificationView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<UserSummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [f, fd, n] = await Promise.all([api<FriendsView>('/friends'), api<FeedView>('/friends/feed'), api<NotificationView[]>('/notifications').catch(() => null)]);
      setFriends(f);
      setFeed(fd);
      if (n) setNotes(n);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      const poll = setInterval(() => void load(), 20_000);
      return () => clearInterval(poll);
    }, [load])
  );

  // Debounced username search.
  useEffect(() => {
    const term = q.trim().toLowerCase();
    const t = setTimeout(() => {
      if (term.length < 1) return setResults(null);
      api<UserSummary[]>(`/users/search?q=${encodeURIComponent(term.replace(/^@/, ''))}`)
        .then(setResults)
        .catch((e) => {
          setResults(null);
          toast(errorMessage(e), 'danger');
        });
    }, term.length < 1 ? 0 : 250);
    return () => clearTimeout(t);
  }, [q, toast]);

  if (!me) return null;

  const act = async (key: string, fn: () => Promise<FriendsView>, ok: string) => {
    setBusy(key);
    try {
      setFriends(await fn());
      toast(ok);
      void refresh();
      void load();
      if (results) setResults(await api<UserSummary[]>(`/users/search?q=${encodeURIComponent(q.trim().toLowerCase())}`).catch(() => results));
    } catch (e) {
      toast(errorMessage(e), 'danger');
    } finally {
      setBusy(null);
    }
  };

  const add = (u: Pick<UserSummary, 'username'>) => act(`add${u.username}`, () => api<FriendsView>('/friends/request', { body: { username: u.username } }), `Request sent to ${u.username}`);
  const respond = (u: UserSummary, accept: boolean) =>
    act(`r${u.id}`, () => api<FriendsView>('/friends/respond', { body: { userId: u.id, accept } }), accept ? `You and ${u.username} are now friends` : 'Request declined');
  const remove = async (u: UserSummary, outgoing = false) => {
    if (!outgoing && !(await confirm({ title: `Remove ${u.username}?`, message: "You'll stop seeing each other's friends-only challenges.", confirm: 'Remove friend', destructive: true, icon: 'account-remove' }))) return;
    await act(`x${u.id}`, () => api<FriendsView>('/friends/remove', { body: { userId: u.id } }), outgoing ? 'Request cancelled' : `Removed ${u.username}`);
  };

  const joinInvite = async (challengeId: string, stake: number) => {
    setBusy(`j${challengeId}`);
    try {
      const c = await api<ChallengeView>('/challenges/join', { body: { challengeId }, timeoutMs: 60_000 });
      toast(`You're in! ${coins(stake)} coins staked`, 'success', 'hand-coin');
      void refresh();
      router.push(`/challenge/${c.id}`);
    } catch (e) {
      toast(errorMessage(e), 'danger');
    } finally {
      setBusy(null);
    }
  };

  const relationButton = (u: UserSummary) => {
    if (u.relation === 'friend') return <Button small variant="secondary" icon="sword-cross" title="Challenge" onPress={() => router.push(`/create?with=${u.id}`)} />;
    if (u.relation === 'outgoing') return <Button small variant="secondary" icon="clock-outline" title="Sent" onPress={() => void remove(u, true)} accessibilityHint="Cancels your friend request" />;
    if (u.relation === 'incoming') return <Button small icon="check" title="Accept" loading={busy === `r${u.id}`} onPress={() => void respond(u, true)} />;
    return <Button small icon="account-plus" title="Add" loading={busy === `add${u.username}`} onPress={() => void add(u)} />;
  };

  const unseenNotes = notes.filter((n) => !n.seen).length;
  const requestsCount = (friends?.incoming.length ?? 0) + (friends?.invites.length ?? 0) + unseenNotes;
  const openTab = (t: Tab) => {
    setTab(t);
    // Opening the inbox marks mentions, replies and nudges as seen (they stay listed).
    if (t === 'requests' && (unseenNotes > 0 || (me?.pendingNotifications ?? 0) > 0)) {
      void api('/notifications/read', { method: 'POST' })
        .then(() => {
          setNotes((list) => list.map((n) => ({ ...n, seen: true })));
          void refresh();
        })
        .catch(() => {});
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
            await load();
            setRefreshing(false);
          }}
        />
      }>
      <View style={{ gap: 2 }}>
        <Label>Your people</Label>
        <Title accessibilityRole="header">Squad</Title>
      </View>

      <Field
        label="Find friends"
        value={q}
        onChangeText={setQ}
        placeholder="Search by username or name"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={24}
        returnKeyType="search"
        hint="Add friends to see their bets, back them, and team up on challenges."
      />

      {results ? (
        <Card>
          <Label>Players</Label>
          {results.length === 0 ? <Muted>No one matches “{q.trim()}” yet. Check the spelling, or tell them to sign up!</Muted> : null}
          {results.map((u) => (
            <PersonRow key={u.id} u={u} right={relationButton(u)} />
          ))}
        </Card>
      ) : null}

      <Segmented
        value={tab}
        onChange={openTab}
        options={[
          { value: 'live', label: 'Live' },
          { value: 'friends', label: `Friends${friends ? ` ${friends.friends.length}` : ''}` },
          { value: 'requests', label: 'Inbox', badge: requestsCount || undefined },
        ]}
      />
      {error ? <Banner text={error} /> : null}

      {!friends || !feed ? (
        <CardSkeletons count={2} label="Loading your squad" />
      ) : tab === 'live' ? (
        friends.friends.length === 0 ? (
          <EmptySquad onAdd={() => setQ('')} />
        ) : (
          <>
            {feed.live.length > 0 ? (
              <View style={{ gap: space.md }}>
                <Heading accessibilityRole="header">On the board</Heading>
                <Muted>Live bets your friends are in. Jump in to back yourself against them.</Muted>
                {feed.live.map((c, i) => {
                  const ids = new Set(friends.friends.map((f) => f.id));
                  const names = c.participants.filter((p) => ids.has(p.userId)).map((p) => p.username);
                  return (
                    <Animated.View key={c.id} entering={FadeInDown.delay(Math.min(i, 5) * 60).duration(300)}>
                      <ChallengeCard c={c} now={now} onPress={() => router.push(`/challenge/${c.id}`)} highlight={names.length ? `${names.slice(0, 2).join(' & ')}${names.length > 2 ? ` +${names.length - 2}` : ''} in` : undefined} />
                    </Animated.View>
                  );
                })}
              </View>
            ) : (
              <Card>
                <Heading>Quiet on the board</Heading>
                <Muted>None of your friends has a live bet. Start one and invite them.</Muted>
                <Button icon="sword-cross" title="Challenge the squad" onPress={() => router.push('/create')} />
              </Card>
            )}
            <View style={{ gap: space.sm }}>
              <Heading accessibilityRole="header">Activity</Heading>
              {feed.activity.length === 0 ? <Muted>When friends join, win or fumble, it shows up here.</Muted> : null}
              {feed.activity.map((a) => (
                <ActivityRow key={a.id} a={a} now={now} />
              ))}
            </View>
          </>
        )
      ) : tab === 'friends' ? (
        friends.friends.length === 0 ? (
          <EmptySquad onAdd={() => setQ('')} />
        ) : (
          <View style={{ gap: space.sm }}>
            {friends.friends.map((u, i) => (
              <Animated.View key={u.id} entering={FadeInDown.delay(Math.min(i, 8) * 40).duration(260)}>
                <Card style={{ padding: space.md }}>
                  <PersonRow
                    u={u}
                    right={
                      <Row gap={space.xs}>
                        <Button small icon="sword-cross" title="Challenge" onPress={() => router.push(`/create?with=${u.id}`)} />
                        <Squish accessibilityLabel={`Remove ${u.username}`} onPress={() => void remove(u)} style={styles.more}>
                          <Icon name="account-remove-outline" color={colors.textMuted} />
                        </Squish>
                      </Row>
                    }
                  />
                </Card>
              </Animated.View>
            ))}
          </View>
        )
      ) : (
        <View style={{ gap: space.lg }}>
          <View style={{ gap: 0 }}>
            <Heading accessibilityRole="header" style={{ marginBottom: space.xs }}>
              Mentions & nudges
            </Heading>
            {notes.length === 0 ? <Muted>When someone @mentions you, replies to you or nudges you in a challenge, it shows up here.</Muted> : null}
            {notes.slice(0, 20).map((n) => {
              const who = n.from.displayName || n.from.username;
              const verb = n.kind === 'mention' ? 'mentioned you in' : n.kind === 'reply' ? 'replied to you in' : 'nudged you in';
              return (
                <Squish key={n.id} accessibilityLabel={`${who} ${verb} ${n.challengeTitle}`} onPress={() => router.push(`/challenge/${n.challengeId}`)} style={styles.note}>
                  <Avatar username={n.from.username} avatar={n.from.avatar} size={36} />
                  <View style={styles.flex}>
                    <Body numberOfLines={2}>
                      <BodyStrong>{who}</BodyStrong> {verb} <BodyStrong>{n.challengeTitle}</BodyStrong>
                    </Body>
                    {n.kind !== 'nudge' && n.text ? (
                      <Muted numberOfLines={2}>“{n.text}”</Muted>
                    ) : n.kind === 'nudge' ? (
                      <Muted>Your move — they’re waiting on you.</Muted>
                    ) : null}
                    <Muted>{ago(n.at, now)}</Muted>
                  </View>
                  {!n.seen ? <View style={styles.unseen} accessibilityLabel="New" /> : null}
                </Squish>
              );
            })}
          </View>
          <View style={{ gap: space.sm }}>
            <Heading accessibilityRole="header">Challenge invites</Heading>
            {friends.invites.length === 0 ? <Muted>No invites right now. When a friend pulls you into a bet, it lands here.</Muted> : null}
            {friends.invites.map((inv) => {
              return (
                <Card key={inv.challengeId} tone="attention">
                  <Row gap={space.md}>
                    <CategoryMark category={inv.category} />
                    <View style={styles.flex}>
                      <BodyStrong numberOfLines={1}>{inv.title}</BodyStrong>
                      <Muted>
                        {inv.from.displayName || inv.from.username} invited you · {coins(inv.stakeLamports)} coins · {timeLeft(inv.endsAt, now)} left
                      </Muted>
                    </View>
                  </Row>
                  <Row gap={space.sm}>
                    <Button small variant="attention" title="Join"
                      accessibilityHint={`Stakes ${coins(inv.stakeLamports)} coins`} icon="hand-coin" loading={busy === `j${inv.challengeId}`} onPress={() => void joinInvite(inv.challengeId, inv.stakeLamports)} style={styles.flex} />
                    <Button small variant="secondary" title="Peek" icon="eye-outline" onPress={() => router.push(`/challenge/${inv.challengeId}`)} />
                    <Button
                      small
                      variant="ghost"
                      title="Pass"
                      onPress={() => void act(`d${inv.challengeId}`, () => api<FriendsView>('/friends/invites/dismiss', { body: { challengeId: inv.challengeId } }), 'Invite dismissed')}
                    />
                  </Row>
                </Card>
              );
            })}
          </View>
          <View style={{ gap: space.sm }}>
            <Heading accessibilityRole="header">Friend requests</Heading>
            {friends.incoming.length === 0 ? <Muted>No new requests.</Muted> : null}
            {friends.incoming.map((u) => (
              <Card key={u.id} style={{ padding: space.md }}>
                <PersonRow
                  u={u}
                  right={
                    <Row gap={space.xs}>
                      <Button small icon="check" title="Accept" loading={busy === `r${u.id}`} onPress={() => void respond(u, true)} />
                      <Squish accessibilityLabel={`Decline ${u.username}`} onPress={() => void respond(u, false)} style={styles.more}>
                        <Icon name="close" color={colors.textMuted} />
                      </Squish>
                    </Row>
                  }
                />
              </Card>
            ))}
          </View>
          {friends.outgoing.length > 0 ? (
            <View style={{ gap: space.sm }}>
              <Heading accessibilityRole="header">Sent</Heading>
              {friends.outgoing.map((u) => (
                <PersonRow key={u.id} u={u} right={<Button small variant="secondary" title="Cancel" onPress={() => void remove(u, true)} />} />
              ))}
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

function EmptySquad({ onAdd }: { onAdd: () => void }) {
  return (
    <EmptyState title="Add your first friend" body="Search a username above. Friends can see each other’s bets, join them, and send challenges." action={{ title: 'Search players', onPress: onAdd, variant: 'secondary' }}>
      <Butterfingers mood="nervous" size={110} />
    </EmptyState>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: space.sm + 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  unseen: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.attention, marginTop: 6 },
  flex: { flex: 1 },
  activity: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm + 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  kindDot: { position: 'absolute', right: -3, bottom: -3, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface },
  person: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  personMain: { flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1 },
  more: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  emptyIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  emptyHint: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.primary, marginTop: space.xs },
});
