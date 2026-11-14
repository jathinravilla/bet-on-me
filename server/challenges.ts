// Challenge service: views, progress sync, dare-proof finalisation, settlement and bans.
import { ObjectId } from "mongodb";
import { computeSettlement, settlementPoints, type SettleInput, type SettleResult } from "../lib/rules";
import type { ChallengeView, ProofView } from "../lib/types";
import { keypairOf, transfer } from "./chain";
import { cols, type ChallengeDoc, type DareProofDoc, type ParticipantDoc, type UserDoc } from "./db";
import { chessRating, stravaMiles } from "./external";
import { HttpError } from "./http";

const SYNC_CACHE_MS = 60_000;
const STALE_SETTLING_MS = 90_000;
const PAYOUTS_PER_TX = 12;

export async function getChallenge(id: string): Promise<ChallengeDoc> {
  const { challenges } = await cols();
  const ch = await challenges.findOne({ _id: new ObjectId(id) });
  if (!ch) throw new HttpError(404, "Challenge not found.");
  return ch;
}

export const isParticipant = (ch: ChallengeDoc, userId: string) => ch.participants.some((p) => p.userId === userId);
const staked = (ch: ChallengeDoc) => ch.participants.filter((p) => p.stakeTxSig !== "pending");

export function leaderboard(ch: ChallengeDoc): ParticipantDoc[] {
  return [...staked(ch)].sort(
    (a, b) => Number(b.completed) - Number(a.completed) || b.progress - a.progress || a.joinedAt.getTime() - b.joinedAt.getTime()
  );
}

export async function addPoints(userId: string, delta: number) {
  if (!delta) return;
  const { users } = await cols();
  await users.updateOne({ _id: new ObjectId(userId) }, [{ $set: { points: { $max: [0, { $add: ["$points", delta] }] } } }]);
}

// ---------- views ----------

export async function toView(ch: ChallengeDoc, me: UserDoc, withProofs = false): Promise<ChallengeView> {
  const uid = me._id.toHexString();
  const board = leaderboard(ch);
  const joined = board.some((p) => p.userId === uid);
  const rank = board.findIndex((p) => p.userId === uid);
  const names = new Map(ch.participants.map((p) => [p.userId, p.username]));
  const view: ChallengeView = {
    id: ch._id.toHexString(),
    title: ch.title,
    description: ch.description,
    category: ch.category,
    visibility: ch.visibility,
    inviteCode: joined || ch.creatorId === uid ? ch.inviteCode : undefined,
    mode: ch.mode,
    target: ch.target,
    chessTimeControl: ch.chessTimeControl,
    dareText: ch.dareText,
    stakeLamports: ch.stakeLamports,
    potLamports: ch.stakeLamports * board.length,
    startsAt: ch.startsAt.toISOString(),
    endsAt: ch.endsAt.toISOString(),
    status: ch.status,
    creatorId: ch.creatorId,
    creatorUsername: ch.creatorUsername,
    escrowPublicKey: ch.escrow.publicKey,
    participants: board.map((p) => ({
      userId: p.userId,
      username: p.username,
      joinedAt: p.joinedAt.toISOString(),
      stakeTxSig: p.stakeTxSig,
      baseline: p.baseline,
      progress: p.progress,
      completed: p.completed,
      lastSyncedAt: p.lastSyncedAt?.toISOString(),
    })),
    settlement: ch.settlement && {
      winners: ch.settlement.winners,
      payouts: ch.settlement.payouts.map((p) => ({ ...p, username: names.get(p.userId) ?? "player" })),
      reason: ch.settlement.reason,
      outcome: ch.settlement.outcome,
      settledAt: ch.settlement.settledAt?.toISOString(),
    },
    upvotes: ch.upvotes,
    downvotes: ch.downvotes,
    myVote: ch.voters.find((v) => v.userId === uid)?.v ?? 0,
    reportCount: ch.reports.length,
    iReported: ch.reports.some((r) => r.userId === uid),
    joined,
    myRank: rank >= 0 ? rank + 1 : undefined,
  };

  if (withProofs && ch.category === "dare") {
    const { proofs } = await cols();
    const list = await proofs
      .find({ challengeId: view.id, gemini: { $exists: true } })
      .sort({ _id: -1 })
      .limit(30)
      .toArray();
    const active = ch.status === "active";
    const now = Date.now();
    view.proofs = list.map((p): ProofView => {
      const other = joined && p.userId !== uid;
      const inWindow = ch.visibility === "public" || (p.disputeEndsAt ? p.disputeEndsAt.getTime() > now : false);
      return {
        id: p._id.toHexString(),
        userId: p.userId,
        username: p.username,
        videoUrl: joined ? p.videoUrl : undefined, // only players can watch proof videos
        verdict: p.gemini?.verdict,
        reason: p.gemini?.reason,
        finalStatus: p.finalStatus,
        voting: p.voting,
        disputeEndsAt: p.disputeEndsAt?.toISOString(),
        approveVotes: p.votes.filter((v) => v.approve).length,
        rejectVotes: p.votes.filter((v) => !v.approve).length,
        myVote: p.votes.find((v) => v.userId === uid)?.approve ?? null,
        canDispute: active && other && !p.voting && p.gemini?.verdict === "pass" && p.finalStatus !== "rejected" && inWindow,
        canVote: active && other && p.voting && p.finalStatus === "pending",
      };
    });
  }
  return view;
}

