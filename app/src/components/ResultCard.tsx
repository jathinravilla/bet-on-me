import type { ComponentRef, Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ChallengeView } from '../../../lib/types';
import { Butterfingers } from '@/components/Butterfingers';
import { Gradient } from '@/components/fx';
import { coins } from '@/lib/format';
import { WEB_URL } from '@/lib/share';
import { categoryMeta, colors, fonts, gradients, radius, space } from '@/lib/theme';

/** A picture-ready recap of a settled bet. Rendered on screen and captured as an image for sharing. */
export function ResultCard({ c, quote, iWon, cardRef }: { c: ChallengeView; quote?: string | null; iWon: boolean; cardRef?: Ref<ComponentRef<typeof View>> }) {
  const s = c.settlement;
  const refunded = s?.outcome === 'refund';
  const winners = c.participants.filter((p) => s?.winners.includes(p.userId));
  const names = winners.map((w) => `@${w.username}`);
  const headline = refunded ? 'Everyone gets their coins back' : winners.length === 0 ? 'No winner this time' : winners.length === 1 ? `${names[0]} takes the pot` : `${names.slice(0, 2).join(' & ')}${winners.length > 2 ? ` +${winners.length - 2}` : ''} split the pot`;
  const share = winners.length ? Math.floor((s?.payouts.find((p) => p.userId === winners[0].userId)?.lamports ?? 0)) : 0;
  const meta = categoryMeta[c.category];
  const proof = s?.receipt?.hash.slice(0, 10);

  return (
    <View ref={cardRef} collapsable={false} style={styles.wrap}>
      <Gradient colors={gradients.hero} style={styles.card}>
        <Text style={styles.cat}>{meta.label} · {c.participants.length} {c.participants.length === 1 ? 'player' : 'players'}</Text>
        <Text style={styles.title} numberOfLines={3}>{c.title}</Text>
        <View style={styles.mascot} pointerEvents="none">
          <Butterfingers mood={refunded ? 'idle' : iWon || winners.length ? 'celebrate' : 'fumble'} size={130} />
        </View>
        <View style={{ marginTop: 'auto', gap: 2 }}>
          <Text style={styles.headline}>{headline}</Text>
          {!refunded && winners.length ? (
            <Text style={styles.amount}>
              {coins(share)}
              <Text style={styles.unit}> coins</Text>
            </Text>
          ) : null}
          {quote ? <Text style={styles.quote}>“{quote}”</Text> : null}
        </View>
      </Gradient>
      <View style={styles.footer}>
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>BET ON ME</Text>
          <Text style={styles.small}>{proof ? `Settled on Solana · receipt ${proof}` : 'Settled on Solana devnet'}</Text>
        </View>
        <Text style={styles.small}>{WEB_URL.replace('https://', '')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 360, alignSelf: 'center', borderRadius: radius.xl + 4, overflow: 'hidden', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.hairline },
  card: { minHeight: 290, padding: space.xl, gap: space.sm },
  cat: { fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase', color: colors.paperMuted },
  title: { fontFamily: fonts.displayHeavy, fontSize: 34, lineHeight: 34, textTransform: 'uppercase', letterSpacing: 0.3, color: colors.paperText, maxWidth: '72%' },
  mascot: { position: 'absolute', right: 6, top: 52 },
  headline: { fontFamily: fonts.displaySemi, fontSize: 16, color: colors.paperText },
  amount: { fontFamily: fonts.displayHeavy, fontSize: 64, lineHeight: 64, letterSpacing: 0.4, color: colors.paperText, fontVariant: ['tabular-nums'] },
  unit: { fontFamily: fonts.displaySemi, fontSize: 18, color: colors.paperMuted },
  quote: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18, color: colors.paperMuted, marginTop: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: colors.bg },
  brand: { fontFamily: fonts.display, fontSize: 18, letterSpacing: 0.5, color: colors.text },
  small: { fontFamily: fonts.body, fontSize: 10.5, color: colors.textMuted },
});
