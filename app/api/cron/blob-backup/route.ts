import { NextResponse } from "next/server";
import { list, get, put } from "@vercel/blob";

// Inkrementální záloha SKENŮ z primárního Vercel Blob storu do záložního storu.
// Skeny jsou nenahraditelné originály (podepsané smlouvy); generovaná PDF jdou
// znovu vytvořit z dat v Redisu, proto se nezálohují.
//
// Běží 1× za 24 h (vercel.json cron). Kopíruje jen bloby, které v záloze ještě
// nejsou (idempotentní, levné). Záloha se nikdy nemaže - drží i nahrazené skeny.
//
// Konfigurace: BLOB_BACKUP_READ_WRITE_TOKEN = read-write token DRUHÉHO Blob storu.
// Dokud není nastaven, cron je no-op (nezahltí logy chybami).

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Necháme si rezervu proti maxDuration - když dojde čas, vrátíme partial a
// zbytek se dokopíruje při příštím běhu (incremental je self-healing).
const TIME_BUDGET_MS = 50_000;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const primaryToken = process.env.BLOB_READ_WRITE_TOKEN;
  const backupToken = process.env.BLOB_BACKUP_READ_WRITE_TOKEN;
  if (!primaryToken) {
    return NextResponse.json(
      { ok: false, error: "BLOB_READ_WRITE_TOKEN (primární) chybí." },
      { status: 500 },
    );
  }
  if (!backupToken) {
    // Záloha ještě není nastavená - čistý no-op (2xx, ať cron nehlásí chybu).
    return NextResponse.json({
      ok: false,
      reason: "not-configured",
      error: "BLOB_BACKUP_READ_WRITE_TOKEN není nastaven - záloha přeskočena.",
    });
  }
  if (primaryToken === backupToken) {
    return NextResponse.json(
      { ok: false, error: "Záložní token je shodný s primárním - musí mířit do jiného storu." },
      { status: 500 },
    );
  }

  const startedAt = Date.now();

  // 1) Co už v záloze je (množina cest).
  const backupPaths = new Set<string>();
  try {
    let cursor: string | undefined;
    do {
      const res = await list({ token: backupToken, cursor, limit: 1000 });
      for (const b of res.blobs) backupPaths.add(b.pathname);
      cursor = res.cursor;
    } while (cursor);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Čtení záložního storu selhalo: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  // 2) Projít skeny v primárním storu a dokopírovat chybějící.
  let copied = 0;
  let skipped = 0;
  let failed = 0;
  let incomplete = false;
  const errors: string[] = [];

  let cursor: string | undefined;
  outer: do {
    const res = await list({
      token: primaryToken,
      prefix: "portal/contracts/",
      cursor,
      limit: 250,
    });
    const scans = res.blobs.filter((b) => b.pathname.includes("/scans/"));
    for (const b of scans) {
      if (backupPaths.has(b.pathname)) {
        skipped++;
        continue;
      }
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        incomplete = true;
        break outer;
      }
      try {
        const r = await get(b.pathname, {
          access: "private",
          token: primaryToken,
          useCache: false,
        });
        if (!r || r.statusCode !== 200) {
          failed++;
          errors.push(`${b.pathname}: nelze načíst`);
          continue;
        }
        const buf = Buffer.from(await new Response(r.stream).arrayBuffer());
        await put(b.pathname, buf, {
          access: "private",
          token: backupToken,
          contentType: r.blob.contentType || "application/pdf",
          addRandomSuffix: false,
          allowOverwrite: true,
        });
        copied++;
      } catch (err) {
        failed++;
        errors.push(`${b.pathname}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    cursor = res.cursor;
  } while (cursor);

  return NextResponse.json({
    ok: true,
    copied,
    skipped,
    failed,
    incomplete,
    durationMs: Date.now() - startedAt,
    errors: errors.slice(0, 20),
  });
}
