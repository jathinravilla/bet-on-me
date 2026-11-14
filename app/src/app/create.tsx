import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { Category, ChallengeView, ChessTimeControl, CreateChallengeBody, Mode, Visibility } from '../../../lib/types';
import { Butterfingers } from '@/components/Butterfingers';
import { Banner, Body, Button, Card, Choice, Display, Field, Heading, Label, Money, Muted, Row, Screen, Segmented, Title, TopBar } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { sol, toLamports } from '@/lib/format';
import { colors, radius, space } from '@/lib/theme';

const STAKES = [0.05, 0.1, 0.5, 1];
const GUIDELINES =
  'No dares involving danger or injury, anything illegal, alcohol or drugs, sexual content, filming or bothering people without consent, property damage, or targeting a specific person. Keep it funny, harmless and safe.';

type Step = 'category' | 'mode' | 'goal' | 'stake' | 'duration' | 'visibility';

export default function Create() {
  const { me, refresh } = useAuth();
  const [category, setCategory] = useState<Category>('chess');
  const [mode, setMode] = useState<Mode>('target');
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [tc, setTc] = useState<ChessTimeControl>('rapid');
  const [dareText, setDareText] = useState('');
  const [stake, setStake] = useState(0.1);
  const [minutes, setMinutes] = useState(1440);
  const [visibility, setVisibility] = useState<Visibility>('friends');
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ChallengeView | null>(null);
  const [copied, setCopied] = useState(false);

  if (!me) return null;
  const steps: Step[] = category === 'dare' ? ['category', 'goal', 'stake', 'duration', 'visibility'] : ['category', 'mode', 'goal', 'stake', 'duration', 'visibility'];
  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;
  const effectiveMode: Mode = category === 'dare' ? 'target' : mode;
  const targetNum = Number(target);
  const maxStake = me.limits.maxStakeLamports;
  const daresLeft = me.limits.publicDaresPerWeek - me.limits.publicDaresUsed;

  const goalError = (): string | null => {
    if (title.trim().length < 3) return 'Give your challenge a name (at least 3 characters).';
    if (category === 'dare') return dareText.trim().length < 10 ? 'Describe the dare in at least 10 characters.' : null;
    if (effectiveMode === 'open') return null;
    if (!Number.isFinite(targetNum) || target.trim() === '') return 'Enter a number for the goal.';
    if (category === 'strava' && (targetNum < 0.1 || targetNum > 500)) return 'Miles must be between 0.1 and 500.';
    if (category === 'chess' && (!Number.isInteger(targetNum) || targetNum < 100 || targetNum > 3500)) return 'Rating must be a whole number between 100 and 3500.';
    return null;
  };

  const next = async () => {
    setError(null);
    if (step === 'goal') {
      const problem = goalError();
      if (problem) return setError(problem);
    }
    if (step === 'category' && category === 'chess' && !me.chessUsername) return setError('Add your chess.com username on your profile first, so we can track your rating.');
    if (!last) return setIndex(index + 1);
    setBusy(true);
    try {
      const body: CreateChallengeBody = {
        title: title.trim(),
        category,
        visibility,
        mode: effectiveMode,
        stakeLamports: toLamports(stake),
        durationMinutes: minutes,
        ...(category !== 'dare' && effectiveMode === 'target' ? { target: targetNum } : {}),
        ...(category === 'chess' ? { chessTimeControl: tc } : {}),
        ...(category === 'dare' ? { dareText: dareText.trim() } : {}),
      };
      const c = await api<ChallengeView>('/challenges', { body, timeoutMs: 60_000 });
      void refresh();
      setCreated(c);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <Screen footer={<Button title="Open challenge" icon="arrow-right-bold" onPress={() => router.replace(`/challenge/${created.id}`)} />}>
        <Animated.View entering={FadeIn.duration(400)} style={styles.done}>
          <Butterfingers mood="celebrate" size={190} />
          <Display center>It&apos;s on</Display>
          <Body center color={colors.textMuted}>
            Your {sol(created.stakeLamports)} SOL stake is locked in the pot on Solana devnet.
          </Body>
          {created.visibility === 'friends' && created.inviteCode ? (
            <Card tone="primary" style={{ alignSelf: 'stretch', alignItems: 'center' }}>
              <Label>Invite code</Label>
              <Money selectable style={{ letterSpacing: 8, fontSize: 52, lineHeight: 56 }} accessibilityLabel={`Invite code ${created.inviteCode.split('').join(' ')}`}>
                {created.inviteCode}
              </Money>
              <Row gap={space.md} style={{ alignSelf: 'stretch' }}>
                <Button
                  small
                  variant="secondary"
                  icon={copied ? 'check' : 'content-copy'}
                  title={copied ? 'Copied' : 'Copy'}
                  style={styles.flex}
                  onPress={async () => {
                    await Clipboard.setStringAsync(created.inviteCode!);
                    setCopied(true);
                  }}
                />
                <Button
                  small
                  variant="secondary"
                  icon="share-variant"
                  title="Share"
                  style={styles.flex}
                  onPress={() => void Share.share({ message: `Bet on yourself with me! Join "${created.title}" on Bet On Me with code ${created.inviteCode} (${sol(created.stakeLamports)} SOL stake).` })}
                />
              </Row>
            </Card>
          ) : (
            <Banner tone="success" text="Your challenge is live in the public feed. Anyone can join." />
          )}
        </Animated.View>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          {error ? <Banner text={error} /> : null}
          <Button title={last ? `Create and stake ${stake} SOL` : 'Next'} icon={last ? 'lock' : 'arrow-right-bold'} onPress={next} loading={busy} />
        </>
      }>
      <TopBar title="New challenge" onBack={() => (index === 0 ? router.back() : (setError(null), setIndex(index - 1)))} />
      <View style={styles.dots} accessibilityRole="progressbar" accessibilityLabel={`Step ${index + 1} of ${steps.length}`} accessibilityValue={{ min: 1, max: steps.length, now: index + 1 }}>
        {steps.map((s, i) => (
          <View key={s} style={[styles.dot, i <= index && { backgroundColor: colors.primary }]} />
        ))}
      </View>

      <Animated.View key={step} entering={FadeIn.duration(220)} style={{ gap: space.lg }}>
        {step === 'category' ? (
          <>
            <Title>What are you betting on?</Title>
            <View style={{ gap: space.md }} accessibilityRole="radiogroup">
              <Choice icon="chess-knight" title="Chess" subtitle="Your live chess.com rating is the proof." selected={category === 'chess'} onPress={() => setCategory('chess')} />
              <Choice icon="run-fast" title="Running" subtitle="Strava GPS miles. Typed-in activities don't count." selected={category === 'strava'} onPress={() => setCategory('strava')} />
              <Choice icon="drama-masks" title="Dare" subtitle="Record a video. AI and your friends judge it." selected={category === 'dare'} onPress={() => setCategory('dare')} />
            </View>
          </>
        ) : null}

        {step === 'mode' ? (
          <>
            <Title>How do you win?</Title>
            <View style={{ gap: space.md }} accessibilityRole="radiogroup">
              <Choice icon="bullseye-arrow" title="Hit a target" subtitle="Everyone who reaches the goal splits the pot." selected={mode === 'target'} onPress={() => setMode('target')} />
              <Choice icon="podium-gold" title="Most progress" subtitle={category === 'chess' ? 'Whoever gains the most rating takes it all.' : 'Whoever logs the most miles takes it all.'} selected={mode === 'open'} onPress={() => setMode('open')} />
            </View>
          </>
        ) : null}

        {step === 'goal' ? (
          <>
            <Title>Set the goal</Title>
            <Field label="Challenge name" value={title} onChangeText={setTitle} maxLength={60} placeholder={category === 'dare' ? 'Sing in the dining hall' : category === 'chess' ? 'Road to 1200' : '20 mile week'} returnKeyType="done" />
            {category === 'chess' ? (
              <View style={{ gap: space.sm }}>
                <Label>Time control</Label>
                <Segmented value={tc} onChange={setTc} options={[{ value: 'rapid', label: 'Rapid' }, { value: 'blitz', label: 'Blitz' }, { value: 'bullet', label: 'Bullet' }]} />
              </View>
            ) : null}
            {category !== 'dare' && effectiveMode === 'target' ? (
              <Field
                label={category === 'chess' ? 'Target rating' : 'Target miles'}
                value={target}
                onChangeText={setTarget}
                keyboardType={category === 'chess' ? 'number-pad' : 'decimal-pad'}
                placeholder={category === 'chess' ? '1200' : '20'}
                maxLength={6}
                hint={category === 'chess' ? `Checked live against chess.com (${me.chessUsername ?? 'set your username'}).` : 'Only GPS-recorded runs and walks count. Manual activities are ignored.'}
              />
            ) : null}
            {category !== 'dare' && effectiveMode === 'open' ? (
              <Banner tone="info" text={category === 'chess' ? 'Most rating points gained from now until the end wins the whole pot.' : 'Most GPS-recorded miles between now and the end wins the whole pot.'} />
            ) : null}
            {category === 'dare' ? (
              <>
                <Field label="The dare" value={dareText} onChangeText={setDareText} multiline maxLength={200} placeholder="Order a coffee using only song lyrics" hint={`${dareText.length}/200 · Butterfingers screens every dare before it goes live.`} />
                <Card>
                  <Label>Community guidelines</Label>
                  <Muted>{GUIDELINES}</Muted>
                </Card>
              </>
            ) : null}
          </>
        ) : null}

        {step === 'stake' ? (
          <>
            <Title>How much is on the line?</Title>
            <Muted>Everyone who joins puts in the same stake. Your wallet has {sol(me.wallet.balanceLamports)} SOL.</Muted>
            <View style={styles.grid} accessibilityRole="radiogroup">
              {STAKES.map((s) => {
                const locked = toLamports(s) > maxStake;
                return (
                  <View key={s} style={styles.cell}>
                    <Choice
                      title={`${s} SOL`}
                      subtitle={locked ? `Unlocks at ${me.limits.next && toLamports(s) <= me.limits.next.maxStakeLamports ? me.limits.next.points : 1000} Clout` : undefined}
                      selected={stake === s}
                      disabled={locked}
                      onPress={() => setStake(s)}
                      right={locked ? undefined : null}
                    />
                  </View>
                );
              })}
            </View>
            <Banner tone="info" icon="star-four-points" text={`Your max stake is ${sol(maxStake)} SOL. Earn Clout by joining and winning to raise it.`} />
          </>
        ) : null}

        {step === 'duration' ? (
          <>
            <Title>How long?</Title>
            <View style={{ gap: space.md }} accessibilityRole="radiogroup">
              {me.demoMode ? <Choice icon="lightning-bolt" title="5 minutes" subtitle="Demo mode" selected={minutes === 5} onPress={() => setMinutes(5)} /> : null}
              <Choice icon="calendar-today" title="1 day" selected={minutes === 1440} onPress={() => setMinutes(1440)} />
              <Choice icon="calendar-range" title="3 days" selected={minutes === 4320} onPress={() => setMinutes(4320)} />
              <Choice icon="calendar-week" title="1 week" selected={minutes === 10080} onPress={() => setMinutes(10080)} />
            </View>
          </>
        ) : null}

        {step === 'visibility' ? (
          <>
            <Title>Who can join?</Title>
            <View style={{ gap: space.md }} accessibilityRole="radiogroup">
              <Choice icon="account-multiple" title="Friends" subtitle="Only people with your invite code." selected={visibility === 'friends'} onPress={() => setVisibility('friends')} />
              <Choice
                icon="earth"
                title="Public"
                subtitle={category === 'dare' ? (daresLeft > 0 ? `Shown in the live feed. ${daresLeft} public dare${daresLeft === 1 ? '' : 's'} left this week.` : 'You have no public dares left this week. Earn Clout for more.') : 'Shown in the live feed. Anyone can join.'}
                selected={visibility === 'public'}
                disabled={category === 'dare' && daresLeft <= 0}
                onPress={() => setVisibility('public')}
              />
            </View>
            <Card>
              <Label>Review</Label>
              <Heading>{title.trim()}</Heading>
              <Muted>
                {category === 'dare' ? dareText.trim() : effectiveMode === 'open' ? (category === 'chess' ? `Most ${tc} rating gained wins` : 'Most miles wins') : category === 'chess' ? `Reach ${target} ${tc} on chess.com` : `Run or walk ${target} miles`}
              </Muted>
              <Row style={{ justifyContent: 'space-between' }}>
                <Body color={colors.textMuted}>Your stake</Body>
                <Heading color={colors.primary}>{stake} SOL</Heading>
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                <Body color={colors.textMuted}>Ends in</Body>
                <Heading>{minutes === 5 ? '5 minutes' : minutes === 1440 ? '1 day' : minutes === 4320 ? '3 days' : '1 week'}</Heading>
              </Row>
            </Card>
          </>
        ) : null}
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dots: { flexDirection: 'row', gap: space.xs + 2 },
  dot: { flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceHi },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  cell: { flexBasis: '47%', flexGrow: 1 },
  done: { alignItems: 'center', gap: space.lg, paddingTop: space.xxl },
});
