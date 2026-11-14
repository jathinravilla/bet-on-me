// End-to-end API test against an in-memory MongoDB and the fake chain (no network, no real keys).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { MongoMemoryServer } from "mongodb-memory-server";
import { sol } from "../../lib/rules";
import type { ChallengeView, LoginResponse, MeView } from "../../lib/types";

let mongo: MongoMemoryServer;
let server: Server;
let base = "";

before(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.WALLET_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.SOLANA_MOCK = "true";
  process.env.DEMO_MODE = "true";
  process.env.CRON_SECRET = "test-cron-secret-test-cron-secret";
  delete process.env.VERCEL;
  const { handle } = await import("../app");
  server = createServer((req, res) => void handle(req, res));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

after(async () => {
  server?.close();
  const { cols } = await import("../db");
  await (await cols()).db.client.close();
  await mongo?.stop();
});

async function call<T>(method: "GET" | "POST", path: string, token?: string, body?: unknown): Promise<{ status: number; data: T & { error?: string } }> {
  const res = await fetch(base + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: (await res.json()) as T & { error?: string } };
}
// Each login comes from its own fake IP so the per-IP sign-up limit doesn't trip (that limit has its own test).
let ipSeq = 0;
async function login(username: string): Promise<LoginResponse> {
  const res = await fetch(base + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-real-ip": `10.0.0.${++ipSeq}` },
    body: JSON.stringify({ username }),
  });
  assert.equal(res.status, 200);
  return (await res.json()) as LoginResponse;
}
const me = async (t: string) => (await call<MeView>("GET", "/me", t)).data;

const strava = (over: object = {}) => ({
  title: "Most miles this week",
  category: "strava",
  visibility: "friends",
  mode: "open",
  stakeLamports: sol(0.1),
  durationMinutes: 5,
  ...over,
});

test("login creates a funded wallet; bad input and missing auth are rejected", async () => {
  const a = await login("Alice_1");
  assert.equal(a.isNew, true);
  assert.equal(a.me.username, "alice_1");
  assert.equal(a.me.wallet.balanceLamports, sol(2));
  assert.equal((await login("alice_1")).isNew, false);
  assert.equal((await call("POST", "/auth/login", undefined, { username: "a b!" })).status, 400);
  assert.equal((await call("POST", "/auth/login", undefined, { username: { $ne: "" } })).status, 400);
  assert.equal((await call("GET", "/me")).status, 401);
  assert.equal((await call("GET", "/me", "x".repeat(40))).status, 401);
  assert.equal((await call("GET", "/nope", a.token)).status, 404);
});

test("create -> join by code -> simulate -> end now -> leader is paid", async () => {
  const a = await login("anna");
  const b = await login("bob");
  const created = await call<ChallengeView>("POST", "/challenges", a.token, strava());
  assert.equal(created.status, 200, created.data.error ?? "");
  const ch = created.data;
  assert.equal(ch.potLamports, sol(0.1));
  assert.equal(ch.inviteCode?.length, 6);
  assert.equal((await me(a.token)).wallet.balanceLamports, sol(1.9));

  // friends challenges are private and can't be joined by id
  assert.equal((await call("GET", `/challenges/${ch.id}`, b.token)).status, 404);
  assert.equal((await call("POST", "/challenges/join", b.token, { challengeId: ch.id })).status, 403);
  assert.equal((await call("POST", "/challenges/join", b.token, { inviteCode: "ZZZZZZ" })).status, 404);

  const joined = await call<ChallengeView>("POST", "/challenges/join", b.token, { inviteCode: ch.inviteCode!.toLowerCase() });
  assert.equal(joined.status, 200, joined.data.error ?? "");
  assert.equal(joined.data.potLamports, sol(0.2));
  assert.equal((await call("POST", "/challenges/join", b.token, { inviteCode: ch.inviteCode })).status, 409);

  const sim = await call<ChallengeView>("POST", "/demo/simulate-progress", b.token, { challengeId: ch.id, amount: 4.2 });
  assert.equal(sim.data.participants[0].username, "bob");
  assert.equal(sim.data.participants[0].progress, 4.2);

  const outsider = await login("zed");
  assert.equal((await call("POST", "/demo/end-now", outsider.token, { challengeId: ch.id })).status, 403);

  const ended = await call<ChallengeView>("POST", "/demo/end-now", a.token, { challengeId: ch.id });
  assert.equal(ended.status, 200, ended.data.error ?? "");
  assert.equal(ended.data.status, "settled");
  assert.deepEqual(ended.data.settlement?.winners, [b.me.id]);
  assert.equal(ended.data.settlement?.payouts[0].lamports, sol(0.2));
  assert.ok(ended.data.settlement?.payouts[0].txSig);

  // settling again is a no-op (no double payout)
  await call("POST", `/challenges/${ch.id}/settle`, a.token);
  const [ma, mb] = [await me(a.token), await me(b.token)];
  assert.equal(ma.wallet.balanceLamports, sol(1.9));
  assert.equal(mb.wallet.balanceLamports, sol(2.1));
  assert.equal(mb.points, 10 + 100);
  assert.equal(ma.points, 0); // 10 for joining, -20 for losing, floored at 0
  assert.equal(mb.history[0].won, true);
});

