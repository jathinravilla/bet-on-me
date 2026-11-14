// Shared API types used by both the backend (/server, /api) and the Expo app (/app).
// The app must only `import type` from here so nothing in /lib is bundled by Metro.

export type Category = "strava" | "chess" | "dare";
export type Visibility = "friends" | "public";
export type Mode = "target" | "open";
export type ChallengeStatus = "active" | "settling" | "settled" | "banned";
export type ChessTimeControl = "rapid" | "blitz" | "bullet";
export type DareVerdict = "pass" | "fail" | "unsure";
export type ProofStatus = "pending" | "approved" | "rejected";

export interface ParticipantView {
  userId: string;
  username: string;
  joinedAt: string;
  stakeTxSig: string;
  baseline?: number;
  progress: number;
  completed: boolean;
  lastSyncedAt?: string;
}

export interface PayoutView {
  userId: string;
  username: string;
  lamports: number;
  txSig: string | null;
}

export interface SettlementView {
  winners: string[];
  payouts: PayoutView[];
  reason: string;
  outcome: "refund" | "split" | "leader";
  settledAt?: string;
}

export interface ProofView {
  id: string;
  userId: string;
  username: string;
  videoUrl?: string;
  verdict?: DareVerdict;
  reason?: string;
  finalStatus: ProofStatus;
  voting: boolean;
  disputeEndsAt?: string;
  approveVotes: number;
  rejectVotes: number;
  myVote: boolean | null;
  canDispute: boolean;
  canVote: boolean;
}

export interface ChallengeView {
  id: string;
  title: string;
  description: string;
  category: Category;
  visibility: Visibility;
  inviteCode?: string;
  mode: Mode;
  target?: number;
  chessTimeControl?: ChessTimeControl;
  dareText?: string;
  stakeLamports: number;
  potLamports: number;
  startsAt: string;
  endsAt: string;
  status: ChallengeStatus;
  creatorId: string;
  creatorUsername: string;
  escrowPublicKey: string;
  participants: ParticipantView[]; // already sorted as the leaderboard
  settlement?: SettlementView;
  upvotes: number;
  downvotes: number;
  myVote: 1 | -1 | 0;
  reportCount: number;
  iReported: boolean;
  joined: boolean;
  myRank?: number;
  proofs?: ProofView[];
}

export interface LimitsView {
  maxStakeLamports: number;
  publicDaresPerWeek: number;
  publicDaresUsed: number;
  next?: { points: number; maxStakeLamports: number; publicDaresPerWeek: number };
}

export interface HistoryItem {
  challengeId: string;
  title: string;
  category: Category;
  won: boolean;
  completed: boolean;
  paidLamports: number;
  stakeLamports: number;
  settledAt: string;
}

export interface MeView {
  id: string;
  username: string;
  points: number;
  wallet: { publicKey: string; balanceLamports: number; funded: boolean };
  chessUsername?: string;
  stravaConnected: boolean;
  stravaDemo: boolean; // true = simulated Strava (no real Strava API app configured)
  limits: LimitsView;
  demoMode: boolean;
  chainMock: boolean;
  history: HistoryItem[];
}

export interface LoginResponse {
  token: string;
  me: MeView;
  isNew: boolean;
}

export interface CreateChallengeBody {
  title: string;
  description?: string;
  category: Category;
  visibility: Visibility;
  mode: Mode;
  target?: number;
  chessTimeControl?: ChessTimeControl;
  dareText?: string;
  stakeLamports: number;
  durationMinutes: number;
}

export interface DareStartResponse {
  proofId: string;
  word: string;
  expiresAt: string;
}

export interface UploadTokenResponse {
  uploadUrl: string;
  headers: Record<string, string>;
}

export interface DareVerifyResponse {
  verdict: DareVerdict;
  reason: string;
  finalStatus: ProofStatus;
  voting: boolean;
  disputeEndsAt?: string;
}
