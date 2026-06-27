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
        body="Nastavte POS_API_BASE a POS_API_KEY v prostředí (Vercel), aby šlo načíst pokladny k napárování."
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
    return <Notice title="Data dočasně nedostupná" body="Nepodařilo se načíst pokladny z API Data Warehouse." />;
  }

  const brandName = new Map(brandsRaw.map((b) => [b.id, b.name]));
  const shops = shopsRaw
    .map((s) => ({
      id: s.id,
      name: s.name,
      brandId: s.brand_id,
      brandName: brandName.get(s.brand_id) ?? s.brand_id,
      city: s.city,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));

  const locations = locationsRaw
    .map((l) => ({ id: l.id, name: l.name, code: l.code }))
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));

  // Současné párování z pohledu lokality + množina přiřazených pokladen.
  const initialPairs: Record<string, { dwShopId: string | null; city: string }> = {};
  const assignedShopIds = new Set<string>();
  for (const p of pairsRaw) {
    if (p.locationId) {
      initialPairs[p.locationId] = { dwShopId: p.dwShopId, city: p.city };
      assignedShopIds.add(p.dwShopId);
    }
  }

  // Návrhy: lokalita bez párování -> nepřiřazená pokladna se shodným názvem.
  const shopByNorm = new Map<string, string>();
  for (const s of shops) {
    if (assignedShopIds.has(s.id)) continue;
    const k = norm(s.name);
    if (k && !shopByNorm.has(k)) shopByNorm.set(k, s.id);
  }
  const suggestions: Record<string, string> = {};
  for (const loc of locations) {
    if (initialPairs[loc.id]?.dwShopId) continue;
    const hit = shopByNorm.get(norm(loc.name));
    if (hit) suggestions[loc.id] = hit;
  }

  const unpairedShops = shops.filter((s) => !assignedShopIds.has(s.id));
  const conceptOptions = CONCEPTS.map((c) => ({ value: c, label: CONCEPT_LABEL[c] }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-[1.3rem] font-extrabold tracking-[-0.02em] text-ink-base">Párování pokladen</h2>
        <p className="mt-1 max-w-[70ch] text-[13px] text-ink-mid">
          Ke každé lokalitě portálu přiřaďte odpovídající pokladnu z pokladního systému (Data Warehouse)
          a doplňte město. Párování a město jsou autoritativní pro filtr podle měst a propojení tržeb s lokalitami.
        </p>
      </div>

      <BrandConceptMap
        brands={brandsRaw.map((b) => ({ id: b.id, name: b.name }))}
        initialMap={brandConcept}
        concepts={conceptOptions}
      />

      <PairingEditor
        locations={locations}
        shops={shops}
        initialPairs={initialPairs}
        suggestions={suggestions}
        unpairedShops={unpairedShops}
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
