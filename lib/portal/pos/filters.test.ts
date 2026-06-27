import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_POS_FILTER,
  inclusiveDays,
  parsePosFilter,
  resolveComparisonRange,
  resolveDateRange,
  serializePosFilter,
  type PosFilter,
} from "./filters";

const TODAY = "2026-06-27"; // sobota

function withPreset(preset: PosFilter["preset"]): PosFilter {
  return { ...DEFAULT_POS_FILTER, preset };
}

test("resolveDateRange - presety", () => {
  assert.deepEqual(resolveDateRange(withPreset("dnes"), TODAY), { from: "2026-06-27", to: "2026-06-27" });
  assert.deepEqual(resolveDateRange(withPreset("vcera"), TODAY), { from: "2026-06-26", to: "2026-06-26" });
  // tento týden = pondělí..dnes
  assert.deepEqual(resolveDateRange(withPreset("tento-tyden"), TODAY), { from: "2026-06-22", to: "2026-06-27" });
  assert.deepEqual(resolveDateRange(withPreset("minuly-tyden"), TODAY), { from: "2026-06-15", to: "2026-06-21" });
  assert.deepEqual(resolveDateRange(withPreset("tento-mesic"), TODAY), { from: "2026-06-01", to: "2026-06-27" });
  assert.deepEqual(resolveDateRange(withPreset("minuly-mesic"), TODAY), { from: "2026-05-01", to: "2026-05-31" });
  assert.deepEqual(resolveDateRange(withPreset("poslednich-30-dni"), TODAY), { from: "2026-05-29", to: "2026-06-27" });
  assert.deepEqual(resolveDateRange(withPreset("tento-rok"), TODAY), { from: "2026-01-01", to: "2026-06-27" });
});

test("inclusiveDays", () => {
  assert.equal(inclusiveDays({ from: "2026-06-22", to: "2026-06-27" }), 6);
  assert.equal(inclusiveDays({ from: "2026-06-01", to: "2026-06-27" }), 27);
});

test("resolveComparisonRange - týden = D-7 (zarovnané dny)", () => {
  const range = resolveDateRange(withPreset("tento-tyden"), TODAY); // 22..27
  assert.deepEqual(
    resolveComparisonRange({ ...DEFAULT_POS_FILTER, comparison: "predchozi-obdobi", preset: "tento-tyden" }, range),
    { from: "2026-06-15", to: "2026-06-20" },
  );
});

test("resolveComparisonRange - měsíc = D-28 (zarovnané dny v týdnu)", () => {
  const range = resolveDateRange(withPreset("tento-mesic"), TODAY); // 06-01..06-27 (27 dní -> round(27/7)=4 -> 28)
  assert.deepEqual(
    resolveComparisonRange({ ...DEFAULT_POS_FILTER, comparison: "predchozi-obdobi", preset: "tento-mesic" }, range),
    { from: "2026-05-04", to: "2026-05-30" },
  );
});

test("resolveComparisonRange - předchozí rok = D-364", () => {
  const range = resolveDateRange(withPreset("tento-tyden"), TODAY); // 22..27
  assert.deepEqual(
    resolveComparisonRange({ ...DEFAULT_POS_FILTER, comparison: "predchozi-rok", preset: "tento-tyden" }, range),
    { from: "2025-06-23", to: "2025-06-28" },
  );
});

test("resolveComparisonRange - zadne = null", () => {
  const range = resolveDateRange(withPreset("tento-tyden"), TODAY);
  assert.equal(resolveComparisonRange({ ...DEFAULT_POS_FILTER, comparison: "zadne" }, range), null);
});

test("parse/serialize round-trip", () => {
  const f: PosFilter = {
    scope: { kind: "shop", shopId: "abc-123" },
    preset: "minuly-mesic",
    comparison: "predchozi-rok",
    sameStore: false,
    currency: "EUR",
    vatInclusive: false,
  };
  const parsed = parsePosFilter(new URLSearchParams(serializePosFilter(f).toString()));
  assert.deepEqual(parsed, { ...f, from: undefined, to: undefined });
});

test("parsePosFilter - prázdné = default", () => {
  // parse vrací from/to jako undefined klíče (sémanticky = default bez nich)
  assert.deepEqual(parsePosFilter(new URLSearchParams("")), {
    ...DEFAULT_POS_FILTER,
    from: undefined,
    to: undefined,
  });
});

test("parsePosFilter - značka scope", () => {
  const parsed = parsePosFilter(new URLSearchParams("scope=brand:xyz&cur=PLN"));
  assert.deepEqual(parsed.scope, { kind: "brand", brandId: "xyz" });
  assert.equal(parsed.currency, "PLN");
});
