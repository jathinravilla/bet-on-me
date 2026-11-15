// Search (MongoDB Atlas Search), "bets like this" and Butterfingers' coaching and commentary.
import type { Collection } from "mongodb";
import type { ChallengeDoc } from "./db";
import { cols, rateLimit, type UserDoc } from "./db";
import { balance } from "./chain";
import { coachGoal, coachStake, commentate, type CoachAdvice, type Commentary } from "./gemini";
import { HttpError, type Ctx, oneOf, str } from "./http";
import { MIN_STAKE_LAMPORTS, tierFor } from "../lib/rules";

const INDEX = "challenge_search";
const COIN = 1_000_000;
const timeout = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

// ---------- Atlas Search ----------

let indexState: "unknown" | "ready" | "unavailable" = "unknown";
let lastCheck = 0;

/** Create the Atlas Search index once (a no-op if it exists) and report whether it can be queried yet. */
async function atlasReady(col: Collection<ChallengeDoc>): Promise<boolean> {
  if (indexState === "unavailable" && Date.now() - lastCheck < 5 * 60_000) return false;
  if (indexState === "ready") return true;
  lastCheck = Date.now();
  try {
    const existing = await timeout(col.listSearchIndexes(INDEX).toArray(), 4000);
    if (existing.length === 0) {
      await timeout(
        col.createSearchIndex({
          name: INDEX,
          definition: { mappings: { dynamic: false, fields: { title: { type: "string" }, description: { type: "string" }, dareText: { type: "string" }, creatorUsername: { type: "string" } } } },
        }),
        6000
      );
      indexState = "unknown"; // building; try again on the next search
      return false;
    }
    if ((existing[0] as { queryable?: boolean }).queryable) {
      indexState = "ready";
      return true;
    }
    return false;
  } catch {
    indexState = "unavailable"; // not Atlas (e.g. local test database) or still starting
    return false;
  }
}

const visible = { visibility: "public", status: { $in: ["active", "settled"] } } as const;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface SearchOut {
  docs: ChallengeDoc[];
  engine: "atlas" | "basic";
}

export async function searchPublic(q: string): Promise<SearchOut> {
  const { challenges } = await cols();
  if (await atlasReady(challenges)) {
    try {
      const docs = await challenges
        .aggregate<ChallengeDoc>([
          {
            $search: {
              index: INDEX,
              compound: {
                should: [
                  { text: { query: q, path: "title", fuzzy: { maxEdits: 1 }, score: { boost: { value: 3 } } } },
                  { text: { query: q, path: ["description", "dareText", "creatorUsername"], fuzzy: { maxEdits: 1 } } },
                ],
                minimumShouldMatch: 1,
              },
            },
          },
          { $match: visible },
          { $limit: 20 },
        ])
        .toArray();
      if (docs.length > 0) return { docs, engine: "atlas" };
    } catch (e) {
      console.error("atlas search failed:", e instanceof Error ? e.message : e);
      indexState = "unavailable";
    }
  }
  // Fallback while the index is still building: a plain case-insensitive match.
  const re = new RegExp(esc(q), "i");
  const docs = await challenges
    .find({ ...visible, $or: [{ title: re }, { description: re }, { dareText: re }, { creatorUsername: re }] })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();
  return { docs, engine: "basic" };
}

/** Public bets similar to this one, ranked by Atlas Search "more like this". */
export async function similarTo(ch: ChallengeDoc): Promise<ChallengeDoc[]> {
  const { challenges } = await cols();
  if (!(await atlasReady(challenges))) return [];
  try {
    return await challenges
      .aggregate<ChallengeDoc>([
        { $search: { index: INDEX, moreLikeThis: { like: [{ title: ch.title, description: ch.description, dareText: ch.dareText ?? "" }] } } },
        { $match: { ...visible, _id: { $ne: ch._id }, category: ch.category } },
        { $limit: 4 },
      ])
      .toArray();
  } catch {
    return [];
  }
}

// ---------- Butterfingers the coach ----------

export interface CoachOut extends CoachAdvice {
  suggestedStakeLamports: number;
}

