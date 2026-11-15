import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { MeView } from '../../../../lib/types';
import { Avatar, CategoryMark, RatingBadge, Sheet, Squish, useConfirm, useToast } from '@/components/fx';
import { Banner, Body, BodyStrong, Button, Card, Chip, DevnetTag, Field, Heading, Icon, IconButton, Label, Money, Muted, ProgressBar, Row, Screen, Title, type IconName } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { shareText } from '@/lib/share';
import { UPCOMING } from '@/lib/integrations';
import { explorerAddress, shortKey, coins } from '@/lib/format';
import { categoryMeta, colors, fonts, space } from '@/lib/theme';

const GUIDELINES =
  'No dares involving danger or injury, anything illegal, alcohol or drugs, sexual content, filming or bothering people without consent, property damage, or targeting a specific person.';


type Info = 'guidelines' | 'payouts' | null;

export default function Profile() {
  const { me, refresh, setMe, logout } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [chess, setChess] = useState('');
  const [editChess, setEditChess] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<Info>(null);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );
  if (!me) return null;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const saveChess = () =>
    run('chess', async () => {
      setMe(await api<MeView>('/me/chess', { body: { username: chess.trim() } }));
      setEditChess(false);
      toast('chess.com account linked', 'success', 'chess-knight');
    });

  const connectStrava = () =>
    run('strava', async () => {
      const returnTo = Linking.createURL('/strava-connected');
      const { url, demo } = await api<{ url?: string; demo?: boolean }>(`/strava/connect?returnTo=${encodeURIComponent(returnTo)}`);
      if (demo || !url) {
        await refresh();
        return toast('Demo Strava connected. Log simulated runs from a running challenge.', 'success', 'run-fast');
      }
      const result = await WebBrowser.openAuthSessionAsync(url, returnTo);
      const fresh = await refresh();
      if (fresh?.stravaConnected) toast('Strava connected. Your GPS runs and walks now count.', 'success', 'run-fast');
      else if (result.type === 'success') setError("Strava didn't connect. Make sure you allow activity access, then try again.");
    });

  const toggleInterest = (key: string, name: string) =>
    run(`i${key}`, async () => {
      const was = me.integrationsWanted.includes(key);
      setMe(await api<MeView>('/me/integrations', { body: { key } }));
      toast(was ? `Okay, no ${name} pings` : `We'll tell you when ${name} lands`, 'info', was ? 'bell-off-outline' : 'bell-ring-outline');
    });

  const next = me.limits.next;
  const prevFloor = next ? (next.points === 200 ? 0 : 200) : 1000;
  const tierProgress = next ? (me.points - prevFloor) / (next.points - prevFloor) : 1;
  const winRate = me.stats.played ? Math.round((me.stats.wins / me.stats.played) * 100) : 0;
  const net = me.stats.netLamports;

  return (
    <Screen tabbed>
      {/* Identity */}
      <View style={{ gap: space.lg, paddingTop: space.sm }}>
        <Row gap={space.lg}>
          <Squish accessibilityLabel="Change profile picture" onPress={() => router.push('/edit-profile')}>
            <Avatar username={me.username} avatar={me.avatar} size={64} />
          </Squish>
          <View style={[styles.flex, { gap: 4 }]}>
            <Title numberOfLines={1}>{me.displayName || me.username}</Title>
            <Row gap={space.sm}>
              <Muted>@{me.username}</Muted>
              <RatingBadge rating={me.rating} size="sm" />
            </Row>
          </View>
        </Row>
        {me.bio ? <Body color={colors.textMuted}>{me.bio}</Body> : null}
        <Row gap={space.sm}>
          <Button small variant="secondary" title={me.bio ? 'Edit profile' : 'Add a bio'} style={styles.flex} onPress={() => router.push('/edit-profile')} />
          <Button
            small
            variant="secondary"
            title="Share profile"
            style={styles.flex}
            onPress={async () => (await shareText(`I'm @${me.username} on Bet On Me — add me and let's put stakes on our goals.`)) === 'copied' && toast('Copied — paste it anywhere', 'success', 'content-copy')}
          />
        </Row>
        <View style={styles.stats}>
          <Stat label="Played" value={String(me.stats.played)} />
          <Stat label="Wins" value={String(me.stats.wins)} />
          <Stat label="Win rate" value={`${winRate}%`} />
          <Stat label="Net coins" value={`${net > 0 ? '+' : net < 0 ? '−' : ''}${coins(Math.abs(net))}`} color={net > 0 ? colors.success : net < 0 ? colors.danger : colors.text} />
          <Stat label="Squad" value={String(me.friendCount)} onPress={() => router.navigate('/friends')} />
        </View>
      </View>

      {error ? <Banner text={error} /> : null}
      {!me.wallet.funded ? <Banner tone="info" text="Your starter coins are still on their way. Pull down on the feed to check again." /> : null}

      <Card>
        <Label>Wallet</Label>
        <Row gap={6} style={{ alignItems: 'baseline' }}>
          <Money>{coins(me.wallet.balanceLamports)}</Money>
          <Muted>coins</Muted>
        </Row>
        <Row>
          <Muted style={styles.flex} selectable accessibilityLabel={`Wallet address ${me.wallet.publicKey}`}>
            {shortKey(me.wallet.publicKey)}
          </Muted>
          <IconButton
            name="content-copy"
            label="Copy wallet address"
            color={colors.textMuted}
            onPress={async () => {
              await Clipboard.setStringAsync(me.wallet.publicKey);
              toast('Wallet address copied', 'success', 'content-copy');
            }}
          />
          <IconButton name="open-in-new" label="View wallet on Solana Explorer" color={colors.textMuted} onPress={() => void Linking.openURL(explorerAddress(me.wallet.publicKey))} />
        </Row>
        <Muted>1 coin = 0.001 test SOL. Every stake and payout is a devnet transaction you can verify on the Explorer.</Muted>
        <DevnetTag mock={me.chainMock} />
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Heading>Level {me.points >= 1000 ? 3 : me.points >= 200 ? 2 : 1}</Heading>
          <Text style={styles.delta}>{me.points} XP</Text>
        </Row>
        <ProgressBar value={tierProgress} />
        <Muted>{next ? `${next.points - me.points} XP to Level ${next.points === 200 ? 2 : 3}: ${coins(next.maxStakeLamports)}-coin stakes and ${next.publicDaresPerWeek} public dares a week.` : "Top tier unlocked. You're a legend."}</Muted>
        <Row style={{ flexWrap: 'wrap' }}>
          <Chip text={`Max stake ${coins(me.limits.maxStakeLamports)} coins`} tone="primary" />
          <Chip text={`${me.limits.publicDaresUsed}/${me.limits.publicDaresPerWeek} public dares used`} />
        </Row>
        <Muted>XP: +10 join · +50 complete · +100 win a pot · −20 fail. Your ★ rating is the average players give the challenges you create.</Muted>
      </Card>

      {/* Connected apps */}
      <View style={{ gap: space.md }}>
        <Heading accessibilityRole="header">Connected apps</Heading>
        <Card>
          <Row>
            <View style={styles.appIcon}>
              <Icon name="chess-knight" color={categoryMeta.chess.color} size={20} />
            </View>
            <View style={styles.flex}>
              <BodyStrong>chess.com</BodyStrong>
              <Muted>{me.chessUsername ? `Linked as ${me.chessUsername}` : 'Needed for chess challenges'}</Muted>
            </View>
            {me.chessUsername && !editChess ? (
              <Button
                small
                variant="secondary"
                title="Change"
                onPress={() => {
                  setChess(me.chessUsername ?? '');
                  setEditChess(true);
                }}
              />
            ) : null}
          </Row>
          {!me.chessUsername || editChess ? (
            <>
              <Field label="chess.com username" value={chess} onChangeText={setChess} autoCapitalize="none" autoCorrect={false} maxLength={25} placeholder="e.g. hikaru" returnKeyType="done" onSubmitEditing={() => chess.trim().length >= 3 && void saveChess()} />
              <Row gap={space.sm}>
                <Button small title="Link account" icon="link-variant" loading={busy === 'chess'} disabled={chess.trim().length < 3} onPress={() => void saveChess()} style={styles.flex} />
                {editChess ? <Button small variant="ghost" title="Cancel" onPress={() => setEditChess(false)} /> : null}
              </Row>
            </>
          ) : null}
        </Card>
        <Card>
          <Row>
            <View style={styles.appIcon}>
              <Icon name="run-fast" color={categoryMeta.strava.color} size={20} />
            </View>
            <View style={styles.flex}>
              <BodyStrong>{me.stravaDemo ? 'Strava (demo)' : 'Strava'}</BodyStrong>
              <Muted>{me.stravaDemo ? (me.stravaConnected ? 'Simulated connection. Runs are logged from a running challenge.' : 'Simulated for this demo — no real Strava account needed.') : me.stravaConnected ? "Connected. Manual activities don't count." : 'Needed for running challenges'}</Muted>
            </View>
            {me.stravaConnected ? <Chip text="Connected" icon="check-circle" tone="success" /> : null}
          </Row>
          {me.stravaDemo && me.stravaConnected ? null : (
            <Button small variant={me.stravaConnected ? 'secondary' : 'primary'} title={me.stravaConnected ? 'Reconnect Strava' : me.stravaDemo ? 'Connect demo Strava' : 'Connect Strava'} icon="link-variant" loading={busy === 'strava'} onPress={() => void connectStrava()} />
          )}
        </Card>
        <Card>
          <Heading>Coming soon</Heading>
          <Muted>Tell us what to build next. We’ll ping you when it can verify your challenges.</Muted>
          <View style={styles.grid}>
            {UPCOMING.map((it) => {
              const on = me.integrationsWanted.includes(it.key);
              return (
                <Squish key={it.key} accessibilityRole="checkbox" accessibilityLabel={`${it.name}. ${it.what}. ${on ? 'You will be notified' : 'Tap to get notified'}`} onPress={() => void toggleInterest(it.key, it.name)} style={styles.soon}>
                  <Icon name={it.icon} color={on ? colors.primary : colors.textMuted} size={20} />
                  <View style={styles.flex}>
                    <BodyStrong numberOfLines={1}>{it.name}</BodyStrong>
                    <Muted numberOfLines={1}>{it.what}</Muted>
                  </View>
                  <Text style={[styles.link, on && { color: colors.textMuted }]}>{on ? 'Voted' : 'Vote'}</Text>
                </Squish>
              );
            })}
          </View>
        </Card>
      </View>

      {/* History */}
      <View style={{ gap: 0 }}>
        <Heading accessibilityRole="header" style={{ marginBottom: space.xs }}>History</Heading>
        {me.history.length === 0 ? <Muted>No finished challenges yet. Your wins and fumbles will show up here.</Muted> : null}
        {me.history.map((h) => {
          const n = h.paidLamports - h.stakeLamports;
          return (
            <Squish key={h.challengeId} accessibilityLabel={`Open ${h.title}`} onPress={() => router.push(`/challenge/${h.challengeId}`)} style={styles.historyRow}>
              <CategoryMark category={h.category} size={36} />
              <View style={styles.flex}>
                <BodyStrong numberOfLines={1}>{h.title}</BodyStrong>
                <Muted>{h.won ? 'Won' : n === 0 ? 'Stake returned' : 'Lost'}</Muted>
              </View>
              <Text style={[styles.delta, { color: n > 0 ? colors.success : n < 0 ? colors.danger : colors.textMuted }]}>
                {n > 0 ? '+' : n < 0 ? '−' : ''}
                {coins(Math.abs(n))}
              </Text>
            </Squish>
          );
        })}
      </View>

      {/* Settings */}
      <View style={{ gap: 0 }}>
        <Heading accessibilityRole="header" style={{ marginBottom: space.xs }}>Settings</Heading>
        <SettingRow icon="account-edit-outline" title="Edit profile" onPress={() => router.push('/edit-profile')} />
        <SettingRow icon="ticket-confirmation-outline" title="Join with a code" onPress={() => router.push('/join')} />
        <SettingRow icon="scale-balance" title="How payouts work" onPress={() => setInfo('payouts')} />
        <SettingRow icon="shield-check-outline" title="Community guidelines" onPress={() => setInfo('guidelines')} />
        <SettingRow
          icon="logout"
          title="Log out"
          danger
          onPress={async () => {
            if (await confirm({ title: 'Log out?', message: 'Your wallet and bets stay safe. Log back in with the same username.', confirm: 'Log out', destructive: true, icon: 'logout' })) void logout();
          }}
        />
      </View>

      <Sheet visible={info === 'guidelines'} onClose={() => setInfo(null)} title="Community guidelines">
        <Body color={colors.textMuted}>{GUIDELINES}</Body>
        <Body color={colors.textMuted}>Public challenges are removed and refunded after 3 reports, or when downvotes outnumber upvotes by 5.</Body>
        <Button title="Got it" onPress={() => setInfo(null)} />
      </Sheet>
      <Sheet visible={info === 'payouts'} onClose={() => setInfo(null)} title="How payouts work">
        <Body color={colors.textMuted}>
          <BodyStrong>Hit a target:</BodyStrong> everyone who hits it splits the pot. Everyone hits → stakes back. Nobody → the leader takes it (dares refund).
        </Body>
        <Body color={colors.textMuted}>
          <BodyStrong>Most progress:</BodyStrong> the top performer takes the pot, ties split, no progress refunds everyone.
        </Body>
        <Body color={colors.textMuted}>Every stake and payout is a real Solana devnet transaction you can open on the Explorer. Test money only.</Body>
        <Button title="Got it" onPress={() => setInfo(null)} />
      </Sheet>
    </Screen>
  );
}

