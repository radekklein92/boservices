import { redirect } from "next/navigation";
import { getSession } from "@/lib/portal/get-session";
import { canSeePOS } from "@/lib/portal/auth-guard";

// POS / pokladní sekce vidí manager + admin + superadmin (efektivní role z
// getSession kvůli "view as"). Layout je jen tenký guard + rozteč - hlavičku
// (PageHeader), filtr a navigaci si nese KAŽDÁ stránka sama (konzistentně se
// zbytkem portálu; rozcestník místo tabů).
export const dynamic = "force-dynamic";

export default async function PosLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  const session = await getSession();
  if (!canSeePOS(session?.user?.role)) redirect("/portal");
  return (
    <div className="flex flex-col gap-8">
      {children}
      {modal}
    </div>
  );
}
