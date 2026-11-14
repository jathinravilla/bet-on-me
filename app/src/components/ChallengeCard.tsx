import { Pressable, StyleSheet, View } from 'react-native';

import type { ChallengeView } from '../../../lib/types';
import { Chip, Heading, Icon, IconButton, Label, Money, Muted, Row } from '@/components/ui';
import { endingSoon, goalLine, sol, timeLeft } from '@/lib/format';
import { categoryMeta, colors, icon, radius, space } from '@/lib/theme';

export function StatusChip({ c, now }: { c: ChallengeView; now: number }) {
  if (c.status === 'banned') return <Chip text="Removed" icon="cancel" tone="danger" />;
  if (c.status === 'settled') return <Chip text="Settled" icon="check-decagram" tone="success" />;
  if (c.status === 'settling' || new Date(c.endsAt).getTime() <= now) return <Chip text="Settling" icon="timer-sand" tone="warn" />;
  if (endingSoon(c, now)) return <Chip text="Ending soon" icon="fire" tone="danger" />;
  return <Chip text="Live" icon="circle" tone="success" />;
}

export function ChallengeCard({ c, now, onPress, onVote }: { c: ChallengeView; now: number; onPress: () => void; onVote?: (v: 1 | -1 | 0) => void }) {
  const meta = categoryMeta[c.category];
  const players = c.participants.length;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${c.title}. ${meta.label}. Pot ${sol(c.potLamports)} SOL. ${players} players. ${c.status === 'active' ? timeLeft(c.endsAt, now) + ' left' : c.status}.`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.8, borderColor: colors.primary }]}>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <View style={styles.badge}>
          <Icon name={meta.icon} color={colors.onPrimary} size={icon.lg} />
        </View>
        <View style={styles.flex}>
          <Heading numberOfLines={2}>{c.title}</Heading>
          <Muted numberOfLines={2}>{goalLine(c)}</Muted>
        </View>
        <StatusChip c={c} now={now} />
      </Row>

      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <View>
          <Label>Pot</Label>
          <Row gap={space.xs + 2} style={{ alignItems: 'baseline' }}>
            <Money>{sol(c.potLamports)}</Money>
            <Heading color={colors.primary}>SOL</Heading>
          </Row>
        </View>
        <View style={{ alignItems: 'flex-end', gap: space.xs }}>
          <Row gap={space.xs + 2}>
            <Icon name="account-group" size={icon.sm} color={colors.textMuted} />
            <Muted>
              {players} {players === 1 ? 'player' : 'players'}
            </Muted>
          </Row>
          {c.status === 'active' ? (
            <Row gap={space.xs + 2}>
              <Icon name="clock-outline" size={icon.sm} color={colors.textMuted} />
              <Muted style={{ fontVariant: ['tabular-nums'] }}>{timeLeft(c.endsAt, now)}</Muted>
            </Row>
          ) : null}
          {c.myRank ? (
            <Row gap={space.xs + 2}>
              <Icon name="podium" size={icon.sm} color={colors.primary} />
              <Muted color={colors.primary}>
                You&apos;re #{c.myRank} of {players}
              </Muted>
            </Row>
          ) : null}
        </View>
      </Row>

      {onVote && c.status === 'active' ? (
        <Row style={styles.votes}>
          <Chip text={c.visibility === 'public' ? 'Public' : 'Friends'} icon={c.visibility === 'public' ? 'earth' : 'account-multiple'} />
          <View style={styles.flex} />
          <IconButton name="arrow-up-bold" label={`Upvote. ${c.upvotes} upvotes`} active={c.myVote === 1} color={c.myVote === 1 ? colors.success : colors.textMuted} onPress={() => onVote(c.myVote === 1 ? 0 : 1)} />
          <Heading style={{ minWidth: 28, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{c.upvotes - c.downvotes}</Heading>
          <IconButton name="arrow-down-bold" label={`Downvote. ${c.downvotes} downvotes`} active={c.myVote === -1} color={c.myVote === -1 ? colors.danger : colors.textMuted} onPress={() => onVote(c.myVote === -1 ? 0 : -1)} />
        </Row>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, padding: space.lg, gap: space.lg },
  badge: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  votes: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm, marginTop: -space.xs },
});
