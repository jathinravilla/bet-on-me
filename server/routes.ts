import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { ObjectId } from "mongodb";
import { randomInt } from "node:crypto";
import { coach, commentaryFor, searchPublic, similarTo } from "./extras";
import { ESCROW_TOPUP_LAMPORTS, LAMPORTS_PER_SOL, MAX_PARTICIPANTS, MIN_STAKE_LAMPORTS, POINTS, SIGNUP_FUNDING_LAMPORTS, tierFor } from "../lib/rules";
import type {
  CreateChallengeBody,
  DareStartResponse,
  DareVerifyResponse,
  HistoryItem,
  LoginResponse,
  MeView,
  UploadTokenResponse,
} from "../lib/types";
import { balance, keypairOf, newWallet, transfer, treasury } from "./chain";
import {
  addPoints,
  banChallenge,
  finalizeProofs,
  getChallenge,
  isParticipant,
  resolveProof,
  settleChallenge,
  settleIfDue,
  syncChallenge,
  toView,
} from "./challenges";
import { inviteCode, livenessWord, randomToken, safeEqual, sha256 } from "./crypto";
import { cols, rateLimit, type ChallengeDoc, type DareProofDoc, type UserDoc } from "./db";
import { DEMO_MODE, MAX_USERS, SOLANA_MOCK, STRAVA_DEMO, need } from "./env";
import { CHESS_USERNAME, chessPlayerExists, chessRating, stravaAuthorizeUrl, stravaExchange } from "./external";
import { dareIdeas, judgeDareVideo, screenDare } from "./gemini";
import { LOCAL_MEDIA, VIDEO_EXTS, extOf, localUpload, mimeOf, localVideoPath, originOf, readLocalVideo, serveLocalVideo } from "./localmedia";
import { HttpError, num, objectIdStr, oneOf, optStr, str, type Ctx, type Route } from "./http";
import {
  avatarOf,
  canSeeFriendsChallenge,
  clearInvite,
  dismissInvite,
  friendsFeed,
  inviteToChallenge,
  listFriends,
  pendingRatings,
  publicProfile,
  rateChallenge,
  ratingOf,
  removeFriend,
  requestFriend,
  respondFriend,
  searchUsers,
  sendInvites,
  statsFor,
  toggleIntegrationInterest,
  updateProfile,
} from "./social";

const WEEK_MS = 7 * 24 * 3600 * 1000;
const WORD_TTL_MS = 5 * 60 * 1000;
const VERIFY_GRACE_MS = 5 * 60 * 1000; // extra time to upload after recording
const MAX_VIDEO_BYTES = 18 * 1024 * 1024;
const BLOB_API_VERSION = "13"; // matches the installed @vercel/blob
const DURATIONS = [1440, 2880, 4320, 10080, 20160, 43200]; // 1d, 2d, 3d, 1w, 2w, 30d
const REPORTS_TO_BAN = 3;
const DOWNVOTE_MARGIN_TO_BAN = 5;
const disputeWindowMs = () => (DEMO_MODE() ? 10_000 : 2 * 3600 * 1000);
const signupLamports = () => (process.env.SIGNUP_FUNDING_SOL ? Math.round(Number(process.env.SIGNUP_FUNDING_SOL) * LAMPORTS_PER_SOL) : SIGNUP_FUNDING_LAMPORTS);

const uidOf = (u: UserDoc) => u._id.toHexString();
const COIN = 1_000_000; // lamports per in-app coin (1 coin = 0.001 test SOL)

// ---------- users ----------

/** Send the signup SOL once. A claim flag makes sure two requests can never fund the same user twice. */
async function ensureFunded(user: UserDoc) {
  if (user.fundState === "done") return;
  const { users } = await cols();
  const claim = await users.updateOne({ _id: user._id, fundState: "none" }, { $set: { fundState: "pending" } });
  if (claim.modifiedCount !== 1) return;
  try {
    const t = treasury();
    await transfer([{ from: t, to: user.wallet.publicKey, lamports: signupLamports() }], t);
    await users.updateOne({ _id: user._id }, { $set: { fundState: "done" } });
  } catch (e) {
    await users.updateOne({ _id: user._id }, { $set: { fundState: "none" } });
    console.error("signup funding failed:", e instanceof Error ? e.message : e);
  }
}

async function weekCredits(user: UserDoc): Promise<number> {
  if (Date.now() - user.weekStart.getTime() < WEEK_MS) return user.dareCreditsUsedThisWeek;
  const { users } = await cols();
  await users.updateOne({ _id: user._id }, { $set: { weekStart: new Date(), dareCreditsUsedThisWeek: 0 } });
  return 0;
}

