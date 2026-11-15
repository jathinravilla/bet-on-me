import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { colors, fonts } from '@/lib/theme';

/** App mark: a glacier tile with a rising line, plus the wordmark. */
export function Logo({ size = 40, wordmark = true }: { size?: number; wordmark?: boolean }) {
  return (
    <View style={styles.row} accessible accessibilityLabel="Bet on me">
      <View style={[styles.mark, { width: size, height: size, borderRadius: size * 0.28 }]}>
        <Icon name="trending-up" color={colors.onPrimary} size={size * 0.6} />
      </View>
      {wordmark ? <Text style={[styles.word, { fontSize: size * 0.7 }]}>Bet on me</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  word: { fontFamily: fonts.display, letterSpacing: 0.3, color: colors.text },
});
