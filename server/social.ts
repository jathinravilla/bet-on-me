// Friends, profiles, invites and the friends activity feed.
import { ObjectId } from "mongodb";
import type { ActivityItem, Avatar, FeedView, FriendInvite, FriendsView, ProfileStats, PublicProfile, UserSummary } from "../lib/types";
import { getChallenge, isParticipant, toView } from "./challenges";
import { cols, rateLimit, type ChallengeDoc, type UserDoc } from "./db";
import { HttpError, objectIdStr, optStr, str, type Ctx } from "./http";

const uidOf = (u: UserDoc) => u._id.toHexString();
const MAX_FRIENDS = 200;
const MAX_AVATAR_CHARS = 48_000; // data URI of a ~160px JPEG
export const AVATAR_COLORS = ["#9AD7F5", "#4E98C4", "#8FB2FF", "#7FE6EE", "#F7FBFF", "#1F4C8F", "#C9D6E8", "#5BE3A6"] as const;
export const INTEGRATIONS = ["github", "leetcode", "duolingo", "apple_health", "fitbit", "goodreads", "peloton", "spotify"] as const;

function defaultAvatar(username: string): Avatar {
  let h = 0;
  for (const ch of username) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { color: AVATAR_COLORS[h % AVATAR_COLORS.length] };
}

export const avatarOf = (u: Pick<UserDoc, "username" | "avatar">): Avatar => u.avatar ?? defaultAvatar(u.username);

export function relationOf(me: UserDoc, otherId: string): UserSummary["relation"] {
  if (uidOf(me) === otherId) return "self";
  if (me.friends?.includes(otherId)) return "friend";
  if (me.friendReqIn?.includes(otherId)) return "incoming";
  if (me.friendReqOut?.includes(otherId)) return "outgoing";
  return "none";
}

export const ratingOf = (u: Pick<UserDoc, "ratingSum" | "ratingCount">) => {
  const count = u.ratingCount ?? 0;
  return { avg: count ? Math.round(((u.ratingSum ?? 0) / count) * 10) / 10 : 0, count };
};

export function summary(u: UserDoc, viewer: UserDoc): UserSummary {
  return { id: uidOf(u), username: u.username, displayName: u.displayName, avatar: avatarOf(u), points: u.points, rating: ratingOf(u), relation: relationOf(viewer, uidOf(u)) };
}

async function usersById(ids: string[]): Promise<Map<string, UserDoc>> {
  const valid = [...new Set(ids)].filter((id) => /^[a-f0-9]{24}$/.test(id));
  if (valid.length === 0) return new Map();
  const { users } = await cols();
  const list = await users.find({ _id: { $in: valid.map((id) => new ObjectId(id)) } }, { projection: { sessions: 0, wallet: 0, strava: 0 } }).toArray();
  return new Map(list.map((u) => [uidOf(u), u]));
}

/** A friends-only challenge is visible to its players, the creator, anyone invited, and friends of any player. */
export function canSeeFriendsChallenge(ch: ChallengeDoc, user: UserDoc): boolean {
  const uid = uidOf(user);
  if (isParticipant(ch, uid) || ch.creatorId === uid) return true;
  if (user.invites?.some((i) => i.challengeId === ch._id.toHexString())) return true;
  const friends = new Set(user.friends ?? []);
  return friends.has(ch.creatorId) || ch.participants.some((p) => friends.has(p.userId));
}

export async function statsFor(userId: string): Promise<ProfileStats> {
  const { challenges } = await cols();
  const mine = await challenges
    .find({ "participants.userId": userId, status: { $in: ["active", "settling", "settled"] } }, { projection: { status: 1, settlement: 1, participants: 1, stakeLamports: 1 } })
    .limit(500)
    .toArray();
  const stats: ProfileStats = { played: 0, wins: 0, completed: 0, netLamports: 0, live: 0 };
  for (const c of mine) {
    if (c.status !== "settled") {
      stats.live++;
      continue;
    }
    stats.played++;
    if (c.participants.find((p) => p.userId === userId)?.completed) stats.completed++;
    if (c.settlement?.outcome !== "refund" && c.settlement?.winners.includes(userId)) stats.wins++;
    stats.netLamports += (c.settlement?.payouts.find((p) => p.userId === userId)?.lamports ?? 0) - c.stakeLamports;
  }
  return stats;
}

