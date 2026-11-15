import { Redirect } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Logo } from '@/components/Logo';
import { Button, DevnetTag, Field, Icon, Muted, Screen, Title } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, fonts, space } from '@/lib/theme';

const POINTS = [
  { icon: 'shield-check-outline', text: 'Proof is verified automatically — Strava, chess.com, or video.' },
  { icon: 'account-multiple-outline', text: 'Stake coins against friends or open it up to anyone.' },
  { icon: 'scale-balance', text: 'Winners are paid out on-chain the moment it settles.' },
] as const;

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
        <Animated.View entering={FadeIn.duration(400)} style={styles.top}>
          <Logo size={36} />
          <View style={{ gap: space.sm }}>
            <Title accessibilityRole="header" style={styles.headline}>
              Put stakes on your goals.
            </Title>
            <Muted style={{ fontSize: 15, lineHeight: 22 }}>Challenge yourself and your friends. Hit the goal, take the pot.</Muted>
          </View>
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
            hint="No password needed. New accounts start with 2,000 test coins."
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
  top: { gap: space.xl, paddingTop: space.xxl },
  headline: { fontSize: 30, lineHeight: 36, letterSpacing: -0.9 },
  points: { gap: space.md, paddingVertical: space.sm },
  point: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  pointText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textMuted },
  form: { gap: space.lg, marginTop: space.xl },
});
