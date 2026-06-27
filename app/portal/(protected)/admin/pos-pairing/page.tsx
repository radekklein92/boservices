import { redirect } from "next/navigation";
import { getSession } from "@/lib/portal/get-session";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import { getAllShops, getBrands } from "@/lib/portal/pos/queries";
import { getBrandConceptMap, listShopPairs } from "@/lib/portal/pos/pairing-db";
import { cachedListLocations } from "@/lib/portal/cached-db";
import { CONCEPT_LABEL } from "@/components/portal/locations/locations-shared";
import type { LocationConcept } from "@/lib/portal/locations-db";
import { PairingEditor } from "@/components/portal/pos/pairing/PairingEditor";
import { BrandConceptMap } from "@/components/portal/pos/pairing/BrandConceptMap";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pokladna - Párování pokladen" };

const CONCEPTS = Object.keys(CONCEPT_LABEL) as LocationConcept[];

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export default async function PairingPage() {
  const session = await getSession();
  if (!isAdminRole(session?.user?.role)) redirect("/portal/pos");

  if (!isPosApiConfigured()) {
    return (
      <Notice
        title="POS data nejsou nakonfigurovaná"
        body="Nastavte POS_API_BASE a POS_API_KEY v prostředí (Vercel), aby šlo načíst pobočky k napárování."
      />
    );
  }

  let shopsRaw: Awaited<ReturnType<typeof getAllShops>>;
  let brandsRaw: Awaited<ReturnType<typeof getBrands>>;
  let pairsRaw: Awaited<ReturnType<typeof listShopPairs>>;
  let locationsRaw: Awaited<ReturnType<typeof cachedListLocations>>;
  let brandConcept: Awaited<ReturnType<typeof getBrandConceptMap>>;
  try {
    [shopsRaw, brandsRaw, pairsRaw, locationsRaw, brandConcept] = await Promise.all([
      getAllShops(),
      getBrands(),
      listShopPairs(),
      cachedListLocations(),
      getBrandConceptMap(),
    ]);
  } catch {
    return <Notice title="Data dočasně nedostupná" body="Nepodařilo se načíst pobočky z API Data Warehouse." />;
  }

  const brandName = new Map(brandsRaw.map((b) => [b.id, b.name]));
  const locations = locationsRaw
    .map((l) => ({ id: l.id, name: l.name, code: l.code, concept: l.concept as string }))
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));

  const pairByShop = new Map(pairsRaw.map((p) => [p.dwShopId, p]));
  const shops = shopsRaw
    .map((s) => ({
      id: s.id,
      name: s.name,
      brandId: s.brand_id,
      brandName: brandName.get(s.brand_id) ?? s.brand_id,
      city: s.city,
      code: s.code,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));

  // Návrhy: nenapárované pobočky -> lokalita se shodným normalizovaným názvem.
  const locByNorm = new Map<string, string>();
  for (const l of locations) {
    const k = norm(l.name);
    if (k && !locByNorm.has(k)) locByNorm.set(k, l.id);
  }
  const suggestions: Record<string, string> = {};
  const initialPairs: Record<string, { locationId: string | null; city: string }> = {};
  for (const s of shops) {
    const pair = pairByShop.get(s.id);
    initialPairs[s.id] = { locationId: pair?.locationId ?? null, city: pair?.city ?? "" };
    if (!pair?.locationId) {
      const hit = locByNorm.get(norm(s.name));
      if (hit) suggestions[s.id] = hit;
    }
  }

  // Osiřelé párování = záznam k pobočce, která už v DW není.
  const shopIds = new Set(shops.map((s) => s.id));
  const orphaned = pairsRaw
    .filter((p) => !shopIds.has(p.dwShopId))
    .map((p) => ({ dwShopId: p.dwShopId, dwShopName: p.dwShopName, city: p.city }));

  const conceptOptions = CONCEPTS.map((c) => ({ value: c, label: CONCEPT_LABEL[c] }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-[1.3rem] font-extrabold tracking-[-0.02em] text-ink-base">Párování pokladen</h2>
        <p className="mt-1 max-w-[70ch] text-[13px] text-ink-mid">
          Napárujte pobočky z pokladního systému (Data Warehouse) na lokality portálu a doplňte město.
          Město a párování jsou autoritativní pro filtr podle měst a propojení s lokalitami.
        </p>
      </div>

      <BrandConceptMap brands={brandsRaw.map((b) => ({ id: b.id, name: b.name }))} initialMap={brandConcept} concepts={conceptOptions} />

      <PairingEditor
        shops={shops}
        locations={locations}
        initialPairs={initialPairs}
        suggestions={suggestions}
        orphaned={orphaned}
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
