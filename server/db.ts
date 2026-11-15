import { MongoClient, type Collection, type Db, type ObjectId } from "mongodb";
import type { Category, ChallengeStatus, ChessTimeControl, DareVerdict, Mode, ProofStatus, ThreadEventType, Visibility } from "../lib/types";
import { need } from "./env";
import { HttpError } from "./http";

export interface WalletDoc {
  publicKey: string;
  encryptedSecret: string;
}

export interface UserDoc {
  _id: ObjectId;
  username: string;
  createdAt: Date;
  sessions: string[]; // sha256 of session tokens (never the tokens themselves)
  wallet: WalletDoc;
  fundState: "none" | "pending" | "done";
  points: number;
  chessUsername?: string;
  githubUsername?: string;
  duolingoUsername?: string;
  strava?: { athleteId: number; accessToken: string; refreshToken: string; expiresAt: number }; // tokens encrypted
  stravaDemo?: { runs: { miles: number; at: Date }[] }; // demo-only stand-in for Strava (simulated GPS runs)
  stravaOauth?: { nonce: string; returnTo: string; at: Date };
  dareCreditsUsedThisWeek: number;
  weekStart: Date;
  displayName?: string;
  bio?: string;
  avatar?: { color: string; emoji?: string; image?: string };
  friends?: string[]; // user ids (mutual)
  friendReqIn?: string[];
  friendReqOut?: string[];
  invites?: { challengeId: string; fromId: string; at: Date }[];
  integrationsWanted?: string[];
  ratingSum?: number;
  ratingCount?: number;
  notifications?: NotificationDoc[]; // newest last, capped
  threadSeen?: Record<string, number>; // challengeId -> comment count when you last opened the thread
}

export interface NotificationDoc {
  id: string;
  kind: "mention" | "reply" | "nudge";
  challengeId: string;
  commentId?: string;
  fromId: string;
  text?: string;
  at: Date;
  seen: boolean;
}

/** One collection for a challenge's thread: player comments and automatic bet updates, in insertion order. */
export interface ThreadDoc {
  _id: ObjectId;
  challengeId: string;
  kind: "comment" | "event";
  at: Date;
  // comments
  userId?: string;
  username?: string;
  text?: string;
  replyTo?: string;
  replyToUsername?: string;
  deleted?: boolean;
  hidden?: boolean;
  reports?: { userId: string; at: Date }[];
  // events
  key?: string; // deterministic id so the same update is never posted twice
  type?: ThreadEventType;
}

export interface ParticipantDoc {
  userId: string;
  username: string;
  joinedAt: Date;
  stakeTxSig: string; // "pending" while the stake transfer is in flight
  baseline?: number;
  windowStart?: string; // GitHub: first day (YYYY-MM-DD) counted toward this player
  source?: string; // GitHub / Duolingo username the baseline was read from; progress is always read from this one
  progress: number;
  completed: boolean;
  lastSyncedAt?: Date;
  simBonus?: number; // demo-mode fake progress
}

export interface ChallengeDoc {
  _id: ObjectId;
  title: string;
  description: string;
  category: Category;
  visibility: Visibility;
  inviteCode: string;
  mode: Mode;
  target?: number;
  chessTimeControl?: ChessTimeControl;
  dareText?: string;
  stakeLamports: number;
  potLamports: number;
  startsAt: Date;
  endsAt: Date;
  status: ChallengeStatus;
  settlingAt?: Date;
  escrow: WalletDoc;
  creatorId: string;
  creatorUsername: string;
  participants: ParticipantDoc[];
  settlement?: {
    winners: string[];
    payouts: { userId: string; lamports: number; txSig: string | null }[];
    reason: string;
    outcome: "refund" | "split" | "leader";
    receipt?: { hash: string; memo: string }; // fingerprint of the result, also written on-chain via the Memo program
    commentary?: { winner: string; loser: string; generatedAt: Date };
    pointsApplied?: boolean;
    finalStatus: "settled" | "banned";
    settledAt?: Date;
  };
  voters: { userId: string; v: 1 | -1 }[];
  upvotes: number;
  downvotes: number;
  reports: { userId: string; reason: string; at: Date }[];
  ratings?: { from: string; stars: number; at: Date }[]; // players rate the challenge once it's settled (feeds the creator's rating)
  commentCount?: number;
  pinnedCommentId?: string;
  backers?: { userId: string; backs: string; at: Date }[]; // spectators backing a player (no money involved)
  createdAt: Date;
}

