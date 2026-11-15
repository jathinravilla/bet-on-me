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
  avatar?: Avatar;
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
  /** Fingerprint of the result; the same text is written into the payout transaction on Solana. */
  receipt?: { hash: string; memo: string };
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
  /** Players (not the creator) rate a settled challenge 1-5; it feeds the creator's profile rating. */
  canRate: boolean;
  myRating?: number;
  rating: Rating;
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

export interface Avatar {
  color: string; // hex, one of the preset swatches
  emoji?: string;
  image?: string; // small JPEG data URI (<= ~40KB)
}

export interface ProfileStats {
  played: number;
  wins: number;
  completed: number;
  netLamports: number;
  live: number;
}

export interface MeView {
  id: string;
  username: string;
  displayName?: string;
  bio?: string;
  avatar: Avatar;
  rating: Rating;
  stats: ProfileStats;
  friendCount: number;
  pendingRequests: number;
  pendingRatings: number; // finished challenges you played in and haven't rated yet
  pendingInvites: number;
  integrationsWanted: string[];
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
  inviteFriendIds?: string[];
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

/** Average stars players gave the challenges this person created. */
export interface Rating {
  avg: number; // 0 when nobody has rated them yet
  count: number;
}

export interface UserSummary {
  id: string;
  username: string;
  displayName?: string;
  avatar: Avatar;
  points: number; // XP
  rating: Rating;
  relation: "self" | "friend" | "incoming" | "outgoing" | "none";
}

export interface PublicProfile extends UserSummary {
  bio?: string;
  stats: ProfileStats;
  friendCount: number;
  challenges: ChallengeView[]; // their live challenges you are allowed to see
}

export interface FriendInvite {
  challengeId: string;
  title: string;
  category: Category;
  stakeLamports: number;
  endsAt: string;
  from: UserSummary;
  at: string;
}

export interface FriendsView {
  friends: UserSummary[];
  incoming: UserSummary[];
  outgoing: UserSummary[];
  invites: FriendInvite[];
}

export type ActivityKind = "created" | "joined" | "completed" | "won" | "fumbled";

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  user: UserSummary;
  challengeId: string;
  title: string;
  category: Category;
  lamports?: number;
  at: string;
}

export interface FeedView {
  live: ChallengeView[]; // live challenges your friends are in (you can view and join these)
  activity: ActivityItem[];
}

export interface UpdateProfileBody {
  displayName?: string;
  bio?: string;
  avatar?: Avatar;
}

export interface CoachResponse {
  odds: number; // 1-99, chance a typical player pulls the goal off
  verdict: string;
  tip: string;
  suggestedStakeLamports: number;
}

export interface SearchResponse {
  engine: "atlas" | "basic"; // "atlas" = MongoDB Atlas Search, "basic" = plain text match while the index builds
  results: ChallengeView[];
}

export interface CommentaryResponse {
  commentary: { winner: string; loser: string } | null;
}
