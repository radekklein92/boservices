import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeVatRate, pctChange } from "./pos-shared";

test("pctChange", () => {
  assert.equal(pctChange(110, 100), 0.1);
  assert.equal(pctChange(90, 100), -0.1);
  assert.equal(pctChange(5, 0), null);
  assert.equal(pctChange(5, null), null);
  assert.equal(pctChange(5, undefined), null);
});

test("normalizeVatRate - sjednotí Dotykačka i Trdlokafe kódování", () => {
  assert.equal(normalizeVatRate(0.21), 0.21);
  assert.equal(normalizeVatRate(1.21), 0.21);
  assert.equal(normalizeVatRate(0.12), 0.12);
  assert.equal(normalizeVatRate(1.12), 0.12);
  assert.equal(normalizeVatRate(1), 0);
  assert.equal(normalizeVatRate(0), 0);
  assert.equal(normalizeVatRate(null), null);
  assert.equal(normalizeVatRate(undefined), null);
});
