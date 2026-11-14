import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, RefreshControl, Share, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import type { ChallengeView, ProofView } from '../../../../lib/types';
import { Butterfingers, type Mood } from '@/components/Butterfingers';
import { StatusChip } from '@/components/ChallengeCard';
import { Banner, Body, BodyStrong, Button, Card, Chip, Display, Heading, Icon, IconButton, Label, Loading, Money, Muted, ProgressBar, Row, Screen, Title, TopBar } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { endingSoon, explorerAddress, explorerTx, goalLine, isRealSig, progressLabel, progressRatio, sol, timeLeft } from '@/lib/format';
import { useNow } from '@/lib/useNow';
import { categoryMeta, colors, icon, radius, space } from '@/lib/theme';

const open = (url: string) => void Linking.openURL(url).catch(() => {});

export default function ChallengeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, refresh } = useAuth();
  const [c, setC] = useState<ChallengeView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const now = useNow();
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const wasSettled = useRef(false);

  const load = useCallback(async () => {
    try {
      const fresh = await api<ChallengeView>(`/challenges/${id}`);
      setC(fresh);
      setError(null);
      if (fresh.status === 'settled' && !wasSettled.current) {
        wasSettled.current = true;
        void refresh(); // balance + Clout changed
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id, refresh]);

  // Live leaderboard: poll every 10s while the screen is open.
  useFocusEffect(
    useCallback(() => {
      void load();
      const poll = setInterval(() => void load(), 10_000);
      return () => clearInterval(poll);
    }, [load])
  );

  const ended = c ? new Date(c.endsAt).getTime() <= now : false;
  // The moment the clock hits zero, ask the server to settle instead of waiting for the next poll.
  const status = c?.status;
  const endsAt = c?.endsAt;
  useEffect(() => {
    if (status !== 'active' || !endsAt) return;
    const t = setTimeout(() => void load(), Math.max(0, new Date(endsAt).getTime() - Date.now()) + 600);
    return () => clearTimeout(t);
  }, [status, endsAt, load]);

  const act = async (key: string, fn: () => Promise<ChallengeView | void>) => {
    setBusy(key);
    setError(null);
    try {
      const out = await fn();
      if (out) setC(out);
      else await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  if (!me) return null;
  if (!c) {
    return (
      <Screen>
        <TopBar onBack={() => router.back()} />
        {error ? <Banner text={error} /> : <Loading label="Loading challenge" />}
      </Screen>
    );
  }

  const meta = categoryMeta[c.category];
  const mine = c.participants.find((p) => p.userId === me.id);
  const live = c.status === 'active' && !ended;
  const settled = c.status === 'settled';
  const myPayout = c.settlement?.payouts.find((p) => p.userId === me.id);
  const iWon = settled && c.settlement?.outcome !== 'refund' && !!c.settlement?.winners.includes(me.id);
  const refunded = c.settlement?.outcome === 'refund';
  const myPending = c.proofs?.find((p) => p.userId === me.id && p.finalStatus === 'pending');

  let mood: Mood = 'idle';
  if (settled && c.joined) mood = iWon || (refunded && mine?.completed) ? 'celebrate' : refunded ? 'idle' : 'fumble';
  else if (mine?.completed) mood = 'celebrate';
  else if (live && c.joined && endingSoon(c, now)) mood = 'nervous';
  else if (c.status === 'settling' || (c.status === 'active' && ended)) mood = 'thinking';

  const report = () =>
    Alert.alert('Report this challenge?', 'Challenges are removed and refunded after 3 reports.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Breaks the guidelines', style: 'destructive', onPress: () => void act('report', async () => void (await api(`/challenges/${c.id}/report`, { body: { reason: 'Breaks the community guidelines' } }))) },
    ]);

  return (
    <Screen
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
      }
      footer={
        !c.joined && live ? (
          <Button
            title={`Join for ${sol(c.stakeLamports)} SOL`}
            icon="hand-coin"
            loading={busy === 'join'}
            onPress={() =>
              void act('join', async () => {
                const joined = await api<ChallengeView>('/challenges/join', { body: { challengeId: c.id }, timeoutMs: 60_000 });
                void refresh();
                return joined;
              })
            }
          />
        ) : undefined
      }>
      <TopBar
        title={meta.label}
        onBack={() => router.back()}
        right={c.visibility === 'public' && live ? <IconButton name="flag-outline" label={c.iReported ? 'Already reported' : 'Report challenge'} color={c.iReported ? colors.danger : colors.textMuted} disabled={c.iReported} onPress={report} /> : undefined}
      />

      {/* Results */}
      {c.settlement && c.status !== 'active' ? (
        <Animated.View entering={FadeInDown.duration(400)}>
          <Card tone={c.status === 'banned' ? 'danger' : iWon || refunded ? 'success' : c.joined ? 'danger' : undefined} style={{ alignItems: 'center' }}>
            <Butterfingers mood={c.status === 'banned' ? 'fumble' : mood} size={170} />
            <Display center>{c.status === 'banned' ? 'Removed' : !c.joined ? 'Settled' : iWon ? 'You won' : refunded ? 'Stakes back' : 'Fumbled it'}</Display>
            <Body center>{c.settlement.reason}</Body>
            {myPayout ? (
              <Row gap={space.xs + 2} style={{ alignItems: 'baseline' }}>
                <Money>+{sol(myPayout.lamports)}</Money>
                <Heading color={colors.primary}>SOL</Heading>
              </Row>
            ) : null}
            <View style={styles.payouts}>
              <Label>Payouts on Solana</Label>
              {c.settlement.payouts.length === 0 ? <Muted>No payouts.</Muted> : null}
              {c.settlement.payouts.map((p) => (
                <Row key={p.userId} style={styles.payoutRow}>
                  <Icon name={c.settlement!.winners.includes(p.userId) && !refunded ? 'trophy' : 'cash-refund'} color={colors.primary} />
                  <BodyStrong style={styles.flex} numberOfLines={1}>
                    {p.username}
                  </BodyStrong>
                  <BodyStrong color={colors.primary} style={styles.tabular}>
                    {sol(p.lamports)} SOL
                  </BodyStrong>
                  {isRealSig(p.txSig) ? <IconButton name="open-in-new" label={`View ${p.username}'s payout on Solana Explorer`} color={colors.primary} onPress={() => open(explorerTx(p.txSig!))} /> : <Muted>{p.txSig ? 'simulated' : 'sending…'}</Muted>}
                </Row>
              ))}
            </View>
          </Card>
        </Animated.View>
      ) : null}

      {/* Header + pot */}
      <View style={{ gap: space.sm }}>
        <Row style={{ flexWrap: 'wrap' }}>
          <StatusChip c={c} now={now} />
          <Chip text={c.visibility === 'public' ? 'Public' : 'Friends'} icon={c.visibility === 'public' ? 'earth' : 'account-multiple'} />
          <Chip text={c.mode === 'open' ? 'Most progress' : 'Hit the target'} icon={c.mode === 'open' ? 'podium-gold' : 'bullseye-arrow'} />
        </Row>
        <Title accessibilityRole="header">{c.title}</Title>
        <Body color={colors.textMuted}>{goalLine(c)}</Body>
        <Muted>Created by {c.creatorUsername}</Muted>
      </View>

      <Card tone="primary">
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Label>{c.status === 'active' ? 'Pot in escrow' : 'Final pot'}</Label>
            <Row gap={space.xs + 2} style={{ alignItems: 'baseline' }}>
              <Money style={{ fontSize: 56, lineHeight: 58 }}>{sol(c.potLamports)}</Money>
              <Heading color={colors.primary}>SOL</Heading>
            </Row>
            <Muted>
              {sol(c.stakeLamports)} SOL each · {c.participants.length} {c.participants.length === 1 ? 'player' : 'players'}
            </Muted>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Label>{c.status === 'active' ? 'Time left' : 'Status'}</Label>
            <Heading style={[styles.tabular, { fontSize: 26, lineHeight: 30 }]} color={mood === 'nervous' ? colors.danger : colors.text}>
              {c.status === 'active' ? timeLeft(c.endsAt, now) : c.status}
            </Heading>
          </View>
        </Row>
        <Button small variant="secondary" icon="open-in-new" title="View escrow on Solana Explorer" onPress={() => open(explorerAddress(c.escrowPublicKey))} />
        {c.inviteCode && c.visibility === 'friends' && live ? (
          <Row style={styles.invite}>
            <View style={styles.flex}>
              <Label>Invite code</Label>
              <Heading color={colors.primary} style={{ letterSpacing: 5, fontSize: 26, lineHeight: 30 }} selectable>
                {c.inviteCode}
              </Heading>
            </View>
            <IconButton
              name={copied ? 'check' : 'content-copy'}
              label="Copy invite code"
              color={colors.primary}
              onPress={async () => {
                await Clipboard.setStringAsync(c.inviteCode!);
                setCopied(true);
              }}
            />
            <IconButton name="share-variant" label="Share invite code" color={colors.primary} onPress={() => void Share.share({ message: `Join "${c.title}" on Bet On Me with code ${c.inviteCode} (${sol(c.stakeLamports)} SOL stake).` })} />
          </Row>
        ) : null}
      </Card>

      {error ? <Banner text={error} /> : null}

      {/* My action */}
      {c.joined && live ? (
        <Card>
          <Row gap={space.md}>
            <Butterfingers mood={mood} size={84} />
            <View style={styles.flex}>
              <Heading>{mine?.completed ? 'You did it' : 'Your move'}</Heading>
              <Muted>
                {mine?.completed && c.category !== 'dare'
                  ? 'Target reached. Hold on until the clock runs out.'
                  : c.category === 'strava'
                  ? me.stravaConnected
                    ? me.stravaDemo
                      ? 'Demo Strava: log a simulated GPS run to add miles.'
                      : "Record a run or walk with the Strava app, then sync. Manual activities don't count."
                    : 'Connect Strava so your miles count.'
                  : c.category === 'chess'
                    ? `Play ${c.chessTimeControl ?? 'rapid'} games on chess.com, then sync your rating.`
                    : mine?.completed
                      ? 'Your proof was approved.'
                      : myPending
                        ? myPending.voting
                          ? 'Your proof is being voted on by the other players.'
                          : 'Proof passed. Waiting out the dispute window.'
                        : 'Record a short video doing the dare and saying the secret word.'}
              </Muted>
            </View>
          </Row>
          {c.category === 'strava' && !me.stravaConnected ? (
            <Button title={me.stravaDemo ? 'Connect demo Strava' : 'Connect Strava'} icon="link-variant" onPress={() => router.push('/profile')} />
          ) : c.category === 'dare' ? (
            !mine?.completed && !myPending ? <Button title="Record proof" icon="video" onPress={() => router.push(`/dare/${c.id}`)} /> : null
          ) : c.category === 'strava' && me.stravaDemo ? (
            <Button
              title="Log a demo run"
              icon="run-fast"
              loading={busy === 'run'}
              onPress={() =>
                void act('run', async () => {
                  await api('/strava/demo-run', { method: 'POST' });
                  return api<ChallengeView>(`/challenges/${c.id}/sync`, { method: 'POST' });
                })
              }
            />
          ) : (
            <Button title={c.category === 'strava' ? 'Sync runs' : 'Sync rating'} icon="sync" loading={busy === 'sync'} onPress={() => void act('sync', () => api<ChallengeView>(`/challenges/${c.id}/sync`, { method: 'POST' }))} />
          )}
        </Card>
      ) : null}

      {/* Leaderboard */}
      <View style={{ gap: space.md }}>
        <Heading accessibilityRole="header">Leaderboard</Heading>
        {c.participants.map((p, i) => {
          const you = p.userId === me.id;
          return (
            <View key={p.userId} style={[styles.rank, you && { borderColor: colors.primary }]} accessible accessibilityLabel={`Rank ${i + 1}. ${p.username}${you ? ' (you)' : ''}. ${progressLabel(c, p)}${p.completed ? '. Completed' : ''}`}>
              <View style={[styles.rankNum, i === 0 && { backgroundColor: colors.primary }]}>
                <Heading color={i === 0 ? colors.onPrimary : colors.text}>{i + 1}</Heading>
              </View>
              <View style={[styles.flex, { gap: space.xs + 2 }]}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Row gap={space.xs + 2} style={styles.flex}>
                    <BodyStrong numberOfLines={1}>
                      {p.username}
                      {you ? ' (you)' : ''}
                    </BodyStrong>
                    {p.completed ? <Icon name="check-decagram" color={colors.success} size={icon.sm + 4} /> : null}
                  </Row>
                  <Heading style={styles.tabular} color={p.completed ? colors.success : colors.text}>
                    {progressLabel(c, p)}
                  </Heading>
                </Row>
                <ProgressBar value={progressRatio(c, p)} tone={p.completed ? 'success' : 'primary'} />
              </View>
            </View>
          );
        })}
      </View>

      {/* Dare proofs */}
      {c.category === 'dare' && c.proofs && c.proofs.length > 0 ? (
        <View style={{ gap: space.md }}>
          <Heading accessibilityRole="header">Proofs</Heading>
          {c.proofs.map((p) => (
            <ProofRow key={p.id} p={p} busy={busy} onWatch={() => p.videoUrl && open(p.videoUrl)} onDispute={() => void act(`d${p.id}`, () => api<ChallengeView>(`/dare/${p.id}/dispute`, { method: 'POST' }))} onVote={(approve) => void act(`v${p.id}`, () => api<ChallengeView>(`/dare/${p.id}/vote`, { body: { approve } }))} now={now} />
          ))}
        </View>
      ) : null}

      {/* Community (public) */}
      {c.visibility === 'public' && live ? (
        <Card>
          <Row>
            <View style={styles.flex}>
              <Heading>Community</Heading>
              <Muted>
                {c.upvotes} up · {c.downvotes} down · {c.reportCount}/3 reports
              </Muted>
            </View>
            <IconButton name="arrow-up-bold" label="Upvote" active={c.myVote === 1} color={c.myVote === 1 ? colors.success : colors.textMuted} onPress={() => void act('vote', () => api<ChallengeView>(`/challenges/${c.id}/vote`, { body: { value: c.myVote === 1 ? 0 : 1 } }).then(() => undefined))} />
            <IconButton name="arrow-down-bold" label="Downvote" active={c.myVote === -1} color={c.myVote === -1 ? colors.danger : colors.textMuted} onPress={() => void act('vote', () => api<ChallengeView>(`/challenges/${c.id}/vote`, { body: { value: c.myVote === -1 ? 0 : -1 } }).then(() => undefined))} />
          </Row>
        </Card>
      ) : null}

      {/* Demo tools */}
      {me.demoMode && c.joined && live && (c.visibility === 'friends' || c.creatorId === me.id) ? (
        <Card style={{ borderStyle: 'dashed' }}>
          <Row>
            <Icon name="flask-outline" color={colors.warn} />
            <Heading color={colors.warn}>Demo tools</Heading>
          </Row>
          {c.category !== 'dare' && c.visibility === 'friends' ? (
            <Button
              small
              variant="secondary"
              icon="plus-circle-outline"
              title={c.category === 'strava' ? 'Simulate +2 miles' : 'Simulate +25 rating'}
              loading={busy === 'sim'}
              onPress={() => void act('sim', () => api<ChallengeView>('/demo/simulate-progress', { body: { challengeId: c.id, amount: c.category === 'strava' ? 2 : 25 } }))}
            />
          ) : null}
          <Button
            variant="danger"
            icon="lightning-bolt"
            title="End now"
            loading={busy === 'end'}
            accessibilityHint="Ends the challenge immediately and pays out the winners"
            onPress={() => void act('end', () => api<ChallengeView>('/demo/end-now', { body: { challengeId: c.id }, timeoutMs: 60_000 }))}
          />
        </Card>
      ) : null}
    </Screen>
  );
}

