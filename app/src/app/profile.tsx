import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { Redirect, router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { MeView } from '../../../lib/types';
import { Butterfingers } from '@/components/Butterfingers';
import { Banner, Body, BodyStrong, Button, Card, Chip, DevnetTag, Field, Heading, Icon, IconButton, Label, Money, Muted, ProgressBar, Row, Screen, Title, TopBar } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { explorerAddress, shortKey, sol } from '@/lib/format';
import { categoryMeta, colors, space } from '@/lib/theme';

const GUIDELINES =
  'No dares involving danger or injury, anything illegal, alcohol or drugs, sexual content, filming or bothering people without consent, property damage, or targeting a specific person.';

export default function Profile() {
  const { me, refresh, setMe, logout } = useAuth();
  const [chess, setChess] = useState('');
  const [editChess, setEditChess] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );
  if (!me) return <Redirect href="/login" />;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
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
      setNotice('chess.com account linked.');
    });

  const connectStrava = () =>
    run('strava', async () => {
      const returnTo = Linking.createURL('/strava-connected');
      const { url } = await api<{ url: string }>(`/strava/connect?returnTo=${encodeURIComponent(returnTo)}`);
      const result = await WebBrowser.openAuthSessionAsync(url, returnTo);
      const fresh = await refresh();
      if (fresh?.stravaConnected) setNotice('Strava connected. Your GPS runs and walks now count.');
      else if (result.type === 'success') setError("Strava didn't connect. Make sure you allow activity access, then try again.");
    });

  const next = me.limits.next;
  const prevFloor = next ? (next.points === 200 ? 0 : 200) : 1000;
  const tierProgress = next ? (me.points - prevFloor) / (next.points - prevFloor) : 1;

  return (
    <Screen>
      <TopBar title="Profile" onBack={() => router.back()} right={<IconButton name="logout" label="Log out" color={colors.textMuted} onPress={() => void logout()} />} />

      <Row gap={space.lg}>
        <Butterfingers mood="idle" size={96} />
        <View style={styles.flex}>
          <Title numberOfLines={1}>{me.username}</Title>
          <DevnetTag mock={me.chainMock} />
        </View>
      </Row>

      {error ? <Banner text={error} /> : null}
      {notice ? <Banner tone="success" text={notice} /> : null}
      {!me.wallet.funded ? <Banner tone="info" text="Your starter SOL is still on its way. Pull down on the home screen to check again." /> : null}

      <Card tone="primary">
        <Label>Wallet balance</Label>
        <Row gap={space.xs + 2} style={{ alignItems: 'baseline' }}>
          <Money style={{ fontSize: 56, lineHeight: 58 }}>{sol(me.wallet.balanceLamports)}</Money>
          <Heading color={colors.primary}>SOL</Heading>
        </Row>
        <Row>
          <Icon name="wallet-outline" color={colors.textMuted} />
          <Body style={styles.flex} color={colors.textMuted} selectable accessibilityLabel={`Wallet address ${me.wallet.publicKey}`}>
            {shortKey(me.wallet.publicKey)}
          </Body>
          <IconButton
            name={copied ? 'check' : 'content-copy'}
            label="Copy wallet address"
            color={colors.primary}
            onPress={async () => {
              await Clipboard.setStringAsync(me.wallet.publicKey);
              setCopied(true);
            }}
          />
          <IconButton name="open-in-new" label="View wallet on Solana Explorer" color={colors.primary} onPress={() => void Linking.openURL(explorerAddress(me.wallet.publicKey))} />
        </Row>
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row>
            <Icon name="star-four-points" color={colors.primary} />
            <Heading>Clout</Heading>
          </Row>
          <Heading color={colors.primary} style={styles.tabular}>
            {me.points}
          </Heading>
        </Row>
        <ProgressBar value={tierProgress} />
        <Muted>
          {next
            ? `${next.points - me.points} more to unlock ${sol(next.maxStakeLamports)} SOL stakes and ${next.publicDaresPerWeek} public dares a week.`
            : "Top tier unlocked. You're a legend."}
        </Muted>
        <Row style={{ flexWrap: 'wrap' }}>
          <Chip icon="hand-coin" text={`Max stake ${sol(me.limits.maxStakeLamports)} SOL`} tone="primary" />
          <Chip icon="drama-masks" text={`${me.limits.publicDaresUsed}/${me.limits.publicDaresPerWeek} public dares used`} />
        </Row>
        <Muted>+10 join · +50 complete · +100 win a pot · −20 fail</Muted>
      </Card>

      <View style={{ gap: space.md }}>
        <Heading accessibilityRole="header">Connected accounts</Heading>
        <Card>
          <Row>
            <Icon name="chess-knight" color={colors.primary} />
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
              <Button small title="Link account" icon="link-variant" loading={busy === 'chess'} disabled={chess.trim().length < 3} onPress={() => void saveChess()} />
            </>
          ) : null}
        </Card>
        <Card>
          <Row>
            <Icon name="run-fast" color={colors.primary} />
            <View style={styles.flex}>
              <BodyStrong>Strava</BodyStrong>
              <Muted>{me.stravaConnected ? "Connected. Manual activities don't count." : 'Needed for running challenges'}</Muted>
            </View>
            {me.stravaConnected ? <Chip text="Connected" icon="check-circle" tone="success" /> : null}
          </Row>
          <Button small variant={me.stravaConnected ? 'secondary' : 'primary'} title={me.stravaConnected ? 'Reconnect Strava' : 'Connect Strava'} icon="link-variant" loading={busy === 'strava'} onPress={() => void connectStrava()} />
        </Card>
      </View>

      <View style={{ gap: space.md }}>
        <Heading accessibilityRole="header">History</Heading>
        {me.history.length === 0 ? <Muted>No finished challenges yet. Your wins and fumbles will show up here.</Muted> : null}
        {me.history.map((h) => {
          const net = h.paidLamports - h.stakeLamports;
          return (
            <Card key={h.challengeId}>
              <Row>
                <Icon name={categoryMeta[h.category].icon} color={colors.primary} />
                <View style={styles.flex}>
                  <BodyStrong numberOfLines={1}>{h.title}</BodyStrong>
                  <Muted>{h.won ? 'Won the pot' : net === 0 ? 'Stake returned' : 'Fumbled'}</Muted>
                </View>
                <Heading style={styles.tabular} color={net > 0 ? colors.success : net < 0 ? colors.danger : colors.textMuted}>
                  {net > 0 ? '+' : net < 0 ? '−' : ''}
                  {sol(Math.abs(net))} SOL
                </Heading>
                <IconButton name="chevron-right" label={`Open ${h.title}`} color={colors.textMuted} onPress={() => router.push(`/challenge/${h.challengeId}`)} />
              </Row>
            </Card>
          );
        })}
      </View>

      <Card>
        <Label>Community guidelines</Label>
        <Muted>{GUIDELINES} Public challenges are removed and refunded after 3 reports.</Muted>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
});
