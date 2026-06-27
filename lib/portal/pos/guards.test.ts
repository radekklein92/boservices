import { test } from "node:test";
import assert from "node:assert/strict";
import { clampLimit, clampPage, clampWindow, MAX_WINDOW_DAYS } from "./guards";
import { inclusiveDays } from "./filters";

test("clampLimit", () => {
  assert.equal(clampLimit(50), 50);
  assert.equal(clampLimit(9999), 200);
  assert.equal(clampLimit(0), 1);
  assert.equal(clampLimit(undefined), 50);
});

test("clampPage", () => {
  assert.equal(clampPage(-5), 0);
  assert.equal(clampPage(3), 3);
  assert.equal(clampPage(undefined), 0);
});

test("clampWindow ořízne příliš velké okno", () => {
  const res = clampWindow({ from: "2020-01-01", to: "2026-06-27" });
  assert.equal(res.clamped, true);
  assert.ok(inclusiveDays(res.range) <= MAX_WINDOW_DAYS);
  assert.equal(res.range.to, "2026-06-27");
});

test("clampWindow nechá malé okno být", () => {
  const res = clampWindow({ from: "2026-06-22", to: "2026-06-27" });
  assert.equal(res.clamped, false);
  assert.deepEqual(res.range, { from: "2026-06-22", to: "2026-06-27" });
});
