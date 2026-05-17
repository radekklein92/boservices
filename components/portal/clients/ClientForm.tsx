"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, ShieldCheck } from "lucide-react";
import type { Client, LegalForm } from "@/lib/portal/clients-db";

type Mode =
  | { kind: "create" }
  | { kind: "edit"; clientId: string; initial: Client };

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
  website: string;
  storesCount: string;
  notes: string;
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
    website: "",
    storesCount: "",
    notes: "",
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
    website: c.website ?? "",
    storesCount: c.storesCount?.toString() ?? "",
    notes: c.notes ?? "",
  };
}

export function ClientForm({ mode }: { mode: Mode }) {
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

  async function lookupAres() {
    const ico = state.ico.replace(/\D/g, "");
    if (!ico) {
      setAresMessage("Zadejte IČO.");
      return;
    }
    setAresPending(true);
    setAresMessage(null);
    try {
      const res = await fetch("/api/portal/clients/ares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ico }),
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
      setAresMessage("Údaje z ARES doplněny.");
    } catch {
      setAresMessage("ARES neodpovídá. Zkuste to znovu.");
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
        ico: state.ico.replace(/\D/g, "") || undefined,
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
        website: state.website.trim() || undefined,
        storesCount: state.storesCount.trim()
          ? Number.parseInt(state.storesCount, 10)
          : undefined,
        notes: state.notes.trim() || undefined,
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

      router.push("/portal/clients");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chyba");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-10">
      {/* Forma */}
      <Card>
        <Legend label="Právní forma" />
        <div className="flex gap-2">
          <FormChip
            active={state.legalForm === "PO"}
            label="Právnická osoba"
            hint="s.r.o., a.s., družstvo, ..."
            onClick={() => set("legalForm", "PO")}
          />
          <FormChip
            active={state.legalForm === "FO"}
            label="Fyzická osoba"
            hint="OSVČ, podnikatel."
            onClick={() => set("legalForm", "FO")}
          />
        </div>
      </Card>

      {/* Základní */}
      <Card>
        <Legend
          label="Základní údaje"
          hint={
            state.legalForm === "PO"
              ? "IČO + ARES vyplní zbytek za vás."
              : "Doplňte jméno, IČO (volitelně) a adresu."
          }
        />

        <div className="grid grid-cols-1 gap-5 md:grid-cols-[200px_1fr_140px]">
          <Field label="IČO">
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={state.ico}
                onChange={(e) => set("ico", e.target.value)}
                placeholder="245 200 39"
                className={inputCls}
              />
              <button
                type="button"
                onClick={lookupAres}
                disabled={aresPending || !state.ico.trim()}
                className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-edge bg-paper text-ink-mid transition-colors hover:border-ink-base hover:text-ink-base disabled:opacity-50"
                aria-label="Načíst z ARES"
                title="Načíst z ARES"
              >
                {aresPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
                ) : (
                  <Search className="h-4 w-4" strokeWidth={1.5} />
                )}
              </button>
            </div>
          </Field>
          <Field
            label={
              state.legalForm === "PO" ? "Obchodní jméno" : "Jméno a příjmení"
            }
            required
          >
            <input
              type="text"
              required
              value={state.companyName}
              onChange={(e) => set("companyName", e.target.value)}
              placeholder={
                state.legalForm === "PO" ? "Business Operations Services s.r.o." : "Jana Novotná"
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
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-edge bg-paper-warm px-3 py-1.5 text-[12px] text-ink-deep"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-ink-mid" strokeWidth={1.5} />
            {aresMessage}
          </div>
        )}
      </Card>

      {/* Sídlo */}
      <Card>
        <Legend label="Sídlo" />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-[2fr_1fr_140px]">
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
        <div className="mt-5">
          <Field label="Stát">
            <input
              type="text"
              value={state.country}
              onChange={(e) => set("country", e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>
      </Card>

      {/* Statutární zástupce */}
      {state.legalForm === "PO" && (
        <Card>
          <Legend label="Statutární zástupce" hint="Jméno, které půjde do smluv." />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[2fr_1fr]">
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
        </Card>
      )}

      {/* Kontakt + doplňující */}
      <Card>
        <Legend label="Kontakt a doplňující údaje" />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <Field label="Kontaktní osoba">
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
        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-[2fr_140px]">
          <Field label="Web">
            <input
              type="url"
              value={state.website}
              onChange={(e) => set("website", e.target.value)}
              placeholder="https://"
              className={inputCls}
            />
          </Field>
          <Field label="Počet prodejen">
            <input
              type="number"
              min={0}
              value={state.storesCount}
              onChange={(e) => set("storesCount", e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>
        <div className="mt-5">
          <Field label="Poznámka">
            <textarea
              rows={3}
              value={state.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Cokoli důležitého, co se nehodí do polí výše."
              className={`${inputCls} h-auto resize-y py-3 leading-relaxed`}
            />
          </Field>
        </div>
      </Card>

      {error && (
        <div role="alert" className="text-[13.5px] text-ink-deep">
          {error}
        </div>
      )}

      <div className="sticky bottom-6 z-10 flex items-center justify-end gap-3 rounded-2xl border border-edge bg-paper/95 px-5 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() => router.back()}
          className="h-11 rounded-full px-5 text-[13.5px] font-medium text-ink-mid transition-colors hover:text-ink-base"
        >
          Zrušit
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-ink-base px-6 text-[13.5px] font-semibold text-paper transition-transform active:translate-y-px disabled:opacity-60"
        >
          {pending
            ? "Ukládám…"
            : mode.kind === "create"
              ? "Uložit klienta"
              : "Uložit změny"}
          {!pending && (
            <span aria-hidden="true" className="-mr-1">
              →
            </span>
          )}
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "h-12 w-full rounded-xl border border-edge bg-paper px-4 text-[15px] text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base";

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-[24px] border border-edge bg-paper p-7 md:p-8">
      {children}
    </section>
  );
}

function Legend({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="mb-6 flex items-baseline gap-3">
      <h2 className="text-[1rem] font-bold tracking-[-0.02em] text-ink-base">
        {label}
      </h2>
      {hint && (
        <span className="hidden text-[12px] text-ink-mid md:inline">· {hint}</span>
      )}
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

function FormChip({
  active,
  label,
  hint,
  onClick,
}: {
  active: boolean;
  label: string;
  hint: string;
  onClick: () => void;
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
