import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { listContracts, type Contract } from "@/lib/portal/contracts-db";
import { shouldExtractFeeTerms } from "@/lib/portal/contract-fee-terms";
import { ensureContractFeeTerms } from "@/lib/portal/contract-fee-ai";

// Vercel Cron Job. vercel.json: "*/15 * * * *" (à 15 min).
//
// Doplní poplatky (feeTerms) approval-gated podepsaným smlouvám, kterým chybí -
// řeší ZÁROVEŇ: (a) jistotu, když inline extrakce při podpisu selhala, a
// (b) jednorázový backfill už podepsaných smluv. Idempotentní: hotové smlouvy
// (s feeTerms) se přeskakují, ručně upravené nepřepisuje (ensureContractFeeTerms).
//
// Dávkově s časovým rozpočtem (AI volání jsou pomalá) - zbytek dobere další běh.
// Autentizace stejná jako u ostatních cronů: Authorization: Bearer <CRON_SECRET>.

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const TIME_BUDGET_MS = 50_000;
const MAX_BATCH = 10;

// Jednorázový backfill: BRYSTAN PRO/POLSKA mají v textu odloženou fakturaci poplatku
// („za obrat vzniklý po …"), kterou starší extrakce mohla minout. Gated Redis flagem
// -> proběhne jednou. Po doběhnutí lze tento blok i flag odstranit.
const BRYSTAN_REEXTRACT_FLAG = "portal:fees:brystan-reextract-v1";

// Smlouva, které cron (re)generuje poplatky. Kromě backfillu (bez feeTerms) i
// migrace AI záznamů ve starém formátu (bez termEndsAt) a franšíz bez konce.
// Ručně upravené (source != "ai") nikdy nepřepisuje; korektní coop/op s termEndsAt:""
// (klíč existuje) nechá být - jinak by se zacyklil.
function needsFeeTerms(c: Contract): boolean {
  if (!shouldExtractFeeTerms(c)) return false;
  if (!c.feeTerms) return true;
  if (c.feeTerms.source !== "ai") return false;
  if (!("termEndsAt" in c.feeTerms)) return true;
  if (c.type === "franchise" && !c.feeTerms.termEndsAt) return true;
  return false;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const startedAt = Date.now();
  const all = await listContracts();

  // Jednorázová re-extrakce franšíz BRYSTAN, kde odklad fakturace není zachycen
  // (invoicingStartsFrom prázdné). Jen source "ai" (ruční úpravy se nepřepisují).
  let brystanReextracted = 0;
  const redis = getRedis();
  if (redis && !(await redis.get(BRYSTAN_REEXTRACT_FLAG))) {
    const brystan = all.filter(
      (c) =>
        c.type === "franchise" &&
        !c.cancelledAt &&
        /brystan/i.test(c.clientName) &&
        c.feeTerms?.source === "ai" &&
        !c.feeTerms.invoicingStartsFrom,
    );
    let done = true;
    for (const c of brystan) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        done = false;
        break;
      }
      const r = await ensureContractFeeTerms(c, { force: true });
      if (r.ok) brystanReextracted++;
    }
    if (done) await redis.set(BRYSTAN_REEXTRACT_FLAG, new Date().toISOString());
  }

  const pending = all.filter(needsFeeTerms);

  let processed = 0;
  let failed = 0;
  for (const c of pending.slice(0, MAX_BATCH)) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;
    const r = await ensureContractFeeTerms(c);
    if (r.ok) processed++;
    else failed++;
  }

  return NextResponse.json({
    ok: true,
    pending: pending.length,
    processed,
    failed,
    brystanReextracted,
    remaining: Math.max(0, pending.length - processed),
    durationMs: Date.now() - startedAt,
  });
}
