// Dare recorder: liveness word -> in-app recording (max 15s) -> upload -> Gemini verdict.
import { CameraView, useCameraPermissions, useMicrophonePermissions, type CameraType } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { DareStartResponse, DareVerifyResponse, UploadTokenResponse } from '../../../../lib/types';
import { Banner, Body, Button, Heading, Icon, IconButton, Label, Muted, ProgressBar, Screen, Title, TopBar } from '@/components/ui';
import { api, errorMessage, uploadFile } from '@/lib/api';
import { goBack } from '@/lib/nav';
import { useAuth } from '@/lib/auth';
import { timeLeft } from '@/lib/format';
import { useNow } from '@/lib/useNow';
import { colors, fonts, radius, space } from '@/lib/theme';

const MAX_SECONDS = 15;
type Phase = 'intro' | 'camera' | 'uploading' | 'checking' | 'result';

export default function DareRecorder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { refresh } = useAuth();
  const insets = useSafeAreaInsets();
  const [camPerm, askCam] = useCameraPermissions();
  const [micPerm, askMic] = useMicrophonePermissions();
  const camera = useRef<CameraView>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [proof, setProof] = useState<DareStartResponse | null>(null);
  const [facing, setFacing] = useState<CameraType>('front');
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [upload, setUpload] = useState(0);
  const [result, setResult] = useState<DareVerifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const now = useNow();

  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.min(MAX_SECONDS, (Date.now() - started) / 1000)), 100);
    return () => clearInterval(t);
  }, [recording]);

  const granted = camPerm?.granted && micPerm?.granted;
  const blocked = (camPerm && !camPerm.granted && !camPerm.canAskAgain) || (micPerm && !micPerm.granted && !micPerm.canAskAgain);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!camPerm?.granted && !(await askCam()).granted) return;
      if (!micPerm?.granted && !(await askMic()).granted) return;
      setProof(await api<DareStartResponse>('/dare/start', { body: { challengeId: id } }));
      setElapsed(0);
      setReady(false);
      setPhase('camera');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const record = async () => {
    if (!camera.current || !proof || recording) return;
    setRecording(true);
    setElapsed(0);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    let uri: string | undefined;
    try {
      uri = (await camera.current.recordAsync({ maxDuration: MAX_SECONDS }))?.uri;
    } catch {
      /* handled below */
    }
    setRecording(false);
    if (!uri) {
      setError("The recording didn't save. Try again.");
      return setPhase('intro');
    }
    try {
      setPhase('uploading');
      setUpload(0);
      const ext = uri.toLowerCase().endsWith('.mp4') ? 'mp4' : 'mov';
      const ticket = await api<UploadTokenResponse>('/dare/upload-token', { body: { proofId: proof.proofId, ext } });
      const videoUrl = await uploadFile(uri, ticket.uploadUrl, ticket.headers, setUpload);
      setPhase('checking');
      const verdict = await api<DareVerifyResponse>('/dare/verify', { body: { proofId: proof.proofId, videoUrl }, timeoutMs: 75_000 });
      setResult(verdict);
      setPhase('result');
      void Haptics.notificationAsync(verdict.verdict === 'pass' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
      void refresh();
    } catch (e) {
      setError(errorMessage(e));
      setPhase('intro');
    }
  };

  if (phase === 'camera' && proof) {
    const wordLeft = timeLeft(proof.expiresAt, now);
    return (
      <View style={styles.cameraWrap}>
        <CameraView ref={camera} style={StyleSheet.absoluteFill} facing={facing} mode="video" videoQuality="480p" onCameraReady={() => setReady(true)} />
        <View style={[styles.overlayTop, { paddingTop: insets.top + space.sm }]}>
          <View style={styles.topRow}>
            <IconButton name="close" label="Cancel recording" onPress={() => (recording ? camera.current?.stopRecording() : setPhase('intro'))} />
            <View style={styles.timer} accessibilityLiveRegion="polite">
              <View style={[styles.recDot, !recording && { backgroundColor: colors.textMuted }]} />
              <Heading style={{ fontVariant: ['tabular-nums'] }}>
                {recording ? `${Math.ceil(MAX_SECONDS - elapsed)}s left` : `Word valid ${wordLeft}`}
              </Heading>
            </View>
            <IconButton name="camera-flip-outline" label="Flip camera" disabled={recording} onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))} />
          </View>
          <View style={styles.wordCard} accessible accessibilityLabel={`Say the word ${proof.word} out loud in your video`}>
            <Label color={colors.onPrimary}>Say this word out loud</Label>
            <Text style={styles.word} adjustsFontSizeToFit numberOfLines={1}>
              {proof.word}
            </Text>
          </View>
        </View>

        <View style={[styles.overlayBottom, { paddingBottom: insets.bottom + space.lg }]}>
          {recording ? <ProgressBar value={elapsed / MAX_SECONDS} /> : <Muted center color={colors.text}>Do the dare and say the word. Up to {MAX_SECONDS} seconds.</Muted>}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={recording ? 'Stop recording' : 'Start recording'}
            disabled={!ready}
            onPress={() => (recording ? camera.current?.stopRecording() : void record())}
            style={({ pressed }) => [styles.shutter, pressed && { opacity: 0.8 }, !ready && { opacity: 0.4 }]}>
            <View style={[styles.shutterInner, recording && styles.shutterStop]} />
          </Pressable>
        </View>
      </View>
    );
  }

  if (phase === 'uploading' || phase === 'checking') {
    return (
      <Screen scroll={false}>
        <View style={styles.center} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.primary} />
          <Title center>{phase === 'uploading' ? 'Uploading your proof' : 'Checking your proof'}</Title>
          <Body center color={colors.textMuted}>
            {phase === 'uploading' ? `${Math.round(upload * 100)}%` : 'Gemini is watching the video and listening for your word. This takes a few seconds.'}
          </Body>
          {phase === 'uploading' ? (
            <View style={{ alignSelf: 'stretch' }}>
              <ProgressBar value={upload} />
            </View>
          ) : null}
        </View>
      </Screen>
    );
  }

  if (phase === 'result' && result) {
    const pass = result.verdict === 'pass';
    const fail = result.finalStatus === 'rejected';
    return (
      <Screen footer={<Button title={fail ? 'Back to challenge' : 'Done'} onPress={() => goBack('/home')} />}>
        <View style={[styles.center, { paddingTop: space.xxl }]}>
          <View style={[styles.resultIcon, { backgroundColor: pass ? colors.successBg : fail ? colors.dangerBg : colors.primarySoft }]}>
            <Icon name={pass ? 'check' : fail ? 'close' : 'help'} color={pass ? colors.success : fail ? colors.danger : colors.primary} size={28} />
          </View>
          <Title center>{pass ? 'Proof passed' : result.verdict === 'fail' ? 'Proof failed' : 'Needs a vote'}</Title>
          <Body center>{result.reason}</Body>
          {result.finalStatus === 'approved' ? <Banner tone="success" text="Dare complete. You're in line for the pot." /> : null}
          {result.finalStatus === 'pending' && result.voting ? <Banner tone="info" icon="vote" text="The AI wasn't sure, so the other players will vote on your proof." /> : null}
          {result.finalStatus === 'pending' && !result.voting ? <Banner tone="info" icon="timer-sand" text="Passed! Other players get a short window to dispute it before it counts." /> : null}
          {fail ? <Banner text="This proof didn't count. You can record a new one while the dare is live." /> : null}
        </View>
      </Screen>
    );
  }

  return (
    <Screen footer={blocked ? <Button title="Open settings" icon="cog" onPress={() => void Linking.openSettings()} /> : <Button title={granted ? 'Get my word and record' : 'Allow camera and record'} icon="video" onPress={start} loading={busy} />}>
      <TopBar title="Record proof" onBack={() => goBack('/home')} />
      <View style={[styles.center, { paddingTop: space.lg }]}>
        <Title center>Record your proof</Title>
      </View>
      {error ? <Banner text={error} /> : null}
      {blocked ? <Banner text="Camera or microphone access is off. Turn both on in Settings to record your proof." /> : null}
      <View style={{ gap: space.md }}>
        {[
          ['1', "You'll get a secret word. It's only valid for 5 minutes."],
          ['2', `Record up to ${MAX_SECONDS} seconds doing the dare, and say the word out loud.`],
          ['3', 'AI checks the video. Other players can dispute or vote.'],
        ].map(([n, text]) => (
          <View key={n} style={styles.step}>
            <Text style={styles.stepNum}>{n}</Text>
            <Body style={{ flex: 1 }}>{text}</Body>
          </View>
        ))}
      </View>
      <Muted center>Videos are recorded in the app only — no camera roll uploads.</Muted>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cameraWrap: { flex: 1, backgroundColor: '#000000' },
  overlayTop: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: space.lg, gap: space.md, backgroundColor: colors.scrim, paddingBottom: space.lg },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timer: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  recDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.danger },
  wordCard: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingVertical: space.md, paddingHorizontal: space.lg, alignItems: 'center' },
  word: { fontFamily: fonts.display, fontSize: 61, lineHeight: 62, letterSpacing: 0.3, color: colors.onPrimary },
  resultIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  stepNum: { width: 24, height: 24, borderRadius: 12, textAlign: 'center', lineHeight: 24, overflow: 'hidden', backgroundColor: colors.surfaceHi, fontFamily: fonts.bodySemi, fontSize: 12, color: colors.text },
  overlayBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.lg, alignItems: 'stretch', backgroundColor: colors.scrim },
  shutter: { alignSelf: 'center', width: 84, height: 84, borderRadius: 42, borderWidth: 5, borderColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.danger },
  shutterStop: { width: 34, height: 34, borderRadius: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: space.sm },
});
