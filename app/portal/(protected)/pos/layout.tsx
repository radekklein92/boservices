import { redirect } from "next/navigation";
import { getSession } from "@/lib/portal/get-session";
import { canSeePOS } from "@/lib/portal/auth-guard";
import { isPosApiConfigured } from "@/lib/portal/pos/api";
import { getBrands } from "@/lib/portal/pos/queries";
import { PosFilterBar } from "@/components/portal/pos/PosFilterBar";

// POS / pokladní sekce vidí manager + admin + superadmin. Náhled role ("view as")
// se promítá - getSession vrací efektivní roli, takže gating je věrný.
// Filtr (PosFilterBar) žije v layoutu -> persistuje napříč POS obrazovkami.
export const dynamic = "force-dynamic";

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!canSeePOS(session?.user?.role)) redirect("/portal");

  let brands: { id: string; name: string }[] = [];
  if (isPosApiConfigured()) {
    try {
      brands = (await getBrands()).map((b) => ({ id: b.id, name: b.name }));
    } catch {
      brands = [];
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PosFilterBar brands={brands} currencies={["CZK", "EUR", "PLN"]} />
      {children}
    </div>
  );
}