// ---------- profile ----------

export async function updateProfile(ctx: Ctx) {
  await rateLimit(`profile:${uidOf(ctx.user)}`, 30, 60);
  const b = ctx.body;
  const set: Partial<UserDoc> = {};
  if (b.displayName !== undefined) set.displayName = optStr(b.displayName, "Display name", 30) || undefined;
  if (b.bio !== undefined) set.bio = optStr(b.bio, "Bio", 160) || undefined;
  if (b.avatar !== undefined) {
    const a = b.avatar as Record<string, unknown> | null;
    if (!a || typeof a !== "object") throw new HttpError(400, "Avatar is invalid.");
    const color = typeof a.color === "string" && (AVATAR_COLORS as readonly string[]).includes(a.color) ? a.color : null;
    if (!color) throw new HttpError(400, "Pick one of the avatar colours.");
    const emoji = a.emoji === undefined || a.emoji === "" ? undefined : str(a.emoji, "Emoji", 1, 8);
    let image: string | undefined;
    if (a.image !== undefined && a.image !== null && a.image !== "") {
      if (typeof a.image !== "string" || !/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(a.image)) throw new HttpError(400, "Profile photo must be a JPEG or PNG.");
      if (a.image.length > MAX_AVATAR_CHARS) throw new HttpError(413, "That photo is too large. Try another one.");
      image = a.image;
    }
    set.avatar = { color, emoji, image };
  }
  const unset: Record<string, ""> = {};
  for (const k of ["displayName", "bio"] as const) if (k in set && set[k] === undefined) (delete set[k], (unset[k] = ""));
  const { users } = await cols();
  await users.updateOne({ _id: ctx.user._id }, { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) });
}

export async function toggleIntegrationInterest(ctx: Ctx) {
  const key = str(ctx.body.key, "Integration", 2, 30);
  if (!(INTEGRATIONS as readonly string[]).includes(key)) throw new HttpError(400, "Unknown integration.");
  const { users } = await cols();
  const on = ctx.user.integrationsWanted?.includes(key);
  await users.updateOne({ _id: ctx.user._id }, on ? { $pull: { integrationsWanted: key } } : { $addToSet: { integrationsWanted: key } });
}

export async function publicProfile(ctx: Ctx): Promise<PublicProfile> {
  const username = str(ctx.params.username, "Username", 3, 16).toLowerCase();
  const { users, challenges } = await cols();
  const u = await users.findOne({ username }, { projection: { sessions: 0, wallet: 0, strava: 0 } });
  if (!u) throw new HttpError(404, "No player with that username.");
  const id = uidOf(u);
  const viewer = ctx.user;
  const isFriend = relationOf(viewer, id) === "friend" || id === uidOf(viewer);
  const live = await challenges
    .find({ "participants.userId": id, status: "active", endsAt: { $gt: new Date() }, ...(isFriend ? {} : { visibility: "public" as const }) })
    .sort({ endsAt: 1 })
    .limit(10)
    .toArray();
  return {
    ...summary(u, viewer),
    bio: u.bio,
    stats: await statsFor(id),
    friendCount: u.friends?.length ?? 0,
    challenges: await Promise.all(live.map((c) => toView(c, viewer))),
  };
}

export async function searchUsers(ctx: Ctx): Promise<UserSummary[]> {
  await rateLimit(`usersearch:${uidOf(ctx.user)}`, 90, 60);
  const q = (ctx.query.get("q") ?? "").trim().toLowerCase().replace(/^@/, "").slice(0, 24);
  if (q.length < 1) return [];
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const { users } = await cols();
  // Matches the start of a username first, then anywhere in a username or display name.
  const list = await users
    .find({ $or: [{ username: { $regex: safe } }, { displayName: { $regex: safe, $options: "i" } }] }, { projection: { sessions: 0, wallet: 0, strava: 0 } })
    .limit(30)
    .toArray();
  const rank = (u: UserDoc) => (u.username.startsWith(q) ? 0 : u.username.includes(q) ? 1 : 2);
  return list
    .filter((u) => uidOf(u) !== uidOf(ctx.user))
    .sort((x, y) => rank(x) - rank(y) || x.username.localeCompare(y.username))
    .slice(0, 12)
    .map((u) => summary(u, ctx.user));
}

