"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X, PenLine, Gavel } from "lucide-react";
import type { SignerFunction, User, UserRole } from "@/lib/portal/users-db";

type EditableUser = Pick<
  User,
  "email" | "name" | "role" | "isSigner" | "signerFunction" | "signerDisplayName"
>;

export function EditUserModal({
  user,
  canEditSuperadmin,
  onClose,
  onSaved,
}: {
  user: EditableUser;
  canEditSuperadmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [role, setRole] = useState<UserRole>(user.role);
  const [isSigner, setIsSigner] = useState<boolean>(!!user.isSigner);
  const [signerFunction, setSignerFunction] = useState<SignerFunction>(
    user.signerFunction ?? "jednatel",
  );
  const [signerDisplayName, setSignerDisplayName] = useState<string>(
    user.signerDisplayName ?? "",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/portal/users/${encodeURIComponent(user.email)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          isSigner,
          signerFunction: isSigner ? signerFunction : null,
          signerDisplayName: isSigner ? signerDisplayName.trim() || null : null,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Chyba");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chyba");
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-base/40 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[520px] rounded-[28px] border border-edge bg-paper p-8 shadow-[0_24px_60px_-20px_rgba(14,14,14,0.35)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink-mid">
              Úprava uživatele
            </div>
            <h2 className="mt-2 font-extrabold text-ink-base text-[1.5rem] leading-[1.1] tracking-[-0.025em]">
              {user.name || user.email}
            </h2>
            <div className="mt-1 text-[12.5px] text-ink-mid">{user.email}</div>
          </div>
          <button
            type="button"
            aria-label="Zavřít"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-ink-mid transition-colors hover:bg-edge-warm hover:text-ink-base"
          >
            <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={onSubmit} noValidate className="mt-7 flex flex-col gap-6">
          <Field label="Role">
            <div className="flex flex-wrap gap-2">
              <RoleChip
                ref={firstRef}
                active={role === "admin"}
                onClick={() => setRole("admin")}
                label="Admin"
                hint="Klienti, smlouvy + správa uživatelů."
              />
              <RoleChip
                active={role === "user"}
                onClick={() => setRole("user")}
                label="Uživatel"
                hint="Klienti a smlouvy. Bez správy uživatelů."
              />
              {(role === "superadmin" || canEditSuperadmin) && (
                <RoleChip
                  active={role === "superadmin"}
                  onClick={() => setRole("superadmin")}
                  label="Superadmin"
                  hint="Plný přístup, včetně mazání superadmin účtů."
                />
              )}
            </div>
          </Field>

          <Field label="Podepisující">
            <button
              type="button"
              onClick={() => setIsSigner((v) => !v)}
              className={[
                "flex w-full items-center gap-4 rounded-2xl border px-5 py-4 text-left transition-all duration-200",
                isSigner
                  ? "border-ink-base bg-ink-base text-paper"
                  : "border-edge bg-paper text-ink-deep hover:border-ink-soft",
              ].join(" ")}
              aria-pressed={isSigner}
            >
              <span
                className={[
                  "grid h-9 w-9 shrink-0 place-items-center rounded-full",
                  isSigner ? "bg-paper text-ink-base" : "bg-edge-warm text-ink-mid",
                ].join(" ")}
              >
                <PenLine className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold tracking-[-0.01em]">
                  {isSigner ? "Smí podepisovat smlouvy za BOServices" : "Aktivovat podepisující"}
                </span>
                <span
                  className={`mt-0.5 block text-[11.5px] leading-snug ${
                    isSigner ? "text-paper/70" : "text-ink-mid"
                  }`}
                >
                  Lze přiřadit k jakékoli smlouvě jako toho, kdo ji podepíše.
                </span>
              </span>
              <span
                className={[
                  "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                  isSigner ? "bg-paper" : "bg-edge",
                ].join(" ")}
                aria-hidden="true"
              >
                <span
                  className={[
                    "absolute top-0.5 h-5 w-5 rounded-full bg-ink-base transition-transform",
                    isSigner ? "translate-x-[22px]" : "translate-x-0.5",
                  ].join(" ")}
                />
              </span>
            </button>
          </Field>

          {isSigner && (
            <>
              <Field label="Funkce">
                <div className="flex flex-wrap gap-2">
                  <FunctionChip
                    active={signerFunction === "jednatel"}
                    onClick={() => setSignerFunction("jednatel")}
                    label="Jednatel"
                    hint={`V PDF se zobrazí jako „jednatel".`}
                  />
                  <FunctionChip
                    active={signerFunction === "power-of-attorney"}
                    onClick={() => setSignerFunction("power-of-attorney")}
                    label="Na základě plné moci"
                    hint={`V PDF se zobrazí „na základě plné moci".`}
                  />
                </div>
              </Field>

              <Field label="Jméno v PDF (volitelné)">
                <input
                  type="text"
                  value={signerDisplayName}
                  onChange={(e) => setSignerDisplayName(e.target.value)}
                  placeholder={user.name ? `např. Ing. ${user.name}` : "Ing. Jiří Slavkovský"}
                  className="h-12 w-full rounded-xl border border-edge bg-paper px-4 text-[15px] text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base"
                />
                <div className="mt-1 text-[11.5px] text-ink-mid">
                  Pro formální titul (Ing., Mgr.). Pokud necháš prázdné, použije se „{user.name || user.email}&#8221;.
                </div>
              </Field>
            </>
          )}

          {error && (
            <div role="alert" className="text-[13px] text-ink-deep">
              {error}
            </div>
          )}

          <div className="mt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="h-12 rounded-full px-5 text-[13.5px] font-medium text-ink-mid transition-colors hover:text-ink-base"
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-ink-base px-6 text-[13.5px] font-semibold text-paper transition-transform active:translate-y-px disabled:opacity-60"
            >
              {pending ? "Ukládám…" : "Uložit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mid">
        {label}
      </span>
      {children}
    </label>
  );
}

function RoleChip({
  active,
  onClick,
  label,
  hint,
  ref,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={[
        "flex-1 min-w-[140px] rounded-xl border px-4 py-3 text-left transition-all duration-200",
        active
          ? "border-ink-base bg-ink-base text-paper"
          : "border-edge bg-paper text-ink-deep hover:border-ink-soft",
      ].join(" ")}
    >
      <div className="text-[13.5px] font-semibold tracking-[-0.01em]">{label}</div>
      <div
        className={`mt-0.5 text-[11px] leading-snug ${
          active ? "text-paper/65" : "text-ink-mid"
        }`}
      >
        {hint}
      </div>
    </button>
  );
}

function FunctionChip({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex flex-1 min-w-[170px] items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-200",
        active
          ? "border-ink-base bg-ink-base text-paper"
          : "border-edge bg-paper text-ink-deep hover:border-ink-soft",
      ].join(" ")}
    >
      <Gavel
        className={`mt-0.5 h-4 w-4 shrink-0 ${active ? "text-paper" : "text-ink-mid"}`}
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold tracking-[-0.01em]">{label}</span>
        <span
          className={`mt-0.5 block text-[11px] leading-snug ${
            active ? "text-paper/65" : "text-ink-mid"
          }`}
        >
          {hint}
        </span>
      </span>
    </button>
  );
}