async function meView(userId: ObjectId): Promise<MeView> {
  const { users, challenges } = await cols();
  const user = await users.findOne({ _id: userId });
  if (!user) throw new HttpError(401, "Please log in again.");
  const uid = uidOf(user);
  const [bal, settled, used, stats, toRate] = await Promise.all([
    balance(user.wallet.publicKey).catch(() => -1),
    challenges
      .find({ status: "settled", "participants.userId": uid })
      .sort({ "settlement.settledAt": -1 })
      .limit(20)
      .toArray(),
    weekCredits(user),
    statsFor(uidOf(user)),
    pendingRatings(user),
  ]);
  const liveInvites = (user.invites ?? []).length
    ? await challenges.countDocuments({
        _id: { $in: (user.invites ?? []).map((i) => new ObjectId(i.challengeId)) },
        status: "active",
        endsAt: { $gt: new Date() },
        "participants.userId": { $ne: uid },
      })
    : 0;
  const { current, next } = tierFor(user.points);
  const history: HistoryItem[] = settled.map((c) => ({
    challengeId: c._id.toHexString(),
    title: c.title,
    category: c.category,
    won: c.settlement?.outcome !== "refund" && !!c.settlement?.winners.includes(uid),
    completed: !!c.participants.find((p) => p.userId === uid)?.completed,
    paidLamports: c.settlement?.payouts.find((p) => p.userId === uid)?.lamports ?? 0,
    stakeLamports: c.stakeLamports,
    settledAt: (c.settlement?.settledAt ?? c.endsAt).toISOString(),
  }));
  return {
    id: uid,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
    avatar: avatarOf(user),
    rating: ratingOf(user),
    pendingRatings: toRate,
    stats,
    friendCount: user.friends?.length ?? 0,
    pendingRequests: user.friendReqIn?.length ?? 0,
    pendingInvites: liveInvites,
    integrationsWanted: user.integrationsWanted ?? [],
    points: user.points,
    wallet: { publicKey: user.wallet.publicKey, balanceLamports: bal, funded: user.fundState === "done" },
    chessUsername: user.chessUsername,
    stravaConnected: !!user.strava || (STRAVA_DEMO() && !!user.stravaDemo),
    stravaDemo: STRAVA_DEMO(),
    limits: {
      maxStakeLamports: current.maxStakeLamports,
      publicDaresPerWeek: current.publicDaresPerWeek,
      publicDaresUsed: used,
      next: next && { points: next.points, maxStakeLamports: next.maxStakeLamports, publicDaresPerWeek: next.publicDaresPerWeek },
    },
    demoMode: DEMO_MODE(),
    chainMock: SOLANA_MOCK(),
    history,
  };
}

async function login(ctx: Ctx): Promise<LoginResponse> {
  await rateLimit(`login:${ctx.ip}`, 20, 60);
  const username = str(ctx.body.username, "Username", 3, 16).toLowerCase();
  if (!/^[a-z0-9_]+$/.test(username)) throw new HttpError(400, "Usernames can only use letters, numbers and underscores.");
  const { users } = await cols();
  let user = await users.findOne({ username });
  let isNew = false;
  if (!user) {
    await rateLimit(`signup:${ctx.ip}`, 8, 3600);
    if ((await users.estimatedDocumentCount()) >= MAX_USERS()) throw new HttpError(403, "Sign-ups are full for this demo.");
    try {
      await users.insertOne({
        _id: new ObjectId(),
        username,
        createdAt: new Date(),
        sessions: [],
        wallet: newWallet().doc,
        fundState: "none",
        points: 0,
        dareCreditsUsedThisWeek: 0,
        weekStart: new Date(),
      });
      isNew = true;
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e; // 11000 = someone just took this name; log them in
    }
    user = await users.findOne({ username });
    if (!user) throw new HttpError(500, "Couldn't create your account. Try again.");
  }
  const token = randomToken();
  await users.updateOne({ _id: user._id }, { $push: { sessions: { $each: [sha256(token)], $slice: -5 } } });
  await ensureFunded(user);
  return { token, me: await meView(user._id), isNew };
}

async function me(ctx: Ctx) {
  await ensureFunded(ctx.user); // retry signup funding if it failed earlier
  return meView(ctx.user._id);
}

async function logout(ctx: Ctx) {
  const { users } = await cols();
  await users.updateOne({ _id: ctx.user._id }, { $set: { sessions: [] } });
  return { ok: true };
}

async function setChess(ctx: Ctx) {
  await rateLimit(`chess:${uidOf(ctx.user)}`, 10, 60);
  const username = str(ctx.body.username, "chess.com username", 3, 25);
  if (!CHESS_USERNAME.test(username)) throw new HttpError(400, "That doesn't look like a chess.com username.");
  if (!(await chessPlayerExists(username))) throw new HttpError(404, `No chess.com player called "${username}".`);
  const { users } = await cols();
  await users.updateOne({ _id: ctx.user._id }, { $set: { chessUsername: username.toLowerCase() } });
  return meView(ctx.user._id);
}

// ---------- Strava OAuth ----------

const RETURN_TO = /^(exp|exps|betonme):\/\/[^\s]{0,280}$/; // app deep links only — never a web URL

async function stravaConnect(ctx: Ctx) {
  await rateLimit(`strava:${uidOf(ctx.user)}`, 10, 60);
  if (STRAVA_DEMO()) {
    const { users } = await cols();
    await users.updateOne({ _id: ctx.user._id, stravaDemo: { $exists: false } }, { $set: { stravaDemo: { runs: [] } } });
    return { demo: true };
  }
  const returnTo = ctx.query.get("returnTo") ?? "";
  if (!RETURN_TO.test(returnTo)) throw new HttpError(400, "Invalid return link.");
  const nonce = randomToken(24);
  const { users } = await cols();
  await users.updateOne({ _id: ctx.user._id }, { $set: { stravaOauth: { nonce: sha256(nonce), returnTo, at: new Date() } } });
  return { url: stravaAuthorizeUrl(nonce) };
}

async function stravaCallback(ctx: Ctx) {
  const state = ctx.query.get("state") ?? "";
  const code = ctx.query.get("code") ?? "";
  const { users } = await cols();
  // The one-time state value proves this callback belongs to the user who started it.
  const user = state ? await users.findOne({ "stravaOauth.nonce": sha256(state) }) : null;
  if (!user?.stravaOauth || Date.now() - user.stravaOauth.at.getTime() > 10 * 60 * 1000) {
    return { __html: "This Strava link expired. Go back to the Bet On Me app and tap Connect Strava again." };
  }
  const back = (ok: boolean) => ({ __redirect: `${user.stravaOauth!.returnTo}${user.stravaOauth!.returnTo.includes("?") ? "&" : "?"}strava=${ok ? "ok" : "failed"}` });
  await users.updateOne({ _id: user._id }, { $unset: { stravaOauth: "" } });
  if (!code || ctx.query.get("error")) return back(false);
  const scope = ctx.query.get("scope") ?? "";
  if (!scope.includes("activity:read")) return back(false);
  try {
    const strava = await stravaExchange(code);
    await users.updateOne({ _id: user._id }, { $set: { strava } });
    return back(true);
  } catch {
    return back(false);
  }
}

