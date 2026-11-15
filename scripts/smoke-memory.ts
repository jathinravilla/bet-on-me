// Live check of Butterfingers' memory with a throwaway player id. Run: npx tsx --env-file=.env.local scripts/smoke-memory.ts
// Saves two bet sentences, waits for Supermemory to process them, recalls them, asks the coach, then deletes the test player.
import { Supermemory } from "supermemory";
import { coachGoal } from "../server/gemini";
import { memorySentence, recall } from "../server/memory";
import type { ChallengeDoc } from "../server/db";

const ns = `smoke-${Date.now()}`;
const mk = (title: string, hit: boolean): ChallengeDoc =>
  ({
    _id: { toHexString: () => `${ns}-${title.length}` },
    title,
    category: "strava",
    mode: "target",
    target: 10,
    stakeLamports: 50_000_000,
    participants: [{ userId: "me", username: "me", completed: hit }, { userId: "f", username: "f", completed: true }],
    settlement: { winners: hit ? ["me"] : ["f"], payouts: [], reason: "", outcome: "split", finalStatus: "settled" },
  }) as unknown as ChallengeDoc;

async function main() {
  const sm = new Supermemory({ apiKey: process.env.SUPERMEMORY_API_KEY! });
  const bets = [mk("Sunrise 10 miler", false), mk("Weekend long run", false)];
  for (const [i, b] of bets.entries()) {
    const content = memorySentence(b, "me")!;
    console.log("saving:", content);
    await sm.add(ns, { content, id: `bet-${ns}-${i}`, metadata: { kind: "bet-result" }, dreaming: "instant" });
  }
  let got: string[] = [];
  for (let i = 0; i < 12 && got.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    got = await recall(ns, "strava 10 mile running goal");
    console.log(`recall attempt ${i + 1}:`, got.length, "lines");
  }
  console.log("recalled:", got);
  const advice = await coachGoal({ category: "strava", title: "Run 10 miles", description: "", goal: "Run or walk 10 miles within 7 days", played: 2, completed: 0, memories: got });
  console.log("coach:", advice);
  await sm.namespaces.delete(ns, {}).then(() => console.log("cleaned up test player"), (e) => console.log("cleanup:", e instanceof Error ? e.message : e));
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
