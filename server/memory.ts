// Butterfingers' memory of each player, kept in Supermemory (supermemory.ai).
// Everything here is best-effort: if the key is missing, Supermemory is slow, or it errors, we return nothing and
// the coach carries on with the plain history counted from our own database. It can never block a bet or a payout.
import { Supermemory } from "supermemory";
import type { Category } from "../lib/types";
import type { ChallengeDoc } from "./db";

const COIN = 1_000_000; // lamports per in-app coin
const RECALL_TIMEOUT_MS = 3500;
const SAVE_TIMEOUT_MS = 3500;

let client: Supermemory | null | undefined;
/** Lazily built so tests and local runs without a key simply have no memory. */
function sm(): Supermemory | null {
  if (client !== undefined) return client;
  const apiKey = process.env.SUPERMEMORY_API_KEY;
  client = apiKey ? new Supermemory({ apiKey, timeoutInSeconds: 4, maxRetries: 0 }) : null;
  return client;
}
export const memoryEnabled = () => sm() !== null;

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("supermemory timed out")), ms))]);

const GOAL_WORD: Record<Category, string> = { strava: "running", chess: "chess", dare: "dare", github: "GitHub", duolingo: "Duolingo" };

/** One short, plain sentence about how a finished bet went for one player. No name, no email: the player id is the namespace. */
export function memorySentence(ch: Pick<ChallengeDoc, "title" | "category" | "mode" | "target" | "stakeLamports" | "participants" | "settlement">, userId: string): string | null {
  const me = ch.participants.find((p) => p.userId === userId);
  const s = ch.settlement;
  if (!me || !s) return null;
  const stake = Math.round(ch.stakeLamports / COIN);
  const rivals = ch.participants.length - 1;
  const result =
    s.outcome === "refund"
      ? "it was refunded (nobody finished or it was cancelled)"
      : s.winners.includes(userId)
        ? me.completed
          ? "hit the goal and won a share of the pot"
          : "ended in the lead and won a share of the pot"
        : me.completed
          ? "hit the goal but did not win the pot"
          : "missed the goal and lost the stake";
  const goal = ch.mode === "open" ? "most-progress bet" : ch.target ? `goal of ${ch.target}` : "goal bet";
  const field = rivals > 0 ? `against ${rivals} other player${rivals === 1 ? "" : "s"}` : "solo";
  return `The player took a ${GOAL_WORD[ch.category]} ${goal} ("${ch.title.slice(0, 50)}"), staking ${stake} coins ${field}, and ${result}.`;
}

/** When a challenge settles, save one memory per player. Never throws. */
export async function rememberSettled(ch: ChallengeDoc): Promise<void> {
  const c = sm();
  if (!c || ch.settlement?.finalStatus !== "settled") return;
  const id = ch._id.toHexString();
  await Promise.allSettled(
    ch.participants.map(async (p) => {
      const content = memorySentence(ch, p.userId);
      if (!content) return;
      await withTimeout(
        c.add(p.userId, { content, id: `bet-${id}`, metadata: { kind: "bet-result", category: ch.category, outcome: ch.settlement!.outcome, challengeId: id }, dreaming: "instant" }),
        SAVE_TIMEOUT_MS
      );
    })
  ).then((rs) => {
    const failed = rs.filter((r) => r.status === "rejected").length;
    if (failed) console.error(`supermemory: ${failed} memory save(s) failed for challenge ${id}`);
  });
}

/** Save a player's earlier finished bets (from before memory existed) once, in one batch. Never throws. */
export async function backfill(userId: string, past: ChallengeDoc[]): Promise<boolean> {
  const c = sm();
  if (!c || past.length === 0) return false;
  const documents = past.flatMap((ch) => {
    const content = memorySentence(ch, userId);
    return content ? [{ content, id: `bet-${ch._id.toHexString()}`, metadata: { kind: "bet-result", category: ch.category, outcome: ch.settlement?.outcome ?? "unknown", challengeId: ch._id.toHexString() } }] : [];
  });
  if (documents.length === 0) return false;
  try {
    await withTimeout(c.documents.batchAdd(userId, { documents }), SAVE_TIMEOUT_MS);
    return true;
  } catch (e) {
    console.error("supermemory backfill failed:", e instanceof Error ? e.message : e);
    return false;
  }
}

/** What Butterfingers remembers that is relevant to this new bet: a few plain sentences, or [] if none/unavailable. */
export async function recall(userId: string, about: string): Promise<string[]> {
  const c = sm();
  if (!c) return [];
  try {
    const [prof, found] = await withTimeout(
      Promise.all([
        c.profile(userId).catch(() => null),
        c.search(userId, { query: about.slice(0, 300), limit: 6, searchMode: "hybrid" }).catch(() => null),
      ]),
      RECALL_TIMEOUT_MS
    );
    const lines: string[] = [];
    for (const m of prof?.profile?.static ?? []) if (m?.memory) lines.push(m.memory);
    for (const m of prof?.profile?.dynamic ?? []) if (m?.memory) lines.push(m.memory);
    for (const r of found?.results ?? []) {
      const text = (r as { memory?: string; chunk?: string }).memory ?? (r as { chunk?: string }).chunk;
      if (text) lines.push(text);
    }
    return [...new Set(lines.map((l) => l.trim().slice(0, 240)))].slice(0, 8);
  } catch (e) {
    console.error("supermemory recall failed:", e instanceof Error ? e.message : e);
    return [];
  }
}
