import { test } from "node:test";
import assert from "node:assert/strict";
import {
  conceptOfShop,
  effectiveCurrency,
  resolveSelection,
  selectionCurrencies,
  type ResolvedSelection,
} from "./selection";
import type { PairingIndex } from "./pairing-db";
import type { ApiShop } from "./types";
import type { PosSelection } from "./filters";

// Minimální ApiShop pro test (jen pole, která resolver čte: id, brand_id).
function shop(id: string, brand_id: string): ApiShop {
  return { id, brand_id, name: id } as unknown as ApiShop;
}

// ApiShop s měnou (pro currency helpery).
function cshop(id: string, currency_code: string): ApiShop {
  return { id, brand_id: "b", name: id, currency_code } as unknown as ApiShop;
}
function resolvedOf(ids: string[]): ResolvedSelection {
  return { shopIds: new Set(ids), isAll: false, coversWholeBrands: [], brandsPresent: [] };
}

// Síť: bA (KoP) = s1,s2 napárované; bB (OXO) = s3 napárovaná + s4 nenapárovaná;
// bC = s5 nenapárovaná bez konceptu (-> other). s3 má ZÁMĚRNĚ špatný fallback
// conceptByShop=KoP, ale lokalita říká OXO -> lokalita musí vyhrát (R1).
const SHOPS: ApiShop[] = [
  shop("s1", "bA"),
  shop("s2", "bA"),
  shop("s3", "bB"),
  shop("s4", "bB"),
  shop("s5", "bC"),
];

const INDEX: PairingIndex = {
  cityByShop: new Map([
    ["s1", "Praha"],
    ["s2", "Brno"],
    ["s3", "Praha"],
    ["s4", "Praha"],
  ]),
  locationByShop: new Map([
    ["s1", "L1"],
    ["s2", "L2"],
    ["s3", "L3"],
  ]),
  shopsByLocation: new Map([
    ["L1", ["s1"]],
    ["L2", ["s2"]],
    ["L3", ["s3"]],
  ]),
  brandByShop: new Map([
    ["s1", "bA"],
    ["s2", "bA"],
    ["s3", "bB"],
  ]),
  conceptByLocation: new Map([
    ["L1", "KoP"],
    ["L2", "KoP"],
    ["L3", "OXO"],
  ]),
  conceptByShop: new Map([
    ["s3", "KoP"], // stale fallback - lokalita (OXO) musí vyhrát
    ["s4", "OXO"], // nenapárovaná -> jen fallback
  ]),
  pairs: [],
};

function sel(s: Partial<PosSelection>): PosSelection {
  return { concepts: [], locations: [], ...s };
}

test("conceptOfShop - lokalita vyhrává nad fallbackem; jinak other", () => {
  assert.equal(conceptOfShop("s3", INDEX), "OXO"); // lokalita L3 = OXO, ne stale KoP
  assert.equal(conceptOfShop("s4", INDEX), "OXO"); // nenapárovaná -> fallback
  assert.equal(conceptOfShop("s5", INDEX), "other"); // nic -> other
});

test("resolveSelection - prázdný výběr = vše", () => {
  const r = resolveSelection(sel({}), INDEX, SHOPS);
  assert.equal(r.isAll, true);
  assert.deepEqual([...r.shopIds].sort(), ["s1", "s2", "s3", "s4", "s5"]);
  assert.deepEqual([...r.coversWholeBrands].sort(), ["bA", "bB", "bC"]);
});

test("resolveSelection - koncept KoP", () => {
  const r = resolveSelection(sel({ concepts: ["KoP"] }), INDEX, SHOPS);
  assert.deepEqual([...r.shopIds].sort(), ["s1", "s2"]);
  assert.equal(r.isAll, false);
  assert.deepEqual(r.coversWholeBrands, ["bA"]); // všechny bA pokladny vybrány
});

test("resolveSelection - koncept OXO (lokalita + fallback)", () => {
  const r = resolveSelection(sel({ concepts: ["OXO"] }), INDEX, SHOPS);
  assert.deepEqual([...r.shopIds].sort(), ["s3", "s4"]);
  assert.deepEqual(r.coversWholeBrands, ["bB"]);
});

test("resolveSelection - bare locationId = jen jeho pokladny", () => {
  const r = resolveSelection(sel({ locations: ["L1"] }), INDEX, SHOPS);
  assert.deepEqual([...r.shopIds], ["s1"]);
  assert.deepEqual(r.coversWholeBrands, []); // bA jen částečně
});

test("resolveSelection - shop: token (nenapárovaná)", () => {
  const r = resolveSelection(sel({ locations: ["shop:s5"] }), INDEX, SHOPS);
  assert.deepEqual([...r.shopIds], ["s5"]);
  assert.deepEqual(r.coversWholeBrands, ["bC"]);
});

