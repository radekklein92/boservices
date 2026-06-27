import { setAssumedRole } from "@/lib/portal/role-override-actions";
import { ASSUMABLE_ROLES } from "@/lib/portal/role-override";
import type { UserRole } from "@/lib/portal/users-db";

// Přepínač náhledu rolí. Vidí ho jen superadmin (realRole). Aktivní segment =
// efektivní role. Výběr posílá server action setAssumedRole, která nastaví/zruší
// cookie a přerenderuje layout. Bez JS (čisté <form> submity).
const LABELS: Record<UserRole, string> = {
  superadmin: "Super",
  admin: "Admin",
  user: "Uživatel",
};

export function RoleSwitcher({
  realRole,
  effectiveRole,
}: {
  realRole?: UserRole;
  effectiveRole?: UserRole;
}) {
  if (realRole !== "superadmin") return null;
  const active = effectiveRole ?? realRole;

  return (
    <div className="px-2 pb-2.5">
      <div className="px-1 pb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-mid">
        Náhled role
      </div>
      <div className="flex gap-0.5 rounded-lg bg-edge-warm p-0.5">
        {ASSUMABLE_ROLES.map((role) => {
          const isActive = active === role;
          return (
            <form key={role} action={setAssumedRole} className="min-w-0 flex-1">
              <input type="hidden" name="role" value={role} />
              <button
                type="submit"
                aria-pressed={isActive}
                title={LABELS[role]}
                className={`w-full truncate rounded-md px-1.5 py-1.5 text-[11px] font-medium transition-colors ${
                  isActive
                    ? "bg-paper text-ink-base shadow-[0_1px_3px_-1px_rgba(14,14,14,0.2)]"
                    : "text-ink-mid hover:text-ink-base"
                }`}
              >
                {LABELS[role]}
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}
