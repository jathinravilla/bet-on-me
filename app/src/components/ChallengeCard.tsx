import { StyleSheet, Text, View } from 'react-native';

import type { ChallengeView } from '../../../lib/types';
import { AvatarStack, CategoryMark, LiveDot, Squish } from '@/components/fx';
import { Chip, Heading, IconButton, Muted, Row } from '@/components/ui';
import { coins, endingSoon, goalLine, progressRatio, timeLeft } from '@/lib/format';
import { categoryMeta, colors, fonts, radius, space } from '@/lib/theme';

export function StatusChip({ c, now }: { c: ChallengeView; now: number }) {
  if (c.status === 'banned') return <Chip text="Removed" tone="danger" />;
  if (c.status === 'settled') return <Chip text="Settled" tone="neutral" />;
  if (c.status === 'settling' || new Date(c.endsAt).getTime() <= now) return <Chip text="Settling" tone="neutral" />;
  if (endingSoon(c, now)) return <Chip text="Ending soon" tone="attention" />;
  return <Chip text="Live" tone="primary" />;
}

/** Share of the field that is on pace or done (0..1). */
export function onTrack(c: ChallengeView) {
  if (c.participants.length === 0) return 0;
  if (c.category === 'dare') return c.participants.filter((p) => p.completed).length / c.participants.length;
  return c.participants.reduce((sum, p) => sum + progressRatio(c, p), 0) / c.participants.length;
}

export function ChallengeCard({
  c,
  now,
  onPress,
  onVote,
  highlight,
}: {
  c: ChallengeView;
  now: number;
  onPress: () => void;
  onVote?: (v: 1 | -1 | 0) => void;
  /** e.g. "maya & leo in" on the Squad board */
  highlight?: string;
}) {
  const meta = categoryMeta[c.category];
  const players = c.participants.length;
  const live = c.status === 'active' && new Date(c.endsAt).getTime() > now;
  const hot = live && endingSoon(c, now);
  const pct = Math.round(onTrack(c) * 100);
  const toRate = c.canRate && !c.myRating;
  const when = live ? `Ends in ${timeLeft(c.endsAt, now)}` : c.status === 'settled' ? 'Settled' : c.status === 'banned' ? 'Removed' : 'Settling';

  return (
    <Squish
      accessibilityLabel={`${c.title}. ${meta.label}. Pot ${coins(c.potLamports)} coins. ${players} players. ${when}. ${pct}% on track.`}
      onPress={onPress}
      style={[styles.card, (hot || toRate) && { borderColor: colors.attention }]}>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <CategoryMark category={c.category} />
        <View style={styles.flex}>
          <Row gap={6}>
            {live ? <LiveDot color={hot ? colors.attention : colors.primary} size={6} /> : null}
            <Text style={[styles.meta, hot && { color: colors.attention }]} numberOfLines={1}>
              {meta.label} · {when}
            </Text>
          </Row>
          <Heading numberOfLines={2} style={{ marginTop: 2 }}>
            {c.title}
          </Heading>
          <Muted numberOfLines={1}>{c.description || goalLine(c)}</Muted>
        </View>
        {live || c.status === 'settling' ? (
          <View style={styles.odds}>
            <Text style={[styles.pct, { color: pct > 0 ? colors.text : colors.textMuted }]}>{pct}%</Text>
            <Text style={styles.pctLabel}>{c.category === 'dare' ? 'done' : 'on track'}</Text>
          </View>
        ) : (
          <View style={styles.odds}>
            <Text style={styles.pct}>
              {c.participants.filter((p) => p.completed).length}
              <Text style={styles.pctOf}>/{players}</Text>
            </Text>
            <Text style={styles.pctLabel}>hit goal</Text>
          </View>
        )}
      </Row>

      {live ? (
      <View style={styles.meter}>
        <View style={[styles.meterFill, { width: `${Math.max(pct, 2)}%`, backgroundColor: hot ? colors.attention : colors.primary }]} />
      </View>
      ) : null}

      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={space.lg}>
          <View>
            <Text style={styles.k}>Pot</Text>
            <Text style={styles.v}>{coins(c.potLamports)}</Text>
          </View>
          <View>
            <Text style={styles.k}>Stake</Text>
            <Text style={styles.v}>{coins(c.stakeLamports)}</Text>
          </View>
          {c.myRank ? (
            <View>
              <Text style={styles.k}>You</Text>
              <Text style={styles.v}>
                #{c.myRank}
                <Text style={styles.vDim}>/{players}</Text>
              </Text>
            </View>
          ) : null}
        </Row>
        <Row gap={6}>
          {highlight ? <Muted numberOfLines={1}>{highlight}</Muted> : null}
          <AvatarStack people={c.participants} size={22} max={3} />
        </Row>
      </Row>

      {toRate ? <Chip text="Rate this challenge" icon="star-outline" tone="attention" /> : null}

      {onVote && live ? (
        <Row style={styles.votes}>
          <Muted style={styles.flex}>{c.joined ? 'You’re in' : 'Open to join'}</Muted>
          <IconButton name="arrow-up" label={`Upvote. ${c.upvotes} upvotes`} active={c.myVote === 1} color={c.myVote === 1 ? colors.primary : colors.textMuted} onPress={() => onVote(c.myVote === 1 ? 0 : 1)} />
          <Text style={styles.score}>{c.upvotes - c.downvotes}</Text>
          <IconButton name="arrow-down" label={`Downvote. ${c.downvotes} downvotes`} active={c.myVote === -1} color={c.myVote === -1 ? colors.danger : colors.textMuted} onPress={() => onVote(c.myVote === -1 ? 0 : -1)} />
        </Row>
      ) : null}
    </Squish>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.md },
  meta: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
  odds: { alignItems: 'flex-end', minWidth: 56 },
  pct: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26, letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  pctOf: { fontFamily: fonts.body, fontSize: 15, color: colors.textMuted },
  pctLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted },
  meter: { height: 3, borderRadius: 2, backgroundColor: colors.surfaceHi, overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 2 },
  k: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted },
  v: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text, fontVariant: ['tabular-nums'] },
  vDim: { fontFamily: fonts.body, color: colors.textMuted },
  votes: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: space.xs },
  score: { minWidth: 24, textAlign: 'center', fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text, fontVariant: ['tabular-nums'] },
});
