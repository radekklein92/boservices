import { LogOut } from "lucide-react";
import { cookies } from "next/headers";
import type { Session } from "next-auth";
import { signOut } from "@/auth";
import { ASSUME_ROLE_COOKIE } from "@/lib/portal/role-override";
import { RoleSwitcherButton } from "./RoleSwitcherButton";

const ROLE_LABELS: Record<string, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  manager: "Manažer",
  user: "Uživatel",
};

function initialsFor(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name ?? email ?? "?").trim();
  if (!source) return "?";
  const parts = source.split(/[\s.@]+/).filter(Boolean);
  if (parts.length === 0) return source[0]!.toUpperCase();
  const first = parts[0]![0] ?? "";
  const second = parts.length > 1 ? parts[parts.length - 1]![0] : "";
  return (first + second).toUpperCase().slice(0, 2);
}

export function UserMenu({ session }: { session: Session }) {
  const user = session.user;
  if (!user) return null;

  const initials = initialsFor(user.name, user.email);
  const roleLabel = user.role ? ROLE_LABELS[user.role] ?? user.role : "—";
  const displayName = user.name ?? user.email ?? "Uživatel";

  return (
    <div className="flex items-center gap-3 rounded-xl px-2 py-2">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-base text-[11.5px] font-bold tracking-tight text-paper">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold leading-tight text-ink-base">
          {displayName}
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-mid">
          {roleLabel}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {/* Náhled role - jen pro superadmina (komponenta si to ohlídá sama). */}
        <RoleSwitcherButton realRole={user.realRole} effectiveRole={user.role} />
        <form
          action={async () => {
            "use server";
            // Náhled role je vázaný na session - při odhlášení ho zruš, ať se
            // po dalším přihlášení nezačne v cizí roli.
            (await cookies()).delete(ASSUME_ROLE_COOKIE);
            await signOut({ redirectTo: "/portal/login" });
          }}
        >
          <button
            type="submit"
            aria-label="Odhlásit se"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-mid transition-colors hover:bg-edge-warm hover:text-ink-base"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  );
}
