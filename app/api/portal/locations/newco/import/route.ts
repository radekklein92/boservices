import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/portal/auth-guard";
import {
  listLocations,
  saveNewCoMapping,
  setLocationNewCo,
  type LocationNewCo,
} from "@/lib/portal/locations-db";
import { NEWCO_RED_THRESHOLD, type NewCoMapping } from "@/lib/portal/newco-fields";
import { bustLocations } from "@/lib/portal/revalidate";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  mapping: z.object({
    entitaCeip1: z.string(),
    entitaCeip2: z.string(),
    field103: z.string(),
    includeInBusinessPlan: z.string(),
    operationalType: z.string(),
    category: z.string(),
    code: z.string().min(1),
  }),
  rows: z.array(z.record(z.string(), z.string())).max(5000),
  rowRedCounts: z.array(z.number()),
});

const normCode = (s: string) => s.trim().toUpperCase();

export async function POST(req: Request) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Neplatné mapování nebo data. Vyberte aspoň sloupec s kódem." },
      { status: 400 },
    );
  }
  const mapping = parsed.data.mapping as NewCoMapping;
  const { rows, rowRedCounts } = parsed.data;

  // code → id mapa z aktuálních lokalit (kód je match-klíč).
  const locations = await listLocations();
  const codeToId = new Map<string, string>();
  for (const l of locations) {
    if (l.code) codeToId.set(normCode(l.code), l.id);
  }

  const email = g.session.user!.email!;
  const importedAt = new Date().toISOString();
  const cell = (row: Record<string, string>, letter: string) =>
    letter ? (row[letter] ?? "") : "";

  let matched = 0;
  let flaggedRed = 0;
  let noCode = 0;
  const unmatched: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const codeVal = cell(row, mapping.code).trim();
    if (!codeVal) {
      noCode++;
      continue;
    }
    const id = codeToId.get(normCode(codeVal));
    if (!id) {
      unmatched.push(codeVal);
      continue;
    }
    const isRed = (rowRedCounts[i] ?? 0) >= NEWCO_RED_THRESHOLD;
    const newco: LocationNewCo = {
      entitaCeip1: cell(row, mapping.entitaCeip1),
      entitaCeip2: cell(row, mapping.entitaCeip2),
      field103: cell(row, mapping.field103),
      includeInBusinessPlan: cell(row, mapping.includeInBusinessPlan),
      operationalType: cell(row, mapping.operationalType),
      category: cell(row, mapping.category),
      flaggedRed: isRed,
      importedBy: email,
      importedAt,
    };
    await setLocationNewCo(id, newco);
    matched++;
    if (isRed) flaggedRed++;
  }

  await saveNewCoMapping(mapping);
  bustLocations();

  return NextResponse.json({
    ok: true,
    total: rows.length,
    matched,
    flaggedRed,
    noCode,
    unmatchedCount: unmatched.length,
    unmatched: unmatched.slice(0, 50),
  });
}
