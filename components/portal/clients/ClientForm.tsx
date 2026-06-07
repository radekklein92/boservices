"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, ShieldCheck } from "lucide-react";
import type { Client, LegalForm } from "@/lib/portal/clients-db";
import {
  CONTRACT_TYPES_PICKABLE,
  CONTRACT_TYPE_META,
  type ContractType,
} from "@/lib/portal/contract-types";
import { normalizePlanned } from "@/lib/portal/client-contract-status";
import { Minus, Plus } from "lucide-react";

type Mode =
  | {
      kind: "create";
      onSuccess?: (id?: string) => void;
      onCancel?: () => void;
    }
  | { kind: "edit"; clientId: string; initial: Client };

type Variant = "page" | "modal";

type FormState = {
  legalForm: LegalForm;
  companyName: string;
  ico: string;
  dic: string;
  street: string;
  city: string;
  zip: string;
  country: string;
  statutoryName: string;
  statutoryRole: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  plannedContracts: Partial<Record<ContractType, number>>;
};

function blankState(): FormState {
  return {
    legalForm: "PO",
    companyName: "",
    ico: "",
    dic: "",
    street: "",
    city: "",
    zip: "",
    country: "Česká republika",
    statutoryName: "",
    statutoryRole: "jednatel",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    plannedContracts: {},
  };
}

function fromClient(c: Client): FormState {
  return {
    legalForm: c.legalForm,
    companyName: c.companyName,
    ico: c.ico ?? "",
    dic: c.dic ?? "",
    street: c.address.street,
    city: c.address.city,
    zip: c.address.zip,
    country: c.address.country ?? "Česká republika",
    statutoryName: c.statutory?.name ?? "",
    statutoryRole: c.statutory?.role ?? "jednatel",
    contactName: c.contact?.name ?? "",
    contactEmail: c.contact?.email ?? "",
    contactPhone: c.contact?.phone ?? "",
    plannedContracts: normalizePlanned(c.plannedContracts),
  };
}