// ---------- friends ----------

export async function friendsView(user: UserDoc): Promise<FriendsView> {
  const { users } = await cols();
  const me = (await users.findOne({ _id: user._id })) ?? user;
  const inviteChallenges = await Promise.all(
    (me.invites ?? []).map((i) => getChallenge(i.challengeId).catch(() => null))
  );
  const byId = await usersById([...(me.friends ?? []), ...(me.friendReqIn ?? []), ...(me.friendReqOut ?? []), ...(me.invites ?? []).map((i) => i.fromId)]);
  const pick = (ids: string[] = []) => ids.map((id) => byId.get(id)).filter((u): u is UserDoc => !!u).map((u) => summary(u, me));
  const invites: FriendInvite[] = [];
  (me.invites ?? []).forEach((inv, i) => {
    const ch = inviteChallenges[i];
    const from = byId.get(inv.fromId);
    if (!ch || !from || ch.status !== "active" || ch.endsAt.getTime() <= Date.now() || isParticipant(ch, uidOf(me))) return;
    invites.push({ challengeId: inv.challengeId, title: ch.title, category: ch.category, stakeLamports: ch.stakeLamports, endsAt: ch.endsAt.toISOString(), from: summary(from, me), at: inv.at.toISOString() });
  });
  const friends = pick(me.friends).sort((a, b) => b.points - a.points);
  return { friends, incoming: pick(me.friendReqIn), outgoing: pick(me.friendReqOut), invites };
}

export const listFriends = (ctx: Ctx) => friendsView(ctx.user);

async function targetUser(ctx: Ctx): Promise<UserDoc> {
  const { users } = await cols();
  let other: UserDoc | null = null;
  if (typeof ctx.body.username === "string") other = await users.findOne({ username: str(ctx.body.username, "Username", 3, 16).toLowerCase() });
  else other = await users.findOne({ _id: new ObjectId(objectIdStr(ctx.body.userId, "User id")) });
  if (!other) throw new HttpError(404, "No player with that username.");
  if (uidOf(other) === uidOf(ctx.user)) throw new HttpError(400, "You can't add yourself — but we admire the confidence.");
  return other;
}

export async function requestFriend(ctx: Ctx) {
  const uid = uidOf(ctx.user);
  await rateLimit(`friendreq:${uid}`, 40, 3600);
  const other = await targetUser(ctx);
  const oid = uidOf(other);
  const { users } = await cols();
  const rel = relationOf(ctx.user, oid);
  if (rel === "friend") throw new HttpError(409, `You're already friends with ${other.username}.`);
  if ((ctx.user.friends?.length ?? 0) >= MAX_FRIENDS) throw new HttpError(409, `You can have up to ${MAX_FRIENDS} friends.`);
  if (rel === "incoming") return acceptPair(ctx.user._id, other._id); // they already asked: just become friends
  await users.updateOne({ _id: ctx.user._id }, { $addToSet: { friendReqOut: oid } });
  await users.updateOne({ _id: other._id }, { $addToSet: { friendReqIn: uid } });
  return friendsView(ctx.user);
}

async function acceptPair(meId: ObjectId, otherId: ObjectId) {
  const { users } = await cols();
  const a = meId.toHexString();
  const b = otherId.toHexString();
  await users.updateOne({ _id: meId }, { $addToSet: { friends: b }, $pull: { friendReqIn: b, friendReqOut: b } });
  await users.updateOne({ _id: otherId }, { $addToSet: { friends: a }, $pull: { friendReqIn: a, friendReqOut: a } });
  const me = await users.findOne({ _id: meId });
  return friendsView(me!);
}

