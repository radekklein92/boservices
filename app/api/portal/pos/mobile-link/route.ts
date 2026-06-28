import { NextResponse } from "next/server";
import { toDataURL } from "qrcode";
import { requirePOS } from "@/lib/portal/auth-guard";
import { DEFAULT_POS_FILTER, parsePosFilter, serializePosFilter, type PosFilter } from "@/lib/portal/pos/filters";
import {
  deleteMobileLink,
  getMobileLinkByOwner,
  isValidPin,
  toPublic,
  upsertMobileLink,
  type MobileLink,
} from "@/lib/portal/pos/mobile-link-db";

// Správa osobního mobilního odkazu (1 na uživatele). GET = můj odkaz, POST = vytvořit
// /aktualizovat, DELETE = zneplatnit. Veřejné čtení dat řeší /m/[token]; odemčení PINem
// /api/m/[token]/unlock. Guard requirePOS (manager+).

export const dynamic = "force-dynamic";

function baseUrl(req: Request): string {
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}

async function linkResponse(req: Request, link: MobileLink) {
  const url = `${baseUrl(req)}/m/${link.token}`;
  let qr: string | null = null;
  try {
    qr = await toDataURL(url, { margin: 1, width: 240, errorCorrectionLevel: "M" });
  } catch {
    qr = null; // QR je doplněk; odkaz funguje i bez něj
  }
  return { ...toPublic(link), url, qr };
}

export async function GET(req: Request) {
  const g = await requirePOS();
  if (!g.ok) return g.response;
  const link = await getMobileLinkByOwner(g.session.user!.email!);
  if (!link) return NextResponse.json({ ok: true, link: null });
  return NextResponse.json({ ok: true, link: await linkResponse(req, link) });
}

export async function POST(req: Request) {
  const g = await requirePOS();
  if (!g.ok) return g.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Neplatný JSON." }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const pin = typeof b.pin === "string" ? b.pin.trim() : "";
  if (pin && !isValidPin(pin)) {
    return NextResponse.json({ ok: false, error: "PIN musí být 4-6 číslic." }, { status: 400 });
  }

  // Sanitizace výběru přes serialize→parse: zaručí, že uložíme jen to, co filtr umí
  // (validní koncepty, deduplikované tokeny, známá měna/okruh) - stejná pravidla jako URL.
  const selIn = (b.selection ?? {}) as { concepts?: unknown; locations?: unknown };
  const raw: PosFilter = {
    ...DEFAULT_POS_FILTER,
    selection: {
      concepts: (Array.isArray(selIn.concepts) ? selIn.concepts : []).filter(
        (x): x is string => typeof x === "string",
      ) as PosFilter["selection"]["concepts"],
      locations: (Array.isArray(selIn.locations) ? selIn.locations : []).filter(
        (x): x is string => typeof x === "string",
      ),
    },
    scope: b.scope === "all" ? "all" : "bos",
    currency: typeof b.currency === "string" ? b.currency : DEFAULT_POS_FILTER.currency,
    vatInclusive: b.vatInclusive !== false,
  };
  const clean = parsePosFilter(serializePosFilter(raw));

  try {
    const link = await upsertMobileLink(g.session.user!.email!, {
      selection: clean.selection,
      scope: clean.scope,
      currency: clean.currency,
      vatInclusive: clean.vatInclusive,
      pin: pin || undefined,
    });
    return NextResponse.json({ ok: true, link: await linkResponse(req, link) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Nepodařilo se uložit odkaz.";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function DELETE() {
  const g = await requirePOS();
  if (!g.ok) return g.response;
  await deleteMobileLink(g.session.user!.email!);
  return NextResponse.json({ ok: true });
}
