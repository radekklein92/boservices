import { redirect } from "next/navigation";
import { getSession } from "@/lib/portal/get-session";
import { canSeePOS } from "@/lib/portal/auth-guard";

// POS / pokladní sekce vidí manager + admin + superadmin. Náhled role ("view as")
// se promítá - getSession vrací efektivní roli, takže gating je věrný.
export const dynamic = "force-dynamic";

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!canSeePOS(session?.user?.role)) redirect("/portal");
  return <>{children}</>;
}