export async function respondFriend(ctx: Ctx) {
  const other = await targetUser(ctx);
  const oid = uidOf(other);
  if (!ctx.user.friendReqIn?.includes(oid)) throw new HttpError(409, "That friend request is no longer open.");
  if (ctx.body.accept === true) return acceptPair(ctx.user._id, other._id);
  const { users } = await cols();
  await users.updateOne({ _id: ctx.user._id }, { $pull: { friendReqIn: oid } });
  await users.updateOne({ _id: other._id }, { $pull: { friendReqOut: uidOf(ctx.user) } });
  return friendsView(ctx.user);
}

/** Unfriend, or cancel a request you sent. */
export async function removeFriend(ctx: Ctx) {
  const other = await targetUser(ctx);
  const oid = uidOf(other);
  const uid = uidOf(ctx.user);
  const { users } = await cols();
  await users.updateOne({ _id: ctx.user._id }, { $pull: { friends: oid, friendReqOut: oid, friendReqIn: oid } });
  await users.updateOne({ _id: other._id }, { $pull: { friends: uid, friendReqIn: uid, friendReqOut: uid } });
  return friendsView(ctx.user);
}

// ---------- invites (collab on challenges) ----------

export async function sendInvites(ch: ChallengeDoc, from: UserDoc, ids: unknown) {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  if (ids.length > 30) throw new HttpError(400, "Invite up to 30 friends at a time.");
  const friends = new Set(from.friends ?? []);
  const targets = [...new Set(ids.filter((id): id is string => typeof id === "string" && friends.has(id)))].filter((id) => !isParticipant(ch, id));
  if (targets.length === 0) return 0;
  const { users } = await cols();
  const cid = ch._id.toHexString();
  await users.updateMany(
    { _id: { $in: targets.map((id) => new ObjectId(id)) }, "invites.challengeId": { $ne: cid } },
    { $push: { invites: { $each: [{ challengeId: cid, fromId: uidOf(from), at: new Date() }], $slice: -30 } } }
  );
  return targets.length;
}

export async function inviteToChallenge(ctx: Ctx) {
  await rateLimit(`invite:${uidOf(ctx.user)}`, 30, 3600);
  const ch = await getChallenge(objectIdStr(ctx.params.id, "Challenge id"));
  if (!isParticipant(ch, uidOf(ctx.user))) throw new HttpError(403, "Join this challenge before inviting friends.");
  if (ch.status !== "active" || ch.endsAt.getTime() <= Date.now()) throw new HttpError(409, "This challenge has already ended.");
  const sent = await sendInvites(ch, ctx.user, ctx.body.userIds);
  if (sent === 0) throw new HttpError(400, "Pick at least one friend who isn't already in.");
  return { sent };
}

export async function dismissInvite(ctx: Ctx) {
  const cid = objectIdStr(ctx.body.challengeId, "Challenge id");
  const { users } = await cols();
  await users.updateOne({ _id: ctx.user._id }, { $pull: { invites: { challengeId: cid } } });
  return friendsView(ctx.user);
}

export async function clearInvite(userId: ObjectId, challengeId: string) {
  const { users } = await cols();
  await users.updateOne({ _id: userId }, { $pull: { invites: { challengeId } } });
}

// ---------- feed ----------

