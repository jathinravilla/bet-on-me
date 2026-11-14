// Live end-to-end check against a running backend (real database, devnet, Gemini, Blob).
//   node scripts/e2e-live.mjs <base-url> [clip.mp4]
import { readFileSync } from "node:fs";
const base = process.argv[2].replace(/\/$/, "") + "/api";
const clip = process.argv[3];
const tag = Math.random().toString(36).slice(2, 7);
async function call(method, path, token, body) {
  const t = Date.now();
  const res = await fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${data?.error ?? ""}`);
  return { data, ms: Date.now() - t };
}
const ok = (label, extra = "") => console.log("PASS", label, extra);
try {
  const a = await call("POST", "/auth/login", null, { username: `e2e_a_${tag}` });
  const b = await call("POST", "/auth/login", null, { username: `e2e_b_${tag}` });
  const [ta, tb] = [a.data.token, b.data.token];
  ok("login x2 + funding", `balances ${a.data.me.wallet.balanceLamports / 1e9}/${b.data.me.wallet.balanceLamports / 1e9} SOL, funded ${a.data.me.wallet.funded}/${b.data.me.wallet.funded}, ${a.ms}ms`);
  const ch = await call("POST", "/challenges", ta, { title: "E2E miles", category: "strava", visibility: "friends", mode: "open", stakeLamports: 50_000_000, durationMinutes: 5 });
  ok("create + stake", `${ch.ms}ms, real sig ${!ch.data.participants[0].stakeTxSig.startsWith("MOCK")}`);
  const j = await call("POST", "/challenges/join", tb, { inviteCode: ch.data.inviteCode });
  ok("join by code", `pot ${j.data.potLamports / 1e9} SOL, ${j.ms}ms`);
  await call("GET", "/strava/connect?returnTo=betonme://x", tb);
  const run = await call("POST", "/strava/demo-run", tb);
  const s = await call("POST", `/challenges/${ch.data.id}/sync`, tb);
  ok("demo strava run + sync", `${run.data.miles} mi, leader ${s.data.participants[0].username.startsWith("e2e_b")}`);
  const end = await call("POST", "/demo/end-now", ta, { challengeId: ch.data.id });
  const p = end.data.settlement?.payouts?.[0];
  ok("end now + payout", `status ${end.data.status}, ${p?.lamports / 1e9} SOL to winner, sig present ${!!p?.txSig && !p.txSig.startsWith("MOCK")}, ${end.ms}ms`);
  const mb = await call("GET", "/me", tb);
  ok("winner balance + clout", `${mb.data.wallet.balanceLamports / 1e9} SOL, ${mb.data.points} clout`);
  try {
    await call("POST", "/challenges", ta, { title: "Bad dare", category: "dare", visibility: "friends", mode: "target", dareText: "Drink a bottle of vodka and then drive a car fast", stakeLamports: 50_000_000, durationMinutes: 5 });
    console.log("FAIL unsafe dare was allowed");
  } catch (e) { ok("unsafe dare blocked", String(e.message).slice(0, 110)); }
  const d = await call("POST", "/challenges", ta, { title: "TV test pattern", category: "dare", visibility: "friends", mode: "target", dareText: "Show a colorful TV test pattern on your screen", stakeLamports: 50_000_000, durationMinutes: 5 });
  ok("dare created (Gemini screen)", `${d.ms}ms`);
  if (clip) {
    const st = await call("POST", "/dare/start", ta, { challengeId: d.data.id });
    const tk = await call("POST", "/dare/upload-token", ta, { proofId: st.data.proofId, ext: "mp4" });
    const up = await fetch(tk.data.uploadUrl, { method: "PUT", headers: tk.data.headers, body: readFileSync(clip) });
    const upj = await up.json().catch(() => ({}));
    if (!up.ok || !upj.url) throw new Error(`blob upload -> ${up.status} ${JSON.stringify(upj).slice(0, 160)}`);
    ok("blob upload", new URL(upj.url).hostname.replace(/^[^.]+/, "<store>"));
    const v = await call("POST", "/dare/verify", ta, { proofId: st.data.proofId, videoUrl: upj.url });
    ok("gemini video verdict", `(word was ${st.data.word}; clip says pineapple) ${v.data.verdict}/${v.data.finalStatus} ${v.ms}ms — ${v.data.reason.slice(0, 120)}`);
  }
  await call("POST", "/demo/end-now", ta, { challengeId: d.data.id });
  ok("dare settled (refund)");
} catch (e) {
  console.log("FAIL", e.message);
}
