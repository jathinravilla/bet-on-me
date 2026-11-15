import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { CoachResponse } from '../../../lib/types';
import { Butterfingers } from '@/components/Butterfingers';
import { Button, Chip, Muted, Row } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { LAMPORTS_PER_COIN } from '@/lib/format';
import { colors, fonts, radius, space } from '@/lib/theme';

/** Butterfingers reads the goal and suggests how much to put on the line. Asked on demand, never blocks the flow. */
export function CoachCard({ body, maxCoins, onUse }: { body: Record<string, unknown>; maxCoins: number; onUse: (coins: number) => void }) {
  const [busy, setBusy] = useState(false);
  const [advice, setAdvice] = useState<CoachResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      setAdvice(await api<CoachResponse>('/coach', { body, timeoutMs: 40_000 }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const coinsSuggested = advice ? Math.min(maxCoins, Math.round(advice.suggestedStakeLamports / LAMPORTS_PER_COIN)) : 0;

  return (
    <View style={styles.card}>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <Butterfingers mood={busy ? 'thinking' : advice ? (advice.odds >= 50 ? 'celebrate' : 'nervous') : 'idle'} size={84} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.kicker}>Coach Butterfingers</Text>
          {advice ? (
            <Animated.View entering={FadeIn.duration(250)} style={{ gap: 4 }}>
              <Row gap={space.sm} style={{ alignItems: 'baseline' }}>
                <Text style={styles.odds}>{advice.odds}%</Text>
                <Text style={styles.verdict}>{advice.verdict}</Text>
              </Row>
              <Text style={styles.tip}>{advice.tip}</Text>
              {advice.remembered ? (
                <View style={styles.memory} accessibilityLabel={`Butterfingers remembers: ${advice.remembered}`}>
                  <Row gap={space.xs}>
                    <Chip icon="brain" text={advice.memorySource === 'supermemory' ? 'Remembered via Supermemory' : 'Remembered'} tone="primary" />
                  </Row>
                  <Text style={styles.memoryText}>{advice.remembered}</Text>
                </View>
              ) : null}
            </Animated.View>
          ) : (
            <Text style={styles.tip}>{busy ? 'Hmm, let me look at this goal…' : 'Not sure how much to risk? I’ll check how doable this goal is.'}</Text>
          )}
        </View>
      </Row>
      {error ? <Muted color={colors.danger}>{error}</Muted> : null}
      {advice ? (
        <Row gap={space.sm}>
          <Button small title={`Use ${coinsSuggested} coins`} onPress={() => onUse(coinsSuggested)} style={{ flex: 1 }} />
          <Button small variant="secondary" title="Ask again" loading={busy} onPress={() => void ask()} />
        </Row>
      ) : (
        <Button small variant="secondary" title="Ask Butterfingers" icon="creation" loading={busy} onPress={() => void ask()} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.hairline, padding: space.lg, gap: space.md },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase', color: colors.primary },
  odds: { fontFamily: fonts.displayHeavy, fontSize: 40, lineHeight: 40, letterSpacing: 0.3, color: colors.text },
  verdict: { fontFamily: fonts.displaySemi, fontSize: 15, color: colors.attention },
  memory: { gap: space.xs, marginTop: space.xs, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  memoryText: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, color: colors.text },
  tip: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textMuted },
});
