import { Eye } from "lucide-react";
import { clearAssumedRole } from "@/lib/portal/role-override-actions";
import type { UserRole } from "@/lib/portal/users-db";

// Banner nad obsahem, když superadmin prohlíží portál jako nižší role.
// Drží jasný signál "tohle není tvoje skutečná role" + rychlý odchod.
const LABELS: Record<UserRole, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  user: "Uživatel",
};

export function RoleAssumptionBanner({
  assumedRole,
  realRole,
}: {
  assumedRole?: UserRole;
  realRole?: UserRole;
}) {
  if (!assumedRole) return null;

  return (
    <div className="mb-6 flex items-center gap-3 rounded-xl bg-ink-base px-4 py-2.5 text-paper">
      <Eye className="h-4 w-4 shrink-0 text-paper/80" strokeWidth={1.5} aria-hidden="true" />
      <div className="min-w-0 flex-1 text-[12.5px] leading-tight">
        <span className="font-semibold">Náhled role: {LABELS[assumedRole]}</span>
        <span className="text-paper/55">
          {" "}
          · tvoje skutečná role je {LABELS[realRole ?? "superadmin"]}
        </span>
      </div>
      <form action={clearAssumedRole} className="shrink-0">
        <button
          type="submit"
          className="rounded-lg bg-paper/10 px-3 py-1.5 text-[11.5px] font-semibold text-paper transition-colors hover:bg-paper/20"
        >
          Ukončit náhled
        </button>
      </form>
    </div>
  );
}
