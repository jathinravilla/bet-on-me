// Checks the Solana memo receipt, Gemini coach + commentary, and search against a running backend.
//   node scripts/e2e-features.mjs http://127.0.0.1:3100
const base = process.argv[2].replace(/\/$/, "") + "/api";
const tag = Math.random().toString(36).slice(2, 7);
async function call(method, path, token, body) {
  const res = await fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${data?.error ?? ""}`);
  return data;
}
const ok = (l, x = "") => console.log("PASS", l, x);
const bad = (l, x = "") => { console.log("FAIL", l, x); process.exitCode = 1; };
try {
  const a = (await call("POST", "/auth/login", null, { username: `f_a_${tag}` })).token;
  const b = (await call("POST", "/auth/login", null, { username: `f_b_${tag}` })).token;
  const ch = await call("POST", "/challenges", a, { title: "Sunrise mile club", category: "strava", visibility: "friends", mode: "open", stakeLamports: 50_000_000, durationMinutes: 5 });
  await call("POST", "/challenges/join", b, { inviteCode: ch.inviteCode });
  await call("GET", "/strava/connect?returnTo=x", b);
  await call("POST", "/strava/demo-run", b);
  await call("POST", `/challenges/${ch.id}/sync`, b);
  const end = await call("POST", "/demo/end-now", a, { challengeId: ch.id });
  const sig = end.settlement.payouts[0].txSig;
  ok("settled with payout", `status ${end.status}, real sig ${!!sig && !sig.startsWith("MOCK")}`);
  ok("receipt present", end.settlement.receipt?.memo);
  // read the transaction back from Solana devnet and look for the memo
  let found = false;
  for (let i = 0; i < 6 && !found; i++) {
    const r = await fetch("https://api.devnet.solana.com", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: [sig, { encoding: "json", commitment: "confirmed", maxSupportedTransactionVersion: 0 }] }) }).then((x) => x.json());
    const logs = r.result?.meta?.logMessages ?? [];
    found = logs.some((l) => l.includes(end.settlement.receipt.memo));
    if (!found) await new Promise((s) => setTimeout(s, 3000));
    else console.log("   on-chain log:", logs.find((l) => l.includes("Memo")).slice(0, 140));
  }
  found ? ok("memo found on Solana devnet") : bad("memo NOT found on chain");
  const q = await call("GET", `/challenges/${ch.id}/commentary`, a);
  q.commentary ? ok("Gemini commentary", JSON.stringify(q.commentary)) : bad("commentary empty");
  const coach = await call("POST", "/coach", a, { category: "strava", mode: "target", title: "20 mile week", target: 20, durationMinutes: 10080 });
  ok("Gemini coach", `${coach.odds}% ${coach.verdict} | ${coach.tip} | stake ${coach.suggestedStakeLamports / 1e6} coins`);
  const pub = await call("POST", "/challenges", a, { title: "Sunrise 5K public", category: "strava", visibility: "public", mode: "open", stakeLamports: 20_000_000, durationMinutes: 1440 });
  const s = await call("GET", "/challenges/search?q=sunrise", b);
  s.results.some((r) => r.id === pub.id) && !s.results.some((r) => r.id === ch.id) ? ok("search finds public only", `engine ${s.engine}`) : bad("search results wrong");
} catch (e) { bad("exception", e.message); }
