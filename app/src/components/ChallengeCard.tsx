import { StyleSheet, Text, View } from 'react-native';

import type { ChallengeView } from '../../../lib/types';
import { AvatarStack, CategoryMark, LiveDot, Squish } from '@/components/fx';
import { Chip, Icon, IconButton, Row } from '@/components/ui';
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
      style={[styles.card, (hot || toRate) && { borderColor: colors.attention, borderWidth: 2 }]}>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <CategoryMark category={c.category} />
        <View style={styles.flex}>
          <Row gap={6}>
            {live ? <LiveDot color={hot ? '#E0A100' : colors.glacierDeep} size={6} /> : null}
            <Text style={[styles.meta, hot && { color: '#8A6100' }]} numberOfLines={1}>
              {meta.label} · {when}
            </Text>
          </Row>
          <Text numberOfLines={2} style={styles.title}>
            {c.title}
          </Text>
          <Text numberOfLines={1} style={styles.sub}>
            {c.description || goalLine(c)}
          </Text>
        </View>
        {live || c.status === 'settling' ? (
          <View style={styles.odds}>
            <Text style={[styles.pct, { color: pct > 0 ? colors.paperText : colors.paperMuted }]}>{pct}%</Text>
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
        <View style={[styles.meterFill, { width: `${Math.max(pct, 2)}%`, backgroundColor: hot ? '#F2B705' : colors.glacierDeep }]} />
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
          {highlight ? <Text numberOfLines={1} style={styles.sub}>{highlight}</Text> : null}
          <AvatarStack people={c.participants} size={22} max={3} />
        </Row>
      </Row>

      {toRate ? (
        <View style={styles.rate}>
          <Icon name="star-outline" size={13} color={colors.onAttention} />
          <Text style={styles.rateText}>Rate this challenge</Text>
        </View>
      ) : null}

      {onVote && live ? (
        <Row style={styles.votes}>
          <Text style={[styles.sub, styles.flex]}>{c.joined ? 'You’re in' : 'Open to join'}</Text>
          <IconButton name="arrow-up" label={`Upvote. ${c.upvotes} upvotes`} active={c.myVote === 1} color={c.myVote === 1 ? colors.primary : colors.paperMuted} onPress={() => onVote(c.myVote === 1 ? 0 : 1)} />
          <Text style={styles.score}>{c.upvotes - c.downvotes}</Text>
          <IconButton name="arrow-down" label={`Downvote. ${c.downvotes} downvotes`} active={c.myVote === -1} color={c.myVote === -1 ? colors.danger : colors.paperMuted} onPress={() => onVote(c.myVote === -1 ? 0 : -1)} />
        </Row>
      ) : null}
    </Squish>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { backgroundColor: colors.paper, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.paperBorder, padding: space.lg, gap: space.md },
  title: { fontFamily: fonts.displaySemi, fontSize: 17, lineHeight: 22, color: colors.paperText, marginTop: 2 },
  sub: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.paperMuted },
  rate: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: colors.attention, paddingHorizontal: 10, height: 26, borderRadius: radius.pill },
  rateText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.onAttention },
  meta: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.paperMuted },
  odds: { alignItems: 'flex-end', minWidth: 56 },
  pct: { fontFamily: fonts.display, fontSize: 30, lineHeight: 30, letterSpacing: 0.2, fontVariant: ['tabular-nums'] },
  pctOf: { fontFamily: fonts.body, fontSize: 15, color: colors.paperMuted },
  pctLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.paperMuted },
  meter: { height: 5, borderRadius: 3, backgroundColor: colors.paperTrack, overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 3 },
  k: { fontFamily: fonts.body, fontSize: 11, color: colors.paperMuted },
  v: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.paperText, fontVariant: ['tabular-nums'] },
  vDim: { fontFamily: fonts.body, color: colors.paperMuted },
  votes: { borderTopWidth: 1, borderTopColor: colors.paperBorder, paddingTop: space.xs },
  score: { minWidth: 24, textAlign: 'center', fontFamily: fonts.bodySemi, fontSize: 14, color: colors.paperText, fontVariant: ['tabular-nums'] },
});
