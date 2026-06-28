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

// Srovnání = přirozené předchozí KALENDÁŘNÍ období dle presetu (toggle zapnutý).
test("resolveComparisonRange - presety (kalendářní auto-období)", () => {
  const cmp = (preset: PosFilter["preset"]) => {
    const f = withPreset(preset);
    return resolveComparisonRange(f, resolveDateRange(f, TODAY));
  };
  assert.deepEqual(cmp("dnes"), { from: "2026-06-26", to: "2026-06-26" }); // předchozí den
  assert.deepEqual(cmp("vcera"), { from: "2026-06-25", to: "2026-06-25" }); // předchozí den
  assert.deepEqual(cmp("tento-tyden"), { from: "2026-06-15", to: "2026-06-20" }); // -7
  assert.deepEqual(cmp("minuly-tyden"), { from: "2026-06-08", to: "2026-06-14" }); // -7
  assert.deepEqual(cmp("tento-mesic"), { from: "2026-05-01", to: "2026-05-27" }); // MTD vs MTD
  assert.deepEqual(cmp("minuly-mesic"), { from: "2026-04-01", to: "2026-04-30" }); // celý předchozí měsíc
  assert.deepEqual(cmp("poslednich-30-dni"), { from: "2026-04-29", to: "2026-05-28" }); // -30
  assert.deepEqual(cmp("tento-rok"), { from: "2025-01-01", to: "2025-06-27" }); // YTD vs YTD
});

test("resolveComparisonRange - vlastni dle délky (<=31 = stejně dlouhé okno, >31 = předchozí rok)", () => {
  const short: PosFilter = { ...DEFAULT_POS_FILTER, preset: "vlastni", from: "2026-06-10", to: "2026-06-19" }; // L=10
  assert.deepEqual(resolveComparisonRange(short, resolveDateRange(short, TODAY)), { from: "2026-05-31", to: "2026-06-09" });
  const long: PosFilter = { ...DEFAULT_POS_FILTER, preset: "vlastni", from: "2026-04-01", to: "2026-06-27" }; // L=88
  assert.deepEqual(resolveComparisonRange(long, resolveDateRange(long, TODAY)), { from: "2025-04-01", to: "2025-06-27" });
});

test("resolveComparisonRange - clamping konce měsíce (březen -> únor)", () => {
  // minuly-mesic v dubnu = celý březen [1.3,31.3] -> celý únor [1.2,28.2] (31 clampnuto na 28)
  const f = withPreset("minuly-mesic");
  assert.deepEqual(resolveDateRange(f, "2026-04-15"), { from: "2026-03-01", to: "2026-03-31" });
  assert.deepEqual(resolveComparisonRange(f, resolveDateRange(f, "2026-04-15")), { from: "2026-02-01", to: "2026-02-28" });
});

test("resolveComparisonRange - vypnuté srovnání = null", () => {
  const f: PosFilter = { ...DEFAULT_POS_FILTER, compare: false };
  assert.equal(resolveComparisonRange(f, resolveDateRange(f, TODAY)), null);
});

test("parse/serialize round-trip - multi-select výběr", () => {
  const f: PosFilter = {
    selection: { concepts: ["KoP", "BB"], locations: ["loc-1", "shop:abc-123"] },
    preset: "minuly-mesic",
    compare: false, // serializuje se jako cmp=0
    sameStore: true,
    currency: "EUR",
    vatInclusive: false,
  };
  const parsed = parsePosFilter(new URLSearchParams(serializePosFilter(f).toString()));
  assert.deepEqual(parsed, { ...f, from: undefined, to: undefined });
});

test("compare - default zapnuto; vypnutí přes cmp=0; zpětná kompat se starým cmp", () => {
  assert.equal(parsePosFilter(new URLSearchParams("")).compare, true); // default
  assert.equal(parsePosFilter(new URLSearchParams("cmp=0")).compare, false);
  assert.equal(parsePosFilter(new URLSearchParams("cmp=zadne")).compare, false); // legacy "bez srovnání"
  assert.equal(parsePosFilter(new URLSearchParams("cmp=predchozi-rok")).compare, true); // legacy -> zapnuto
  assert.equal(parsePosFilter(new URLSearchParams("cmp=predchozi-obdobi")).compare, true);
  // default (zapnuto) se neserializuje, vypnutí ano
  assert.equal(serializePosFilter(DEFAULT_POS_FILTER).has("cmp"), false);
  assert.equal(serializePosFilter({ ...DEFAULT_POS_FILTER, compare: false }).get("cmp"), "0");
});

test("serializePosFilter - prázdný výběr ('vše') se neserializuje", () => {
  const sp = serializePosFilter(DEFAULT_POS_FILTER);
  assert.equal(sp.has("c"), false);
  assert.equal(sp.has("l"), false);
  assert.equal(sp.toString(), "");
});

test("parsePosFilter - prázdné = default (vše)", () => {
  // parse vrací from/to jako undefined klíče (sémanticky = default bez nich)
  assert.deepEqual(parsePosFilter(new URLSearchParams("")), {
    ...DEFAULT_POS_FILTER,
    from: undefined,
    to: undefined,
  });
});

test("decodeConcepts - zahodí neznámé kódy a duplicity", () => {
  const parsed = parsePosFilter(new URLSearchParams("c=KoP,NEEXISTUJE,KoP,OXO"));
  assert.deepEqual(parsed.selection.concepts, ["KoP", "OXO"]);
});

test("parsePosFilter - jen koncepty", () => {
  const parsed = parsePosFilter(new URLSearchParams("c=TK&cur=PLN"));
  assert.deepEqual(parsed.selection, { concepts: ["TK"], locations: [] });
  assert.equal(parsed.currency, "PLN");
});

test("zpětná kompat - legacy ?scope=brand: -> token v locations", () => {
  const parsed = parsePosFilter(new URLSearchParams("scope=brand:xyz&cur=PLN"));
  assert.deepEqual(parsed.selection, { concepts: [], locations: ["brand:xyz"] });
  assert.equal(parsed.currency, "PLN");
});

test("zpětná kompat - legacy ?scope=shop: a city:", () => {
  assert.deepEqual(parsePosFilter(new URLSearchParams("scope=shop:s-1")).selection, {
    concepts: [],
    locations: ["shop:s-1"],
  });
  assert.deepEqual(parsePosFilter(new URLSearchParams("scope=city:Praha")).selection, {
    concepts: [],
    locations: ["city:Praha"],
  });
  assert.deepEqual(parsePosFilter(new URLSearchParams("scope=all")).selection, {
    concepts: [],
    locations: [],
  });
});

test("nový výběr přebíjí legacy scope", () => {
  const parsed = parsePosFilter(new URLSearchParams("c=KoP&scope=brand:xyz"));
  assert.deepEqual(parsed.selection, { concepts: ["KoP"], locations: [] });
});
