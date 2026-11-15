import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { Category, ChallengeView, ChessTimeControl, CreateChallengeBody, FriendsView, MeView, Mode, Visibility } from '../../../lib/types';
import { Butterfingers } from '@/components/Butterfingers';
import { CoachCard } from '@/components/CoachCard';
import { Avatar, CategoryMark, Squish, useToast } from '@/components/fx';
import { Logo } from '@/components/Logo';
import { Banner, Body, BodyStrong, Button, Card, Chip, Choice, Field, Heading, Icon, Label, Money, Muted, Row, Screen, Segmented, Title, TopBar, type IconName } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { goBack } from '@/lib/nav';
import { useAuth } from '@/lib/auth';
import { WEB_URL, shareText } from '@/lib/share';
import { connectStrava, linkChess } from '@/lib/connect';
import { coins, coinsToLamports } from '@/lib/format';
import { UPCOMING } from '@/lib/integrations';
import { categoryMeta, colors, fonts, radius, space } from '@/lib/theme';

const STAKES = [10, 25, 50, 100, 250, 500, 1000, 2000]; // coins
const DURATIONS = [
  { minutes: 1440, label: '24 hours', sub: 'Sprint', icon: 'lightning-bolt' },
  { minutes: 2880, label: '2 days', sub: 'Weekend warrior', icon: 'calendar-today' },
  { minutes: 4320, label: '3 days', sub: 'Long weekend', icon: 'calendar-range' },
  { minutes: 10080, label: '1 week', sub: 'Classic', icon: 'calendar-week' },
  { minutes: 20160, label: '2 weeks', sub: 'Build a habit', icon: 'calendar-month' },
  { minutes: 43200, label: '30 days', sub: 'The long game', icon: 'calendar-star' },
] as const satisfies readonly { minutes: number; label: string; sub: string; icon: IconName }[];
const GUIDELINES =
  'No dares involving danger or injury, anything illegal, alcohol or drugs, sexual content, filming or bothering people without consent, property damage, or targeting a specific person. Keep it funny, harmless and safe.';

type Kind = Category | 'custom';
type Source = 'strava' | 'chess' | 'video';
type Step = 'category' | 'custom' | 'connect' | 'mode' | 'goal' | 'stake' | 'duration' | 'squad';

type Template = {
  key: string;
  title: string;
  blurb: string;
  icon: IconName;
  category: Category;
  mode: Mode;
  target?: number;
  tc?: ChessTimeControl;
  dare?: string;
  minutes: number;
};

const TEMPLATES: Template[] = [
  { key: '5k', title: '5K this weekend', blurb: 'Run 3.1 GPS miles in 2 days', icon: 'run-fast', category: 'strava', mode: 'target', target: 3.1, minutes: 2880 },
  { key: '20mi', title: '20 mile week', blurb: 'Hit 20 miles in 7 days', icon: 'road-variant', category: 'strava', mode: 'target', target: 20, minutes: 10080 },
  { key: 'war', title: 'Mileage war', blurb: 'Most miles in a week takes it all', icon: 'sword-cross', category: 'strava', mode: 'open', minutes: 10080 },
  { key: '1200', title: 'Road to 1200', blurb: 'Reach 1200 rapid in 2 weeks', icon: 'chess-queen', category: 'chess', mode: 'target', target: 1200, tc: 'rapid', minutes: 20160 },
  { key: 'climb', title: 'Blitz climb', blurb: 'Biggest blitz rating gain wins', icon: 'trending-up', category: 'chess', mode: 'open', tc: 'blitz', minutes: 10080 },
  { key: 'cold', title: 'Cold shower dare', blurb: '60 seconds, ice cold, on camera', icon: 'snowflake', category: 'dare', mode: 'target', dare: 'Take a 60 second ice-cold shower (film your face and the water, keep it PG).', minutes: 1440 },
  { key: 'pushups', title: '50 push-up dare', blurb: '50 in one set, on video', icon: 'arm-flex', category: 'dare', mode: 'target', dare: 'Do 50 push-ups in one set without stopping, counting out loud on camera.', minutes: 2880 },
  { key: 'sing', title: 'Karaoke solo', blurb: 'Sing a full chorus at home', icon: 'microphone-variant', category: 'dare', mode: 'target', dare: 'Sing a full chorus of a song of your choice, loudly and with feeling, on camera at home.', minutes: 1440 },
];

