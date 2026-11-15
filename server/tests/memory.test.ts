// Butterfingers' memory: the sentences we save about finished bets, and the "no key, no problem" behavior.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import type { ChallengeDoc } from "../db";

delete process.env.SUPERMEMORY_API_KEY; // these tests never touch the real service

const part = (userId: string, completed: boolean) => ({ userId, username: userId, joinedAt: new Date(), stakeTxSig: "x", progress: 0, completed });
const bet = (over: Partial<ChallengeDoc> = {}): ChallengeDoc =>
  ({
    _id: new ObjectId(),
    title: "Morning 5K streak",
    category: "strava",
    mode: "target",
    target: 5,
    stakeLamports: 50_000_000,
    participants: [part("u1", true), part("u2", false)],
    settlement: { winners: ["u1"], payouts: [], reason: "", outcome: "split", finalStatus: "settled" },
    ...over,
  }) as unknown as ChallengeDoc;

test("memory sentences say what happened, with no names", async () => {
  const { memorySentence } = await import("../memory.js");
  const ch = bet();
  const win = memorySentence(ch, "u1")!;
  assert.match(win, /running goal of 5/);
  assert.match(win, /staking 50 coins against 1 other player/);
  assert.match(win, /hit the goal and won/);
  assert.match(memorySentence(ch, "u2")!, /missed the goal and lost the stake/);
  assert.ok(!win.includes("u1") && !win.includes("u2")); // usernames are never sent
  assert.match(memorySentence(bet({ settlement: { winners: [], payouts: [], reason: "", outcome: "refund", finalStatus: "settled" } }), "u1")!, /refunded/);
  assert.match(memorySentence(bet({ mode: "open", participants: [part("u1", false)] }), "u1")!, /most-progress bet.*solo/);
  assert.equal(memorySentence(ch, "stranger"), null); // only players get a memory
});

test("without a Supermemory key nothing breaks and nothing is sent", async () => {
  const m = await import("../memory.js");
  assert.equal(m.memoryEnabled(), false);
  assert.deepEqual(await m.recall("u1", "running"), []);
  assert.equal(await m.backfill("u1", [bet()]), false);
  await m.rememberSettled(bet()); // resolves quietly
});
