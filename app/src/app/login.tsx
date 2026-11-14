import { Redirect } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { Butterfingers } from '@/components/Butterfingers';
import { Body, Button, DevnetTag, Display, Field, Screen } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, space } from '@/lib/theme';

export default function Login() {
  const { me, login } = useAuth();
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (me) return <Redirect href="/home" />;

  const clean = username.trim().toLowerCase();
  const submit = async () => {
    if (!/^[a-z0-9_]{3,16}$/.test(clean)) return setError('Use 3–16 letters, numbers or underscores.');
    setBusy(true);
    setError(null);
    try {
      await login(clean);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Animated.View entering={FadeInDown.duration(500)} style={styles.hero}>
          <View style={styles.halo} pointerEvents="none">
            <Svg width="100%" height="100%" viewBox="0 0 300 300">
              <Circle cx={150} cy={150} r={148} fill={colors.primary} opacity={0.06} />
              <Circle cx={150} cy={150} r={108} fill={colors.primary} opacity={0.08} />
              <Circle cx={150} cy={150} r={70} fill={colors.primary} opacity={0.1} />
            </Svg>
          </View>
          <Butterfingers mood={busy ? 'thinking' : error ? 'nervous' : 'idle'} size={220} />
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(120).duration(450)} style={styles.copy}>
          <Display center accessibilityRole="header">
            Bet on <Display color={colors.primary}>me</Display>
          </Display>
          <Body center color={colors.textMuted}>
            Put money on your own goals. Run it, win it, or do the dare — Butterfingers checks the proof and pays the winners.
          </Body>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(220).duration(450)} style={styles.form}>
          <Field
            label="Pick a username"
            value={username}
            onChangeText={(t) => {
              setUsername(t);
              setError(null);
            }}
            placeholder="e.g. speedy_sam"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            maxLength={16}
            returnKeyType="go"
            onSubmitEditing={submit}
            error={error}
            hint="No password needed. New here? You get a wallet with free test SOL."
          />
          <Button title="Let's go" icon="arrow-right-bold" onPress={submit} loading={busy} disabled={clean.length < 3} />
          <View style={styles.center}>
            <DevnetTag />
          </View>
        </Animated.View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  hero: { alignItems: 'center', justifyContent: 'center', height: 280, marginTop: space.lg },
  halo: { position: 'absolute', width: 300, height: 300 },
  copy: { gap: space.md, paddingHorizontal: space.sm },
  form: { gap: space.lg, marginTop: space.sm },
  center: { alignItems: 'center' },
});
