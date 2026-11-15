// Adds a few public bets from a "butterfingers" account so the Public tab is never empty during the demo.
//   node scripts/seed-demo.mjs https://bet-on-me-sepia.vercel.app
const base = process.argv[2].replace(/\/$/, "") + "/api";
async function call(method, path, token, body) {
  const res = await fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${data?.error ?? ""}`);
  return data;
}
const { token } = await call("POST", "/auth/login", null, { username: "butterfingers" });
const mine = await call("GET", "/challenges/mine", token);
const have = new Set(mine.map((c) => c.title));
const bets = [
  { title: "Most miles during the expo", category: "strava", visibility: "public", mode: "open", stakeLamports: 10_000_000, durationMinutes: 1440, description: "Whoever logs the most miles wins the pot." },
  { title: "Walk 2 miles today", category: "strava", visibility: "public", mode: "target", target: 2, stakeLamports: 10_000_000, durationMinutes: 1440 },
  { title: "Tongue twister dare", category: "dare", visibility: "public", mode: "target", dareText: "Say 'red leather, yellow leather' five times fast, on camera.", stakeLamports: 10_000_000, durationMinutes: 1440 },
];
for (const b of bets) {
  if (have.has(b.title)) { console.log("skip (exists):", b.title); continue; }
  try { const c = await call("POST", "/challenges", token, b); console.log("created:", c.title); } catch (e) { console.log("FAILED:", b.title, e.message); }
}
