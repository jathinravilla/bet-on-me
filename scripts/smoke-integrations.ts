// Live check that the GitHub and Duolingo readers still work (they use unofficial public pages).
//   npx tsx scripts/smoke-integrations.ts [githubUser] [duolingoUser]
import { duolingoProfile, githubContributionsSince, githubDays, githubWindowStart } from "../server/external";

async function main() {
  const gh = process.argv[2] ?? "torvalds";
  const duo = process.argv[3] ?? "luis";
  const days = await githubDays(gh);
  if (days === null || days === "missing") {
    console.log(`GitHub ${gh}: ${days ?? "no answer"}`);
    process.exitCode = 1;
  } else {
    const sorted = [...days.keys()].sort();
    const week = await githubContributionsSince(gh, githubWindowStart(new Date(Date.now() - 6 * 24 * 3600 * 1000)));
    console.log(`GitHub ${gh}: ${days.size} days (${sorted[0]} → ${sorted.at(-1)}), ${[...days.values()].reduce((a, b) => a + b, 0)} in the year, ${week} in the last ~week`);
  }
  const p = await duolingoProfile(duo);
  console.log(`Duolingo ${duo}:`, p ?? "no answer");
  if (p === null) process.exitCode = 1;
}
void main();
