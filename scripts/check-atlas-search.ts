// Creates the Atlas Search index on your cluster (if missing) and waits until a query uses it.
// Run: npx tsx --env-file=.env.local scripts/check-atlas-search.ts
import { searchPublic } from "../server/extras";

async function main() {
  for (let i = 0; i < 24; i++) {
    const r = await searchPublic("sunrise");
    console.log(`try ${i + 1}: engine=${r.engine}, results=${r.docs.length}`);
    if (r.engine === "atlas") return console.log("Atlas Search is live.");
    await new Promise((res) => setTimeout(res, 5000));
  }
  console.log("Index still building (or no matching public bets yet). The app falls back to a basic match meanwhile.");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