test("resolveSelection - legacy brand: a city: tokeny", () => {
  assert.deepEqual([...resolveSelection(sel({ locations: ["brand:bB"] }), INDEX, SHOPS).shopIds].sort(), [
    "s3",
    "s4",
  ]);
  assert.deepEqual([...resolveSelection(sel({ locations: ["city:Praha"] }), INDEX, SHOPS).shopIds].sort(), [
    "s1",
    "s3",
    "s4",
  ]);
});

test("resolveSelection - koncept ∪ lokalita (sjednocení, bez duplicit)", () => {
  const r = resolveSelection(sel({ concepts: ["KoP"], locations: ["shop:s5"] }), INDEX, SHOPS);
  assert.deepEqual([...r.shopIds].sort(), ["s1", "s2", "s5"]);
});

test("resolveSelection - neznámý token nic nepřidá", () => {
  const r = resolveSelection(sel({ locations: ["L-neexistuje", "shop:nope"] }), INDEX, SHOPS);
  assert.equal(r.shopIds.size, 0);
});

// --- Okruh BOS (opts.bosShopIds) ---

test("resolveSelection - okruh BOS: prázdný výběr = jen BOS pokladny (ne celá síť)", () => {
  const r = resolveSelection(sel({}), INDEX, SHOPS, { bosShopIds: new Set(["s1", "s3"]) });
  assert.equal(r.isAll, false); // BOS podmnožina není "celá síť"
  assert.deepEqual([...r.shopIds].sort(), ["s1", "s3"]);
});

test("resolveSelection - okruh BOS protne koncept (KoP -> jen BOS-KoP)", () => {
  const r = resolveSelection(sel({ concepts: ["KoP"] }), INDEX, SHOPS, { bosShopIds: new Set(["s1", "s3"]) });
  assert.deepEqual([...r.shopIds].sort(), ["s1"]); // s2 (KoP) není BOS -> vypadne
});

test("resolveSelection - okruh BOS vyřadí ne-BOS token", () => {
  const r = resolveSelection(sel({ locations: ["shop:s5"] }), INDEX, SHOPS, { bosShopIds: new Set(["s1"]) });
  assert.equal(r.shopIds.size, 0); // s5 není v BOS množině
});

// --- Měny ve výběru ---

const CSHOPS: ApiShop[] = [
  cshop("c1", "CZK"),
  cshop("c2", "CZK"),
  cshop("p1", "PLN"),
  cshop("e1", "EUR"),
];

test("effectiveCurrency - polská prodejna + default CZK -> PLN (bug fix)", () => {
  // Jádro reportovaného bugu: vybraná jen PLN pokladna, filtr drží default CZK.
  assert.equal(effectiveCurrency("CZK", resolvedOf(["p1"]), CSHOPS), "PLN");
});

test("effectiveCurrency - zvolená měna má data -> beze změny", () => {
  assert.equal(effectiveCurrency("CZK", resolvedOf(["c1", "p1"]), CSHOPS), "CZK");
  assert.equal(effectiveCurrency("PLN", resolvedOf(["c1", "p1"]), CSHOPS), "PLN");
});

test("effectiveCurrency - zvolená měna bez dat -> dominantní (nejvíc pokladen)", () => {
  // EUR ve výběru není; CZK má 2 pokladny, PLN 1 -> dominantní CZK.
  assert.equal(effectiveCurrency("EUR", resolvedOf(["c1", "c2", "p1"]), CSHOPS), "CZK");
});

test("effectiveCurrency - shoda počtů -> priorita CZK>EUR>PLN", () => {
  // CZK 1, PLN 1 (shoda), zvolené EUR (bez dat) -> priorita CZK.
  assert.equal(effectiveCurrency("EUR", resolvedOf(["c1", "p1"]), CSHOPS), "CZK");
  // EUR 1, PLN 1 (shoda) -> priorita EUR.
  assert.equal(effectiveCurrency("CZK", resolvedOf(["e1", "p1"]), CSHOPS), "EUR");
});

test("effectiveCurrency - prázdný výběr -> preferovaná beze změny", () => {
  assert.equal(effectiveCurrency("CZK", resolvedOf([]), CSHOPS), "CZK");
});

test("selectionCurrencies - zastoupené měny v pořadí CZK, EUR, PLN", () => {
  assert.deepEqual(selectionCurrencies(resolvedOf(["p1", "e1", "c1"]), CSHOPS), ["CZK", "EUR", "PLN"]);
  assert.deepEqual(selectionCurrencies(resolvedOf(["p1"]), CSHOPS), ["PLN"]);
  assert.deepEqual(selectionCurrencies(resolvedOf([]), CSHOPS), []);
});
