// Challenge threads: comments with replies and @mentions, automatic bet updates, backing, nudges, pins,
// and the notifications they create. Everyone who can open a challenge can read and post in its thread.
import { ObjectId, type Filter } from "mongodb";
import type { BackingView, CommentAuthor, CommentView, NotificationView, ThreadEventView, ThreadItem, ThreadView } from "../lib/types";
import { getChallenge, isParticipant } from "./challenges";
import { cols, rateLimit, type ChallengeDoc, type NotificationDoc, type ThreadDoc, type UserDoc } from "./db";
import { postEvent } from "./events";
import { HttpError, objectIdStr, type Ctx } from "./http";
import { avatarOf, canSeeFriendsChallenge } from "./social";

const uidOf = (u: UserDoc) => u._id.toHexString();
const MAX_COMMENT = 280;
const PAGE = 30;
const REPORTS_TO_HIDE = 3;
const MAX_MENTIONS = 5;
const MAX_NOTIFICATIONS = 50;

// ---------- access ----------

const staked = (ch: ChallengeDoc, userId: string) => ch.participants.some((p) => p.userId === userId && p.stakeTxSig !== "pending");
const live = (ch: ChallengeDoc) => ch.status === "active" && ch.endsAt.getTime() > Date.now();

/** Same rule as the challenge page: friends-only threads are for players, invitees and friends of players. */
function canView(ch: ChallengeDoc, user: UserDoc) {
  if (ch.visibility === "friends" && !canSeeFriendsChallenge(ch, user)) return false;
  if (ch.status === "banned" && !isParticipant(ch, uidOf(user))) return false;
  return true;
}

async function viewable(id: unknown, user: UserDoc) {
  const ch = await getChallenge(objectIdStr(id, "Challenge id"));
  if (!canView(ch, user)) throw new HttpError(404, "Challenge not found.");
  return ch;
}

// ---------- moderation ----------

// Deliberately narrow: trash talk ("you're on fire", "I'll crush you") is the point of the thread.
// This only stops self-harm baiting, sharing contact details, and links (spam / phishing). Reports handle the rest.
const BLOCK: [RegExp, string][] = [
  [/\b(kys|kill (yo)?ur ?self|go die)\b/i, "That crosses the line. Keep it about the bet."],
  [/(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|gg|xyz|ru|ly)\b)/i, "Links aren't allowed in comments."],
  [/\b\d{3}[\s.-]?\d{3}[\s.-]?\d{4}\b/, "Don't share phone numbers in comments."],
  [/\b[^\s@]+@[^\s@]+\.[a-z]{2,}\b/i, "Don't share email addresses in comments."],
];
export function checkComment(text: string): string | null {
  for (const [re, why] of BLOCK) if (re.test(text)) return why;
  return null;
}

// ---------- views ----------

async function authors(ids: string[]): Promise<Map<string, UserDoc>> {
  const valid = [...new Set(ids)].filter((id) => /^[a-f0-9]{24}$/.test(id));
  if (valid.length === 0) return new Map();
  const { users } = await cols();
  const list = await users.find({ _id: { $in: valid.map((id) => new ObjectId(id)) } }, { projection: { username: 1, displayName: 1, avatar: 1 } }).toArray();
  return new Map(list.map((u) => [uidOf(u), u]));
}

const author = (id: string, fallbackName: string, people: Map<string, UserDoc>): CommentAuthor => {
  const u = people.get(id);
  return { id, username: u?.username ?? fallbackName, displayName: u?.displayName, avatar: u ? avatarOf(u) : avatarOf({ username: fallbackName }) };
};

