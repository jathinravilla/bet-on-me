// Automatic bet updates in a challenge's thread ("maya logged +2.3 mi", "leo joined").
// Best effort: an update failing to post must never break a join, a sync or a payout,
// and each update has a deterministic key so retries and repeated syncs never post it twice.
import { ObjectId } from "mongodb";
import type { ThreadEventType } from "../lib/types";
import { cols } from "./db";

export async function postEvent(challengeId: string, key: string, type: ThreadEventType, text: string): Promise<boolean> {
  try {
    const { threads } = await cols();
    await threads.insertOne({ _id: new ObjectId(), challengeId, kind: "event", at: new Date(), key: `${challengeId}:${key}`, type, text: text.slice(0, 200) });
    return true;
  } catch (e) {
    if ((e as { code?: number }).code !== 11000) console.error("thread event failed:", e instanceof Error ? e.message : e);
    return false; // 11000 = already posted
  }
}

const fmtMiles = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const coinsOf = (lamports: number) => Math.floor(lamports / 1_000_000).toLocaleString("en-US");
export const fmt = { miles: fmtMiles, coins: coinsOf };
