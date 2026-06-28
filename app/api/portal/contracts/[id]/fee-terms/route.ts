import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/portal/auth-guard";
import { bustContracts } from "@/lib/portal/revalidate";
import {
  clientSignedAtEffective,
  getContract,
  upsertContract,
} from "@/lib/portal/contracts-db";
import {
  resolveRelativePeriods,
  type ContractFeeTerms,
  type FeeSource,
} from "@/lib/portal/contract-fee-terms";
import { ensureContractFeeTerms } from "@/lib/portal/contract-fee-ai";

// POST (re-extrakce) volá Claude přes text smlouvy - povolíme delší běh.
export const maxDuration = 60;

const dateStr = z
  .string()
  .max(40)
  .refine((s) => s === "" || /^\d{4}-\d{2}-\d{2}$/.test(s), {
    message: "Neplatné datum (RRRR-MM-DD)",
  });

const periodSchema = z.object({
  id: z.string().max(80),
  label: z.string().max(200),
  kind: z.enum(["franchise", "marketing", "operation", "cooperation", "other"]),
  percent: z.number().min(0).max(100),
  percentBase: z.string().max(200),
  amount: z.number().min(0).max(100_000_000),
  amountPeriod: z.enum(["monthly", "yearly", "one-time", "none"]),
  from: dateStr,
  to: dateStr,
  relativeFromMonth: z.number().int().min(0).max(600),
  relativeToMonth: z.number().int().min(0).max(600),
  note: z.string().max(2000),
});

// Klient posílá jen editovatelná pole. Audit / AI provenienci (aiModel,
// aiConfidence, aiNotes, extractedAt) zachováme z původního záznamu.
const bodySchema = z.object({
  effectiveFrom: dateStr,
  invoicingStartsFrom: dateStr,
  termEndsAt: dateStr,
  currency: z.string().max(10),
  periods: z.array(periodSchema).max(20),
  summary: z.string().max(2000),
});

function newId(): string {
  return globalThis.crypto.randomUUID();
}

// PUT - ruční úprava poplatků (na detailu lokality). Editovatelné dokud smlouva
// není zrušená. Nepřepisuje obsah smlouvy (html), jen feeTerms.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const { id } = await params;
  const contract = await getContract(id);
  if (!contract) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (contract.cancelledAt) {
    return NextResponse.json(
      { ok: false, error: "Zrušená smlouva - poplatky nelze upravovat." },
      { status: 409 },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Neplatná data poplatků." },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const prev = contract.feeTerms;
  // AI základ + ruční úpravy = „ai-edited"; jinak čistě „manual".
  const source: FeeSource =
    prev && (prev.source === "ai" || prev.source === "ai-edited")
      ? "ai-edited"
      : "manual";
  const now = new Date().toISOString();

  let feeTerms: ContractFeeTerms = {
    effectiveFrom: data.effectiveFrom,
    invoicingStartsFrom: data.invoicingStartsFrom,
    termEndsAt: data.termEndsAt,
    currency: data.currency.trim() || "CZK",
    periods: data.periods.map((p) => ({ ...p, id: p.id || newId() })),
    summary: data.summary.trim(),
    source,
    aiModel: prev?.aiModel ?? "",
    aiConfidence: prev?.aiConfidence ?? "none",
    aiNotes: prev?.aiNotes ?? "",
    extractedAt: prev?.extractedAt ?? "",
    updatedBy: g.session.user!.email!,
    updatedAt: now,
  };
  // Dopočti absolutní from/to z případných relativních měsíců (kde absolutní chybí).
  feeTerms = resolveRelativePeriods(
    feeTerms,
    (clientSignedAtEffective(contract) ?? "").slice(0, 10),
  );

  const { feeTermsError: _drop, ...rest } = contract;
  void _drop;
  await upsertContract({ ...rest, feeTerms, updatedAt: now });
  bustContracts();
  return NextResponse.json({ ok: true, feeTerms });
}

// POST - „Načíst / Obnovit z AI". ?force=1 přepíše i ručně upravené poplatky.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const { id } = await params;
  const contract = await getContract(id);
  if (!contract) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (contract.cancelledAt) {
    return NextResponse.json(
      { ok: false, error: "Zrušená smlouva - poplatky nelze načítat." },
      { status: 409 },
    );
  }

  const force = new URL(req.url).searchParams.get("force") === "1";
  const result = await ensureContractFeeTerms(contract, { force });

  if (result.skipped === "not-eligible") {
    return NextResponse.json(
      { ok: false, error: "Smlouva není ve stavu pro extrakci poplatků (musí být podepsaná klientem)." },
      { status: 409 },
    );
  }
  if (result.skipped === "manual-locked") {
    return NextResponse.json(
      {
        ok: false,
        locked: true,
        error: "Poplatky byly ručně upraveny. Pro přepsání z AI potvrďte obnovení.",
        feeTerms: result.feeTerms,
      },
      { status: 409 },
    );
  }
  if (result.skipped === "no-key-or-error" || !result.ok) {
    return NextResponse.json(
      { ok: false, error: "AI extrakce poplatků se nezdařila. Zkuste znovu nebo doplňte ručně." },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, feeTerms: result.feeTerms });
}
