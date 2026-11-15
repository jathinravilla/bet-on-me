// Quick live check of the coach and commentary prompts. Run: npx tsx --env-file=.env.local scripts/smoke-coach.ts
import { coachGoal, coachStake, commentate } from "../server/gemini";

async function main() {
const advice = await coachGoal({ category: "strava", title: "20 mile week", description: "", goal: "Run or walk 20 miles within 7 days", played: 3, completed: 1 });
console.log("coach:", advice, "stake ->", coachStake(advice.odds, 10_000_000, 100_000_000));
console.log("commentary:", await commentate({ title: "5K this weekend", outcome: "leader", winners: ["maya"], losers: ["leo", "sam"], pot: 150 }));
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
