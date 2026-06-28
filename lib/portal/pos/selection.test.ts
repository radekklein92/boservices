import { test } from "node:test";
import assert from "node:assert/strict";
import { conceptOfShop, resolveSelection } from "./selection";
import type { PairingIndex } from "./pairing-db";
import type { ApiShop } from "./types";
import type { PosSelection } from "./filters";

// Minimální ApiShop pro test (jen pole, která resolver čte: id, brand_id).
function shop(id: string, brand_id: string): ApiShop {
  return { id, brand_id, name: id } as unknown as ApiShop;
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
