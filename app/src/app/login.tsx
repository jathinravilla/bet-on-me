import { Redirect, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Butterfingers } from '@/components/Butterfingers';
import { Gradient } from '@/components/fx';
import { Button, DevnetTag, Field, Icon, Muted, Screen } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, fonts, gradients, radius, space } from '@/lib/theme';

const POINTS = [
  { icon: 'shield-check-outline', text: 'Proof is verified automatically — runs, chess, GitHub, Duolingo, or video.' },
  { icon: 'account-multiple-outline', text: 'Stake coins against friends or open it up to anyone.' },
  { icon: 'scale-balance', text: 'Winners are paid out on-chain the moment it settles.' },
] as const;

export default function Login() {
  const { me, login } = useAuth();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (me) return <Redirect href={(typeof next === 'string' && /^\/(join|challenge)/.test(next) ? next : '/home') as Href} />;

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
        <Animated.View entering={FadeIn.duration(400)} style={styles.top}>
          <Gradient colors={gradients.hero} style={styles.hero}>
            <View style={styles.mascot} pointerEvents="none">
              <Butterfingers mood="celebrate" size={150} />
            </View>
            <Text style={styles.brand}>Bet on me</Text>
            <Text accessibilityRole="header" style={styles.headline}>
              Put your money where your goals are.
            </Text>
          </Gradient>
          <Muted style={{ fontSize: 15, lineHeight: 22 }}>Challenge yourself and your friends. Hit the goal, take the pot.</Muted>
          <View style={styles.points}>
            {POINTS.map((p) => (
              <View key={p.text} style={styles.point}>
                <Icon name={p.icon} color={colors.primary} size={18} />
                <Text style={styles.pointText}>{p.text}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={FadeIn.delay(120).duration(400)} style={styles.form}>
          <Field
            label="Username"
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
            hint="No password needed. New accounts start with free test coins."
          />
          <Button title="Continue" onPress={submit} loading={busy} disabled={clean.length < 3} />
          <View style={{ alignItems: 'center' }}>
            <DevnetTag />
          </View>
        </Animated.View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  top: { gap: space.lg, paddingTop: space.md },
  hero: { borderRadius: radius.xl + 6, padding: space.xl, minHeight: 270, overflow: 'hidden', justifyContent: 'space-between' },
  mascot: { position: 'absolute', right: -8, bottom: -10 },
  brand: { fontFamily: fonts.display, fontSize: 22, letterSpacing: 0.4, color: colors.paperText, textTransform: 'uppercase' },
  headline: { fontFamily: fonts.displayHeavy, fontSize: 46, lineHeight: 46, letterSpacing: 0.2, color: colors.paperText, textTransform: 'uppercase', maxWidth: '72%' },
  points: { gap: space.md, paddingVertical: space.sm },
  point: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  pointText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textMuted },
  form: { gap: space.lg, marginTop: space.xl },
});