export async function friendsFeed(ctx: Ctx): Promise<FeedView> {
  const me = ctx.user;
  const uid = uidOf(me);
  const friendIds = me.friends ?? [];
  if (friendIds.length === 0) return { live: [], activity: [] };
  const { challenges } = await cols();
  const recent = await challenges
    .find({ "participants.userId": { $in: friendIds }, status: { $ne: "banned" } })
    .sort({ createdAt: -1 })
    .limit(40)
    .toArray();
  const people = await usersById(recent.flatMap((c) => c.participants.map((p) => p.userId)));
  const friendSet = new Set(friendIds);
  const activity: ActivityItem[] = [];
  const push = (c: ChallengeDoc, userId: string, kind: ActivityItem["kind"], at: Date, lamports?: number) => {
    const u = people.get(userId);
    if (!u || !friendSet.has(userId)) return;
    activity.push({ id: `${c._id.toHexString()}:${userId}:${kind}`, kind, user: summary(u, me), challengeId: c._id.toHexString(), title: c.title, category: c.category, lamports, at: at.toISOString() });
  };
  for (const c of recent) {
    for (const p of c.participants) {
      if (p.stakeTxSig === "pending") continue;
      push(c, p.userId, p.userId === c.creatorId ? "created" : "joined", p.joinedAt, c.stakeLamports);
      if (c.status === "settled" && c.settlement) {
        const at = c.settlement.settledAt ?? c.endsAt;
        const paid = c.settlement.payouts.find((x) => x.userId === p.userId)?.lamports ?? 0;
        if (c.settlement.outcome !== "refund" && c.settlement.winners.includes(p.userId)) push(c, p.userId, "won", at, paid);
        else if (!p.completed && c.settlement.outcome !== "refund") push(c, p.userId, "fumbled", at, c.stakeLamports);
      } else if (p.completed && p.lastSyncedAt) push(c, p.userId, "completed", p.lastSyncedAt);
    }
  }
  activity.sort((a, b) => b.at.localeCompare(a.at));
  const liveDocs = recent.filter((c) => c.status === "active" && c.endsAt.getTime() > Date.now() && (c.visibility === "public" || canSeeFriendsChallenge(c, me)));
  liveDocs.sort((a, b) => Number(isParticipant(a, uid)) - Number(isParticipant(b, uid)) || a.endsAt.getTime() - b.endsAt.getTime());
  return { live: await Promise.all(liveDocs.slice(0, 15).map((c) => toView(c, me))), activity: activity.slice(0, 40) };
}

// ---------- ratings ----------

/**
 * After a challenge settles, each player (except its creator) rates the challenge 1-5 stars.
 * Those stars feed the creator's profile rating. Re-rating replaces your earlier stars.
 */
export async function rateChallenge(ctx: Ctx) {
  const uid = uidOf(ctx.user);
  await rateLimit(`rate:${uid}`, 60, 3600);
  const ch = await getChallenge(objectIdStr(ctx.params.id, "Challenge id"));
  const stars = ctx.body.stars;
  if (typeof stars !== "number" || !Number.isInteger(stars) || stars < 1 || stars > 5) throw new HttpError(400, "Stars must be a whole number from 1 to 5.");
  if (ch.status !== "settled") throw new HttpError(409, "You can rate a challenge once it's settled.");
  if (!ch.participants.some((p) => p.userId === uid && p.stakeTxSig !== "pending")) throw new HttpError(403, "Only players in this challenge can rate it.");
  if (ch.creatorId === uid) throw new HttpError(400, "You can't rate your own challenge — the players will.");

  const { challenges, users } = await cols();
  const creator = new ObjectId(ch.creatorId);
  const old = ch.ratings?.find((r) => r.from === uid);
  if (old) {
    const r = await challenges.updateOne(
      { _id: ch._id, ratings: { $elemMatch: { from: uid, stars: old.stars } } },
      { $set: { "ratings.$.stars": stars, "ratings.$.at": new Date() } }
    );
    if (r.modifiedCount === 1) await users.updateOne({ _id: creator }, { $inc: { ratingSum: stars - old.stars } });
  } else {
    const r = await challenges.updateOne({ _id: ch._id, "ratings.from": { $ne: uid } }, { $push: { ratings: { from: uid, stars, at: new Date() } } });
    if (r.modifiedCount === 1) await users.updateOne({ _id: creator }, { $inc: { ratingSum: stars, ratingCount: 1 } });
  }
  return toView(await getChallenge(ch._id.toHexString()), ctx.user, true);
}

/** Recently settled challenges you played in (but didn't create) and haven't rated yet. */
export async function pendingRatings(user: UserDoc): Promise<number> {
  const uid = uidOf(user);
  const { challenges } = await cols();
  return challenges.countDocuments({
    status: "settled",
    creatorId: { $ne: uid },
    participants: { $elemMatch: { userId: uid, stakeTxSig: { $ne: "pending" } } },
    "ratings.from": { $ne: uid },
    "settlement.settledAt": { $gt: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
  });
}