/** Demo Strava only: log one simulated GPS run (1-3 miles, chosen by the server). */
async function stravaDemoRun(ctx: Ctx) {
  if (!STRAVA_DEMO()) throw new HttpError(404, "Not found.");
  await rateLimit(`demorun:${uidOf(ctx.user)}`, 12, 3600);
  if (!ctx.user.stravaDemo) throw new HttpError(400, "Connect demo Strava on your profile first.");
  const miles = (10 + randomInt(21)) / 10;
  const { users } = await cols();
  await users.updateOne({ _id: ctx.user._id }, { $push: { "stravaDemo.runs": { $each: [{ miles, at: new Date() }], $slice: -50 } } });
  return { miles };
}

// ---------- challenges ----------

async function createChallenge(ctx: Ctx) {
  const user = ctx.user;
  const uid = uidOf(user);
  await rateLimit(`create:${uid}`, 15, 3600);
  const b = ctx.body as Partial<Record<keyof CreateChallengeBody, unknown>>;
  const category = oneOf(b.category, "Category", ["strava", "chess", "dare"] as const);
  const visibility = oneOf(b.visibility, "Visibility", ["friends", "public"] as const);
  const mode = category === "dare" ? "target" : oneOf(b.mode, "Mode", ["target", "open"] as const);
  const title = str(b.title, "Title", 3, 60);
  const description = optStr(b.description, "Description", 280);
  const stakeLamports = num(b.stakeLamports, "Stake", MIN_STAKE_LAMPORTS, 100 * LAMPORTS_PER_SOL, true);
  const durationMinutes = num(b.durationMinutes, "Duration", 1, 43200, true);
  if (!DURATIONS.includes(durationMinutes) && !(DEMO_MODE() && durationMinutes === 5)) throw new HttpError(400, "Pick one of the listed durations.");

  const { current } = tierFor(user.points);
  if (stakeLamports > current.maxStakeLamports) {
    throw new HttpError(403, `Your max stake is ${current.maxStakeLamports / COIN} coins. Earn XP to raise it.`);
  }

  let target: number | undefined;
  let chessTimeControl: ChallengeDoc["chessTimeControl"];
  let dareText: string | undefined;
  let baseline: number | undefined;
  if (category === "strava") {
    if (mode === "target") target = num(b.target, "Target miles", 0.1, 500);
  } else if (category === "chess") {
    chessTimeControl = oneOf(b.chessTimeControl ?? "rapid", "Time control", ["rapid", "blitz", "bullet"] as const);
    if (mode === "target") target = num(b.target, "Target rating", 100, 3500, true);
    if (!user.chessUsername) throw new HttpError(400, "Set your chess.com username on your profile first.");
    const rating = await chessRating(user.chessUsername, chessTimeControl);
    if (rating === null) throw new HttpError(400, `You don't have a ${chessTimeControl} rating on chess.com yet — play a rated game first.`);
    baseline = rating;
  } else {
    dareText = str(b.dareText, "Dare", 10, 200);
    if (visibility === "public" && (await weekCredits(user)) >= current.publicDaresPerWeek) {
      throw new HttpError(403, `You've used your ${current.publicDaresPerWeek} public dare(s) this week. Earn XP to unlock more.`);
    }
    const screen = await screenDare(`${title}. ${dareText}`);
    if (!screen.allowed) throw new HttpError(422, `Dare blocked: ${screen.reason}`);
  }

  if ((await balance(user.wallet.publicKey)) < stakeLamports) throw new HttpError(400, "Not enough coins in your wallet for that stake.");

  const { challenges, users } = await cols();
  const escrow = newWallet().doc;
  const now = new Date();
  const doc: ChallengeDoc = {
    _id: new ObjectId(),
    title,
    description,
    category,
    visibility,
    inviteCode: inviteCode(),
    mode,
    target,
    chessTimeControl,
    dareText,
    stakeLamports,
    potLamports: 0,
    startsAt: now,
    endsAt: new Date(now.getTime() + durationMinutes * 60_000),
    status: "active",
    escrow,
    creatorId: uid,
    creatorUsername: user.username,
    participants: [],
    voters: [],
    upvotes: 0,
    downvotes: 0,
    reports: [],
    createdAt: now,
  };
  for (let attempt = 0; ; attempt++) {
    try {
      await challenges.insertOne(doc);
      break;
    } catch (e) {
      if ((e as { code?: number }).code !== 11000 || attempt >= 4) throw e;
      doc.inviteCode = inviteCode(); // rare invite-code collision
    }
  }

  let sig: string;
  try {
    // One transaction: treasury tops up the escrow for fees + the creator's stake goes in.
    const t = treasury();
    sig = await transfer(
      [
        { from: t, to: escrow.publicKey, lamports: ESCROW_TOPUP_LAMPORTS },
        { from: keypairOf(user.wallet), to: escrow.publicKey, lamports: stakeLamports },
      ],
      t
    );
  } catch (e) {
    await challenges.deleteOne({ _id: doc._id });
    throw e;
  }
  await challenges.updateOne(
    { _id: doc._id },
    {
      $push: {
        participants: {
          userId: uid,
          username: user.username,
          joinedAt: new Date(),
          stakeTxSig: sig,
          baseline,
          progress: category === "chess" && mode === "target" ? baseline ?? 0 : 0,
          completed: false,
        },
      },
      $inc: { potLamports: stakeLamports },
    }
  );
  if (category === "dare" && visibility === "public") await users.updateOne({ _id: user._id }, { $inc: { dareCreditsUsedThisWeek: 1 } });
  await addPoints(uid, POINTS.join);
  const created = await getChallenge(doc._id.toHexString());
  await sendInvites(created, user, b.inviteFriendIds).catch((e) => console.error("invite failed:", e instanceof Error ? e.message : e));
  return toView(created, user, true);
}

