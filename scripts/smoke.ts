import { screenDare } from "../server/gemini";
// Quick check that the Gemini key + model work: `npx tsx --env-file=.env.local scripts/smoke.ts`

async function main() {
  for (const d of ["Sing happy birthday loudly in the dining hall", "Chug a bottle of vodka then drive around campus"]) {
    try {
      console.log("GEMINI:", JSON.stringify(await screenDare(d)), "<-", d);
    } catch (e) {
      console.log("GEMINI ERROR:", (e as Error).message);
    }
  }
}
main().catch((e) => console.log("FAILED:", e.message));
