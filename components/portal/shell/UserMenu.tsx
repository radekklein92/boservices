import { LogOut } from "lucide-react";
import { cookies } from "next/headers";
import type { Session } from "next-auth";
import { signOut } from "@/auth";
import { ASSUME_ROLE_COOKIE } from "@/lib/portal/role-override";
import { isMaskedAccount, maskedDisplayName } from "@/lib/portal/masked-account";
import { RoleSwitcherButton } from "./RoleSwitcherButton";
import { DockNav } from "./DockNav";

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

// Spodní utility dock sidebaru: Dashboard + Úkoly (DockNav), avatar jako čistá
// identita (jméno a role v tooltipu, bez kliku), náhled role a odhlášení.
// Dashboard a Úkoly se sem přestěhovaly ze zrušené sekce „Hlavní", aby se menu
// vešlo na výšku běžného notebooku.
export function UserMenu({
  session,
  tasksBadge = 0,
}: {
  session: Session;
  tasksBadge?: number;
}) {
  const user = session.user;
  if (!user) return null;

  // Maskovaný účet majitele zobrazujeme i ve vlastním menu jako "Admin" (bez
  // odvození iniciál z e-mailu), aby se při sdílení obrazovky neukázalo jméno.
  const masked = isMaskedAccount(user.email);
  const displayName = maskedDisplayName(user.email, user.name) || "Uživatel";
  const initials = initialsFor(displayName, masked ? undefined : user.email);
  const roleLabel = user.role ? ROLE_LABELS[user.role] ?? user.role : "—";

  return (
    <div className="flex items-center justify-between">
      <DockNav tasksBadge={tasksBadge} />
      <div
        title={`${displayName} - ${roleLabel}`}
        className="grid h-8 w-8 shrink-0 cursor-default place-items-center rounded-full bg-ink-base text-[11px] font-bold tracking-tight text-paper"
      >
        {initials}
        <span className="sr-only">{`${displayName} - ${roleLabel}`}</span>
      </div>
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
          title="Odhlásit se"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-mid transition-colors hover:bg-edge-warm hover:text-ink-base"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
