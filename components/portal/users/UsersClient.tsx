"use client";

import { useState } from "react";
import {
  Plus,
  KeyRound,
  Trash2,
  RefreshCw,
  Mail,
  ShieldCheck,
  Clock,
  PenLine,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import type { AllowlistEntry } from "@/lib/portal/allowlist-db";
import {
  signerFunctionShortLabel,
  type User,
  type UserRole,
} from "@/lib/portal/users-db";
import { isMaskedAccount, maskedDisplayName } from "@/lib/portal/masked-account";
import dynamicImport from "next/dynamic";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { BTN_PRIMARY } from "@/components/portal/ui/buttons";
import { CHIP_CLASS } from "@/components/portal/ui/Chip";

// Modaly se renderují conditional ({open && <Modal />}). next/dynamic je
// code-splitne do separátního chunku, který se stáhne až při open=true.
const InviteModal = dynamicImport(
  () => import("./InviteModal").then((m) => m.InviteModal),
  { ssr: false },
);
const EditUserModal = dynamicImport(
  () => import("./EditUserModal").then((m) => m.EditUserModal),
  { ssr: false },
);

type Props = {
  currentEmail: string;
  currentRole: UserRole;
  initialUsers: User[];
  initialAllowlist: AllowlistEntry[];
};

const ROLE_LABEL: Record<string, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  manager: "Manažer",
  user: "Uživatel",
};

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("cs-CZ", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Europe/Prague",
    });
  } catch {
    return iso;
  }
}

function relativeTime(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso).getTime();
    const diffMs = Date.now() - d;
    const min = Math.round(diffMs / 60000);
    if (min < 1) return "právě teď";
    if (min < 60) return `před ${min} min`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `před ${hr} h`;
    const day = Math.round(hr / 24);
    if (day < 7) return `před ${day} dny`;
    return formatDate(iso);
  } catch {
    return iso;
  }
}

function initials(name?: string, email?: string): string {
  const src = (name ?? email ?? "?").trim();
  if (!src) return "?";
  const parts = src.split(/[\s.@]+/).filter(Boolean);
  if (!parts.length) return src[0]!.toUpperCase();
  const a = parts[0]![0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1]![0] : "";
  return (a + b).toUpperCase().slice(0, 2);
}