function commentView(d: ThreadDoc, ch: ChallengeDoc, me: UserDoc, people: Map<string, UserDoc>): CommentView {
  const uid = uidOf(me);
  const mine = d.userId === uid;
  const removed = d.deleted ? "deleted" : d.hidden ? "hidden" : undefined;
  return {
    kind: "comment",
    id: d._id.toHexString(),
    author: author(d.userId!, d.username ?? "player", people),
    text: removed ? null : d.text ?? "",
    removed,
    replyTo: d.replyTo ? { id: d.replyTo, username: d.replyToUsername ?? "player" } : undefined,
    at: d.at.toISOString(),
    byCreator: d.userId === ch.creatorId,
    isPlayer: staked(ch, d.userId!),
    mine,
    canDelete: !removed && (mine || ch.creatorId === uid),
    canPin: !removed && ch.creatorId === uid,
    canReport: !removed && !mine,
    iReported: (d.reports ?? []).some((r) => r.userId === uid),
  };
}

const eventView = (d: ThreadDoc): ThreadEventView => ({ kind: "event", id: d._id.toHexString(), type: d.type!, text: d.text ?? "", at: d.at.toISOString() });

async function backingView(ch: ChallengeDoc, me: UserDoc): Promise<BackingView> {
  const uid = uidOf(me);
  // A backer who later joins the bet is a player now, not a spectator.
  const backers = (ch.backers ?? []).filter((b) => !isParticipant(ch, b.userId) && staked(ch, b.backs));
  const counts = new Map<string, number>();
  for (const b of backers) counts.set(b.backs, (counts.get(b.backs) ?? 0) + 1);
  const people = await authors([...counts.keys()]);
  const total = backers.length;
  const options = ch.participants
    .filter((p) => staked(ch, p.userId))
    .map((p) => ({ userId: p.userId, username: p.username, avatar: people.get(p.userId) ? avatarOf(people.get(p.userId)!) : undefined, count: counts.get(p.userId) ?? 0, pct: total ? Math.round(((counts.get(p.userId) ?? 0) / total) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);
  return { total, options, mine: backers.find((b) => b.userId === uid)?.backs ?? null, canBack: live(ch) && !isParticipant(ch, uid) && ch.participants.length > 1 };
}

/** GET /challenges/:id/thread?before=<itemId> — newest first. Opening the first page marks comments as read. */
export async function getThread(ctx: Ctx): Promise<ThreadView> {
  const ch = await viewable(ctx.params.id, ctx.user);
  const cid = ch._id.toHexString();
  const { threads, users } = await cols();
  const before = ctx.query.get("before");
  const filter: Filter<ThreadDoc> = { challengeId: cid };
  if (before) filter._id = { $lt: new ObjectId(objectIdStr(before, "Cursor")) };
  const docs = await threads.find(filter).sort({ _id: -1 }).limit(PAGE + 1).toArray();
  const page = docs.slice(0, PAGE);
  const pinnedDoc = ch.pinnedCommentId ? await threads.findOne({ _id: new ObjectId(ch.pinnedCommentId), challengeId: cid, kind: "comment" }) : null;
  const people = await authors([...page, ...(pinnedDoc ? [pinnedDoc] : [])].filter((d) => d.kind === "comment").map((d) => d.userId!));

  const items: ThreadItem[] = page.map((d) => (d.kind === "comment" ? commentView(d, ch, ctx.user, people) : eventView(d)));
  const count = ch.commentCount ?? 0;
  if (!before && (ctx.user.threadSeen?.[cid] ?? 0) !== count) {
    await users.updateOne({ _id: ctx.user._id }, { $set: { [`threadSeen.${cid}`]: count } });
  }
  const banners: ThreadEventView[] = [];
  const left = ch.endsAt.getTime() - Date.now();
  if (live(ch) && left < 3600_000) {
    banners.push({ kind: "event", id: `ending-${cid}`, type: "ending", text: `Ends in ${Math.max(1, Math.round(left / 60_000))} min — last chance to move up`, at: new Date().toISOString() });
  }
  const quip = ch.settlement?.commentary;
  if (ch.status === "settled" && quip) {
    banners.push({ kind: "event", id: `coach-${cid}`, type: "coach", text: `Coach: ${quip.winner}`, at: (ch.settlement?.settledAt ?? ch.endsAt).toISOString() });
  }
  return {
    items,
    banners,
    nextBefore: docs.length > PAGE ? page[page.length - 1]._id.toHexString() : undefined,
    pinned: pinnedDoc && !pinnedDoc.deleted && !pinnedDoc.hidden ? commentView(pinnedDoc, ch, ctx.user, people) : undefined,
    backing: await backingView(ch, ctx.user),
    canComment: ch.status !== "banned",
    commentCount: count,
  };
}

// ---------- notifications ----------

async function notify(userIds: string[], n: Omit<NotificationDoc, "id" | "at" | "seen">) {
  if (userIds.length === 0) return;
  const { users } = await cols();
  await users.updateMany(
    { _id: { $in: userIds.map((id) => new ObjectId(id)) } },
    { $push: { notifications: { $each: [{ ...n, id: new ObjectId().toHexString(), at: new Date(), seen: false }], $slice: -MAX_NOTIFICATIONS } } }
  );
}

/** Mentioned users who exist, aren't you, and are allowed to see this challenge. */
async function mentionTargets(text: string, ch: ChallengeDoc, me: UserDoc): Promise<string[]> {
  const names = [...new Set([...text.matchAll(/@([a-z0-9_]{3,16})\b/gi)].map((m) => m[1].toLowerCase()))].filter((n) => n !== me.username).slice(0, MAX_MENTIONS);
  if (names.length === 0) return [];
  const { users } = await cols();
  const found = await users.find({ username: { $in: names } }, { projection: { friends: 1, invites: 1, username: 1 } }).toArray();
  return found.filter((u) => canView(ch, u as UserDoc)).map(uidOf);
}

// ---------- comments ----------

/** POST /challenges/:id/comments { text, replyTo? } */
export async function postComment(ctx: Ctx): Promise<CommentView> {
  const uid = uidOf(ctx.user);
  await rateLimit(`comment:${uid}`, 8, 60);
  await rateLimit(`comment-h:${uid}`, 120, 3600);
  const ch = await viewable(ctx.params.id, ctx.user);
  if (ch.status === "banned") throw new HttpError(409, "This challenge was removed.");
  const raw = typeof ctx.body.text === "string" ? ctx.body.text.replace(/\s+\n/g, "\n").trim() : "";
  if (raw.length < 1) throw new HttpError(400, "Write something first.");
  if (raw.length > MAX_COMMENT) throw new HttpError(400, `Keep comments under ${MAX_COMMENT} characters.`);
  const blocked = checkComment(raw);
  if (blocked) throw new HttpError(422, blocked);

  const { threads, challenges, users } = await cols();
  const cid = ch._id.toHexString();
  let parent: ThreadDoc | null = null;
  if (ctx.body.replyTo !== undefined && ctx.body.replyTo !== null) {
    parent = await threads.findOne({ _id: new ObjectId(objectIdStr(ctx.body.replyTo, "Reply")), challengeId: cid, kind: "comment" });
    if (!parent || parent.deleted || parent.hidden) throw new HttpError(404, "That comment is no longer available.");
  }
  const doc: ThreadDoc = {
    _id: new ObjectId(),
    challengeId: cid,
    kind: "comment",
    at: new Date(),
    userId: uid,
    username: ctx.user.username,
    text: raw,
    ...(parent ? { replyTo: parent._id.toHexString(), replyToUsername: parent.username } : {}),
  };
  await threads.insertOne(doc);
  const updated = await challenges.findOneAndUpdate({ _id: ch._id }, { $inc: { commentCount: 1 } }, { returnDocument: "after" });
  // Your own comment never shows up as unread for you.
  await users.updateOne({ _id: ctx.user._id }, { $set: { [`threadSeen.${cid}`]: updated?.commentCount ?? 1 } });

  const excerpt = raw.slice(0, 120);
  const mentioned = await mentionTargets(raw, ch, ctx.user);
  await notify(mentioned, { kind: "mention", challengeId: cid, commentId: doc._id.toHexString(), fromId: uid, text: excerpt });
  if (parent?.userId && parent.userId !== uid && !mentioned.includes(parent.userId)) {
    await notify([parent.userId], { kind: "reply", challengeId: cid, commentId: doc._id.toHexString(), fromId: uid, text: excerpt });
  }
  return commentView(doc, updated ?? ch, ctx.user, await authors([uid]));
}

async function commentInChallenge(ctx: Ctx) {
  const { threads } = await cols();
  const c = await threads.findOne({ _id: new ObjectId(objectIdStr(ctx.params.commentId, "Comment")), kind: "comment" });
  if (!c) throw new HttpError(404, "Comment not found.");
  const ch = await viewable(c.challengeId, ctx.user); // you can only act on comments in threads you can see
  return { c, ch };
}

/** POST /comments/:commentId/delete — your own, or any comment on a challenge you created. */
export async function deleteComment(ctx: Ctx) {
  const { c, ch } = await commentInChallenge(ctx);
  const uid = uidOf(ctx.user);
  if (c.userId !== uid && ch.creatorId !== uid) throw new HttpError(403, "You can only delete your own comments.");
  const { threads, challenges } = await cols();
  await threads.updateOne({ _id: c._id }, { $set: { deleted: true }, $unset: { text: "" } });
  await challenges.updateOne({ _id: ch._id, pinnedCommentId: c._id.toHexString() }, { $unset: { pinnedCommentId: "" } });
  return { ok: true };
}

/** POST /comments/:commentId/report — hidden for everyone after 3 reports. */
export async function reportComment(ctx: Ctx) {
  const uid = uidOf(ctx.user);
  await rateLimit(`creport:${uid}`, 20, 3600);
  const { c, ch } = await commentInChallenge(ctx);
  if (c.userId === uid) throw new HttpError(400, "You can't report your own comment.");
  const { threads, challenges } = await cols();
  const r = await threads.updateOne({ _id: c._id, "reports.userId": { $ne: uid } }, { $push: { reports: { userId: uid, at: new Date() } } });
  if (r.modifiedCount !== 1) throw new HttpError(409, "You've already reported this comment.");
  const fresh = await threads.findOne({ _id: c._id });
  if ((fresh?.reports?.length ?? 0) >= REPORTS_TO_HIDE) {
    await threads.updateOne({ _id: c._id }, { $set: { hidden: true } });
    await challenges.updateOne({ _id: ch._id, pinnedCommentId: c._id.toHexString() }, { $unset: { pinnedCommentId: "" } });
  }
  return { ok: true };
}

/** POST /challenges/:id/pin { commentId | null } — creator only. */
export async function pinComment(ctx: Ctx) {
  const ch = await viewable(ctx.params.id, ctx.user);
  if (ch.creatorId !== uidOf(ctx.user)) throw new HttpError(403, "Only the creator can pin comments.");
  const { threads, challenges } = await cols();
  if (ctx.body.commentId === null) {
    await challenges.updateOne({ _id: ch._id }, { $unset: { pinnedCommentId: "" } });
    return { ok: true };
  }
  const id = objectIdStr(ctx.body.commentId, "Comment");
  const c = await threads.findOne({ _id: new ObjectId(id), challengeId: ch._id.toHexString(), kind: "comment" });
  if (!c || c.deleted || c.hidden) throw new HttpError(404, "Comment not found.");
  await challenges.updateOne({ _id: ch._id }, { $set: { pinnedCommentId: id } });
  return { ok: true };
}

// ---------- backing & nudges ----------

/** POST /challenges/:id/back { userId | null } — spectators pick who they think wins. No money moves. */
export async function backPlayer(ctx: Ctx) {
  const uid = uidOf(ctx.user);
  await rateLimit(`back:${uid}`, 30, 3600);
  const ch = await viewable(ctx.params.id, ctx.user);
  if (!live(ch)) throw new HttpError(409, "This challenge has ended.");
  if (isParticipant(ch, uid)) throw new HttpError(409, "You're playing in this one — back yourself!");
  const { challenges } = await cols();
  await challenges.updateOne({ _id: ch._id }, { $pull: { backers: { userId: uid } } });
  if (ctx.body.userId !== null) {
    const target = objectIdStr(ctx.body.userId, "Player");
    const p = ch.participants.find((x) => x.userId === target && x.stakeTxSig !== "pending");
    if (!p) throw new HttpError(404, "That player isn't in this challenge.");
    await challenges.updateOne({ _id: ch._id }, { $push: { backers: { userId: uid, backs: target, at: new Date() } } });
    await postEvent(ch._id.toHexString(), `backed:${uid}:${target}`, "backed", `${ctx.user.username} is backing ${p.username}`);
  }
  return backingView(await getChallenge(ch._id.toHexString()), ctx.user);
}

/** POST /challenges/:id/nudge { userId } — one nudge per player, per day, between players of a live bet. */
export async function nudgePlayer(ctx: Ctx) {
  const uid = uidOf(ctx.user);
  await rateLimit(`nudge:${uid}`, 20, 3600);
  const ch = await viewable(ctx.params.id, ctx.user);
  if (!live(ch)) throw new HttpError(409, "This challenge has ended.");
  if (!staked(ch, uid)) throw new HttpError(403, "Only players can nudge each other.");
  const target = objectIdStr(ctx.body.userId, "Player");
  if (target === uid) throw new HttpError(400, "You can't nudge yourself.");
  const p = ch.participants.find((x) => x.userId === target && x.stakeTxSig !== "pending");
  if (!p) throw new HttpError(404, "That player isn't in this challenge.");
  if (p.completed) throw new HttpError(409, `${p.username} already hit the goal.`);
  const day = new Date().toISOString().slice(0, 10);
  const posted = await postEvent(ch._id.toHexString(), `nudge:${uid}:${target}:${day}`, "nudge", `${ctx.user.username} nudged ${p.username} — your move`);
  if (!posted) throw new HttpError(429, `You already nudged ${p.username} today.`);
  await notify([target], { kind: "nudge", challengeId: ch._id.toHexString(), fromId: uid, text: ch.title });
  return { ok: true };
}

// ---------- notifications inbox ----------

/** GET /notifications — newest first, with the challenge each one belongs to. */
export async function listNotifications(ctx: Ctx): Promise<NotificationView[]> {
  const list = [...(ctx.user.notifications ?? [])].reverse();
  if (list.length === 0) return [];
  const { challenges } = await cols();
  const ids = [...new Set(list.map((n) => n.challengeId))].filter((id) => /^[a-f0-9]{24}$/.test(id));
  const chs = await challenges.find({ _id: { $in: ids.map((id) => new ObjectId(id)) } }, { projection: { title: 1, visibility: 1, creatorId: 1, participants: 1, status: 1 } }).toArray();
  const byId = new Map(chs.map((c) => [c._id.toHexString(), c as ChallengeDoc]));
  const people = await authors(list.map((n) => n.fromId));
  return list
    .filter((n) => {
      const ch = byId.get(n.challengeId);
      return ch && canView(ch, ctx.user); // e.g. you unfriended them since
    })
    .map((n) => ({ id: n.id, kind: n.kind, challengeId: n.challengeId, challengeTitle: byId.get(n.challengeId)!.title, from: author(n.fromId, "player", people), text: n.text, at: n.at.toISOString(), seen: n.seen }));
}

/** POST /notifications/read — marks everything seen (the inbox was opened). */
export async function readNotifications(ctx: Ctx) {
  const { users } = await cols();
  if ((ctx.user.notifications ?? []).some((n) => !n.seen)) {
    await users.updateOne({ _id: ctx.user._id }, { $set: { "notifications.$[n].seen": true } }, { arrayFilters: [{ "n.seen": false }] });
  }
  return { ok: true };
}

export const unseenNotifications = (u: UserDoc) => (u.notifications ?? []).filter((n) => !n.seen).length;