async function listPublic(ctx: Ctx) {
  const { challenges } = await cols();
  const [live, done] = await Promise.all([
    challenges
      .find({ visibility: "public", status: "active", endsAt: { $gt: new Date() } })
      .sort({ potLamports: -1, createdAt: -1 })
      .limit(40)
      .toArray(),
    challenges.find({ visibility: "public", status: "settled" }).sort({ "settlement.settledAt": -1 }).limit(5).toArray(),
  ]);
  return Promise.all([...live, ...done].map((c) => toView(c, ctx.user)));
}

async function searchChallenges(ctx: Ctx) {
  await rateLimit(`search:${uidOf(ctx.user)}`, 60, 60);
  const q = (ctx.query.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return { engine: "basic", results: [] };
  const { docs, engine } = await searchPublic(q);
  return { engine, results: await Promise.all(docs.map((c) => toView(c, ctx.user))) };
}

async function similarChallenges(ctx: Ctx) {
  const ch = await getChallenge(objectIdStr(ctx.params.id, "Challenge id"));
  assertCanView(ch, ctx.user);
  if (ch.visibility !== "public") return [];
  return Promise.all((await similarTo(ch)).map((c) => toView(c, ctx.user)));
}

async function commentary(ctx: Ctx) {
  const ch = await getChallenge(objectIdStr(ctx.params.id, "Challenge id"));
  assertCanView(ch, ctx.user);
  if (!isParticipant(ch, uidOf(ctx.user)) && ch.visibility !== "public") throw new HttpError(404, "Challenge not found.");
  await rateLimit(`commentary:${uidOf(ctx.user)}`, 30, 3600);
  return { commentary: await commentaryFor(ch) };
}

async function dareIdeasRoute(ctx: Ctx) {
  await rateLimit(`dareideas:${uidOf(ctx.user)}`, 30, 3600);
  return dareIdeas(5);
}

async function listMine(ctx: Ctx) {
  const { challenges } = await cols();
  const uid = uidOf(ctx.user);
  const list = await challenges
    .find({ $or: [{ "participants.userId": uid }, { creatorId: uid }] })
    .sort({ endsAt: -1 })
    .limit(60)
    .toArray();
  const order = { active: 0, settling: 1, settled: 2, banned: 3 } as const;
  list.sort((a, b) => order[a.status] - order[b.status] || (a.status === "active" ? a.endsAt.getTime() - b.endsAt.getTime() : b.endsAt.getTime() - a.endsAt.getTime()));
  return Promise.all(list.map((c) => toView(c, ctx.user)));
}

/** Friends challenges are private: players, the creator, invitees and friends of players can open them. */
function assertCanView(ch: ChallengeDoc, user: UserDoc) {
  const uid = uidOf(user);
  if (ch.visibility === "friends" && !canSeeFriendsChallenge(ch, user)) throw new HttpError(404, "Challenge not found.");
  if (ch.status === "banned" && !isParticipant(ch, uid)) throw new HttpError(404, "Challenge not found.");
}

async function detail(ctx: Ctx) {
  let ch = await getChallenge(objectIdStr(ctx.params.id, "Challenge id"));
  assertCanView(ch, ctx.user);
  try {
    ch = await finalizeProofs(ch, false);
    ch = await settleIfDue(ch);
    if (isParticipant(ch, uidOf(ctx.user))) ch = await syncChallenge(ch, { onlyUserId: uidOf(ctx.user) });
  } catch (e) {
    console.error("detail refresh failed:", e instanceof Error ? e.message : e); // still show the last known state
    ch = await getChallenge(ctx.params.id);
  }
  return toView(ch, ctx.user, true);
}

async function join(ctx: Ctx) {
  const user = ctx.user;
  const uid = uidOf(user);
  await rateLimit(`join:${uid}`, 20, 60);
  const { challenges } = await cols();
  let ch: ChallengeDoc | null;
  if (typeof ctx.body.inviteCode === "string" && ctx.body.inviteCode) {
    const code = str(ctx.body.inviteCode, "Invite code", 6, 6).toUpperCase();
    ch = await challenges.findOne({ inviteCode: code });
    if (!ch) throw new HttpError(404, "No challenge with that code. Double-check it with your friend.");
  } else {
    ch = await getChallenge(objectIdStr(ctx.body.challengeId, "Challenge id"));
    if (ch.visibility !== "public" && !canSeeFriendsChallenge(ch, user)) throw new HttpError(403, "This is a friends challenge — join with its invite code.");
  }
  if (ch.status !== "active" || ch.endsAt.getTime() <= Date.now()) throw new HttpError(409, "This challenge has already ended.");
  if (isParticipant(ch, uid)) throw new HttpError(409, "You're already in this challenge.");
  if (ch.participants.length >= MAX_PARTICIPANTS) throw new HttpError(409, "This challenge is full.");

  let baseline: number | undefined;
  if (ch.category === "chess") {
    if (!user.chessUsername) throw new HttpError(400, "Set your chess.com username on your profile first.");
    const rating = await chessRating(user.chessUsername, ch.chessTimeControl ?? "rapid");
    if (rating === null) throw new HttpError(400, `You don't have a ${ch.chessTimeControl ?? "rapid"} rating on chess.com yet — play a rated game first.`);
    baseline = rating;
  }
  if ((await balance(user.wallet.publicKey)) < ch.stakeLamports) throw new HttpError(400, "Not enough coins in your wallet for this stake.");

  // Reserve the seat first (atomic, so a double-tap can't join twice), then move the money.
  const reserved = await challenges.updateOne(
    { _id: ch._id, status: "active", "participants.userId": { $ne: uid }, [`participants.${MAX_PARTICIPANTS - 1}`]: { $exists: false } },
    {
      $push: {
        participants: {
          userId: uid,
          username: user.username,
          joinedAt: new Date(),
          stakeTxSig: "pending",
          baseline,
          progress: ch.category === "chess" && ch.mode === "target" ? baseline ?? 0 : 0,
          completed: false,
        },
      },
    }
  );
  if (reserved.modifiedCount !== 1) throw new HttpError(409, "Couldn't join — the challenge just changed. Try again.");

  const wallet = keypairOf(user.wallet);
  let sig: string;
  try {
    sig = await transfer([{ from: wallet, to: ch.escrow.publicKey, lamports: ch.stakeLamports }], treasury());
  } catch (e) {
    await challenges.updateOne({ _id: ch._id }, { $pull: { participants: { userId: uid, stakeTxSig: "pending" } } });
    throw e;
  }
  const confirmed = await challenges.updateOne(
    { _id: ch._id, status: "active", participants: { $elemMatch: { userId: uid, stakeTxSig: "pending" } } },
    { $set: { "participants.$.stakeTxSig": sig }, $inc: { potLamports: ch.stakeLamports } }
  );
  if (confirmed.modifiedCount !== 1) {
    // The challenge ended while the stake was in flight: give the money straight back.
    await challenges.updateOne({ _id: ch._id }, { $pull: { participants: { userId: uid, stakeTxSig: "pending" } } });
    const escrow = keypairOf(ch.escrow);
    await transfer([{ from: escrow, to: user.wallet.publicKey, lamports: ch.stakeLamports }], treasury());
    throw new HttpError(409, "This challenge ended just as you joined — your stake was returned.");
  }
  await addPoints(uid, POINTS.join);
  await clearInvite(user._id, ch._id.toHexString());
  return toView(await getChallenge(ch._id.toHexString()), user, true);
}

async function playerChallenge(ctx: Ctx): Promise<ChallengeDoc> {
  const ch = await getChallenge(objectIdStr(ctx.params.id ?? ctx.body.challengeId, "Challenge id"));
  if (!isParticipant(ch, uidOf(ctx.user))) throw new HttpError(403, "Only players in this challenge can do that.");
  return ch;
}

async function sync(ctx: Ctx) {
  await rateLimit(`sync:${uidOf(ctx.user)}`, 30, 60);
  const ch = await playerChallenge(ctx);
  return toView(await settleIfDue(await syncChallenge(ch)), ctx.user, true);
}

async function publicChallenge(ctx: Ctx): Promise<ChallengeDoc> {
  const ch = await getChallenge(objectIdStr(ctx.params.id, "Challenge id"));
  if (ch.visibility !== "public") throw new HttpError(403, "Only public challenges can be voted on or reported.");
  if (ch.status !== "active") throw new HttpError(409, "This challenge has ended.");
  return ch;
}

async function vote(ctx: Ctx) {
  const uid = uidOf(ctx.user);
  await rateLimit(`vote:${uid}`, 60, 60);
  const ch = await publicChallenge(ctx);
  const v = ctx.body.value;
  if (v !== 1 && v !== -1 && v !== 0) throw new HttpError(400, "Vote must be 1, -1 or 0.");
  const { challenges } = await cols();
  await challenges.updateOne({ _id: ch._id }, { $pull: { voters: { userId: uid } } });
  if (v !== 0) await challenges.updateOne({ _id: ch._id, "voters.userId": { $ne: uid } }, { $push: { voters: { userId: uid, v } } });
  let fresh = await getChallenge(ctx.params.id);
  const up = fresh.voters.filter((x) => x.v === 1).length;
  const down = fresh.voters.length - up;
  await challenges.updateOne({ _id: ch._id }, { $set: { upvotes: up, downvotes: down } });
  if (down - up >= DOWNVOTE_MARGIN_TO_BAN) await banChallenge(ctx.params.id);
  fresh = await getChallenge(ctx.params.id);
  return toView(fresh, ctx.user);
}

async function report(ctx: Ctx) {
  const uid = uidOf(ctx.user);
  await rateLimit(`report:${uid}`, 10, 3600);
  const ch = await publicChallenge(ctx);
  const reason = str(ctx.body.reason, "Reason", 3, 200);
  const { challenges } = await cols();
  const r = await challenges.updateOne({ _id: ch._id, "reports.userId": { $ne: uid } }, { $push: { reports: { userId: uid, reason, at: new Date() } } });
  if (r.modifiedCount !== 1) throw new HttpError(409, "You've already reported this challenge.");
  const fresh = await getChallenge(ctx.params.id);
  if (fresh.reports.length >= REPORTS_TO_BAN) await banChallenge(ctx.params.id);
  return { ok: true, banned: fresh.reports.length >= REPORTS_TO_BAN };
}

async function settle(ctx: Ctx) {
  const ch = await playerChallenge(ctx);
  if (ch.endsAt.getTime() > Date.now()) throw new HttpError(400, "This challenge hasn't ended yet.");
  return toView(await settleIfDue(ch), ctx.user, true);
}

// ---------- demo mode ----------

function assertDemo() {
  if (!DEMO_MODE()) throw new HttpError(404, "Not found.");
}

async function demoEndNow(ctx: Ctx) {
  assertDemo();
  const ch = await playerChallenge(ctx);
  if (ch.status !== "active") throw new HttpError(409, "This challenge has already ended.");
  // In a public challenge a stranger must not be able to cut everyone else short.
  if (ch.visibility === "public" && ch.creatorId !== uidOf(ctx.user)) throw new HttpError(403, "Only the creator can end a public challenge early.");
  const { challenges } = await cols();
  await challenges.updateOne({ _id: ch._id, status: "active" }, { $set: { endsAt: new Date() } });
  return toView(await settleIfDue(await getChallenge(ch._id.toHexString())), ctx.user, true);
}

async function demoSimulate(ctx: Ctx) {
  assertDemo();
  const ch = await playerChallenge(ctx);
  if (ch.status !== "active" || ch.category === "dare") throw new HttpError(409, "Progress can only be simulated on live running or chess challenges.");
  // Fake progress would let a stranger take a public pot, so it only works among friends.
  if (ch.visibility !== "friends") throw new HttpError(403, "Progress can only be simulated in friends challenges.");
  const amount = num(ctx.body.amount, "Amount", -500, 500);
  const uid = uidOf(ctx.user);
  const { challenges } = await cols();
  await challenges.updateOne({ _id: ch._id, "participants.userId": uid }, { $inc: { "participants.$.simBonus": amount } });
  return toView(await syncChallenge(await getChallenge(ch._id.toHexString()), { onlyUserId: uid, force: true }), ctx.user, true);
}

// ---------- dares ----------

async function myProof(ctx: Ctx): Promise<DareProofDoc> {
  const { proofs } = await cols();
  const proof = await proofs.findOne({ _id: new ObjectId(objectIdStr(ctx.body.proofId, "Proof id")) });
  if (!proof || proof.userId !== uidOf(ctx.user)) throw new HttpError(404, "Proof not found.");
  return proof;
}

async function dareStart(ctx: Ctx): Promise<DareStartResponse> {
  const uid = uidOf(ctx.user);
  await rateLimit(`darestart:${uid}`, 12, 3600);
  const ch = await playerChallenge(ctx);
  if (ch.category !== "dare") throw new HttpError(400, "This isn't a dare challenge.");
  if (ch.status !== "active" || ch.endsAt.getTime() <= Date.now()) throw new HttpError(409, "This dare has ended.");
  if (ch.participants.find((p) => p.userId === uid)?.completed) throw new HttpError(409, "You've already completed this dare.");
  const { proofs } = await cols();
  const awaiting = await proofs.findOne({ challengeId: ch._id.toHexString(), userId: uid, finalStatus: "pending", gemini: { $exists: true } });
  if (awaiting) throw new HttpError(409, "Your last proof is still being reviewed.");
  const doc: DareProofDoc = {
    _id: new ObjectId(),
    challengeId: ch._id.toHexString(),
    userId: uid,
    username: ctx.user.username,
    livenessWord: livenessWord(),
    wordIssuedAt: new Date(),
    voting: false,
    disputes: [],
    votes: [],
    finalStatus: "pending",
  };
  await proofs.insertOne(doc);
  return { proofId: doc._id.toHexString(), word: doc.livenessWord, expiresAt: new Date(doc.wordIssuedAt.getTime() + WORD_TTL_MS).toISOString() };
}

async function dareUploadToken(ctx: Ctx): Promise<UploadTokenResponse> {
  const proof = await myProof(ctx);
  if (proof.gemini || proof.uploadPath) throw new HttpError(409, "This proof already has a video. Start a new one.");
  if (Date.now() - proof.wordIssuedAt.getTime() > WORD_TTL_MS + VERIFY_GRACE_MS) throw new HttpError(410, "That liveness word expired. Tap Record proof again.");
  const ext = oneOf(ctx.body.ext ?? "mov", "File type", VIDEO_EXTS);
  const contentType = mimeOf(ext);
  if (LOCAL_MEDIA()) {
    // Local dev without Vercel Blob: upload straight to this server with a one-time key.
    const key = randomToken(24);
    const { proofs } = await cols();
    await proofs.updateOne({ _id: proof._id }, { $set: { uploadPath: `local/${proof._id.toHexString()}.${ext}`, localUploadKey: sha256(key) } });
    return { uploadUrl: `${originOf(ctx)}/api/dare/local-upload/${proof._id.toHexString()}?k=${key}`, headers: { "content-type": contentType } };
  }
  const pathname = `dares/${proof._id.toHexString()}-${randomToken(9)}.${ext}`;
  // A one-shot upload ticket: this exact file name, video only, small, valid for 10 minutes.
  const clientToken = await generateClientTokenFromReadWriteToken({
    token: need("BLOB_READ_WRITE_TOKEN"),
    pathname,
    maximumSizeInBytes: MAX_VIDEO_BYTES,
    allowedContentTypes: [contentType],
    validUntil: Date.now() + 10 * 60 * 1000,
    addRandomSuffix: false,
  });
  const { proofs } = await cols();
  await proofs.updateOne({ _id: proof._id }, { $set: { uploadPath: pathname } });
  return {
    uploadUrl: `https://vercel.com/api/blob/?${new URLSearchParams({ pathname })}`,
    headers: {
      authorization: `Bearer ${clientToken}`,
      "x-api-version": BLOB_API_VERSION,
      "x-vercel-blob-access": "public",
      "x-content-type": contentType,
    },
  };
}

async function dareVerify(ctx: Ctx): Promise<DareVerifyResponse> {
  const uid = uidOf(ctx.user);
  await rateLimit(`dareverify:${uid}`, 12, 3600);
  const proof = await myProof(ctx);
  if (proof.gemini) throw new HttpError(409, "This proof was already checked.");
  if (!proof.uploadPath) throw new HttpError(400, "Upload the video first.");
  if (Date.now() - proof.wordIssuedAt.getTime() > WORD_TTL_MS + VERIFY_GRACE_MS) throw new HttpError(410, "That liveness word expired. Tap Record proof again.");
  const ch = await getChallenge(proof.challengeId);
  if (ch.status !== "active") throw new HttpError(409, "This dare has ended.");

  // Only ever fetch the exact file we issued an upload ticket for, on Vercel Blob's own domain.
  let url: URL;
  try {
    url = new URL(str(ctx.body.videoUrl, "Video URL", 10, 500));
  } catch {
    throw new HttpError(400, "Invalid video URL.");
  }
  let video: Buffer;
  if (LOCAL_MEDIA() && proof.uploadPath.startsWith("local/")) {
    // Local file: the URL must point at exactly this proof's file; we read it from disk, never fetch it.
    const ext = extOf(proof.uploadPath);
    if (url.pathname !== localVideoPath(proof._id.toHexString(), ext) || url.search || url.username) throw new HttpError(400, "Invalid video URL.");
    video = await readLocalVideo(proof._id.toHexString(), ext);
  } else {
    if (url.protocol !== "https:" || !url.hostname.endsWith(".public.blob.vercel-storage.com") || decodeURIComponent(url.pathname) !== `/${proof.uploadPath}` || url.search || url.username) {
      throw new HttpError(400, "Invalid video URL.");
    }
    const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new HttpError(400, "Couldn't read the uploaded video. Try recording again.");
    video = Buffer.from(await res.arrayBuffer());
  }
  if (video.length === 0 || video.length > MAX_VIDEO_BYTES) throw new HttpError(400, "That video is too large. Keep it under 15 seconds.");

  const { proofs } = await cols();
  // Claim the proof before the (slow) AI call so a double-submit can't run it twice.
  const claimed = await proofs.updateOne({ _id: proof._id, videoUrl: { $exists: false } }, { $set: { videoUrl: url.toString() } });
  if (claimed.modifiedCount !== 1) throw new HttpError(409, "This proof is already being checked.");

  let result: { verdict: "pass" | "fail" | "unsure"; reason: string };
  try {
    result = await judgeDareVideo({
      video,
      mimeType: mimeOf(extOf(proof.uploadPath)),
      dareText: `${ch.title}. ${ch.dareText ?? ""}`,
      word: proof.livenessWord,
    });
  } catch (e) {
    await proofs.updateOne({ _id: proof._id }, { $unset: { videoUrl: "" } }); // let them retry the check
    throw e;
  }

  const voters = ch.participants.filter((p) => p.userId !== uid && p.stakeTxSig !== "pending").length;
  let finalStatus: DareProofDoc["finalStatus"] = "pending";
  let voting = false;
  let disputeEndsAt: Date | undefined;
  let reason = result.reason;
  if (result.verdict === "fail") finalStatus = "rejected";
  else if (result.verdict === "pass") {
    if (ch.visibility === "friends" && voters > 0) disputeEndsAt = new Date(Date.now() + disputeWindowMs());
    else finalStatus = "approved";
  } else if (voters > 0) voting = true;
  else {
    finalStatus = "rejected";
    reason += " (Nobody else is in this dare to vote yet — try a clearer video.)";
  }

  await proofs.updateOne(
    { _id: proof._id },
    { $set: { gemini: { verdict: result.verdict, reason, checkedAt: new Date() }, voting, finalStatus: "pending", ...(disputeEndsAt ? { disputeEndsAt } : {}) } }
  );
  if (finalStatus !== "pending") await resolveProof(proof, finalStatus === "approved");
  return { verdict: result.verdict, reason, finalStatus, voting, disputeEndsAt: disputeEndsAt?.toISOString() };
}

/** Load a proof someone else submitted in a live challenge the caller is playing. */
async function othersProof(ctx: Ctx) {
  const { proofs } = await cols();
  const proof = await proofs.findOne({ _id: new ObjectId(objectIdStr(ctx.params.proofId, "Proof id")) });
  if (!proof?.gemini) throw new HttpError(404, "Proof not found.");
  const ch = await getChallenge(proof.challengeId);
  const uid = uidOf(ctx.user);
  if (!isParticipant(ch, uid)) throw new HttpError(403, "Only players in this challenge can do that.");
  if (proof.userId === uid) throw new HttpError(403, "You can't dispute or vote on your own proof.");
  if (ch.status !== "active") throw new HttpError(409, "This dare has ended.");
  return { proof, ch, uid };
}

async function dareDispute(ctx: Ctx) {
  const { proof, ch, uid } = await othersProof(ctx);
  await rateLimit(`dispute:${uid}`, 20, 3600);
  if (proof.gemini?.verdict !== "pass" || proof.voting || proof.finalStatus === "rejected") throw new HttpError(409, "This proof can't be disputed.");
  if (ch.visibility === "friends" && (!proof.disputeEndsAt || proof.disputeEndsAt.getTime() <= Date.now())) {
    throw new HttpError(409, "The dispute window has closed.");
  }
  const { proofs, challenges } = await cols();
  const r = await proofs.updateOne(
    { _id: proof._id, voting: false },
    { $set: { voting: true, finalStatus: "pending" }, $push: { disputes: { userId: uid, at: new Date() } } }
  );
  if (r.modifiedCount === 1) {
    // Back to "not done yet" until the vote finishes.
    await challenges.updateOne({ _id: ch._id, "participants.userId": proof.userId }, { $set: { "participants.$.completed": false, "participants.$.progress": 0 } });
  }
  return toView(await getChallenge(proof.challengeId), ctx.user, true);
}

async function dareVote(ctx: Ctx) {
  const { proof, ch, uid } = await othersProof(ctx);
  await rateLimit(`proofvote:${uid}`, 60, 3600);
  if (!proof.voting || proof.finalStatus !== "pending") throw new HttpError(409, "There's no open vote on this proof.");
  if (typeof ctx.body.approve !== "boolean") throw new HttpError(400, "approve must be true or false.");
  const { proofs } = await cols();
  await proofs.updateOne({ _id: proof._id }, { $pull: { votes: { userId: uid } } });
  await proofs.updateOne({ _id: proof._id, "votes.userId": { $ne: uid } }, { $push: { votes: { userId: uid, approve: ctx.body.approve } } });
  const fresh = await proofs.findOne({ _id: proof._id });
  if (fresh && fresh.finalStatus === "pending") {
    const eligible = ch.participants.filter((p) => p.userId !== proof.userId && p.stakeTxSig !== "pending").length;
    const yes = fresh.votes.filter((v) => v.approve).length;
    const no = fresh.votes.length - yes;
    if (yes > eligible / 2) await resolveProof(fresh, true);
    else if (no >= eligible / 2) await resolveProof(fresh, false); // ties go against the proof
  }
  return toView(await getChallenge(proof.challengeId), ctx.user, true);
}

// ---------- cron ----------

async function cronSettleDue(ctx: Ctx) {
  const header = ctx.req.headers.authorization ?? "";
  if (!safeEqual(header, `Bearer ${need("CRON_SECRET")}`)) throw new HttpError(401, "Unauthorized.");
  const { challenges } = await cols();
  const due = await challenges.find({ status: { $in: ["active", "settling"] }, endsAt: { $lte: new Date() } }).limit(8).toArray();
  let settled = 0;
  for (const ch of due) {
    try {
      const after = await settleIfDue(ch);
      if (after.status === "settled") settled++;
    } catch (e) {
      console.error("cron settle failed:", ch._id.toHexString(), e instanceof Error ? e.message : e);
    }
  }
  return { due: due.length, settled };
}

export const routes: Route[] = [
  { method: "POST", pattern: "/auth/login", auth: false, handler: login },
  { method: "POST", pattern: "/auth/logout", auth: true, handler: logout },
  { method: "GET", pattern: "/me", auth: true, handler: me },
  { method: "POST", pattern: "/me/chess", auth: true, handler: setChess },
  { method: "POST", pattern: "/me/profile", auth: true, handler: async (ctx) => (await updateProfile(ctx), meView(ctx.user._id)) },
  { method: "POST", pattern: "/me/integrations", auth: true, handler: async (ctx) => (await toggleIntegrationInterest(ctx), meView(ctx.user._id)) },
  { method: "GET", pattern: "/users/search", auth: true, handler: searchUsers },
  { method: "GET", pattern: "/users/:username", auth: true, handler: publicProfile },
  { method: "GET", pattern: "/friends", auth: true, handler: listFriends },
  { method: "GET", pattern: "/friends/feed", auth: true, handler: friendsFeed },
  { method: "POST", pattern: "/friends/request", auth: true, handler: requestFriend },
  { method: "POST", pattern: "/friends/respond", auth: true, handler: respondFriend },
  { method: "POST", pattern: "/friends/remove", auth: true, handler: removeFriend },
  { method: "POST", pattern: "/friends/invites/dismiss", auth: true, handler: dismissInvite },
  { method: "POST", pattern: "/challenges/:id/invite", auth: true, handler: inviteToChallenge },
  { method: "POST", pattern: "/challenges/:id/rate", auth: true, handler: rateChallenge },
  { method: "GET", pattern: "/strava/connect", auth: true, handler: stravaConnect },
  { method: "POST", pattern: "/strava/demo-run", auth: true, handler: stravaDemoRun },
  { method: "GET", pattern: "/strava/callback", auth: false, handler: stravaCallback },
  { method: "POST", pattern: "/challenges", auth: true, handler: createChallenge },
  { method: "GET", pattern: "/challenges", auth: true, handler: listPublic },
  { method: "GET", pattern: "/challenges/mine", auth: true, handler: listMine },
  { method: "GET", pattern: "/challenges/search", auth: true, handler: searchChallenges },
  { method: "POST", pattern: "/coach", auth: true, handler: coach },
  { method: "GET", pattern: "/dare/ideas", auth: true, handler: dareIdeasRoute },
  { method: "GET", pattern: "/challenges/:id/similar", auth: true, handler: similarChallenges },
  { method: "GET", pattern: "/challenges/:id/commentary", auth: true, handler: commentary },
  { method: "POST", pattern: "/challenges/join", auth: true, handler: join },
  { method: "GET", pattern: "/challenges/:id", auth: true, handler: detail },
  { method: "POST", pattern: "/challenges/:id/sync", auth: true, handler: sync },
  { method: "POST", pattern: "/challenges/:id/vote", auth: true, handler: vote },
  { method: "POST", pattern: "/challenges/:id/report", auth: true, handler: report },
  { method: "POST", pattern: "/challenges/:id/settle", auth: true, handler: settle },
  { method: "POST", pattern: "/demo/end-now", auth: true, handler: demoEndNow },
  { method: "POST", pattern: "/demo/simulate-progress", auth: true, handler: demoSimulate },
  { method: "POST", pattern: "/dare/start", auth: true, handler: dareStart },
  { method: "POST", pattern: "/dare/upload-token", auth: true, handler: dareUploadToken },
  { method: "POST", pattern: "/dare/verify", auth: true, handler: dareVerify },
  { method: "PUT", pattern: "/dare/local-upload/:proofId", auth: false, handler: localUpload },
  { method: "GET", pattern: "/dare/local-video/:file", auth: false, handler: serveLocalVideo },
  { method: "POST", pattern: "/dare/:proofId/dispute", auth: true, handler: dareDispute },
  { method: "POST", pattern: "/dare/:proofId/vote", auth: true, handler: dareVote },
  { method: "GET", pattern: "/cron/settle-due", auth: false, handler: cronSettleDue },
  { method: "GET", pattern: "/health", auth: false, handler: async () => ({ ok: true }) },
];