const durationLabel = (m: number) => (m === 5 ? '5 minutes' : DURATIONS.find((d) => d.minutes === m)?.label ?? `${m} min`);

export default function Create() {
  const { with: withFriend } = useLocalSearchParams<{ with?: string }>();
  const { me, refresh, setMe } = useAuth();
  const toast = useToast();
  const [kind, setKind] = useState<Kind>('chess');
  const [source, setSource] = useState<Source>('video');
  const [mode, setMode] = useState<Mode>('target');
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState(''); // custom: what the player has to do (becomes description / dare text)
  const [target, setTarget] = useState('');
  const [tc, setTc] = useState<ChessTimeControl>('rapid');
  const [dareText, setDareText] = useState('');
  const [stake, setStake] = useState(50);
  const [customStake, setCustomStake] = useState('');
  const [minutes, setMinutes] = useState(1440);
  const [visibility, setVisibility] = useState<Visibility>('friends');
  const [invitees, setInvitees] = useState<string[]>(withFriend ? [withFriend] : []);
  const [friends, setFriends] = useState<FriendsView['friends'] | null>(null);
  const [chessName, setChessName] = useState('');
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ChallengeView | null>(null);

  useEffect(() => {
    api<FriendsView>('/friends')
      .then((f) => setFriends(f.friends))
      .catch(() => setFriends([]));
  }, []);

  if (!me) return null;

  const category: Category = kind === 'custom' ? (source === 'video' ? 'dare' : source) : kind;
  const needsConnect = (category === 'chess' && !me.chessUsername) || (category === 'strava' && !me.stravaConnected);
  const stepsFor = (k: Kind, cat: Category, connect: boolean): Step[] => {
    const s: Step[] = ['category'];
    if (k === 'custom') s.push('custom');
    if (connect) s.push('connect');
    if (cat !== 'dare') s.push('mode');
    if (!(k === 'custom' && cat === 'dare')) s.push('goal');
    s.push('stake', 'duration', 'squad');
    return s;
  };
  const steps = stepsFor(kind, category, needsConnect);
  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;
  const effectiveMode: Mode = category === 'dare' ? 'target' : mode;
  const targetNum = Number(target);
  const maxStake = me.limits.maxStakeLamports;
  const daresLeft = me.limits.publicDaresPerWeek - me.limits.publicDaresUsed;
  const finalDare = kind === 'custom' ? goal.trim() : dareText.trim();

  const applyTemplate = (t: Template) => {
    setError(null);
    setKind(t.category);
    setMode(t.mode);
    setTitle(t.title);
    setTarget(t.target !== undefined ? String(t.target) : '');
    if (t.tc) setTc(t.tc);
    setDareText(t.dare ?? '');
    setMinutes(t.minutes);
    const connect = (t.category === 'chess' && !me.chessUsername) || (t.category === 'strava' && !me.stravaConnected);
    const s = stepsFor(t.category, t.category, connect);
    setIndex(s.indexOf(connect ? 'connect' : 'stake'));
  };

  const stepError = (): string | null => {
    if (step === 'custom') {
      if (title.trim().length < 3) return 'Give your challenge a name (at least 3 characters).';
      if (goal.trim().length < 10) return 'Describe the goal in at least 10 characters so everyone knows what counts.';
      if (source === 'video' && goal.trim().length > 200) return 'Keep a video-proof goal under 200 characters.';
    }
    if (step === 'connect' && needsConnect) return category === 'chess' ? 'Link your chess.com username to continue.' : 'Connect Strava to continue.';
    if (step === 'goal') {
      if (title.trim().length < 3) return 'Give your challenge a name (at least 3 characters).';
      if (category === 'dare') return dareText.trim().length < 10 ? 'Describe the dare in at least 10 characters.' : null;
      if (effectiveMode === 'open') return null;
      if (!Number.isFinite(targetNum) || target.trim() === '') return 'Enter a number for the goal.';
      if (category === 'strava' && (targetNum < 0.1 || targetNum > 500)) return 'Miles must be between 0.1 and 500.';
      if (category === 'chess' && (!Number.isInteger(targetNum) || targetNum < 100 || targetNum > 3500)) return 'Rating must be a whole number between 100 and 3500.';
    }
    if (step === 'stake') {
      if (!Number.isInteger(stake) || stake < 10) return 'The minimum stake is 10 coins.';
      if (coinsToLamports(stake) > maxStake) return `Your max stake is ${coins(maxStake)} coins. Earn XP to raise it.`;
      if (me.wallet.balanceLamports >= 0 && coinsToLamports(stake) > me.wallet.balanceLamports) return `You only have ${coins(me.wallet.balanceLamports)} coins.`;
    }
    if (step === 'squad' && category === 'dare' && visibility === 'public' && daresLeft <= 0) return 'No public dares left this week — make it a friends dare.';
    return null;
  };

  const submit = async () => {
    setBusy('create');
    try {
      const body: CreateChallengeBody = {
        title: title.trim(),
        category,
        visibility,
        mode: effectiveMode,
        stakeLamports: coinsToLamports(stake),
        durationMinutes: minutes,
        ...(kind === 'custom' && category !== 'dare' ? { description: goal.trim() } : {}),
        ...(category !== 'dare' && effectiveMode === 'target' ? { target: targetNum } : {}),
        ...(category === 'chess' ? { chessTimeControl: tc } : {}),
        ...(category === 'dare' ? { dareText: finalDare } : {}),
        ...(invitees.length ? { inviteFriendIds: invitees } : {}),
      };
      const c = await api<ChallengeView>('/challenges', { body, timeoutMs: 60_000 });
      void refresh();
      setCreated(c);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const next = async () => {
    setError(null);
    const problem = stepError();
    if (problem) return setError(problem);
    if (!last) return setIndex(index + 1);
    await submit();
  };

  const back = () => {
    setError(null);
    if (index === 0) goBack('/home');
    else setIndex(index - 1);
  };

  const doConnectStrava = async () => {
    setBusy('strava');
    setError(null);
    try {
      const r = await connectStrava(refresh);
      if (r.ok) toast(r.demo ? 'Demo Strava connected' : 'Strava connected', 'success', 'run-fast');
      else setError("Strava didn't connect. Allow activity access and try again.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const doLinkChess = async () => {
    setBusy('chess');
    setError(null);
    try {
      setMe(await linkChess(chessName));
      toast('chess.com linked', 'success', 'chess-knight');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const voteIntegration = async (key: string, name: string) => {
    try {
      const was = me.integrationsWanted.includes(key);
      setMe(await api<MeView>('/me/integrations', { body: { key } }));
      toast(was ? `Removed your ${name} vote` : `Voted for ${name} — we'll ping you when it lands`, 'info', 'bell-ring-outline');
    } catch (e) {
      toast(errorMessage(e), 'danger');
    }
  };

  // ---------- done ----------

  if (created) {
    const invited = invitees.length;
    return (
      <Screen footer={<Button title="View challenge" onPress={() => router.replace(`/challenge/${created.id}`)} />}>
        <Animated.View entering={FadeIn.duration(400)} style={styles.done}>
          <Butterfingers mood="celebrate" size={150} />
          <Title center>Challenge is live</Title>
          <Body center color={colors.textMuted}>
            Your {coins(created.stakeLamports)}-coin stake is locked in the pot.
            {invited ? ` ${invited} friend${invited === 1 ? '' : 's'} got your invite.` : ''}
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
                  icon="content-copy"
                  title="Copy"
                  style={styles.flex}
                  onPress={async () => {
                    await Clipboard.setStringAsync(created.inviteCode!);
                    toast('Invite code copied', 'success', 'content-copy');
                  }}
                />
                <Button
                  small
                  variant="secondary"
                  icon="share-variant"
                  title="Share"
                  style={styles.flex}
                  onPress={async () => (await shareText(`Bet on yourself with me! Join "${created.title}" on Bet On Me with code ${created.inviteCode} (${coins(created.stakeLamports)}-coin stake): ${WEB_URL}/join?code=${created.inviteCode}`)) === 'copied' && toast('Copied — paste it anywhere', 'success', 'content-copy')}
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

  // ---------- steps ----------

  return (
    <Screen
      footer={
        <>
          {error ? <Banner text={error} /> : null}
          <Button
            title={last ? `Lock it in · ${stake.toLocaleString()} coins` : step === 'connect' && !needsConnect ? 'Connected — next' : 'Next'}
            onPress={() => void next()}
            loading={busy === 'create'}
          />
        </>
      }>
      <TopBar title={index === 0 ? 'New bet' : kind === 'custom' ? 'Custom bet' : `${categoryMeta[category].label} bet`} onBack={back} right={index > 0 ? <Text style={styles.stepCount}>{index + 1}/{steps.length}</Text> : undefined} />
      <View style={styles.dots} accessibilityRole="progressbar" accessibilityLabel={`Step ${index + 1} of ${steps.length}`} accessibilityValue={{ min: 1, max: steps.length, now: index + 1 }}>
        {steps.map((s, i) => (
          <View key={s} style={styles.dot}>
            {i <= index ? <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.primary }]} /> : null}
          </View>
        ))}
      </View>

      <Animated.View key={step} entering={FadeIn.duration(180)} style={{ gap: space.lg }}>
        {step === 'category' ? (
          <>
            <Title>What are you betting on?</Title>
            <View style={{ gap: space.sm }}>
              <Label>Quick picks</Label>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md, paddingRight: space.lg }} style={{ marginHorizontal: -space.lg, paddingLeft: space.lg }}>
                {TEMPLATES.map((t) => (
                  <Squish key={t.key} accessibilityLabel={`${t.title}. ${t.blurb}`} onPress={() => applyTemplate(t)} style={styles.template}>
                    <View style={styles.templateBg}>
                      <CategoryMark category={t.category} size={32} />
                      <View style={{ gap: 2 }}>
                        <Text style={styles.templateTitle} numberOfLines={1}>
                          {t.title}
                        </Text>
                        <Text style={styles.templateBlurb} numberOfLines={2}>
                          {t.blurb}
                        </Text>
                      </View>
                    </View>
                  </Squish>
                ))}
              </ScrollView>
            </View>
            <Label>Or build it</Label>
            <View style={{ gap: space.md }} accessibilityRole="radiogroup">
              <Choice icon="chess-knight" title="Chess" subtitle="Your live chess.com rating is the proof." selected={kind === 'chess'} onPress={() => setKind('chess')} />
              <Choice icon="run-fast" title="Running" subtitle="Strava GPS miles. Typed-in activities don't count." selected={kind === 'strava'} onPress={() => setKind('strava')} />
              <Choice icon="drama-masks" title="Dare" subtitle="Record a video. AI and your friends judge it." selected={kind === 'dare'} onPress={() => setKind('dare')} />
              <Choice icon="creation" title="Custom" subtitle="Your goal, your rules. Pick how we verify it." selected={kind === 'custom'} onPress={() => setKind('custom')} right={<Chip text="New" tone="primary" />} />
            </View>
          </>
        ) : null}

        {step === 'custom' ? (
          <>
            <Title>Dream it up</Title>
            <Muted>Anything you want to hold yourself to. Then choose how the app checks it — the proof is what makes the money fair.</Muted>
            <Field label="Challenge name" value={title} onChangeText={setTitle} maxLength={60} placeholder="Read 3 books in March" />
            <Field label="The goal" value={goal} onChangeText={setGoal} maxLength={source === 'video' ? 200 : 280} multiline placeholder="Finish 3 books and film a 15s recap of each one." hint={`${goal.length}/${source === 'video' ? 200 : 280} · Be specific so nobody can argue about it.`} />
            <View style={{ gap: space.md }} accessibilityRole="radiogroup">
              <Label>How do we verify it?</Label>
              <Choice icon="video-check" title="Video proof" subtitle="Record a 15s clip with a secret word. AI judges, friends can dispute." selected={source === 'video'} onPress={() => setSource('video')} />
              <Choice
                icon="run-fast"
                title="Strava"
                subtitle={me.stravaConnected ? 'Connected · GPS miles count automatically' : 'Connect next — GPS miles count automatically'}
                selected={source === 'strava'}
                onPress={() => setSource('strava')}
                right={me.stravaConnected ? <Chip text="Linked" tone="success" icon="check" /> : undefined}
              />
              <Choice
                icon="chess-knight"
                title="chess.com"
                subtitle={me.chessUsername ? `Linked as ${me.chessUsername} · rating checked live` : 'Link next — your rating is checked live'}
                selected={source === 'chess'}
                onPress={() => setSource('chess')}
                right={me.chessUsername ? <Chip text="Linked" tone="success" icon="check" /> : undefined}
              />
            </View>
            <Card>
              <Label>More apps coming — vote to unlock</Label>
              <View style={styles.soonGrid}>
                {UPCOMING.map((it) => {
                  const on = me.integrationsWanted.includes(it.key);
                  return (
                    <Squish key={it.key} accessibilityRole="checkbox" accessibilityLabel={`${it.name}: ${it.what}. ${on ? 'Voted' : 'Tap to vote'}`} onPress={() => void voteIntegration(it.key, it.name)} style={[styles.soon, on && { borderColor: colors.primary }]}>
                      <Icon name={it.icon} color={on ? colors.primary : colors.textMuted} size={20} />
                      <Text style={[styles.soonText, on && { color: colors.primary }]} numberOfLines={1}>
                        {it.name}
                      </Text>
                      {on ? <Icon name="check" color={colors.primary} size={14} /> : null}
                    </Squish>
                  );
                })}
              </View>
            </Card>
          </>
        ) : null}

        {step === 'connect' ? (
          <>
            <Title>{category === 'chess' ? 'Link chess.com' : 'Connect Strava'}</Title>
            <Muted>{category === 'chess' ? 'We read your public rating straight from chess.com, so nobody can fake it.' : 'Only GPS-recorded runs and walks from Strava count toward the pot. Typed-in activities are ignored.'}</Muted>
            <View style={styles.connectHero}>
              <CategoryMark category={category} size={44} />
              <Icon name="swap-horizontal" color={colors.textDim} size={20} />
              <Logo size={44} wordmark={false} />
            </View>
            {category === 'chess' ? (
              me.chessUsername ? (
                <Banner tone="success" text={`Linked as ${me.chessUsername}. You're good to go.`} />
              ) : (
                <>
                  <Field label="chess.com username" value={chessName} onChangeText={setChessName} autoCapitalize="none" autoCorrect={false} maxLength={25} placeholder="e.g. hikaru" returnKeyType="done" onSubmitEditing={() => chessName.trim().length >= 3 && void doLinkChess()} />
                  <Button title="Link account" icon="link-variant" loading={busy === 'chess'} disabled={chessName.trim().length < 3} onPress={() => void doLinkChess()} />
                </>
              )
            ) : me.stravaConnected ? (
              <Banner tone="success" text={me.stravaDemo ? 'Demo Strava connected. Log simulated runs from the challenge screen.' : 'Strava connected. Your GPS miles count.'} />
            ) : (
              <Button title={me.stravaDemo ? 'Connect demo Strava' : 'Connect Strava'} icon="link-variant" loading={busy === 'strava'} onPress={() => void doConnectStrava()} />
            )}
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
            {kind !== 'custom' ? <Field label="Challenge name" value={title} onChangeText={setTitle} maxLength={60} placeholder={category === 'dare' ? 'Sing in the dining hall' : category === 'chess' ? 'Road to 1200' : '20 mile week'} returnKeyType="done" /> : null}
            {category === 'chess' ? (
              <View style={{ gap: space.sm }}>
                <Label>Time control</Label>
                <Segmented value={tc} onChange={setTc} options={[{ value: 'rapid', label: 'Rapid' }, { value: 'blitz', label: 'Blitz' }, { value: 'bullet', label: 'Bullet' }]} />
              </View>
            ) : null}
            {category !== 'dare' && effectiveMode === 'target' ? (
              <>
                <Field
                  label={category === 'chess' ? 'Target rating' : 'Target miles'}
                  value={target}
                  onChangeText={setTarget}
                  keyboardType={category === 'chess' ? 'number-pad' : 'decimal-pad'}
                  placeholder={category === 'chess' ? '1200' : '20'}
                  maxLength={6}
                  hint={category === 'chess' ? `Checked live against chess.com (${me.chessUsername ?? 'link your username'}).` : 'Only GPS-recorded runs and walks count. Manual activities are ignored.'}
                />
                <Row style={{ flexWrap: 'wrap' }}>
                  {(category === 'chess' ? [800, 1000, 1200, 1500, 1800] : [3.1, 6.2, 13.1, 20, 26.2]).map((v) => (
                    <Squish key={v} accessibilityLabel={`Set target ${v}`} onPress={() => setTarget(String(v))} style={[styles.quick, target === String(v) && styles.quickOn]}>
                      <Text style={[styles.quickText, target === String(v) && { color: colors.bg }]}>{category === 'strava' ? (v === 3.1 ? '5K' : v === 6.2 ? '10K' : v === 13.1 ? 'Half' : v === 26.2 ? 'Marathon' : `${v} mi`) : v}</Text>
                    </Squish>
                  ))}
                </Row>
              </>
            ) : null}
            {category !== 'dare' && effectiveMode === 'open' ? <Banner tone="info" text={category === 'chess' ? 'Most rating points gained from now until the end wins the whole pot.' : 'Most GPS-recorded miles between now and the end wins the whole pot.'} /> : null}
            {category === 'dare' ? (
              <>
                <Field label="The dare" value={dareText} onChangeText={setDareText} multiline maxLength={200} placeholder="Order a coffee using only song lyrics" hint={`${dareText.length}/200 · Every dare is screened against the guidelines before it goes live.`} />
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
            <Muted>Everyone who joins puts in the same stake. Your wallet has {coins(me.wallet.balanceLamports)} coins.</Muted>
            <CoachCard
              body={{
                category,
                mode: effectiveMode,
                title: title.trim() || 'My challenge',
                description: kind === 'custom' && category !== 'dare' ? goal.trim() : '',
                target: category !== 'dare' && effectiveMode === 'target' ? targetNum : undefined,
                chessTimeControl: tc,
                dareText: category === 'dare' ? finalDare : undefined,
                durationMinutes: minutes,
              }}
              maxCoins={Math.max(10, Math.floor(maxStake / 1_000_000))}
              onUse={(n) => {
                setCustomStake('');
                setStake(n);
              }}
            />
            <View style={styles.stakeHero}>
              <Text style={styles.stakeBig}>{stake.toLocaleString()}</Text>
              <Text style={styles.stakeUnit}>coins each</Text>
            </View>
            <View style={styles.grid} accessibilityRole="radiogroup">
              {STAKES.map((s) => {
                const locked = coinsToLamports(s) > maxStake;
                const on = stake === s && !customStake;
                return (
                  <Squish
                    key={s}
                    accessibilityRole="radio"
                    accessibilityLabel={locked ? `${s} coins, locked` : `${s} coins`}
                    disabled={locked}
                    onPress={() => {
                      setCustomStake('');
                      setStake(s);
                    }}
                    style={[styles.stakeCell, on && styles.stakeCellOn]}>
                    <Text style={[styles.stakeCellText, on && { color: colors.onPrimary }]}>{s >= 1000 ? `${s / 1000}K` : s}</Text>
                    {locked ? <Icon name="lock" size={14} color={colors.textDim} /> : null}
                  </Squish>
                );
              })}
            </View>
            <Field
              label="Custom amount"
              value={customStake}
              onChangeText={(t) => {
                const clean = t.replace(/[^0-9]/g, '').slice(0, 5);
                setCustomStake(clean);
                const n = Number(clean);
                if (clean && Number.isFinite(n)) setStake(Math.floor(n));
              }}
              keyboardType="number-pad"
              placeholder={`10 – ${coins(maxStake)}`}
              hint={`Your max stake is ${coins(maxStake)} coins. Earn XP by joining and winning to raise it${me.limits.next ? ` (${coins(me.limits.next.maxStakeLamports)} coins at ${me.limits.next.points} Clout)` : ''}.`}
            />
          </>
        ) : null}

        {step === 'duration' ? (
          <>
            <Title>How long?</Title>
            <View style={styles.grid} accessibilityRole="radiogroup">
              {me.demoMode ? (
                <Squish accessibilityRole="radio" accessibilityLabel="5 minutes, demo mode" onPress={() => setMinutes(5)} style={[styles.durCell, minutes === 5 && styles.durCellOn]}>
                  <Text style={styles.durTitle}>5 min</Text>
                  <Text style={styles.durSub}>Demo mode</Text>
                </Squish>
              ) : null}
              {DURATIONS.map((d) => {
                const on = minutes === d.minutes;
                return (
                  <Squish key={d.minutes} accessibilityRole="radio" accessibilityLabel={`${d.label}. ${d.sub}`} onPress={() => setMinutes(d.minutes)} style={[styles.durCell, on && styles.durCellOn]}>
                    <Text style={styles.durTitle}>{d.label}</Text>
                    <Text style={styles.durSub}>{d.sub}</Text>
                  </Squish>
                );
              })}
            </View>
          </>
        ) : null}

        {step === 'squad' ? (
          <>
            <Title>Who&apos;s in?</Title>
            <View style={{ gap: space.md }} accessibilityRole="radiogroup">
              <Choice icon="account-multiple" title="Friends" subtitle="Your squad can see and join it. Anyone else needs the code." selected={visibility === 'friends'} onPress={() => setVisibility('friends')} />
              <Choice
                icon="earth"
                title="Public"
                subtitle={category === 'dare' ? (daresLeft > 0 ? `Shown in the live feed. ${daresLeft} public dare${daresLeft === 1 ? '' : 's'} left this week.` : 'You have no public dares left this week. Earn XP for more.') : 'Shown in the live feed. Anyone can join.'}
                selected={visibility === 'public'}
                disabled={category === 'dare' && daresLeft <= 0}
                onPress={() => setVisibility('public')}
              />
            </View>

            <View style={{ gap: space.sm }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Label>Call out friends</Label>
                {friends && friends.length > 0 ? (
                  <Text style={styles.link} onPress={() => setInvitees(invitees.length === friends.length ? [] : friends.map((f) => f.id))} accessibilityRole="button">
                    {invitees.length === friends.length ? 'Clear' : 'Select all'}
                  </Text>
                ) : null}
              </Row>
              {friends === null ? (
                <Muted>Loading your squad…</Muted>
              ) : friends.length === 0 ? (
                <Card>
                  <Muted>No friends yet. Add some from the Squad tab to send them this bet — or share the invite code after you create it.</Muted>
                </Card>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md, paddingRight: space.lg }} style={{ marginHorizontal: -space.lg, paddingLeft: space.lg }}>
                  {friends.map((f) => {
                    const on = invitees.includes(f.id);
                    return (
                      <Squish key={f.id} accessibilityRole="checkbox" accessibilityLabel={`${on ? 'Uninvite' : 'Invite'} ${f.username}`} onPress={() => setInvitees(on ? invitees.filter((x) => x !== f.id) : [...invitees, f.id])} style={styles.friend}>
                        <View>
                          <Avatar username={f.username} avatar={f.avatar} size={56} ring={on ? colors.primary : undefined} />
                          {on ? (
                            <View style={styles.check}>
                              <Icon name="check-bold" size={12} color={colors.onPrimary} />
                            </View>
                          ) : null}
                        </View>
                        <Text numberOfLines={1} style={[styles.friendName, on && { color: colors.primary }]}>
                          {f.displayName || f.username}
                        </Text>
                      </Squish>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            <Card tone="primary">
              <Label>Review</Label>
              <Heading>{title.trim()}</Heading>
              <Muted>
                {category === 'dare'
                  ? finalDare
                  : kind === 'custom'
                    ? goal.trim()
                    : effectiveMode === 'open'
                      ? category === 'chess'
                        ? `Most ${tc} rating gained wins`
                        : 'Most miles wins'
                      : category === 'chess'
                        ? `Reach ${target} ${tc} on chess.com`
                        : `Run or walk ${target} miles`}
              </Muted>
              {kind === 'custom' && category !== 'dare' ? <Muted>Verified by {category === 'chess' ? `chess.com · ${effectiveMode === 'open' ? `most ${tc} rating gained` : `reach ${target} ${tc}`}` : `Strava · ${effectiveMode === 'open' ? 'most miles' : `${target} miles`}`}</Muted> : null}
              <ReviewRow label="Your stake" value={`${stake.toLocaleString()} coins`} accent />
              <ReviewRow label="Ends in" value={durationLabel(minutes)} />
              <ReviewRow label="Proof" value={category === 'dare' ? 'Video + friends' : category === 'chess' ? 'chess.com' : 'Strava GPS'} />
              {invitees.length ? <ReviewRow label="Invites" value={`${invitees.length} friend${invitees.length === 1 ? '' : 's'}`} /> : null}
            </Card>
          </>
        ) : null}
      </Animated.View>
    </Screen>
  );
}

function ReviewRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Body color={colors.textMuted}>{label}</Body>
      {accent ? <Heading color={colors.primary}>{value}</Heading> : <BodyStrong>{value}</BodyStrong>}
    </Row>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stepCount: { width: 40, textAlign: 'center', fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.surfaceHi, overflow: 'hidden' },
  template: { width: 176 },
  templateBg: { height: 128, borderRadius: radius.lg, padding: space.md, justifyContent: 'space-between', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  templateTitle: { fontFamily: fonts.bodySemi, fontSize: 14.5, color: colors.text },
  templateBlurb: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 17, color: colors.textMuted },
  soonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  soon: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, height: 32, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  soonText: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.text },
  connectHero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.lg, height: 96, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  quick: { paddingHorizontal: space.md, height: 32, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  quickOn: { backgroundColor: colors.text, borderColor: colors.text },
  quickText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
  stakeHero: { borderRadius: radius.lg, paddingVertical: space.lg, alignItems: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  stakeBig: { fontFamily: fonts.display, fontSize: 61, lineHeight: 62, letterSpacing: 0.3, color: colors.text, fontVariant: ['tabular-nums'] },
  stakeUnit: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stakeCell: { flexBasis: '22%', flexGrow: 1, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 },
  stakeCellOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  stakeCellText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] },
  durCell: { flexBasis: '46%', flexGrow: 1, paddingHorizontal: space.md, paddingVertical: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: 2 },
  durCellOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  durTitle: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text },
  durSub: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textMuted },
  link: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.primary },
  friend: { alignItems: 'center', gap: 6, width: 68 },
  friendName: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted, maxWidth: 68 },
  check: { position: 'absolute', right: -2, top: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  done: { alignItems: 'center', gap: space.md, paddingTop: space.xxxl },
  doneIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.successBg, alignItems: 'center', justifyContent: 'center' },
});