function ProofRow({ p, now, busy, onWatch, onDispute, onVote }: { p: ProofView; now: number; busy: string | null; onWatch: () => void; onDispute: () => void; onVote: (approve: boolean) => void }) {
  const tone = p.finalStatus === 'approved' ? 'success' : p.finalStatus === 'rejected' ? 'danger' : 'warn';
  const windowLeft = p.disputeEndsAt && !p.voting && p.finalStatus === 'pending' ? timeLeft(p.disputeEndsAt, now) : null;
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <BodyStrong numberOfLines={1} style={styles.flex}>
          {p.username}
        </BodyStrong>
        <Chip tone={tone} icon={p.finalStatus === 'approved' ? 'check-circle' : p.finalStatus === 'rejected' ? 'close-circle' : p.voting ? 'vote' : 'timer-sand'} text={p.finalStatus === 'pending' ? (p.voting ? 'Vote open' : 'In review') : p.finalStatus} />
      </Row>
      <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
        <Icon name="robot-happy-outline" color={colors.primary} />
        <Body style={styles.flex}>
          <BodyStrong>AI says {p.verdict}: </BodyStrong>
          {p.reason}
        </Body>
      </Row>
      {p.voting || p.approveVotes + p.rejectVotes > 0 ? (
        <Muted>
          Votes: {p.approveVotes} legit · {p.rejectVotes} not legit
        </Muted>
      ) : null}
      {windowLeft && windowLeft !== 'Ended' ? <Muted>Dispute window closes in {windowLeft}</Muted> : null}
      {p.videoUrl ? <Button small variant="secondary" icon="play-circle-outline" title="Watch proof" onPress={onWatch} /> : null}
      {p.canDispute ? <Button small variant="danger" icon="alert-octagon-outline" title="Dispute this proof" loading={busy === `d${p.id}`} onPress={onDispute} /> : null}
      {p.canVote ? (
        <Row gap={space.md}>
          <Button small variant={p.myVote === true ? 'primary' : 'secondary'} icon="thumb-up-outline" title="Legit" style={styles.flex} loading={busy === `v${p.id}`} onPress={() => onVote(true)} />
          <Button small variant={p.myVote === false ? 'danger' : 'secondary'} icon="thumb-down-outline" title="Not legit" style={styles.flex} onPress={() => onVote(false)} />
        </Row>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
  payouts: { alignSelf: 'stretch', gap: space.xs, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md },
  payoutRow: { minHeight: 48 },
  invite: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md },
  rank: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  rankNum: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHi },
});
