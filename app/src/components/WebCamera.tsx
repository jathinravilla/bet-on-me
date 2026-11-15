/* eslint-disable react-hooks/immutability -- this file drives browser camera objects (srcObject, cleanup flag) directly */
// Browser camera for dare proofs. expo-camera can't record video on the web, so this uses the browser's own
// camera + MediaRecorder instead. It exposes the same two methods the phone camera does.
import { createElement, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';

export type Recording = { uri: string; ext: 'webm' | 'mp4' };
export type Recorder = { recordAsync: (o: { maxDuration: number }) => Promise<Recording | undefined>; stopRecording: () => void };

const pickType = (): { mime: string; ext: 'webm' | 'mp4' } | null => {
  const MR = (globalThis as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
  if (!MR) return null;
  for (const [mime, ext] of [['video/webm;codecs=vp8,opus', 'webm'], ['video/webm', 'webm'], ['video/mp4', 'mp4']] as const) {
    if (MR.isTypeSupported(mime)) return { mime, ext };
  }
  return null;
};

export function WebCamera({ facing, onReady, onError, recorderRef }: { facing: 'front' | 'back'; onReady: () => void; onError: (message: string) => void; recorderRef: Ref<Recorder> }) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const rec = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    if (!video) return;
    let dead = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser can’t use the camera. Try Safari or Chrome.');
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing === 'front' ? 'user' : 'environment', width: { ideal: 640 }, height: { ideal: 480 } }, audio: true });
        if (dead) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        video.srcObject = s;
        await video.play().catch(() => {});
        onReady();
      } catch (e) {
        const name = e instanceof Error ? e.name : '';
        onError(name === 'NotAllowedError' ? 'Camera or microphone access is blocked. Allow both in your browser, then try again.' : e instanceof Error ? e.message : 'Couldn’t start the camera.');
      }
    })();
    return () => {
      dead = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [facing, video, onReady, onError]);

  useImperativeHandle(recorderRef, () => ({
    recordAsync: ({ maxDuration }) =>
      new Promise<Recording | undefined>((resolve) => {
        const type = pickType();
        if (!stream.current || !type) return resolve(undefined);
        const chunks: Blob[] = [];
        const r = new MediaRecorder(stream.current, { mimeType: type.mime, videoBitsPerSecond: 1_200_000 });
        rec.current = r;
        r.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
        r.onerror = () => resolve(undefined);
        r.onstop = () => {
          clearTimeout(timer);
          resolve(chunks.length ? { uri: URL.createObjectURL(new Blob(chunks, { type: type.mime.split(';')[0] })), ext: type.ext } : undefined);
        };
        const timer = setTimeout(() => r.state !== 'inactive' && r.stop(), maxDuration * 1000);
        r.start(250);
      }),
    stopRecording: () => {
      if (rec.current && rec.current.state !== 'inactive') rec.current.stop();
    },
  }));

  return createElement('video', {
    ref: setVideo,
    muted: true,
    playsInline: true,
    autoPlay: true,
    style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', transform: facing === 'front' ? 'scaleX(-1)' : undefined, backgroundColor: '#000' },
  });
}
