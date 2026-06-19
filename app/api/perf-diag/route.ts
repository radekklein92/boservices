// DOČASNÝ diagnostický endpoint pro performance audit.
// Měří latenci Redis volání z reálné serverless funkce (potvrdí region + rozpad).
// Gated přes CRON_SECRET. Po dokončení auditu SMAZAT.
//
//   GET /api/perf-diag?key=<CRON_SECRET>
//
// Pozn.: složka NESMÍ začínat podtržítkem - Next.js App Router takové složky
// považuje za "private" a vyloučí je z routingu.

import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { listContracts } from "@/lib/portal/contracts-db";
import { listLocations } from "@/lib/portal/locations-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const t0 = performance.now();
  const value = await fn();
  return { ms: Math.round((performance.now() - t0) * 10) / 10, value };
}

function summarize(samples: number[]) {
  const s = [...samples].sort((a, b) => a - b);
  return {
    min: Math.round(s[0]! * 10) / 10,
    p50: Math.round(s[Math.floor(s.length / 2)]! * 10) / 10,
    max: Math.round(s[s.length - 1]! * 10) / 10,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const r = getRedis();
  if (!r) {
    return NextResponse.json({ ok: false, error: "redis not configured" }, { status: 503 });
  }

  // Čistá síťová latence funkce↔Redis: jednoduchý GET neexistujícího klíče, 10×.
  const pingSamples: number[] = [];
  for (let i = 0; i < 10; i++) {
    const { ms } = await timed(() => r.get(`perf:ping:${i}`));
    pingSamples.push(ms);
  }

  // Reálné agregační čtení (necachované) - kolik trvá z této funkce.
  const contracts = await timed(() => listContracts());
  const locations = await timed(() => listLocations());

  return NextResponse.json({
    ok: true,
    region: process.env.VERCEL_REGION ?? "unknown",
    redisPingMs: summarize(pingSamples),
    listContracts: { ms: contracts.ms, count: contracts.value.length },
    listLocations: { ms: locations.ms, count: locations.value.length },
    note: "redisPingMs = čistá round-trip latence funkce↔Redis. >50ms ⇒ region mismatch.",
  });
}