function Stat({ label, value, color = colors.text, onPress }: { label: string; value: string; color?: string; onPress?: () => void }) {
  const inner = (
    <View style={styles.stat}>
      <Text maxFontSizeMultiplier={1.2} style={[styles.statValue, { color }]}>
        {value}
      </Text>
      <Text maxFontSizeMultiplier={1.2} style={styles.statLabel}>
        {label}
      </Text>
    </View>
  );
  return onPress ? (
    <Squish accessibilityLabel={`${label} ${value}`} onPress={onPress} style={{ flex: 1 }}>
      {inner}
    </Squish>
  ) : (
    <View style={{ flex: 1 }} accessible accessibilityLabel={`${label} ${value}`}>
      {inner}
    </View>
  );
}

function SettingRow({ icon: name, title, onPress, danger }: { icon: IconName; title: string; onPress: () => void; danger?: boolean }) {
  return (
    <Squish accessibilityLabel={title} onPress={onPress} style={styles.setting}>
      <Icon name={name} color={danger ? colors.danger : colors.textMuted} />
      <BodyStrong style={styles.flex} color={danger ? colors.danger : colors.text}>
        {title}
      </BodyStrong>
      <Icon name="chevron-right" color={colors.textDim} />
    </Squish>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
  stats: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingVertical: space.md },
  stat: { gap: 2 },
  statValue: { fontFamily: fonts.display, fontSize: 18, letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  statLabel: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textMuted },
  appIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHi, borderWidth: 1, borderColor: colors.border },
  grid: { gap: 0 },
  soon: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm + 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm + 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  link: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.primary },
  delta: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text, fontVariant: ['tabular-nums'] },
  setting: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 50, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