export interface DareProofDoc {
  _id: ObjectId;
  challengeId: string;
  userId: string;
  username: string;
  livenessWord: string;
  wordIssuedAt: Date;
  uploadPath?: string;
  localUploadKey?: string; // local dev only: sha256 of the one-time upload key
  videoUrl?: string;
  gemini?: { verdict: DareVerdict; reason: string; checkedAt: Date };
  voting: boolean;
  disputeEndsAt?: Date;
  disputes: { userId: string; at: Date }[];
  votes: { userId: string; approve: boolean }[];
  finalStatus: ProofStatus;
}

interface RateDoc {
  _id: string;
  count: number;
  exp: Date;
}
interface LedgerDoc {
  _id: string;
  lamports: number;
}

interface Cols {
  db: Db;
  users: Collection<UserDoc>;
  challenges: Collection<ChallengeDoc>;
  proofs: Collection<DareProofDoc>;
  threads: Collection<ThreadDoc>;
  rates: Collection<RateDoc>;
  ledger: Collection<LedgerDoc>;
}

// Reuse one connection across warm serverless invocations.
const g = globalThis as unknown as { __bom?: Promise<Cols> };

export function cols(): Promise<Cols> {
  if (!g.__bom) {
    g.__bom = (async () => {
      const client = new MongoClient(need("MONGODB_URI"), { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 });
      await client.connect();
      const db = client.db(process.env.MONGODB_DB || "betonme");
      const c: Cols = {
        db,
        users: db.collection("users"),
        challenges: db.collection("challenges"),
        proofs: db.collection("dareproofs"),
        threads: db.collection("threads"),
        rates: db.collection("rates"),
        ledger: db.collection("mockledger"),
      };
      await Promise.all([
        c.users.createIndex({ username: 1 }, { unique: true }),
        c.users.createIndex({ sessions: 1 }),
        c.users.createIndex({ friends: 1 }),
        c.users.createIndex({ "stravaOauth.nonce": 1 }, { sparse: true }),
        c.challenges.createIndex({ inviteCode: 1 }, { unique: true }),
        c.challenges.createIndex({ visibility: 1, status: 1, potLamports: -1 }),
        c.challenges.createIndex({ "participants.userId": 1 }),
        c.challenges.createIndex({ status: 1, endsAt: 1 }),
        c.proofs.createIndex({ challengeId: 1 }),
        c.threads.createIndex({ challengeId: 1, _id: -1 }),
        c.threads.createIndex({ key: 1 }, { unique: true, sparse: true }),
        c.rates.createIndex({ exp: 1 }, { expireAfterSeconds: 0 }),
      ]);
      return c;
    })().catch((e) => {
      g.__bom = undefined;
      throw e;
    });
  }
  return g.__bom;
}

/** Fixed-window rate limit stored in Mongo (works across serverless instances). */
export async function rateLimit(key: string, max: number, windowSec: number) {
  const { rates } = await cols();
  const bucket = Math.floor(Date.now() / (windowSec * 1000));
  const doc = await rates.findOneAndUpdate(
    { _id: `${key}:${bucket}` },
    { $inc: { count: 1 }, $setOnInsert: { exp: new Date((bucket + 2) * windowSec * 1000) } },
    { upsert: true, returnDocument: "after" }
  );
  if ((doc?.count ?? 1) > max) {
    throw new HttpError(429, "Slow down — too many requests. Try again in a minute.");
  }
}
