import type { ChallengeView, ParticipantView } from '../../../lib/types';

const LAMPORTS = 1_000_000_000;

export function sol(lamports: number): string {
  if (lamports < 0) return '—';
  const n = lamports / LAMPORTS;
  return n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1') || '0';
}
export const toLamports = (solAmount: number) => Math.round(solAmount * LAMPORTS);

export function timeLeft(endsAt: string, now = Date.now()): string {
  const ms = new Date(endsAt).getTime() - now;
  if (ms <= 0) return 'Ended';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${s}s`;
}

export const endingSoon = (c: ChallengeView, now = Date.now()) => {
  const total = new Date(c.endsAt).getTime() - new Date(c.startsAt).getTime();
  const left = new Date(c.endsAt).getTime() - now;
  return c.status === 'active' && left > 0 && left < Math.max(60_000, total * 0.15);
};

export function goalLine(c: ChallengeView): string {
  if (c.category === 'dare') return c.dareText ?? 'Do the dare';
  if (c.category === 'strava') return c.mode === 'target' ? `Run or walk ${c.target} miles` : 'Most miles wins';
  const tc = c.chessTimeControl ?? 'rapid';
  return c.mode === 'target' ? `Reach ${c.target} ${tc} on chess.com` : `Most ${tc} rating gained wins`;
}

export function progressLabel(c: ChallengeView, p: ParticipantView): string {
  if (c.category === 'dare') return p.completed ? 'Done' : 'Not yet';
  if (c.category === 'strava') return `${p.progress.toFixed(1)} mi`;
  if (c.mode === 'target') return `${Math.round(p.progress)}`;
  return `${p.progress >= 0 ? '+' : ''}${Math.round(p.progress)}`;
}

/** 0..1 for the leaderboard bar. */
export function progressRatio(c: ChallengeView, p: ParticipantView): number {
  if (p.completed) return 1;
  if (c.category === 'dare') return 0;
  if (c.mode === 'target' && c.target) {
    const start = c.category === 'chess' ? p.baseline ?? 0 : 0;
    const span = c.target - start;
    return span <= 0 ? 0 : Math.max(0, Math.min(1, (p.progress - start) / span));
  }
  const best = Math.max(...c.participants.map((x) => x.progress), 0);
  return best <= 0 ? 0 : Math.max(0, Math.min(1, p.progress / best));
}

export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const explorerAddress = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;
export const isRealSig = (sig?: string | null): sig is string => !!sig && sig !== 'pending' && !sig.startsWith('MOCK');
export const shortKey = (k: string) => `${k.slice(0, 4)}…${k.slice(-4)}`;
