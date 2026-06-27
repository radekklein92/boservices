"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Eye, Check } from "lucide-react";
import { setAssumedRole } from "@/lib/portal/role-override-actions";
import type { UserRole } from "@/lib/portal/users-db";

// Ikonové tlačítko (vedle odhlášení) → bublina s výběrem náhledu role.
// Vidí ho jen superadmin (realRole). Výběr posílá server action setAssumedRole.
// Pozn.: roli/labely držíme lokálně - role-override.ts importuje next/headers
// (server-only), nesmí se dostat do klientského bundlu.
const OPTIONS: { role: UserRole; label: string }[] = [
  { role: "superadmin", label: "Superadmin" },
  { role: "admin", label: "Admin" },
  { role: "user", label: "Uživatel" },
];

export function RoleSwitcherButton({
  realRole,
  effectiveRole,
}: {
  realRole?: UserRole;
  effectiveRole?: UserRole;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  // Zavřít na kliknutí mimo / Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (realRole !== "superadmin") return null;

  const active = effectiveRole ?? realRole;
  const previewing = Boolean(effectiveRole && effectiveRole !== realRole);

  function choose(role: UserRole) {
    const fd = new FormData();
    fd.set("role", role);
    startTransition(async () => {
      await setAssumedRole(fd);
      setOpen(false);
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Náhled role"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Náhled role"
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors ${
          previewing
            ? "bg-ink-base text-paper"
            : "text-ink-mid hover:bg-edge-warm hover:text-ink-base"
        }`}
      >
        <Eye className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full right-0 z-50 mb-2 w-48 rounded-xl border border-edge bg-paper p-1.5 shadow-[0_12px_40px_-12px_rgba(14,14,14,0.35)]"
        >
          <div className="px-2 pb-1.5 pt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-mid">
            Náhled role
          </div>
          {OPTIONS.map(({ role, label }) => {
            const isActive = active === role;
            return (
              <button
                key={role}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                disabled={pending}
                onClick={() => choose(role)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors disabled:opacity-50 ${
                  isActive
                    ? "bg-edge-warm text-ink-base"
                    : "text-ink-deep hover:bg-edge-warm hover:text-ink-base"
                }`}
              >
                <span className="flex-1 truncate">{label}</span>
                {isActive && (
                  <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