function goalText(b: { category: string; mode: string; target?: number; chessTimeControl?: string; dareText?: string; durationMinutes: number }): string {
  const days = Math.max(1, Math.round(b.durationMinutes / 1440));
  const span = b.durationMinutes < 1440 ? `${b.durationMinutes} minutes` : `${days} day${days === 1 ? "" : "s"}`;
  if (b.category === "dare") return `Complete this dare within ${span}: ${b.dareText ?? ""}`;
  if (b.category === "strava") return b.mode === "target" ? `Run or walk ${b.target} miles within ${span}` : `Log the most running miles within ${span}, competing against friends`;
  return b.mode === "target" ? `Reach a ${b.target} ${b.chessTimeControl ?? "rapid"} chess.com rating within ${span}` : `Gain the most ${b.chessTimeControl ?? "rapid"} chess.com rating within ${span}, competing against friends`;
}

export async function coach(ctx: Ctx): Promise<CoachOut> {
  const user: UserDoc = ctx.user;
  const uid = user._id.toHexString();
  await rateLimit(`coach:${uid}`, 20, 3600);
  const b = ctx.body;
  const category = oneOf(b.category, "Category", ["strava", "chess", "dare"] as const);
  const mode = category === "dare" ? "target" : oneOf(b.mode, "Mode", ["target", "open"] as const);
  const title = str(b.title ?? "My challenge", "Title", 1, 60);
  const description = typeof b.description === "string" ? b.description.slice(0, 280) : "";
  const duration = typeof b.durationMinutes === "number" && Number.isFinite(b.durationMinutes) ? Math.max(1, Math.min(43200, Math.round(b.durationMinutes))) : 10080;
  const target = typeof b.target === "number" && Number.isFinite(b.target) ? b.target : undefined;
  const dareText = typeof b.dareText === "string" ? b.dareText.slice(0, 200) : undefined;
  const chessTimeControl = typeof b.chessTimeControl === "string" ? b.chessTimeControl.slice(0, 10) : undefined;

  const { challenges } = await cols();
  const past = await challenges.find({ status: "settled", "participants.userId": uid }).sort({ endsAt: -1 }).limit(40).project<Pick<ChallengeDoc, "participants">>({ participants: 1 }).toArray();
  const played = past.length;
  const completed = past.filter((c) => c.participants.find((p) => p.userId === uid)?.completed).length;

  let advice: CoachAdvice;
  try {
    advice = await coachGoal({ category, title, description, goal: goalText({ category, mode, target, chessTimeControl, dareText, durationMinutes: duration }), played, completed });
  } catch (e) {
    console.error("coach failed:", e instanceof Error ? e.message : e);
    throw new HttpError(502, "Butterfingers is busy right now. You can still pick a stake yourself.");
  }
  const bal = await balance(user.wallet.publicKey).catch(() => 0);
  const max = Math.max(MIN_STAKE_LAMPORTS, Math.min(tierFor(user.points).current.maxStakeLamports, Math.floor(bal / COIN) * COIN));
  return { ...advice, suggestedStakeLamports: coachStake(advice.odds, MIN_STAKE_LAMPORTS, max) };
}

// ---------- Butterfingers the commentator ----------

/** Two lines about how a settled challenge ended. Generated once, then stored on the challenge. */
export async function commentaryFor(ch: ChallengeDoc): Promise<Commentary | null> {
  const s = ch.settlement;
  if (!s || ch.status !== "settled") return null;
  if (s.commentary) return { winner: s.commentary.winner, loser: s.commentary.loser };
  const winners = ch.participants.filter((p) => s.winners.includes(p.userId)).map((p) => p.username);
  const losers = ch.participants.filter((p) => !s.winners.includes(p.userId)).map((p) => p.username);
  let c: Commentary;
  try {
    c = await commentate({ title: ch.title, outcome: s.outcome, winners, losers, pot: Math.round((ch.stakeLamports * ch.participants.length) / COIN) });
  } catch (e) {
    console.error("commentary failed:", e instanceof Error ? e.message : e);
    return null; // the card simply shows without a quote
  }
  const { challenges } = await cols();
  await challenges.updateOne({ _id: ch._id, "settlement.commentary": { $exists: false } }, { $set: { "settlement.commentary": { ...c, generatedAt: new Date() } } });
  return c;
}