// ---------- progress sync (Strava / chess.com) ----------

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function syncChallenge(ch: ChallengeDoc, opts: { onlyUserId?: string; force?: boolean } = {}): Promise<ChallengeDoc> {
  if (ch.status !== "active" || ch.category === "dare") return ch;
  const { challenges, users } = await cols();
  const now = Date.now();
  const due = staked(ch).filter(
    (p) =>
      (!opts.onlyUserId || p.userId === opts.onlyUserId) &&
      (opts.force || !p.lastSyncedAt || now - p.lastSyncedAt.getTime() > SYNC_CACHE_MS)
  );
  if (due.length === 0) return ch;
  const docs = await users.find({ _id: { $in: due.map((p) => new ObjectId(p.userId)) } }).toArray();
  const byId = new Map(docs.map((u) => [u._id.toHexString(), u]));

  await Promise.all(
    due.map(async (p) => {
      const user = byId.get(p.userId);
      if (!user) return;
      const bonus = p.simBonus ?? 0;
      let progress: number;
      let completed = p.completed;
      const set: Record<string, unknown> = {};

      if (ch.category === "chess") {
        if (!user.chessUsername) return;
        const rating = await chessRating(user.chessUsername, ch.chessTimeControl ?? "rapid");
        if (rating === null) return; // keep the last known numbers if chess.com is down
        const baseline = p.baseline ?? rating;
        if (p.baseline === undefined) set["participants.$.baseline"] = baseline;
        if (ch.mode === "target") {
          progress = rating + bonus;
          completed = completed || progress >= (ch.target ?? Infinity); // once you hit the rating, it counts
        } else progress = rating + bonus - baseline;
      } else {
        const miles = user.strava
          ? await stravaMiles(user, ch.startsAt, ch.endsAt)
          : (user.stravaDemo?.runs ?? []) // demo Strava: simulated runs logged inside the challenge window
              .filter((r) => r.at >= ch.startsAt && r.at <= ch.endsAt)
              .reduce((sum, r) => sum + r.miles, 0);
        if (miles === null) return;
        progress = round2(miles + bonus);
        if (ch.mode === "target") completed = progress >= (ch.target ?? Infinity);
      }

      set["participants.$.progress"] = progress;
      set["participants.$.completed"] = completed;
      set["participants.$.lastSyncedAt"] = new Date();
      await challenges.updateOne({ _id: ch._id, status: "active", "participants.userId": p.userId }, { $set: set });
    })
  );
  return getChallenge(ch._id.toHexString());
}

// ---------- dare proofs ----------

export async function resolveProof(proof: DareProofDoc, approved: boolean) {
  const { proofs, challenges } = await cols();
  await proofs.updateOne({ _id: proof._id }, { $set: { finalStatus: approved ? "approved" : "rejected", voting: false } });
  if (approved) {
    await challenges.updateOne(
      { _id: new ObjectId(proof.challengeId), "participants.userId": proof.userId },
      { $set: { "participants.$.completed": true, "participants.$.progress": 1 } }
    );
  }
}

/** Approve passes whose dispute window closed. At settlement, also close any open votes. */
export async function finalizeProofs(ch: ChallengeDoc, atSettle: boolean): Promise<ChallengeDoc> {
  if (ch.category !== "dare") return ch;
  const { proofs } = await cols();
  const pending = await proofs.find({ challengeId: ch._id.toHexString(), finalStatus: "pending", gemini: { $exists: true } }).toArray();
  let changed = false;
  const now = Date.now();
  for (const p of pending) {
    const pass = p.gemini?.verdict === "pass";
    if (!p.voting) {
      if (pass && (atSettle || !p.disputeEndsAt || p.disputeEndsAt.getTime() <= now)) {
        await resolveProof(p, true);
        changed = true;
      }
    } else if (atSettle) {
      const yes = p.votes.filter((v) => v.approve).length;
      const no = p.votes.length - yes;
      await resolveProof(p, yes === no ? pass : yes > no); // tie -> fall back to the AI verdict
      changed = true;
    }
  }
  return changed ? getChallenge(ch._id.toHexString()) : ch;
}

// ---------- settlement ----------