export function UsersClient({
  currentEmail,
  currentRole,
  initialUsers,
  initialAllowlist,
}: Props) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [allowlist, setAllowlist] = useState<AllowlistEntry[]>(initialAllowlist);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);

  const isSuperadmin = currentRole === "superadmin";
  const editingUser = editingEmail
    ? users.find((u) => u.email === editingEmail) ?? null
    : null;

  function showToast(kind: "ok" | "error", msg: string) {
    setToast({ kind, msg });
    window.setTimeout(() => setToast(null), 4000);
  }

  async function refresh() {
    try {
      const res = await fetch("/api/portal/users", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setUsers(data.users);
      setAllowlist(data.allowlist);
    } catch {
      // ignore
    }
  }

  async function resetPassword(email: string) {
    if (
      !window.confirm(
        `Resetovat heslo pro ${email}? Uživatel se nebude moct přihlásit, dokud si nenastaví nové.`,
      )
    ) {
      return;
    }
    setBusy(`${email}:reset`);
    try {
      const res = await fetch(
        `/api/portal/users/${encodeURIComponent(email)}/reset`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Chyba");
      showToast("ok", `Reset odkaz odeslán na ${email}.`);
      await refresh();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Chyba");
    } finally {
      setBusy(null);
    }
  }

  async function removeUser(email: string) {
    if (!window.confirm(`Smazat ${email}? Tato akce je nevratná.`)) return;
    setBusy(`${email}:delete`);
    try {
      const res = await fetch(`/api/portal/users/${encodeURIComponent(email)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Chyba");
      showToast("ok", `${email} smazán.`);
      await refresh();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Chyba");
    } finally {
      setBusy(null);
    }
  }

  async function cancelInvite(email: string) {
    if (!window.confirm(`Zrušit pozvánku pro ${email}?`)) return;
    setBusy(`${email}:cancel`);
    try {
      const res = await fetch(
        `/api/portal/allowlist/${encodeURIComponent(email)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Chyba");
      showToast("ok", `Pozvánka zrušena.`);
      await refresh();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Chyba");
    } finally {
      setBusy(null);
    }
  }

  async function resendInvite(entry: AllowlistEntry) {
    setBusy(`${entry.email}:resend`);
    try {
      const res = await fetch("/api/portal/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: entry.email,
          name: entry.name,
          role: entry.role,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Chyba");
      showToast("ok", "Nová pozvánka odeslána.");
      await refresh();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Chyba");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Administrace"
        title="Uživatelé"
        lede="Pozvánky platí 7 dní. Reset hesla 1 hodinu. Vše se eviduje v allowlistu."
        actions={
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className={BTN_PRIMARY}
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            Pozvat uživatele
          </button>
        }
      />

      <Section
        title="Aktivní"
        count={users.length}
        hint="Mohou se přihlásit do portálu."
      >
        {users.length === 0 ? (
          <Empty label="Zatím žádní aktivní uživatelé." />
        ) : (
          <ul className="divide-y divide-edge">
            {users.map((u) => {
              // Osobní účet majitele portálu zobrazujeme anonymně ("Admin",
              // bez e-mailu) - aby se při sdílení obrazovky neukázaly osobní
              // údaje. Týká se jen tohoto jednoho účtu, akce dál jedou na
              // skutečném u.email.
              const isMasked = isMaskedAccount(u.email);
              const displayName = maskedDisplayName(u.email, u.name);
              return (
              <li
                key={u.email}
                className="flex flex-col gap-4 px-5 py-5 transition-colors hover:bg-paper-warm md:flex-row md:items-center md:gap-6 md:px-7 md:py-6"
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink-base text-[12px] font-bold text-paper">
                  {initials(displayName, isMasked ? undefined : u.email)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2.5">
                    <div className="truncate text-[15px] font-bold tracking-[-0.01em] text-ink-base">
                      {displayName}
                    </div>
                    {u.email === currentEmail && (
                      <Badge tone="muted">Vy</Badge>
                    )}
                    {u.isSigner && u.signerFunction && (
                      <Badge tone="ink">
                        <PenLine
                          className="mr-1 h-3 w-3"
                          strokeWidth={1.5}
                          aria-hidden="true"
                        />
                        Podepisující · {signerFunctionShortLabel(u.signerFunction)}
                      </Badge>
                    )}
                  </div>
                  {!isMasked && (
                    <div className="truncate text-[12.5px] text-ink-mid">
                      {u.email}
                    </div>
                  )}
                </div>
                <div className="hidden md:flex md:items-center md:gap-6">
                  <Meta label="Role" value={ROLE_LABEL[u.role] ?? u.role} />
                  <Meta
                    label="Naposledy aktivní"
                    value={relativeTime(u.lastActiveAt ?? u.lastLoginAt)}
                  />
                </div>
                <div className="flex items-center gap-1.5 md:ml-2">
                  <RowButton
                    label="Upravit"
                    Icon={Pencil}
                    onClick={() => setEditingEmail(u.email)}
                  />
                  <RowButton
                    label="Resetovat heslo"
                    Icon={KeyRound}
                    onClick={() => resetPassword(u.email)}
                    pending={busy === `${u.email}:reset`}
                  />
                  {u.email !== currentEmail &&
                    (u.role !== "superadmin" || isSuperadmin) && (
                      <RowButton
                        label="Smazat"
                        Icon={Trash2}
                        danger
                        onClick={() => removeUser(u.email)}
                        pending={busy === `${u.email}:delete`}
                      />
                    )}
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section
        title="Pozvánky"
        count={allowlist.length}
        hint="Allowlist se status pending — čekají na nastavení hesla."
      >
        {allowlist.length === 0 ? (
          <Empty label="Žádné čekající pozvánky." />
        ) : (
          <ul className="divide-y divide-edge">
            {allowlist.map((a) => (
              <li
                key={a.email}
                className="flex flex-col gap-4 px-5 py-5 transition-colors hover:bg-paper-warm md:flex-row md:items-center md:gap-6 md:px-7 md:py-6"
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-dashed border-ink-soft text-ink-soft">
                  <Mail className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-bold tracking-[-0.01em] text-ink-base">
                    {a.name || a.email}
                  </div>
                  <div className="truncate text-[12.5px] text-ink-mid">
                    {a.email}
                  </div>
                </div>
                <div className="hidden md:flex md:items-center md:gap-6">
                  <Meta label="Role po přijetí" value={ROLE_LABEL[a.role] ?? a.role} />
                  <Meta label="Pozváno" value={relativeTime(a.invitedAt)} />
                </div>
                <div className="flex items-center gap-1.5 md:ml-2">
                  <RowButton
                    label="Poslat znovu"
                    Icon={RefreshCw}
                    onClick={() => resendInvite(a)}
                    pending={busy === `${a.email}:resend`}
                  />
                  <RowButton
                    label="Zrušit"
                    Icon={Trash2}
                    danger
                    onClick={() => cancelInvite(a.email)}
                    pending={busy === `${a.email}:cancel`}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {inviteOpen && (
        <InviteModal
          onClose={() => setInviteOpen(false)}
          onInvited={async () => {
            setInviteOpen(false);
            await refresh();
            showToast("ok", "Pozvánka odeslána.");
          }}
        />
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          canEditSuperadmin={isSuperadmin}
          onClose={() => setEditingEmail(null)}
          onSaved={async () => {
            setEditingEmail(null);
            await refresh();
            showToast("ok", "Uloženo.");
          }}
        />
      )}

      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-50 max-w-md rounded-2xl border px-5 py-4 text-[13.5px] leading-snug shadow-[0_18px_42px_-18px_rgba(14,14,14,0.35)] ${
            toast.kind === "ok"
              ? "border-edge bg-paper text-ink-base"
              : "border-ink-base bg-ink-base text-paper"
          }`}
        >
          <div className="flex items-start gap-3">
            {toast.kind === "ok" ? (
              <ShieldCheck className="h-4 w-4 shrink-0 translate-y-0.5" strokeWidth={1.5} />
            ) : (
              <Clock className="h-4 w-4 shrink-0 translate-y-0.5" strokeWidth={1.5} />
            )}
            <div>{toast.msg}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  hint,
  children,
}: {
  title: string;
  count: number;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10 first:mt-0">
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="text-[1.05rem] font-bold tracking-[-0.02em] text-ink-base">
          {title}
        </h2>
        <span className="font-mono text-[12px] text-ink-soft">
          {count.toString().padStart(2, "0")}
        </span>
        {hint && (
          <span className="hidden text-[12px] text-ink-mid md:inline">
            · {hint}
          </span>
        )}
      </div>
      <div className="overflow-hidden rounded-3xl border border-edge bg-paper">
        {children}
      </div>
    </section>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="px-7 py-10 text-center text-[13.5px] text-ink-mid">
      {label}
    </div>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: "muted" | "ink";
  children: React.ReactNode;
}) {
  const cls =
    tone === "ink"
      ? "border-ink-base bg-ink-base text-paper"
      : "border-edge bg-edge-warm text-ink-mid";
  return (
    <span className={`${CHIP_CLASS} shrink-0 whitespace-nowrap ${cls}`}>
      {children}
    </span>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex w-[150px] flex-col gap-1">
      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-mid">
        {label}
      </div>
      <div className="text-[13px] text-ink-base">{value}</div>
    </div>
  );
}

function RowButton({
  label,
  Icon,
  onClick,
  danger,
  pending,
}: {
  label: string;
  Icon: LucideIcon;
  onClick: () => void;
  danger?: boolean;
  pending?: boolean;
}) {
  const base =
    "group inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[12px] font-medium transition-all duration-200 disabled:opacity-50";
  const tone = danger
    ? "border-edge bg-paper text-ink-deep hover:border-ink-base hover:bg-ink-base hover:text-paper"
    : "border-edge bg-paper text-ink-deep hover:border-ink-base hover:text-ink-base";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={`${base} ${tone}`}
      title={label}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
      <span className="hidden sm:inline">{pending ? "…" : label}</span>
    </button>
  );
}
