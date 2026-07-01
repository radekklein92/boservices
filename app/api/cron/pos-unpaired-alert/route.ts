import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/portal/cron-auth";
import { getRedis } from "@/lib/redis";
import { getSession } from "@/lib/portal/get-session";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import { getAllShops, getBrands } from "@/lib/portal/pos/queries";
import { listShopPairs, listIgnoredShops } from "@/lib/portal/pos/pairing-db";
import { notifyUnpairedShops } from "@/lib/email";

// Vercel Cron + admin na vyžádání. Najde pokladny (DW shops) bez napárované
// prodejny (a neignorované) a pošle adminovi e-mail. Logika "nenapárováno" se
// shoduje s /portal/admin/pos-pairing: pár s locationId = napárováno, set
// ignored-shops = vyřazeno.
//
// Dvojí spouštění:
//   - CRON (Authorization: Bearer <CRON_SECRET>) -> denně; e-mail jen když se
//     množina nenapárovaných od posledně ZMĚNILA (dedup přes Redis), ať to
//     nespamuje pořád dokola stejným seznamem.
//   - ADMIN (přihlášený admin otevře URL v prohlížeči) -> "force": pošle vždy,
//     když nějaké nenapárované jsou (a razítko aktualizuje).
//
// Na local devu bez CRON_SECRET se cron auth přeskočí (stejně jako ostatní crony).

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SIG_KEY = "portal:pos:unpaired-alert:last"; // poslední ohlášená množina (dedup)

export async function GET(req: Request) {
  // Auth: nejdřív CRON_SECRET (Bearer, fail-closed v produkci); když nesedí, zkus
  // přihlášeného admina (on-demand). verifyCronAuth vrací null když je cron OK.
  const isCron = verifyCronAuth(req) === null;
  let force = false;
  if (!isCron) {
    const session = await getSession();
    if (!isAdminRole(session?.user?.role)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    force = true; // admin si to vyžádal ručně -> pošli vždy
  }
  if (new URL(req.url).searchParams.get("force") === "1") force = true;

  if (!isPosApiConfigured()) {
    return NextResponse.json({ ok: true, skipped: "POS API not configured" });
  }

  // Pokladny bez prodejny = všechny shopy mínus napárované (pár s locationId)
  // mínus ignorované.
  const [shops, brands, pairs, ignored] = await Promise.all([
    getAllShops(),
    getBrands(),
    listShopPairs(),
    listIgnoredShops(),
  ]);
  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const pairedIds = new Set(pairs.filter((p) => p.locationId).map((p) => p.dwShopId));
  const ignoredIds = new Set(ignored);

  const unpaired = shops
    .filter((s) => !pairedIds.has(s.id) && !ignoredIds.has(s.id))
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));

  if (unpaired.length === 0) {
    return NextResponse.json({ ok: true, sent: false, count: 0, message: "Všechny pokladny jsou napárované." });
  }

  // Dedup: u cronu posílej jen při změně množiny; admin force posílá vždy.
  const signature = unpaired.map((s) => s.id).sort().join(",");
  const r = getRedis();
  if (!force && r) {
    const last = await r.get<string>(SIG_KEY);
    if (last === signature) {
      return NextResponse.json({
        ok: true,
        sent: false,
        count: unpaired.length,
        message: "Beze změny od posledního upozornění - e-mail neodeslán.",
      });
    }
  }

  try {
    await notifyUnpairedShops(
      unpaired.map((s) => ({
        name: s.name,
        cloudId: s.cloud_id,
        brandName: brandName.get(s.brand_id) ?? s.brand_id,
      })),
    );
  } catch (err) {
    console.error("[pos-unpaired-alert] e-mail failed", err);
    return NextResponse.json({ ok: false, error: "E-mail selhal." }, { status: 500 });
  }

  if (r) await r.set(SIG_KEY, signature);

  return NextResponse.json({
    ok: true,
    sent: true,
    count: unpaired.length,
    shops: unpaired.map((s) => ({ name: s.name, cloud_id: s.cloud_id })),
  });
}
