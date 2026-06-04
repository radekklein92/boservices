import { NextResponse } from "next/server";
import { requireSession } from "@/lib/portal/auth-guard";
import { getNewCoMapping } from "@/lib/portal/locations-db";
import { parseXlsxSheet } from "@/lib/portal/xlsx";
import { suggestNewCoMapping } from "@/lib/portal/newco-fields";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Nahraje a rozparsuje NewCo XLSX (1. list). Vrátí detekované sloupce, řádky
// (keyed písmenem sloupce), počty červených buněk na řádek a navržené mapování
// (alias hlaviček + uložené mapování). Vlastní import dělá .../import.
export async function POST(req: Request) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Neplatný formulář." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Chybí soubor." }, { status: 400 });
  }
  const isXlsx =
    file.name.toLowerCase().endsWith(".xlsx") ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (!isXlsx) {
    return NextResponse.json({ ok: false, error: "Nahrajte soubor XLSX." }, { status: 400 });
  }
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "Soubor je větší než 15 MB." }, { status: 400 });
  }

  let parsed;
  try {
    const buf = await file.arrayBuffer();
    parsed = await parseXlsxSheet(buf);
  } catch (err) {
    console.error("[newco/parse] parse failed", err);
    return NextResponse.json(
      { ok: false, error: "Soubor se nepodařilo přečíst (není to platný XLSX?)." },
      { status: 400 },
    );
  }

  const saved = await getNewCoMapping();
  const suggestedMapping = suggestNewCoMapping(parsed.columns, saved);

  return NextResponse.json({
    ok: true,
    sheetName: parsed.sheetName,
    columns: parsed.columns,
    rows: parsed.rows,
    rowRedCounts: parsed.rowRedCounts,
    rowCount: parsed.rows.length,
    suggestedMapping,
  });
}
