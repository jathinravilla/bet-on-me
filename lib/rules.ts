// Pure game rules: payout settlement + XP points. No I/O, so it is unit-tested directly.
import type { Category, Mode } from "./types";

export const LAMPORTS_PER_SOL = 1_000_000_000;
export const sol = (n: number) => Math.round(n * LAMPORTS_PER_SOL);

export const MIN_STAKE_LAMPORTS = sol(0.01);
export const SIGNUP_FUNDING_LAMPORTS = sol(2);
export const ESCROW_TOPUP_LAMPORTS = sol(0.01);
export const MAX_PARTICIPANTS = 20;

// ---------- Points ("XP") ----------
// In-app money is shown as coins: 1 coin = 0.001 test SOL (1,000,000 lamports).

export const POINTS = { join: 10, complete: 50, win: 100, fail: -20 } as const;

export const TIERS = [
  { points: 0, publicDaresPerWeek: 1, maxStakeLamports: sol(0.1) },
  { points: 200, publicDaresPerWeek: 3, maxStakeLamports: sol(0.5) },
  { points: 1000, publicDaresPerWeek: 10, maxStakeLamports: sol(2) },
] as const;

export function tierFor(points: number) {
  let current: (typeof TIERS)[number] = TIERS[0];
  let next: (typeof TIERS)[number] | undefined;
  for (let i = 0; i < TIERS.length; i++) {
    if (points >= TIERS[i].points) {
      current = TIERS[i];
      next = TIERS[i + 1];
    }
  }
  return { current, next };
}

// ---------- Settlement ----------

export interface SettleParticipant {
  userId: string;
  progress: number;
  completed: boolean;
}

export interface SettleInput {
  category: Category;
  mode: Mode;
  stakeLamports: number;
  participants: SettleParticipant[];
}

export interface SettleResult {
  outcome: "refund" | "split" | "leader";
  winners: string[];
  payouts: { userId: string; lamports: number }[];
  reason: string;
}

function refund(input: SettleInput, reason: string, winners: string[] = []): SettleResult {
  return {
    outcome: "refund",
    winners,
    reason,
    payouts: input.participants.map((p) => ({ userId: p.userId, lamports: input.stakeLamports })),
  };
}

/** Split the whole pot equally; leftover lamports from integer division go to the first winner. */
function split(input: SettleInput, winners: string[], outcome: "split" | "leader", reason: string): SettleResult {
  const pot = input.stakeLamports * input.participants.length;
  const share = Math.floor(pot / winners.length);
  const leftover = pot - share * winners.length;
  return {
    outcome,
    winners,
    reason,
    payouts: winners.map((userId, i) => ({ userId, lamports: share + (i === 0 ? leftover : 0) })),
  };
}

function leaders(ps: SettleParticipant[]) {
  const best = Math.max(...ps.map((p) => p.progress));
  return { best, ids: ps.filter((p) => p.progress === best).map((p) => p.userId) };
}

export function computeSettlement(input: SettleInput): SettleResult {
  const ps = input.participants;
  if (ps.length === 0) return { outcome: "refund", winners: [], payouts: [], reason: "No participants." };

  if (input.mode === "target" || input.category === "dare") {
    const done = ps.filter((p) => p.completed).map((p) => p.userId);
    if (done.length === ps.length) {
      return refund(input, "Everyone completed the challenge — all stakes returned.", done);
    }
    if (done.length > 0) {
      return split(input, done, "split", `${done.length} of ${ps.length} completed and split the pot.`);
    }
    if (input.category === "dare") return refund(input, "Nobody completed the dare — all stakes refunded.");
    const { best, ids } = leaders(ps);
    if (best <= 0) return refund(input, "Nobody made any progress — all stakes refunded.");
    return split(
      input,
      ids,
      "leader",
      ids.length > 1 ? "Nobody hit the target — the tied leaders split the pot." : "Nobody hit the target — the leader takes the pot."
    );
  }

  const { best, ids } = leaders(ps);
  if (best <= 0) return refund(input, "Nobody made any progress — all stakes refunded.");
  return split(input, ids, "leader", ids.length > 1 ? "Tied leaders split the pot." : "The leader takes the whole pot.");
}

/** Points earned at settlement (the +10 for joining is granted at join time). */
export function settlementPoints(input: SettleInput, result: SettleResult): Record<string, number> {
  const out: Record<string, number> = {};
  const wonPot = new Set(result.outcome === "refund" ? [] : result.winners);
  for (const p of input.participants) {
    let d = 0;
    if (p.completed) d += POINTS.complete;
    if (wonPot.has(p.userId)) d += POINTS.win;
    if (result.outcome !== "refund" && !wonPot.has(p.userId) && !p.completed) d += POINTS.fail;
    out[p.userId] = d;
  }
  return out;
}
