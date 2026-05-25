"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";

export function InviteModal({
  onClose,
  onInvited,
}: {
  onClose: () => void;
  onInvited: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"admin" | "user">("admin");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/portal/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          name: name.trim() || undefined,
          role,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Chyba");
      onInvited();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chyba");
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-base/40 p-4 py-8 backdrop-blur-sm md:py-12"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[480px] rounded-[28px] border border-edge bg-paper p-8 shadow-[0_24px_60px_-20px_rgba(14,14,14,0.35)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink-mid">
              Nový uživatel
            </div>
            <h2 className="mt-2 font-extrabold text-ink-base text-[1.5rem] leading-[1.1] tracking-[-0.025em]">
              Pozvat do portálu
            </h2>
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

        <p className="mt-3 text-[13.5px] leading-relaxed text-ink-deep">
          Po odeslání pozvánky dostane uživatel e-mail s odkazem na nastavení
          hesla. Odkaz platí 7 dní.
        </p>

        <form onSubmit={onSubmit} noValidate className="mt-7 flex flex-col gap-5">
          <Field label="E-mail" required>
            <input
              ref={emailRef}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jana@boservices.cz"
              autoComplete="off"
              className="h-12 w-full rounded-xl border border-edge bg-paper px-4 text-[15px] text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base"
            />
          </Field>

          <Field label="Jméno (volitelné)">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jana Novotná"
              className="h-12 w-full rounded-xl border border-edge bg-paper px-4 text-[15px] text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base"
            />
          </Field>

          <Field label="Role">
            <div className="flex gap-2">
              <RoleChip
                active={role === "admin"}
                onClick={() => setRole("admin")}
                label="Admin"
                hint="Klienti, smlouvy + pozvánky a správa uživatelů."
              />
              <RoleChip
                active={role === "user"}
                onClick={() => setRole("user")}
                label="Uživatel"
                hint="Klienti a smlouvy. Bez správy uživatelů."
              />
            </div>
          </Field>

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
              {pending ? "Odesílám…" : "Odeslat pozvánku"}
              {!pending && (
                <span aria-hidden="true" className="-mr-1">
                  →
                </span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-mid">
        {label}
        {required && <span aria-hidden="true" className="ml-1 text-ink-deep">·</span>}
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
        "flex-1 rounded-xl border px-4 py-3 text-left transition-all duration-200",
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