export function ClientForm({
  mode,
  variant = "page",
}: {
  mode: Mode;
  variant?: Variant;
}) {
  const router = useRouter();
  const [state, setState] = useState<FormState>(
    mode.kind === "edit" ? fromClient(mode.initial) : blankState(),
  );
  const [aresPending, setAresPending] = useState(false);
  const [aresMessage, setAresMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  const setPlannedCount = (t: ContractType, delta: number) =>
    setState((prev) => {
      const cur = prev.plannedContracts[t] ?? 0;
      const next = Math.max(0, Math.min(99, cur + delta));
      const map = { ...prev.plannedContracts };
      if (next === 0) delete map[t];
      else map[t] = next;
      return { ...prev, plannedContracts: map };
    });

  // Rejstřík podle pole Stát: Polsko = Biała lista (REGON), Slovensko = RPO (IČO),
  // jinak ČR = ARES (IČO).
  const registerKey: "pl" | "sk" | "cz" = (() => {
    const c = state.country.toLowerCase();
    if (c.includes("pol")) return "pl";
    if (c.includes("sloven") || c.includes("slovac")) return "sk";
    return "cz";
  })();
  const registerLabel =
    registerKey === "pl" ? "Biała lista" : registerKey === "sk" ? "RPO" : "ARES";
  const idLabel = registerKey === "pl" ? "REGON" : "IČO";

  async function lookupRegister() {
    const id = state.ico.trim();
    if (!id) {
      setAresMessage(`Zadejte ${idLabel}.`);
      return;
    }
    setAresPending(true);
    setAresMessage(null);
    try {
      const res = await fetch("/api/portal/clients/company-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, country: state.country }),
      });
      const data = await res.json();
      if (!data.ok) {
        setAresMessage(data.error || "Firma se nenašla.");
        return;
      }
      const r = data.result;
      setState((prev) => ({
        ...prev,
        legalForm: r.legalForm,
        companyName: r.companyName,
        ico: r.ico,
        dic: r.dic ?? prev.dic,
        street: r.address.street || prev.street,
        city: r.address.city || prev.city,
        zip: r.address.zip || prev.zip,
        country: r.address.country || prev.country,
      }));
      setAresMessage(`Doplněno z ${registerLabel}.`);
    } catch {
      setAresMessage(`${registerLabel} neodpovídá. Zkuste to znovu.`);
    } finally {
      setAresPending(false);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const payload = {
        legalForm: state.legalForm,
        companyName: state.companyName.trim(),
        // Neškrtáme nečíslice - povolíme i zahraniční reg. číslo (REGON, NIP…).
        ico: state.ico.trim() || undefined,
        dic: state.dic.trim() || undefined,
        address: {
          street: state.street.trim(),
          city: state.city.trim(),
          zip: state.zip.trim(),
          country: state.country.trim() || "Česká republika",
        },
        statutory: state.statutoryName.trim()
          ? {
              name: state.statutoryName.trim(),
              role: state.statutoryRole.trim() || undefined,
            }
          : undefined,
        contact:
          state.contactName.trim() ||
          state.contactEmail.trim() ||
          state.contactPhone.trim()
            ? {
                name: state.contactName.trim() || undefined,
                email: state.contactEmail.trim() || undefined,
                phone: state.contactPhone.trim() || undefined,
              }
            : undefined,
        plannedContracts: state.plannedContracts,
      };

      const url =
        mode.kind === "create"
          ? "/api/portal/clients"
          : `/api/portal/clients/${mode.clientId}`;
      const method = mode.kind === "create" ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Chyba");

      if (mode.kind === "create" && mode.onSuccess) {
        mode.onSuccess(data.id);
      } else {
        router.push("/portal/clients");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chyba");
      setPending(false);
    }
  }

  function handleCancel() {
    if (mode.kind === "create" && mode.onCancel) {
      mode.onCancel();
    } else {
      router.back();
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {/* Forma */}
      <Section label="Právní forma">
        <div className="inline-flex rounded-lg border border-edge p-0.5">
          <SegChip
            active={state.legalForm === "PO"}
            label="Právnická osoba"
            onClick={() => set("legalForm", "PO")}
          />
          <SegChip
            active={state.legalForm === "FO"}
            label="Fyzická osoba"
            onClick={() => set("legalForm", "FO")}
          />
        </div>
      </Section>

      {/* Základní */}
      <Section
        label="Základní údaje"
        hint={
          state.legalForm === "PO"
            ? `${idLabel} + ${registerLabel} vyplní zbytek.`
            : `Doplňte jméno, ${idLabel} (volitelně) a DIČ.`
        }
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[160px_1fr_140px]">
          <Field label={idLabel}>
            <div className="flex gap-1.5">
              <input
                type="text"
                inputMode="numeric"
                value={state.ico}
                onChange={(e) => set("ico", e.target.value)}
                placeholder="24520039"
                className={inputCls}
              />
              <button
                type="button"
                onClick={lookupRegister}
                disabled={aresPending || !state.ico.trim()}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-edge bg-paper text-ink-mid transition-colors hover:border-ink-base hover:text-ink-base disabled:opacity-50"
                aria-label={`Načíst z ${registerLabel}`}
                title={`Načíst z ${registerLabel}`}
              >
                {aresPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
                ) : (
                  <Search className="h-3.5 w-3.5" strokeWidth={1.5} />
                )}
              </button>
            </div>
          </Field>
          <Field
            label={state.legalForm === "PO" ? "Obchodní jméno" : "Jméno a příjmení"}
            required
          >
            <input
              type="text"
              required
              value={state.companyName}
              onChange={(e) => set("companyName", e.target.value)}
              placeholder={
                state.legalForm === "PO" ? "BOServices s.r.o." : "Jana Novotná"
              }
              className={inputCls}
            />
          </Field>
          <Field label="DIČ">
            <input
              type="text"
              value={state.dic}
              onChange={(e) => set("dic", e.target.value)}
              placeholder="CZ24520039"
              className={inputCls}
            />
          </Field>
        </div>

        {aresMessage && (
          <div
            role="status"
            className="mt-2.5 inline-flex items-center gap-1.5 text-[11.5px] text-ink-mid"
          >
            <ShieldCheck className="h-3 w-3" strokeWidth={1.5} />
            {aresMessage}
          </div>
        )}
      </Section>

      {/* Sídlo */}
      <Section label="Sídlo">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_120px]">
          <Field label="Ulice a č.p." required>
            <input
              type="text"
              required
              value={state.street}
              onChange={(e) => set("street", e.target.value)}
              placeholder="Uhelný trh 414/9"
              className={inputCls}
            />
          </Field>
          <Field label="Obec" required>
            <input
              type="text"
              required
              value={state.city}
              onChange={(e) => set("city", e.target.value)}
              placeholder="Praha 1"
              className={inputCls}
            />
          </Field>
          <Field label="PSČ" required>
            <input
              type="text"
              required
              value={state.zip}
              onChange={(e) => set("zip", e.target.value)}
              placeholder="11000"
              className={inputCls}
            />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Stát">
            <input
              type="text"
              value={state.country}
              onChange={(e) => set("country", e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>
      </Section>

      {/* Statutární zástupce */}
      {state.legalForm === "PO" && (
        <Section label="Statutární zástupce" hint="Půjde do smluv.">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr]">
            <Field label="Jméno">
              <input
                type="text"
                value={state.statutoryName}
                onChange={(e) => set("statutoryName", e.target.value)}
                placeholder="Mgr. Ondřej Benáček"
                className={inputCls}
              />
            </Field>
            <Field label="Funkce">
              <input
                type="text"
                value={state.statutoryRole}
                onChange={(e) => set("statutoryRole", e.target.value)}
                placeholder="jednatel"
                className={inputCls}
              />
            </Field>
          </div>
        </Section>
      )}

      {/* Kontakt */}
      <Section label="Kontaktní osoba">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Jméno">
            <input
              type="text"
              value={state.contactName}
              onChange={(e) => set("contactName", e.target.value)}
              placeholder="Jana Novotná"
              className={inputCls}
            />
          </Field>
          <Field label="E-mail">
            <input
              type="email"
              value={state.contactEmail}
              onChange={(e) => set("contactEmail", e.target.value)}
              placeholder="jana@brand.cz"
              className={inputCls}
            />
          </Field>
          <Field label="Telefon">
            <input
              type="tel"
              value={state.contactPhone}
              onChange={(e) => set("contactPhone", e.target.value)}
              placeholder="+420 ..."
              className={inputCls}
            />
          </Field>
        </div>
      </Section>

      {/* Plánované smlouvy - počet kusů každého typu (klient může mít víc prodejen). */}
      <Section
        label="Plánované smlouvy"
        hint="Kolik kusů kterého typu chceš s klientem podepsat. Uvidíš stav na přehledu klientů."
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {CONTRACT_TYPES_PICKABLE.map((t) => {
            const count = state.plannedContracts[t] ?? 0;
            const active = count > 0;
            return (
              <div
                key={t}
                className={[
                  "flex h-11 items-center justify-between gap-3 rounded-full border pl-4 pr-1.5 transition-colors",
                  active
                    ? "border-ink-base bg-paper"
                    : "border-edge bg-paper",
                ].join(" ")}
              >
                <span
                  className={`truncate text-[12.5px] font-medium ${active ? "text-ink-base" : "text-ink-mid"}`}
                >
                  {CONTRACT_TYPE_META[t].shortName}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPlannedCount(t, -1)}
                    disabled={count === 0}
                    aria-label="Ubrat"
                    className="grid h-8 w-8 place-items-center rounded-full text-ink-mid transition-colors hover:bg-edge-warm hover:text-ink-base disabled:opacity-30"
                  >
                    <Minus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  </button>
                  <span
                    className={`w-5 text-center text-[13px] font-semibold tabular-nums ${active ? "text-ink-base" : "text-ink-soft"}`}
                  >
                    {count}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPlannedCount(t, 1)}
                    aria-label="Přidat"
                    className="grid h-8 w-8 place-items-center rounded-full text-ink-mid transition-colors hover:bg-ink-base hover:text-paper"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {error && (
        <div role="alert" className="text-[12.5px] text-ink-deep">
          {error}
        </div>
      )}

      <div
        className={
          variant === "modal"
            ? "-mx-1 mt-2 flex items-center justify-end gap-2 border-t border-edge pt-5"
            : "sticky bottom-6 z-10 flex items-center justify-end gap-2 rounded-2xl border border-edge bg-paper/95 px-4 py-2.5 backdrop-blur"
        }
      >
        <button
          type="button"
          onClick={handleCancel}
          className="h-10 rounded-full px-4 text-[13px] font-medium text-ink-mid transition-colors hover:text-ink-base"
        >
          Zrušit
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-ink-base px-5 text-[13px] font-semibold text-paper transition-transform active:translate-y-px disabled:opacity-60"
        >
          {pending
            ? "Ukládám…"
            : mode.kind === "create"
              ? "Uložit klienta"
              : "Uložit změny"}
          {!pending && <span aria-hidden="true">→</span>}
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "h-10 w-full rounded-lg border border-edge bg-paper px-3 text-[13.5px] text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base";

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-edge pt-5 first:border-0 first:pt-0">
      <div className="flex items-baseline gap-2.5">
        <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-base">
          {label}
        </h3>
        {hint && <span className="text-[11.5px] text-ink-mid">· {hint}</span>}
      </div>
      {children}
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
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-ink-mid">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-1 text-ink-deep">
            ·
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

function SegChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "h-9 rounded-md px-3.5 text-[12.5px] font-medium transition-colors",
        active
          ? "bg-ink-base text-paper"
          : "text-ink-deep hover:bg-edge-warm",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
