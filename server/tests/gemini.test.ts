import { test } from "node:test";
import assert from "node:assert/strict";
import { CURATED_DARES, wordHeard } from "../gemini.js";

test("liveness word matching tolerates speech-to-text slips but not wrong words", () => {
  assert.equal(wordHeard("okay the word is lantern and I'm doing it", "lantern"), true);
  assert.equal(wordHeard("lanterns everywhere", "lantern"), true); // plural
  assert.equal(wordHeard("lantren", "lantern"), true); // one letter slip on a long word
  assert.equal(wordHeard("Lantern!", "LANTERN"), true);
  assert.equal(wordHeard("banter and pattern", "lantern"), false);
  assert.equal(wordHeard("", "lantern"), false);
  assert.equal(wordHeard("cat", "cap"), false); // short words must match exactly
});

test("curated dares are all within the app's limits", () => {
  assert.ok(CURATED_DARES.length >= 15);
  for (const d of CURATED_DARES) {
    assert.ok(d.dare.length >= 10 && d.dare.length <= 200, d.title);
    assert.ok(d.title.length >= 3 && d.title.length <= 60, d.title);
  }
});
