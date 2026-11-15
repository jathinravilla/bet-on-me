import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Butterfingers } from '@/components/Butterfingers';
import { Squish } from '@/components/fx';
import { Button, Icon, Row } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { colors, fonts, radius, space } from '@/lib/theme';

export interface DareIdea {
  title: string;
  dare: string;
}

/** "Surprise me": Butterfingers (Gemini) invents a few fresh dares. Tap one to use it. */
export function DareIdeas({ onPick }: { onPick: (idea: DareIdea) => void }) {
  const [busy, setBusy] = useState(false);
  const [ideas, setIdeas] = useState<DareIdea[] | null>(null);
  const [source, setSource] = useState<'gemini' | 'curated'>('gemini');
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ ideas: DareIdea[]; source: 'gemini' | 'curated' }>('/dare/ideas', { timeoutMs: 30_000 });
      setIdeas(r.ideas);
      setSource(r.source);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <Row gap={space.md}>
        <Butterfingers mood={busy ? 'thinking' : 'idle'} size={64} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.kicker}>Need an idea?</Text>
          <Text style={styles.body}>{busy ? 'Cooking up something silly…' : 'Butterfingers will invent a few dares you can film in 15 seconds.'}</Text>
        </View>
      </Row>
      {error ? <Text style={[styles.body, { color: colors.danger }]}>{error}</Text> : null}
      {ideas ? (
        <Animated.View entering={FadeIn.duration(200)} style={{ gap: space.sm }}>
          {ideas.map((i) => (
            <Squish key={i.title + i.dare} accessibilityLabel={`Use dare: ${i.title}. ${i.dare}`} onPress={() => onPick(i)} style={styles.idea}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.ideaTitle}>{i.title}</Text>
                <Text style={styles.body}>{i.dare}</Text>
              </View>
              <Icon name="plus-circle-outline" color={colors.primary} size={22} />
            </Squish>
          ))}
          {source === 'gemini' ? <Text style={styles.fine}>Written by Gemini</Text> : null}
        </Animated.View>
      ) : null}
      <Button small variant="secondary" icon="dice-multiple-outline" title={ideas ? 'Show me different ones' : 'Surprise me'} loading={busy} onPress={() => void load()} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.hairline, padding: space.lg, gap: space.md },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase', color: colors.primary },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textMuted },
  idea: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderHi, backgroundColor: colors.bgRaised },
  ideaTitle: { fontFamily: fonts.displaySemi, fontSize: 16, color: colors.text },
  fine: { fontFamily: fonts.body, fontSize: 11, color: colors.textDim, textAlign: 'center' },
});
