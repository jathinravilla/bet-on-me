import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import type { ChallengeView } from '../../../lib/types';
import { Body, Button, Field, Screen, Title, TopBar } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { goBack } from '@/lib/nav';
import { useAuth } from '@/lib/auth';
import { colors, fonts, space } from '@/lib/theme';

export default function Join() {
  const { refresh } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const c = await api<ChallengeView>('/challenges/join', { body: { inviteCode: code } });
      void refresh();
      router.replace(`/challenge/${c.id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={<Button title="Join and stake" onPress={submit} loading={busy} disabled={code.length !== 6} />}>
      <TopBar title="Join a challenge" onBack={() => goBack('/home')} />
      <View style={{ gap: space.xs, paddingTop: space.md }}>
        <Title>Enter invite code</Title>
        <Body color={colors.textMuted}>The 6-character code your friend shared. Your stake moves into the pot as soon as you join.</Body>
      </View>
      <Field
        label="Invite code"
        value={code}
        onChangeText={(t) => {
          setCode(t.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6));
          setError(null);
        }}
        placeholder="ABC234"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={6}
        returnKeyType="go"
        onSubmitEditing={() => code.length === 6 && void submit()}
        error={error}
        style={{ fontFamily: fonts.bodySemi, fontSize: 28, letterSpacing: 10, textAlign: 'center', minHeight: 64 }}
      />
    </Screen>
  );
}
