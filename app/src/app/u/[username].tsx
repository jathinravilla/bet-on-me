import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { FriendsView, PublicProfile } from '../../../../lib/types';
import { ChallengeCard } from '@/components/ChallengeCard';
import { Avatar, RatingBadge, useConfirm, useToast } from '@/components/fx';
import { Banner, Body, Button, Chip, Heading, Loading, Muted, Row, Screen, Title, TopBar } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { goBack } from '@/lib/nav';
import { useAuth } from '@/lib/auth';
import { coins } from '@/lib/format';
import { useNow } from '@/lib/useNow';
import { colors, fonts, space } from '@/lib/theme';

export default function UserProfile() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { refresh } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const now = useNow();
  const [p, setP] = useState<PublicProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setP(await api<PublicProfile>(`/users/${encodeURIComponent(username)}`));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [username]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const friendAction = async (path: string, body: object, ok: string) => {
    setBusy(true);
    try {
      await api<FriendsView>(path, { body });
      toast(ok);
      void refresh();
      await load();
    } catch (e) {
      toast(errorMessage(e), 'danger');
    } finally {
      setBusy(false);
    }
  };

  if (!p) {
    return (
      <Screen>
        <TopBar onBack={() => goBack('/home')} />
        {error ? <Banner text={error} /> : <Loading label="Loading profile" />}
      </Screen>
    );
  }

  const winRate = p.stats.played ? Math.round((p.stats.wins / p.stats.played) * 100) : 0;
  const name = p.displayName || p.username;

  return (
    <Screen>
      <TopBar title={`@${p.username}`} onBack={() => goBack('/home')} />
      <View style={styles.hero}>
        <Avatar username={p.username} avatar={p.avatar} size={96}  />
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Title center numberOfLines={1}>
            {name}
          </Title>
          <Row>
            <RatingBadge rating={p.rating} />
            <Chip text={`${p.points} XP`} />
            {p.relation === 'friend' ? <Chip text="Friend" tone="primary" /> : null}
          </Row>
        </View>
        {p.bio ? (
          <Body center color={colors.textMuted}>
            {p.bio}
          </Body>
        ) : null}
        <View style={styles.stats}>
          {[
            ['Played', String(p.stats.played)],
            ['Wins', String(p.stats.wins)],
            ['Win %', String(winRate)],
            ['Live', String(p.stats.live)],
            ['Squad', String(p.friendCount)],
          ].map(([l, v]) => (
            <View key={l} style={styles.stat} accessible accessibilityLabel={`${l} ${v}`}>
              <Text style={styles.statValue}>{v}</Text>
              <Text style={styles.statLabel}>{l}</Text>
            </View>
          ))}
        </View>
        {p.relation === 'self' ? (
          <Button title="Edit your profile" icon="pencil" variant="secondary" onPress={() => router.push('/edit-profile')} style={{ alignSelf: 'stretch' }} />
        ) : p.relation === 'friend' ? (
          <Row gap={space.sm} style={{ alignSelf: 'stretch' }}>
            <Button title="Challenge" accessibilityHint={`Start a bet with ${name}`} icon="sword-cross" onPress={() => router.push(`/create?with=${p.id}`)} style={{ flex: 1 }} />
            <Button
              small
              variant="ghost"
              icon="account-remove-outline"
              title="Remove"
              loading={busy}
              onPress={async () => {
                if (await confirm({ title: `Remove ${p.username}?`, confirm: 'Remove friend', destructive: true, icon: 'account-remove' })) void friendAction('/friends/remove', { userId: p.id }, `Removed ${p.username}`);
              }}
            />
          </Row>
        ) : p.relation === 'incoming' ? (
          <Button title="Accept friend request" icon="check" loading={busy} onPress={() => void friendAction('/friends/respond', { userId: p.id, accept: true }, `You and ${p.username} are now friends`)} style={{ alignSelf: 'stretch' }} />
        ) : p.relation === 'outgoing' ? (
          <Button title="Request sent — cancel" icon="clock-outline" variant="secondary" loading={busy} onPress={() => void friendAction('/friends/remove', { userId: p.id }, 'Request cancelled')} style={{ alignSelf: 'stretch' }} />
        ) : (
          <Button title="Add to squad" icon="account-plus" loading={busy} onPress={() => void friendAction('/friends/request', { userId: p.id }, `Request sent to ${p.username}`)} style={{ alignSelf: 'stretch' }} />
        )}
      </View>

      <View style={{ gap: space.md }}>
        <Heading accessibilityRole="header">Live bets</Heading>
        {p.challenges.length === 0 ? <Muted>{p.relation === 'friend' || p.relation === 'self' ? 'Nothing live right now.' : 'Add them as a friend to see their friends-only bets.'}</Muted> : null}
        {p.challenges.map((c) => (
          <ChallengeCard key={c.id} c={c} now={now} onPress={() => router.push(`/challenge/${c.id}`)} highlight={`${coins(c.stakeLamports)} coins stake`} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: space.md, alignItems: 'center', paddingVertical: space.md },
  stats: { flexDirection: 'row', alignSelf: 'stretch', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingVertical: space.md },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontFamily: fonts.display, fontSize: 23, letterSpacing: 0.3, color: colors.text, fontVariant: ['tabular-nums'] },
  statLabel: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textMuted },
});
