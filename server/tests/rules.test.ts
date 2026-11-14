import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSettlement, settlementPoints, sol, tierFor, type SettleInput } from "../../lib/rules";

const P = (userId: string, progress: number, completed = false) => ({ userId, progress, completed });
const base = (o: Partial<SettleInput>): SettleInput => ({
  category: "strava",
  mode: "target",
  stakeLamports: sol(0.1),
  participants: [],
  ...o,
});
const total = (r: { payouts: { lamports: number }[] }) => r.payouts.reduce((s, p) => s + p.lamports, 0);

test("target: everyone completed -> everyone gets stake back", () => {
  const r = computeSettlement(base({ participants: [P("a", 20, true), P("b", 25, true)] }));
  assert.equal(r.outcome, "refund");
  assert.deepEqual(r.payouts, [
    { userId: "a", lamports: sol(0.1) },
    { userId: "b", lamports: sol(0.1) },
  ]);
});

test("target: some completed -> completers split whole pot", () => {
  const r = computeSettlement(base({ participants: [P("a", 20, true), P("b", 3), P("c", 21, true), P("d", 0)] }));
  assert.equal(r.outcome, "split");
  assert.deepEqual(r.winners, ["a", "c"]);
  assert.deepEqual(r.payouts, [
    { userId: "a", lamports: sol(0.2) },
    { userId: "c", lamports: sol(0.2) },
  ]);
});

test("target strava/chess: nobody completed -> leader takes pot", () => {
  const r = computeSettlement(base({ category: "chess", participants: [P("a", 1100), P("b", 1150), P("c", 900)] }));
  assert.equal(r.outcome, "leader");
  assert.deepEqual(r.payouts, [{ userId: "b", lamports: sol(0.3) }]);
});

test("target: nobody completed, tie -> tied leaders split", () => {
  const r = computeSettlement(base({ participants: [P("a", 5), P("b", 5), P("c", 1)] }));
  assert.deepEqual(r.winners, ["a", "b"]);
  assert.equal(total(r), sol(0.3));
});

test("dare: nobody completed -> refund everyone", () => {
  const r = computeSettlement(base({ category: "dare", participants: [P("a", 0), P("b", 0)] }));
  assert.equal(r.outcome, "refund");
  assert.equal(total(r), sol(0.2));
  assert.deepEqual(r.winners, []);
});

test("dare: one completed -> takes pot", () => {
  const r = computeSettlement(base({ category: "dare", participants: [P("a", 1, true), P("b", 0)] }));
  assert.deepEqual(r.payouts, [{ userId: "a", lamports: sol(0.2) }]);
});

test("open: leader takes pot, ties split, no progress refunds", () => {
  const lead = computeSettlement(base({ mode: "open", participants: [P("a", 12.5), P("b", 30.1)] }));
  assert.deepEqual(lead.payouts, [{ userId: "b", lamports: sol(0.2) }]);
  const tie = computeSettlement(base({ mode: "open", participants: [P("a", 7), P("b", 7)] }));
  assert.deepEqual(tie.winners, ["a", "b"]);
  const none = computeSettlement(base({ mode: "open", participants: [P("a", 0), P("b", 0)] }));
  assert.equal(none.outcome, "refund");
  const negative = computeSettlement(base({ mode: "open", category: "chess", participants: [P("a", -12), P("b", -3)] }));
  assert.equal(negative.outcome, "refund");
});

test("rounding: leftover lamports go to the first winner and the pot is fully paid", () => {
  const input = base({ stakeLamports: 100_000_001, participants: [P("a", 1, true), P("b", 1, true), P("c", 1, true), P("d", 0)] });
  const r = computeSettlement(input);
  assert.equal(total(r), 400_000_004);
  assert.equal(r.payouts[0].lamports, 133_333_336);
  assert.equal(r.payouts[0].lamports - r.payouts[1].lamports, 400_000_004 % 3);
  assert.equal(r.payouts[1].lamports, r.payouts[2].lamports);
});

test("payouts never exceed the pot in any branch", () => {
  for (const mode of ["target", "open"] as const)
    for (const category of ["strava", "chess", "dare"] as const)
      for (let n = 1; n <= 7; n++)
        for (let mask = 0; mask < 1 << n; mask++) {
          const participants = Array.from({ length: n }, (_, i) => P(`u${i}`, (i * 7) % 4, Boolean(mask & (1 << i))));
          const input = base({ mode, category, stakeLamports: 33_333_333, participants });
          assert.equal(total(computeSettlement(input)), 33_333_333 * n);
        }
});

test("points: complete +50, win +100, fail -20, refunds don't punish", () => {
  const input = base({ participants: [P("a", 20, true), P("b", 2)] });
  assert.deepEqual(settlementPoints(input, computeSettlement(input)), { a: 150, b: -20 });
  const all = base({ participants: [P("a", 20, true), P("b", 22, true)] });
  assert.deepEqual(settlementPoints(all, computeSettlement(all)), { a: 50, b: 50 });
  const dare = base({ category: "dare", participants: [P("a", 0), P("b", 0)] });
  assert.deepEqual(settlementPoints(dare, computeSettlement(dare)), { a: 0, b: 0 });
});

test("tiers unlock at 200 and 1000 points", () => {
  assert.equal(tierFor(0).current.maxStakeLamports, sol(0.1));
  assert.equal(tierFor(199).next?.points, 200);
  assert.equal(tierFor(200).current.publicDaresPerWeek, 3);
  assert.equal(tierFor(1000).current.maxStakeLamports, sol(2));
  assert.equal(tierFor(5000).next, undefined);
});