test("target challenge: everyone hits it -> stakes returned", async () => {
  const a = await login("cara");
  const b = await login("dev");
  const ch = (await call<ChallengeView>("POST", "/challenges", a.token, strava({ mode: "target", target: 3 }))).data;
  await call("POST", "/challenges/join", b.token, { inviteCode: ch.inviteCode });
  await call("POST", "/demo/simulate-progress", a.token, { challengeId: ch.id, amount: 3 });
  await call("POST", "/demo/simulate-progress", b.token, { challengeId: ch.id, amount: 5 });
  const ended = (await call<ChallengeView>("POST", "/demo/end-now", b.token, { challengeId: ch.id })).data;
  assert.equal(ended.settlement?.outcome, "refund");
  assert.equal((await me(a.token)).wallet.balanceLamports, sol(2));
  assert.equal((await me(b.token)).wallet.balanceLamports, sol(2));
  assert.equal((await me(a.token)).points, 60);
});

test("stake limits, validation and balance checks", async () => {
  const a = await login("erin");
  assert.equal((await call("POST", "/challenges", a.token, strava({ stakeLamports: sol(0.5) }))).status, 403);
  assert.equal((await call("POST", "/challenges", a.token, strava({ stakeLamports: 1 }))).status, 400);
  assert.equal((await call("POST", "/challenges", a.token, strava({ durationMinutes: 7 }))).status, 400);
  assert.equal((await call("POST", "/challenges", a.token, strava({ category: "poker" }))).status, 400);
  assert.equal((await call("POST", "/challenges", a.token, strava({ title: { $gt: "" } }))).status, 400);
  assert.equal((await call("POST", "/challenges", a.token, strava({ category: "chess" }))).status, 400); // no chess username
});

test("public feed, voting, and 3 reports ban + refund", async () => {
  const a = await login("finn");
  const ch = (await call<ChallengeView>("POST", "/challenges", a.token, strava({ visibility: "public", title: "Public miles" }))).data;
  const users = await Promise.all(["gus", "hal", "ivy"].map(login));
  const joined = await call<ChallengeView>("POST", "/challenges/join", users[0].token, { challengeId: ch.id });
  assert.equal(joined.status, 200, joined.data.error ?? "");

  // demo shortcuts can't be used by a stranger to grab a public pot
  assert.equal((await call("POST", "/demo/simulate-progress", users[0].token, { challengeId: ch.id, amount: 99 })).status, 403);
  assert.equal((await call("POST", "/demo/end-now", users[0].token, { challengeId: ch.id })).status, 403);

  const feed = (await call<ChallengeView[]>("GET", "/challenges?visibility=public", users[1].token)).data;
  assert.ok(feed.some((c) => c.id === ch.id && c.inviteCode === undefined));

  const voted = (await call<ChallengeView>("POST", `/challenges/${ch.id}/vote`, users[1].token, { value: 1 })).data;
  assert.equal(voted.upvotes, 1);
  assert.equal(voted.myVote, 1);
  assert.equal((await call<ChallengeView>("POST", `/challenges/${ch.id}/vote`, users[1].token, { value: -1 })).data.downvotes, 1);

  for (const u of users) {
    const r = await call<{ banned: boolean }>("POST", `/challenges/${ch.id}/report`, u.token, { reason: "not ok" });
    assert.equal(r.status, 200, r.data.error ?? "");
  }
  assert.equal((await call("POST", `/challenges/${ch.id}/report`, a.token, { reason: "again" })).status, 409); // already ended
  const banned = (await call<ChallengeView>("GET", `/challenges/${ch.id}`, a.token)).data;
  assert.equal(banned.status, "banned");
  assert.equal((await me(a.token)).wallet.balanceLamports, sol(2));
  assert.equal((await me(users[0].token)).wallet.balanceLamports, sol(2));
  const after = (await call<ChallengeView[]>("GET", "/challenges", users[1].token)).data;
  assert.ok(!after.some((c) => c.id === ch.id));
  assert.equal((await call("GET", `/challenges/${ch.id}`, users[2].token)).status, 404);
});

test("sign-ups are rate limited per IP", async () => {
  const statuses: number[] = [];
  for (let i = 0; i < 10; i++) {
    const res = await fetch(base + "/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-real-ip": "10.9.9.9" },
      body: JSON.stringify({ username: `flood_${i}` }),
    });
    statuses.push(res.status);
  }
  assert.equal(statuses.filter((s) => s === 200).length, 8);
  assert.equal(statuses.at(-1), 429);
});

test("cron endpoint needs its secret; demo routes vanish when demo mode is off", async () => {
  assert.equal((await call("GET", "/cron/settle-due")).status, 401);
  const ok = await fetch(base + "/cron/settle-due", { headers: { Authorization: "Bearer test-cron-secret-test-cron-secret" } });
  assert.equal(ok.status, 200);
  const a = await login("joe");
  const ch = (await call<ChallengeView>("POST", "/challenges", a.token, strava())).data;
  process.env.DEMO_MODE = "false";
  assert.equal((await call("POST", "/demo/end-now", a.token, { challengeId: ch.id })).status, 404);
  process.env.DEMO_MODE = "true";
});
