import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { ChallengeView, CommentaryResponse, FriendsView, ProofView } from '../../../../lib/types';
import { ChallengeCard, StatusChip, onTrack } from '@/components/ChallengeCard';
import { ResultCard } from '@/components/ResultCard';
import { ChallengeThread } from '@/components/ChallengeThread';
import { Avatar, AvatarStack, CategoryMark, Pop, RatingBadge, Sheet, Squish, StarInput, useConfirm, useToast } from '@/components/fx';
import { Banner, Body, BodyStrong, Button, Card, Chip, Divider, Heading, Icon, IconButton, Loading, Muted, ProgressBar, Row, Screen, Title, TopBar } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { goBack } from '@/lib/nav';
import { useAuth } from '@/lib/auth';
import { WEB_URL, shareCard, shareText } from '@/lib/share';
import { endingSoon, explorerAddress, explorerTx, goalLine, isRealSig, progressLabel, progressRatio, coins, timeLeft } from '@/lib/format';
import { connectStrava } from '@/lib/connect';
import { useNow } from '@/lib/useNow';
import { categoryMeta, colors, fonts, radius, space } from '@/lib/theme';

const open = (url: string) => void Linking.openURL(url).catch(() => {});

export default function ChallengeDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, refresh } = useAuth();
  const [c, setC] = useState<ChallengeView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const now = useNow();
  const [refreshing, setRefreshing] = useState(false);
  const wasSettled = useRef(false);
  const toast = useToast();
  const confirm = useConfirm();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [squad, setSquad] = useState<FriendsView['friends'] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [quote, setQuote] = useState<CommentaryResponse['commentary']>(null);
  const [similar, setSimilar] = useState<ChallengeView[]>([]);
  const cardRef = useRef<ComponentRef<typeof View>>(null);

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

  // Butterfingers' one-liner once the bet is settled, and (for public bets) Atlas "more like this".
  const settledNow = c?.status === 'settled';
  const publicNow = c?.visibility === 'public';
  useEffect(() => {
    if (!settledNow) return;
    api<CommentaryResponse>(`/challenges/${id}/commentary`).then((r) => setQuote(r.commentary)).catch(() => {});
  }, [id, settledNow]);
  useEffect(() => {
    if (!publicNow) return;
    api<ChallengeView[]>(`/challenges/${id}/similar`).then(setSimilar).catch(() => {});
  }, [id, publicNow]);

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
        <TopBar onBack={() => goBack('/home')} />
        {error ? <Banner text={error} /> : <Loading label="Loading challenge" />}
      </Screen>
    );
  }

  const meta = categoryMeta[c.category];
  const mine = c.participants.find((p) => p.userId === me.id);
  const live = c.status === 'active' && !ended;
  const canNudge = (p: ChallengeView['participants'][number]) => live && c.joined && p.userId !== me.id && !p.completed;
  const nudge = async (userId: string, username: string) => {
    try {
      await api(`/challenges/${c.id}/nudge`, { body: { userId } });
      toast(`Nudged ${username}`, 'success', 'bell-ring-outline');
    } catch (e) {
      toast(errorMessage(e), 'danger');
    }
  };
  const settled = c.status === 'settled';
  const myPayout = c.settlement?.payouts.find((p) => p.userId === me.id);
  const iWon = settled && c.settlement?.outcome !== 'refund' && !!c.settlement?.winners.includes(me.id);
  const refunded = c.settlement?.outcome === 'refund';
  const myPending = c.proofs?.find((p) => p.userId === me.id && p.finalStatus === 'pending');

  const report = async () => {
    const yes = await confirm({ title: 'Report this challenge?', message: 'It breaks the community guidelines. Challenges are removed and refunded after 3 reports.', confirm: 'Report it', destructive: true, icon: 'flag' });
    if (!yes) return;
    await act('report', async () => {
      await api(`/challenges/${c.id}/report`, { body: { reason: 'Breaks the community guidelines' } });
      toast('Reported. Thanks for keeping it clean.', 'info', 'flag');
    });
  };

  const openInvite = async () => {
    setInviteOpen(true);
    setPicked([]);
    try {
      setSquad((await api<FriendsView>('/friends')).friends);
    } catch {
      setSquad([]);
    }
  };
  const sendInvites = async () => {
    setBusy('invite');
    try {
      const { sent } = await api<{ sent: number }>(`/challenges/${c.id}/invite`, { body: { userIds: picked } });
      toast(`Invited ${sent} friend${sent === 1 ? '' : 's'}`, 'success', 'account-multiple-plus');
      setInviteOpen(false);
    } catch (e) {
      toast(errorMessage(e), 'danger');
    } finally {
      setBusy(null);
    }
  };
  const inChallenge = new Set(c.participants.map((p) => p.userId));

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
            title={`Join for ${coins(c.stakeLamports)} coins`}
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
        onBack={() => goBack('/home')}
        right={
          c.visibility === 'public' && live && !c.joined ? (
            <IconButton name="flag-outline" label={c.iReported ? 'Already reported' : 'Report challenge'} color={c.iReported ? colors.danger : colors.textMuted} disabled={c.iReported} onPress={() => void report()} />
          ) : undefined
        }
      />

      {/* Header */}
      <View style={{ gap: space.md }}>
        <Row gap={space.md}>
          <CategoryMark category={c.category} size={44} />
          <View style={styles.flex}>
            <Text style={styles.meta} numberOfLines={1}>
              {meta.label} · {c.visibility === 'public' ? 'Public' : 'Friends'} · {c.mode === 'open' ? 'Most progress wins' : 'Hit the target'}
            </Text>
            <Squish accessibilityLabel={`Created by ${c.creatorUsername}. Open profile`} onPress={() => router.push(`/u/${c.creatorUsername}`)} style={styles.creator}>
              <Text style={styles.metaLink}>by @{c.creatorUsername}</Text>
            </Squish>
          </View>
          <StatusChip c={c} now={now} />
        </Row>
        <Title accessibilityRole="header">{c.title}</Title>
        <Body color={colors.textMuted}>{c.description ? c.description : goalLine(c)}</Body>
        {c.description && c.category !== 'dare' ? <Muted>Verified by {c.category === 'chess' ? 'chess.com' : 'Strava'} · {goalLine(c)}</Muted> : null}
      </View>

      {/* Results */}
      {c.settlement && c.status !== 'active' ? (
        <Animated.View entering={FadeIn.duration(300)}>
          <Card tone={c.status === 'banned' ? 'danger' : iWon ? 'success' : undefined}>
            <Row gap={space.md}>
              <View style={[styles.resultIcon, { backgroundColor: iWon ? colors.successBg : c.status === 'banned' ? colors.dangerBg : colors.surfaceHi }]}>
                <Icon name={c.status === 'banned' ? 'cancel' : iWon ? 'trophy-outline' : refunded ? 'cash-refund' : c.joined ? 'close' : 'flag-checkered'} color={iWon ? colors.success : c.status === 'banned' ? colors.danger : colors.textMuted} size={20} />
              </View>
              <View style={styles.flex}>
                <Heading>{c.status === 'banned' ? 'Removed' : !c.joined ? 'Settled' : iWon ? 'You won' : refunded ? 'Stakes returned' : 'You didn’t make it'}</Heading>
                <Muted>{c.settlement.reason}</Muted>
              </View>
              {myPayout ? <Text style={[styles.delta, { color: colors.success }]}>+{coins(myPayout.lamports)}</Text> : null}
            </Row>
            <View style={styles.table}>
              <Row style={styles.tableHead}>
                <Text style={[styles.th, styles.flex]}>Payout</Text>
                <Text style={styles.th}>Coins</Text>
              </Row>
              {c.settlement.payouts.length === 0 ? <Muted>No payouts.</Muted> : null}
              {c.settlement.payouts.map((p) => (
                <Row key={p.userId} style={styles.tr}>
                  <Text style={[styles.td, styles.flex]} numberOfLines={1}>
                    {p.username}
                    {c.settlement!.winners.includes(p.userId) && !refunded ? <Text style={styles.tdDim}>  winner</Text> : null}
                  </Text>
                  <Text style={styles.tdNum}>{coins(p.lamports)}</Text>
                  {isRealSig(p.txSig) ? <IconButton name="open-in-new" label={`View ${p.username}'s payout on Solana Explorer`} color={colors.textMuted} onPress={() => open(explorerTx(p.txSig!))} /> : <Text style={styles.tdDim}>{p.txSig ? '  sim' : '  …'}</Text>}
                </Row>
              ))}
            </View>
            {c.settlement.receipt ? (
              <View style={styles.receipt}>
                <Row gap={space.sm}>
                  <Icon name="shield-check-outline" color={colors.primary} size={16} />
                  <BodyStrong style={styles.flex}>On-chain receipt</BodyStrong>
                  {c.settlement.payouts.find((p) => isRealSig(p.txSig)) ? (
                    <Text onPress={() => open(explorerTx(c.settlement!.payouts.find((p) => isRealSig(p.txSig))!.txSig!))} accessibilityRole="link" style={styles.receiptLink}>
                      Verify on Explorer
                    </Text>
                  ) : null}
                </Row>
                <Muted selectable>{c.settlement.receipt.memo}</Muted>
                <Muted>This fingerprint of the result is written into the payout transaction on Solana, so nobody can quietly change who won.</Muted>
              </View>
            ) : null}
          </Card>
        </Animated.View>
      ) : null}

      {/* Shareable result card */}
      {c.status === 'settled' && c.settlement ? (
        <Animated.View entering={FadeIn.duration(300)} style={{ gap: space.md }}>
          <ResultCard cardRef={cardRef} c={c} iWon={iWon} quote={quote ? (iWon ? quote.winner : quote.loser) : null} />
          <Button
            variant="secondary"
            icon="share-variant-outline"
            title="Share result"
            onPress={async () => {
              const won = c.settlement!.winners.map((w) => c.participants.find((p) => p.userId === w)?.username).filter(Boolean).map((u) => `@${u}`).join(' & ');
              const text = `${c.title} just settled on Bet On Me${won && c.settlement!.outcome !== 'refund' ? ` — ${won} took the pot` : ''}. Put your own goals on the line: ${WEB_URL}`;
              const r = await shareCard(cardRef, text);
              if (r === 'copied') toast('Copied — paste it anywhere', 'success', 'content-copy');
            }}
          />
        </Animated.View>
      ) : null}

      {/* Rate the challenge (feeds the creator's rating) */}
      {c.canRate ? (
        <Card tone={c.myRating ? undefined : 'attention'}>
          <Row>
            <Heading style={styles.flex}>{c.myRating ? 'Your rating' : 'Rate this challenge'}</Heading>
            {c.rating.count ? <RatingBadge rating={c.rating} size="sm" /> : null}
          </Row>
          <Muted>Fair goal, fun to play, worth the stake? Your rating counts toward @{c.creatorUsername}’s creator score.</Muted>
          <StarInput
            label={`Rate ${c.title}`}
            value={c.myRating ?? 0}
            disabled={busy === 'rate'}
            onChange={(stars) =>
              void act('rate', async () => {
                const v = await api<ChallengeView>(`/challenges/${c.id}/rate`, { body: { stars } });
                toast(`Rated ${stars} of 5`, 'success', 'star');
                void refresh();
                return v;
              })
            }
          />
        </Card>
      ) : c.status === 'settled' && c.rating.count ? (
        <Row style={{ justifyContent: 'space-between' }}>
          <Muted>Player rating</Muted>
          <RatingBadge rating={c.rating} />
        </Row>
      ) : null}

      {/* Key numbers */}
      <Card>
        <View style={styles.grid}>
          <KeyStat label={c.status === 'active' ? 'Pot in escrow' : 'Final pot'} value={coins(c.potLamports)} unit="coins" pop={c.potLamports} />
          <KeyStat label="Stake" value={coins(c.stakeLamports)} unit="each" />
          <KeyStat label="Players" value={String(c.participants.length)} />
          <KeyStat label={c.status === 'active' ? 'Ends in' : 'Status'} value={c.status === 'active' ? timeLeft(c.endsAt, now) : c.status === 'settled' ? 'Settled' : c.status === 'banned' ? 'Removed' : 'Settling'} color={endingSoon(c, now) && live ? colors.attention : undefined} />
        </View>
        <View style={{ gap: 6 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Muted>{c.category === 'dare' ? 'Players done' : 'Field on track'}</Muted>
            <Text style={styles.tdNum}>{Math.round(onTrack(c) * 100)}%</Text>
          </Row>
          <ProgressBar value={onTrack(c)} />
        </View>
        <Row style={{ justifyContent: 'space-between' }}>
          <AvatarStack people={c.participants} max={6} size={24} />
          <Text style={styles.metaLink} onPress={() => open(explorerAddress(c.escrowPublicKey))} accessibilityRole="link">
            View escrow ↗
          </Text>
        </Row>
        {c.inviteCode && c.visibility === 'friends' && live ? (
          <Row style={styles.invite}>
            <View style={styles.flex}>
              <Muted>Invite code</Muted>
              <Text style={styles.code} selectable>
                {c.inviteCode}
              </Text>
            </View>
            <IconButton
              name="content-copy"
              label="Copy invite code"
              color={colors.textMuted}
              onPress={async () => {
                await Clipboard.setStringAsync(c.inviteCode!);
                toast('Invite code copied', 'success', 'content-copy');
              }}
            />
            <IconButton name="share-variant-outline" label="Share invite code" color={colors.textMuted} onPress={async () => (await shareText(`Join "${c.title}" on Bet On Me with code ${c.inviteCode} (${coins(c.stakeLamports)}-coin stake): ${WEB_URL}/join?code=${c.inviteCode}`)) === 'copied' && toast('Copied — paste it anywhere', 'success', 'content-copy')} />
          </Row>
        ) : null}
      </Card>

      {error ? <Banner text={error} /> : null}

      {/* My action */}
      {c.joined && live ? (
        <Card tone={endingSoon(c, now) && !mine?.completed ? 'attention' : undefined}>
          <View style={{ gap: 2 }}>
            <Heading>{mine?.completed ? 'Goal reached' : 'Your next step'}</Heading>
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
          <Row gap={space.sm}>
            {c.category === 'strava' && !me.stravaConnected ? (
              <Button
                small
                title={me.stravaDemo ? 'Connect demo Strava' : 'Connect Strava'}
                loading={busy === 'connect'}
                style={styles.flex}
                onPress={() =>
                  void act('connect', async () => {
                    const r = await connectStrava(refresh);
                    if (r.ok) toast(r.demo ? 'Demo Strava connected' : 'Strava connected', 'success', 'check');
                    else throw new Error("Strava didn't connect. Allow activity access and try again.");
                  })
                }
              />
            ) : c.category === 'dare' ? (
              !mine?.completed && !myPending ? <Button small title="Record proof" style={styles.flex} onPress={() => router.push(`/dare/${c.id}`)} /> : null
            ) : c.category === 'strava' && me.stravaDemo ? (
              <Button
                small
                title="Log a demo run"
                loading={busy === 'run'}
                style={styles.flex}
                onPress={() =>
                  void act('run', async () => {
                    await api('/strava/demo-run', { method: 'POST' });
                    return api<ChallengeView>(`/challenges/${c.id}/sync`, { method: 'POST' });
                  })
                }
              />
            ) : (
              <Button small title={c.category === 'strava' ? 'Sync runs' : 'Sync rating'} loading={busy === 'sync'} style={styles.flex} onPress={() => void act('sync', () => api<ChallengeView>(`/challenges/${c.id}/sync`, { method: 'POST' }))} />
            )}
            <Button small variant="secondary" title="Invite friends" style={styles.flex} onPress={() => void openInvite()} />
          </Row>
        </Card>
      ) : null}

      {/* Leaderboard */}
      <View style={{ gap: space.sm }}>
        <Heading accessibilityRole="header">Leaderboard</Heading>
        <Card style={{ paddingVertical: space.xs, gap: 0 }}>
          {c.participants.map((p, i) => {
            const you = p.userId === me.id;
            return (
              <View key={p.userId}>
                {i > 0 ? <Divider /> : null}
                <View style={styles.rank} accessible accessibilityLabel={`Rank ${i + 1}. ${p.username}${you ? ' (you)' : ''}. ${progressLabel(c, p)}${p.completed ? '. Completed' : ''}`}>
                  <Text style={styles.rankNum}>{i + 1}</Text>
                  <Squish accessibilityLabel={`Open ${p.username}'s profile`} onPress={() => router.push(`/u/${p.username}`)}>
                    <Avatar username={p.username} avatar={p.avatar} size={30} />
                  </Squish>
                  <View style={[styles.flex, { gap: 6 }]}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text style={[styles.td, you && { color: colors.primary }]} numberOfLines={1}>
                        {p.username}
                        {you ? ' · you' : ''}
                      </Text>
                      <Row gap={space.md}>
                        {canNudge(p) ? (
                          <Text style={styles.nudge} accessibilityRole="button" accessibilityLabel={`Nudge ${p.username}`} onPress={() => void nudge(p.userId, p.username)}>
                            Nudge
                          </Text>
                        ) : null}
                        <Text style={[styles.tdNum, p.completed && { color: colors.success }]}>
                          {progressLabel(c, p)}
                          {p.completed ? ' ✓' : ''}
                        </Text>
                      </Row>
                    </Row>
                    <ProgressBar value={progressRatio(c, p)} tone={p.completed ? 'success' : 'primary'} />
                  </View>
                </View>
              </View>
            );
          })}
        </Card>
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

      {/* Discussion: comments, bet updates, backing */}
      <ChallengeThread challengeId={c.id} isPlayer={c.joined} players={[...new Set([...c.participants.map((p) => p.username), c.creatorUsername])].filter((u) => u !== me.username)} onBackingChange={() => void load()} />

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
            <IconButton name="arrow-up" label="Upvote" active={c.myVote === 1} color={c.myVote === 1 ? colors.primary : colors.textMuted} onPress={() => void act('vote', () => api<ChallengeView>(`/challenges/${c.id}/vote`, { body: { value: c.myVote === 1 ? 0 : 1 } }).then(() => undefined))} />
            <IconButton name="arrow-down" label="Downvote" active={c.myVote === -1} color={c.myVote === -1 ? colors.danger : colors.textMuted} onPress={() => void act('vote', () => api<ChallengeView>(`/challenges/${c.id}/vote`, { body: { value: c.myVote === -1 ? 0 : -1 } }).then(() => undefined))} />
          </Row>
        </Card>
      ) : null}

      {similar.length > 0 ? (
        <View style={{ gap: space.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Heading accessibilityRole="header">Bets like this</Heading>
            <Chip icon="leaf" text="MongoDB Atlas Search" />
          </Row>
          {similar.map((s) => (
            <ChallengeCard key={s.id} c={s} now={now} onPress={() => router.push(`/challenge/${s.id}`)} />
          ))}
        </View>
      ) : null}

      {/* Demo tools */}
      {me.demoMode && c.joined && live && (c.visibility === 'friends' || c.creatorId === me.id) ? (
        <Card style={{ borderStyle: 'dashed' }}>
          <Row>
            <Icon name="flask-outline" color={colors.textMuted} size={18} />
            <Heading color={colors.textMuted}>Demo tools</Heading>
          </Row>
          {c.category !== 'dare' && c.visibility === 'friends' ? (
            <Button
              small
              variant="secondary"
              title={c.category === 'strava' ? 'Simulate +2 miles' : 'Simulate +25 rating'}
              loading={busy === 'sim'}
              onPress={() => void act('sim', () => api<ChallengeView>('/demo/simulate-progress', { body: { challengeId: c.id, amount: c.category === 'strava' ? 2 : 25 } }))}
            />
          ) : null}
          <Button
            small
            variant="danger"
            title="End now"
            loading={busy === 'end'}
            accessibilityHint="Ends the challenge immediately and pays out the winners"
            onPress={() => void act('end', () => api<ChallengeView>('/demo/end-now', { body: { challengeId: c.id }, timeoutMs: 60_000 }))}
          />
        </Card>
      ) : null}
      <Sheet visible={inviteOpen} onClose={() => setInviteOpen(false)} title="Call out friends">
        <Muted>They get it in their Squad inbox and can join in one tap.</Muted>
        {squad === null ? (
          <Loading label="Loading friends" />
        ) : squad.length === 0 ? (
          <>
            <Muted>No friends yet — add some from the Squad tab, or share the invite code.</Muted>
            <Button
              title="Find friends"
              icon="account-search"
              variant="secondary"
              onPress={() => {
                setInviteOpen(false);
                router.navigate('/friends');
              }}
            />
          </>
        ) : (
          <View style={{ gap: space.sm }}>
            {squad.map((f) => {
              const already = inChallenge.has(f.id);
              const on = picked.includes(f.id);
              return (
                <Squish key={f.id} accessibilityRole="checkbox" accessibilityLabel={`${f.username}${already ? ', already in' : ''}`} disabled={already} onPress={() => setPicked(on ? picked.filter((x) => x !== f.id) : [...picked, f.id])} style={[styles.pick, on && { borderColor: colors.primary }]}>
                  <Avatar username={f.username} avatar={f.avatar} size={40} />
                  <BodyStrong style={styles.flex} numberOfLines={1}>
                    {f.displayName || f.username}
                  </BodyStrong>
                  {already ? <Chip text="In" tone="success" icon="check" /> : <Icon name={on ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'} color={on ? colors.primary : colors.textDim} />}
                </Squish>
              );
            })}
            <Button title={picked.length ? `Send ${picked.length} invite${picked.length === 1 ? '' : 's'}` : 'Pick friends'} icon="send" disabled={!picked.length} loading={busy === 'invite'} onPress={() => void sendInvites()} />
          </View>
        )}
      </Sheet>
    </Screen>
  );
}

function KeyStat({ label, value, unit, color, pop }: { label: string; value: string; unit?: string; color?: string; pop?: number }) {
  const inner = (
    <Text style={[styles.statValue, color ? { color } : null]} numberOfLines={1}>
      {value}
      {unit ? <Text style={styles.statUnit}> {unit}</Text> : null}
    </Text>
  );
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label} ${value}${unit ? ' ' + unit : ''}`}>
      <Text style={styles.statLabel}>{label}</Text>
      {pop !== undefined ? <Pop trigger={pop}>{inner}</Pop> : inner}
    </View>
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
  receipt: { gap: space.xs, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.hairline },
  receiptLink: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.primary },
  flex: { flex: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
  meta: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.textMuted },
  metaLink: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.primary },
  creator: { alignSelf: 'flex-start', marginTop: 2 },
  resultIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  delta: { fontFamily: fonts.display, fontSize: 26, letterSpacing: 0.3, fontVariant: ['tabular-nums'] },
  table: { gap: 0 },
  tableHead: { paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  th: { fontFamily: fonts.bodyMedium, fontSize: 11.5, color: colors.textMuted },
  tr: { minHeight: 40, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  td: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  tdNum: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text, fontVariant: ['tabular-nums'] },
  tdDim: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md },
  stat: { width: '50%', gap: 2 },
  statLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  statValue: { fontFamily: fonts.display, fontSize: 26, letterSpacing: 0.3, color: colors.text, fontVariant: ['tabular-nums'] },
  statUnit: { fontFamily: fonts.body, fontSize: 13, letterSpacing: 0, color: colors.textMuted },
  invite: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: space.md },
  code: { fontFamily: fonts.bodySemi, fontSize: 20, letterSpacing: 4, color: colors.text },
  rank: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  nudge: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.primary },
  rankNum: { width: 18, fontFamily: fonts.bodySemi, fontSize: 13, color: colors.textMuted, textAlign: 'center', fontVariant: ['tabular-nums'] },
  pick: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
});