function settleInput(ch: ChallengeDoc): SettleInput {
  return {
    category: ch.category,
    mode: ch.mode,
    stakeLamports: ch.stakeLamports,
    participants: staked(ch).map((p) => ({ userId: p.userId, progress: p.progress, completed: p.completed })),
  };
}

/**
 * Settle a challenge exactly once. An atomic status flip (active -> settling) is the lock; the payout
 * plan is saved before any money moves so a crashed run can be resumed without paying anyone twice.
 */
export async function settleChallenge(
  id: string,
  opts: { refundReason?: string; finalStatus?: "settled" | "banned" } = {}
): Promise<ChallengeDoc> {
  const { challenges, users } = await cols();
  const _id = new ObjectId(id);
  const now = new Date();
  let ch = await challenges.findOneAndUpdate(
    { _id, status: "active" },
    { $set: { status: "settling", settlingAt: now } },
    { returnDocument: "after" }
  );
  if (!ch) {
    ch = await challenges.findOneAndUpdate(
      { _id, status: "settling", settlingAt: { $lt: new Date(now.getTime() - STALE_SETTLING_MS) } },
      { $set: { settlingAt: now } },
      { returnDocument: "after" }
    );
    if (!ch) return getChallenge(id); // already settled, or another request is settling it right now
  }

  if (!ch.settlement) {
    if (!opts.refundReason) ch = await finalizeProofs(ch, true);
    const input = settleInput(ch);
    const result: SettleResult = opts.refundReason
      ? { outcome: "refund", winners: [], reason: opts.refundReason, payouts: input.participants.map((p) => ({ userId: p.userId, lamports: ch!.stakeLamports })) }
      : computeSettlement(input);
    const settlement: NonNullable<ChallengeDoc["settlement"]> = {
      winners: result.winners,
      payouts: result.payouts.map((p) => ({ ...p, txSig: null })),
      reason: result.reason,
      outcome: result.outcome,
      finalStatus: opts.finalStatus ?? "settled",
    };
    await challenges.updateOne({ _id }, { $set: { settlement } });
    ch.settlement = settlement;
  }
  const s = ch.settlement;

  // Pay everyone still owed, a batch per transaction, from the escrow wallet (which also pays the fee).
  const unpaid = s.payouts.filter((p) => p.txSig === null && p.lamports > 0);
  if (unpaid.length > 0) {
    const escrow = keypairOf(ch.escrow);
    const wallets = await users.find({ _id: { $in: unpaid.map((p) => new ObjectId(p.userId)) } }, { projection: { "wallet.publicKey": 1 } }).toArray();
    const address = new Map(wallets.map((u) => [u._id.toHexString(), u.wallet.publicKey]));
    for (let i = 0; i < unpaid.length; i += PAYOUTS_PER_TX) {
      const batch = unpaid.slice(i, i + PAYOUTS_PER_TX).filter((p) => address.has(p.userId));
      if (batch.length === 0) continue;
      const sig = await transfer(batch.map((p) => ({ from: escrow, to: address.get(p.userId)!, lamports: p.lamports })), escrow);
      await challenges.updateOne(
        { _id },
        { $set: { "settlement.payouts.$[p].txSig": sig } },
        { arrayFilters: [{ "p.userId": { $in: batch.map((p) => p.userId) } }] }
      );
    }
  }

  if (s.finalStatus === "settled" && !s.pointsApplied) {
    const claimed = await challenges.updateOne({ _id, "settlement.pointsApplied": { $ne: true } }, { $set: { "settlement.pointsApplied": true } });
    if (claimed.modifiedCount === 1) {
      const input = settleInput(ch);
      const deltas = settlementPoints(input, { outcome: s.outcome, winners: s.winners, payouts: [], reason: "" });
      await Promise.all(Object.entries(deltas).map(([userId, d]) => addPoints(userId, d)));
    }
  }

  await challenges.updateOne({ _id }, { $set: { status: s.finalStatus, "settlement.settledAt": new Date() } });
  return getChallenge(id);
}

export const banChallenge = (id: string) =>
  settleChallenge(id, { refundReason: "Removed after community reports — all stakes refunded.", finalStatus: "banned" });

/** If the clock ran out, sync one last time and settle. Safe to call from any request. */
export async function settleIfDue(ch: ChallengeDoc): Promise<ChallengeDoc> {
  if (ch.status === "active" && ch.endsAt.getTime() <= Date.now()) {
    const synced = await syncChallenge(ch, { force: true });
    return settleChallenge(synced._id.toHexString());
  }
  if (ch.status === "settling" && ch.settlingAt && Date.now() - ch.settlingAt.getTime() > STALE_SETTLING_MS) {
    return settleChallenge(ch._id.toHexString()); // resume a run that crashed part-way
  }
  return ch;
}
