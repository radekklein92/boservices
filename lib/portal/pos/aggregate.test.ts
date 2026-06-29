import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLfl, rollupSummary, scaleLastComparisonDay } from "./aggregate";
import type { ShopRevenueRow } from "./types";

function row(shop_id: string, gross: number, extra: Partial<ShopRevenueRow> = {}): ShopRevenueRow {
  return { shop_id, brand_id: "b", currency: "CZK", gross, net: gross, vat: 0, receipts: 1, ...extra };
}
const idKey = (id: string) => id; // 1 pokladna = 1 prodejna

test("rollupSummary - součet + avg_ticket + refund_rate", () => {
  // refunds jsou ZÁPORNÉ a gross je už NETTO po refundacích (API kontrakt od
  // 28.6.2026) -> refund_rate = součet(refunds) / součet(gross) (jako /revenue/summary).
  const rows = [row("A", 100, { receipts: 4, refunds: -10 }), row("B", 60, { receipts: 2, refunds: 0 })];
  const s = rollupSummary(rows, new Set(["A", "B"]), "CZK");
  assert.equal(s.gross, 160);
  assert.equal(s.receipts, 6);
  assert.equal(s.avg_ticket, 160 / 6);
  assert.equal(s.refund_rate, -10 / 160); // jen A mělo refundaci
});

test("rollupSummary - refund_rate null, když žádná pokladna nehlásí refunds", () => {
  const s = rollupSummary([row("A", 100)], new Set(["A"]), "CZK");
  assert.equal(s.refund_rate, null);
});

test("computeLfl - jen prodejny v OBOU obdobích (C chybí v prev -> mimo LFL)", () => {
  const cur = [row("A", 100), row("B", 200), row("C", 50)];
  const prev = [row("A", 80), row("B", 150)];
  const scope = new Set(["A", "B", "C"]);
  const { lflCurrent, lflComparison } = computeLfl(cur, prev, scope, idKey, "CZK");
  assert.equal(lflCurrent?.gross, 300); // A+B, NE C
  assert.equal(lflComparison?.gross, 230); // A+B v prev
});

test("computeLfl - žádný průnik prodejen -> null/null (delta se nevykreslí)", () => {
  const cur = [row("A", 100)];
  const prev = [row("B", 80)];
  const { lflCurrent, lflComparison } = computeLfl(cur, prev, new Set(["A", "B"]), idKey, "CZK");
  assert.equal(lflCurrent, null);
  assert.equal(lflComparison, null);
});

test("computeLfl - granularita PRODEJNY: obě pokladny lokality, i když jedna nemá prev", () => {
  // L = {p1, p2}; p1 má data v obou obdobích, p2 jen v aktuálním. Protože prodejna L je
  // aktivní v obou obdobích (díky p1), počítá se CELÁ L (p1+p2) v aktuálním období.
  const keyOf = (id: string) => (id === "p1" || id === "p2" ? "L" : id);
  const cur = [row("p1", 100), row("p2", 40)];
  const prev = [row("p1", 80)];
  const scope = new Set(["p1", "p2"]);
  const { lflCurrent, lflComparison } = computeLfl(cur, prev, scope, keyOf, "CZK");
  assert.equal(lflCurrent?.gross, 140); // p1+p2 (celá prodejna L)
  assert.equal(lflComparison?.gross, 80); // jen p1 měla prev řádek
});

test("computeLfl - refundace se sčítají jen z průniku", () => {
  const cur = [row("A", 100, { refunds: -10 }), row("C", 50, { refunds: -5 })];
  const prev = [row("A", 80, { refunds: -8 })];
  const { lflCurrent } = computeLfl(cur, prev, new Set(["A", "C"]), idKey, "CZK");
  assert.equal(lflCurrent?.refund_rate, -10 / 100); // C (mimo LFL) se nezapočítá
});

test("computeLfl - pokladny mimo scope se ignorují", () => {
  const cur = [row("A", 100), row("X", 999)];
  const prev = [row("A", 80), row("X", 999)];
  const { lflCurrent } = computeLfl(cur, prev, new Set(["A"]), idKey, "CZK");
  assert.equal(lflCurrent?.gross, 100); // X mimo scope
});

test("scaleLastComparisonDay - odečte (1-f) podíl posledního dne, ostatní beze změny", () => {
  // Okno = 7 dní; poslední den (= rozpracovaný dnešek) má v srovnání A:100, B:50.
  // Celé srovnání A:700 (z toho 100 poslední den), B:350 (z toho 50). f = 0,25 ->
  // odečte 75 % posledního dne: A:700-75=625, B:350-37,5=312,5.
  const prevFull = [row("A", 700, { net: 700, vat: 0, receipts: 70, refunds: -7 }), row("B", 350, { receipts: 35 })];
  const prevLast = [row("A", 100, { net: 100, vat: 0, receipts: 10, refunds: -2 }), row("B", 50, { receipts: 5 })];
  const out = scaleLastComparisonDay(prevFull, prevLast, 0.25);
  const a = out.find((r) => r.shop_id === "A")!;
  const b = out.find((r) => r.shop_id === "B")!;
  assert.equal(a.gross, 625);
  assert.equal(a.net, 625);
  assert.equal(a.receipts, Math.round(70 - 10 * 0.75)); // 63 (62,5 zaokr.)
  assert.equal(a.refunds, -7 - -2 * 0.75); // -5,5
  assert.equal(b.gross, 312.5);
});

test("scaleLastComparisonDay - f>=1 (den uplynul) -> beze změny; pokladna bez posledního dne beze změny", () => {
  const prevFull = [row("A", 700), row("C", 200)];
  const prevLast = [row("A", 100)];
  assert.equal(scaleLastComparisonDay(prevFull, prevLast, 1), prevFull); // referenčně beze změny
  const out = scaleLastComparisonDay(prevFull, prevLast, 0.5);
  assert.equal(out.find((r) => r.shop_id === "A")!.gross, 650); // 700 - 50
  assert.equal(out.find((r) => r.shop_id === "C")!.gross, 200); // C nemá poslední den -> beze změny
});
