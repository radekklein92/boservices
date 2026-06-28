import { redirect } from "next/navigation";
import { getSession } from "@/lib/portal/get-session";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import { getAllShops, getBrands } from "@/lib/portal/pos/queries";
import { getBrandConceptMap, listIgnoredShops, listShopPairs } from "@/lib/portal/pos/pairing-db";
import { cachedListLocations } from "@/lib/portal/cached-db";
import { CONCEPT_LABEL } from "@/components/portal/locations/locations-shared";
import type { LocationConcept } from "@/lib/portal/locations-db";
import { PairingEditor } from "@/components/portal/pos/pairing/PairingEditor";
import { BrandConceptMap } from "@/components/portal/pos/pairing/BrandConceptMap";
import { PageHeader } from "@/components/portal/shell/PageHeader";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pokladna - Párování pokladen" };

const CONCEPTS = Object.keys(CONCEPT_LABEL) as LocationConcept[];

function tokenize(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

// Podobnost názvů = sdílené tokeny / max(délka). 0..1.
function score(a: string[], b: Set<string>): number {
  if (!a.length || !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / Math.max(a.length, b.size);
}

export default async function PairingPage() {
  const session = await getSession();
  if (!isAdminRole(session?.user?.role)) redirect("/portal/pos");

  if (!isPosApiConfigured()) {
    return (
      <Notice
        title="POS data nejsou nakonfigurovaná"
        body="Nastavte POS_API_BASE a POS_API_KEY v prostředí (Vercel), aby šlo načíst pokladny k napárování."
      />
    );
  }

  let shopsRaw: Awaited<ReturnType<typeof getAllShops>>;
  let brandsRaw: Awaited<ReturnType<typeof getBrands>>;
  let pairsRaw: Awaited<ReturnType<typeof listShopPairs>>;
  let locationsRaw: Awaited<ReturnType<typeof cachedListLocations>>;
  let brandConcept: Awaited<ReturnType<typeof getBrandConceptMap>>;
  let ignoredRaw: string[];
  try {
    [shopsRaw, brandsRaw, pairsRaw, locationsRaw, brandConcept, ignoredRaw] = await Promise.all([
      getAllShops(),
      getBrands(),
      listShopPairs(),
      cachedListLocations(),
      getBrandConceptMap(),
      listIgnoredShops(),
    ]);
  } catch {
    return <Notice title="Data dočasně nedostupná" body="Nepodařilo se načíst pokladny z API Data Warehouse." />;
  }

  const brandName = new Map(brandsRaw.map((b) => [b.id, b.name]));
  // Pozn.: protahujeme pole z DW (ApiShop) až do řádku, aby šlo pokladnu
  // jednoznačně identifikovat - název "zelená pokladna" sám o sobě nestačí.
  // Hlavní identifikátor je číslo cloudu (cloud_id).
  const shops = shopsRaw
    .map((s) => ({
      id: s.id,
      name: s.name,
      brandId: s.brand_id,
      brandName: brandName.get(s.brand_id) ?? s.brand_id,
      cloudId: s.cloud_id,
      city: s.city,
      country: s.country,
      currency: s.currency_code,
      timezone: s.timezone,
      isActive: s.is_active,
      openedOn: s.opened_on,
      closedOn: s.closed_on,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));

  const locations = locationsRaw
    .map((l) => ({ id: l.id, name: l.name, code: l.code }))
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));

  // Současné párování z pohledu pokladny. Počet pokladen na prodejně (hint
  // "už N pokladen") si editor dopočítá živě z těchto párů.
  const initialPairs: Record<string, { locationId: string | null; city: string }> = {};
  for (const p of pairsRaw) {
    if (p.locationId) initialPairs[p.dwShopId] = { locationId: p.locationId, city: p.city };
  }

  // Našeptávání: pro každou nenapárovanou pokladnu nejlépe sedící lokalita podle
  // podobnosti názvů (token match). Obsazené lokality se NEvylučují - jedna
  // prodejna může mít víc pokladen.
  const locTokens = locations.map((l) => ({ id: l.id, tokens: new Set(tokenize(l.name)) }));
  const suggestions: Record<string, string> = {};
  for (const s of shops) {
    if (initialPairs[s.id]?.locationId) continue;
    const st = tokenize(s.name);
    let best: string | null = null;
    let bestScore = 0;
    for (const lt of locTokens) {
      const sc = score(st, lt.tokens);
      if (sc > bestScore) {
        bestScore = sc;
        best = lt.id;
      }
    }
    if (best && bestScore >= 0.3) suggestions[s.id] = best;
  }

  const conceptOptions = CONCEPTS.map((c) => ({ value: c, label: CONCEPT_LABEL[c] }));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Administrace"
        title="Párování pokladen"
        lede="Ke každé pokladně z pokladního systému (Data Warehouse) vyberte odpovídající prodejnu (lokalitu portálu). Jedna prodejna může mít i víc pokladen. Město navrhne AI z názvu pokladny a prodejny. Pokladny, které se párovat nemají (cizí provozovny, akční kasy), lze ignorovat."
      />

      <BrandConceptMap
        brands={brandsRaw.map((b) => ({ id: b.id, name: b.name }))}
        initialMap={brandConcept}
        concepts={conceptOptions}
      />

      <PairingEditor
        shops={shops}
        locations={locations}
        initialPairs={initialPairs}
        suggestions={suggestions}
        ignoredShopIds={ignoredRaw}
      />
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-edge bg-paper p-6">
      <div className="text-[14px] font-semibold text-ink-base">{title}</div>
      <p className="mt-1.5 max-w-[60ch] text-[13px] text-ink-mid">{body}</p>
    </div>
  );
}
