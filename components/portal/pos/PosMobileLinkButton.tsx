"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy, Loader2, Smartphone, Trash2, X } from "lucide-react";
import type { PosSelection } from "@/lib/portal/pos/filters";
import { Toggle } from "@/components/portal/ui/Toggle";
import { PosStorePicker } from "./PosStorePicker";
import type { ConceptGroup } from "./pos-filter-shared";

// Tlačítko "Na mobil" vedle uložených pohledů: vygeneruje osobní veřejný odkaz na
// dnešní "Živě" dashboard (1 na uživatele). V dialogu si uživatel vybere prodejny +
// okruh + měnu + DPH a nastaví PIN; dostane QR + odkaz na uložení na plochu telefonu.

interface MobileLinkState {
  token: string;
  url: string;
  qr: string | null;
  selection: PosSelection;
  scope: "all" | "bos";
  currency: string;
  vatInclusive: boolean;
  updatedAt: string;
}

export function PosMobileLinkButton({
  concepts,
  currencies,
  initialSelection,
  initialScope,
  initialCurrency,
  initialVatInclusive,
}: {
  concepts: ConceptGroup[];
  currencies: string[];
  initialSelection: PosSelection;
  initialScope: "all" | "bos";
  initialCurrency: string;
  initialVatInclusive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<MobileLinkState | null>(null);
  const [mode, setMode] = useState<"form" | "share">("form");

  // Formulářový stav (návrh nastavení odkazu).
  const [selection, setSelection] = useState<PosSelection>(initialSelection);
  const [scope, setScope] = useState<"all" | "bos">(initialScope);
  const [currency, setCurrency] = useState(initialCurrency);
  const [vatInclusive, setVatInclusive] = useState(initialVatInclusive);
  const [pin, setPin] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Otevření: načti můj existující odkaz. Existuje-li → "share" (předvyplň z něj),
  // jinak → "form" předvyplněný aktuálním filtrem.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/portal/pos/mobile-link")
      .then((r) => r.json())
      .then((data: { ok: boolean; link: MobileLinkState | null }) => {
        if (cancelled) return;
        if (data.ok && data.link) {
          setLink(data.link);
          setSelection(data.link.selection);
          setScope(data.link.scope);
          setCurrency(data.link.currency);
          setVatInclusive(data.link.vatInclusive);
          setMode("share");
        } else {
          setLink(null);
          setSelection(initialSelection);
          setScope(initialScope);
          setCurrency(initialCurrency);
          setVatInclusive(initialVatInclusive);
          setMode("form");
        }
      })
      .catch(() => !cancelled && setError("Nepodařilo se načíst stav odkazu."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, initialSelection, initialScope, initialCurrency, initialVatInclusive]);

  // Scroll-lock + Escape (konvence modalů portálu).
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isNew = !link;
  const pinValid = /^\d{4,6}$/.test(pin);
  const canSave = saving ? false : isNew ? pinValid : pin === "" || pinValid;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/pos/mobile-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selection, scope, currency, vatInclusive, pin: pin || undefined }),
      });
      const data = (await res.json()) as { ok: boolean; link?: MobileLinkState; error?: string };
      if (res.ok && data.ok && data.link) {
        setLink(data.link);
        setPin("");
        setMode("share");
      } else {
        setError(data.error ?? "Nepodařilo se uložit odkaz.");
      }
    } catch {
      setError("Něco se nepovedlo. Zkuste to znovu.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    setError(null);
    try {
      await fetch("/api/portal/pos/mobile-link", { method: "DELETE" });
      setLink(null);
      setPin("");
      setSelection(initialSelection);
      setScope(initialScope);
      setCurrency(initialCurrency);
      setVatInclusive(initialVatInclusive);
      setMode("form");
    } catch {
      setError("Smazání se nepovedlo.");
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard nedostupný - odkaz je vidět, jde zkopírovat ručně */
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-edge bg-paper px-3.5 text-[12.5px] font-medium text-ink-deep transition-colors hover:border-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-base focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      >
        <Smartphone className="h-3.5 w-3.5 text-ink-mid" strokeWidth={1.75} aria-hidden="true" />
        <span>Na mobil</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-base/40 px-4 py-8 backdrop-blur-sm md:py-12"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-[460px] rounded-2xl border border-edge bg-paper p-6 shadow-[0_18px_42px_-18px_rgba(14,14,14,0.35)]">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-mid">Mobilní dashboard</div>
                <h2 className="mt-1 text-[1.15rem] font-bold leading-[1.2] tracking-[-0.02em] text-ink-base">
                  Dnešní tržby na plochu telefonu
                </h2>
              </div>
              <button
                type="button"
                aria-label="Zavřít"
                onClick={() => setOpen(false)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-mid transition-colors hover:bg-edge-warm hover:text-ink-base"
              >
                <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-10 text-ink-mid">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              </div>
            ) : mode === "share" && link ? (
              <ShareView
                link={link}
                copied={copied}
                onCopy={copy}
                onEdit={() => setMode("form")}
                onDelete={remove}
                busy={saving}
              />
            ) : (
              <FormView
                concepts={concepts}
                currencies={currencies}
                selection={selection}
                setSelection={setSelection}
                scope={scope}
                setScope={setScope}
                currency={currency}
                setCurrency={setCurrency}
                vatInclusive={vatInclusive}
                setVatInclusive={setVatInclusive}
                pin={pin}
                setPin={setPin}
                isNew={isNew}
                canSave={canSave}
                saving={saving}
                onSave={save}
                onCancel={link ? () => setMode("share") : undefined}
              />
            )}

            {error && <p className="mt-3 text-center text-[12.5px] font-medium text-rose-600">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}

function ShareView({
  link,
  copied,
  onCopy,
  onEdit,
  onDelete,
  busy,
}: {
  link: MobileLinkState;
  copied: boolean;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-4">
      {link.qr && (
        // eslint-disable-next-line @next/next/no-img-element -- data URL, žádná optimalizace netřeba
        <img
          src={link.qr}
          alt="QR kód mobilního dashboardu"
          width={196}
          height={196}
          className="rounded-xl border border-edge"
        />
      )}
      <p className="text-center text-[12.5px] text-ink-mid">
        Naskenujte QR telefonem, otevřete odkaz a přes <span className="font-medium text-ink-deep">Sdílet → Přidat na plochu</span> uložte. Při prvním otevření zadáte PIN.
      </p>

      <div className="flex w-full items-center gap-1.5 rounded-xl border border-edge bg-paper-warm px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-[12px] text-ink-deep" title={link.url}>
          {link.url}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-ink-base px-3 text-[12px] font-semibold text-paper"
        >
          {copied ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />}
          {copied ? "Zkopírováno" : "Kopírovat"}
        </button>
      </div>

      <div className="flex w-full items-center justify-between gap-2 border-t border-edge pt-3">
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-mid transition-colors hover:text-rose-600 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          Smazat odkaz
        </button>
        <button
          type="button"
          onClick={onEdit}
          disabled={busy}
          className="h-9 rounded-full border border-edge bg-paper px-4 text-[12.5px] font-medium text-ink-deep transition-colors hover:border-ink-soft disabled:opacity-50"
        >
          Upravit nastavení
        </button>
      </div>
    </div>
  );
}

function FormView({
  concepts,
  currencies,
  selection,
  setSelection,
  scope,
  setScope,
  currency,
  setCurrency,
  vatInclusive,
  setVatInclusive,
  pin,
  setPin,
  isNew,
  canSave,
  saving,
  onSave,
  onCancel,
}: {
  concepts: ConceptGroup[];
  currencies: string[];
  selection: PosSelection;
  setSelection: (s: PosSelection) => void;
  scope: "all" | "bos";
  setScope: (s: "all" | "bos") => void;
  currency: string;
  setCurrency: (c: string) => void;
  vatInclusive: boolean;
  setVatInclusive: (v: boolean) => void;
  pin: string;
  setPin: (p: string) => void;
  isNew: boolean;
  canSave: boolean;
  saving: boolean;
  onSave: () => void;
  onCancel?: () => void;
}) {
  const hasSelection = selection.concepts.length > 0 || selection.locations.length > 0;
  return (
    <div className="flex flex-col gap-4">
      <Field label="Prodejny">
        <div className="flex flex-col gap-2">
          <PosStorePicker concepts={concepts} selection={selection} onChange={setSelection} />
          <p className="text-[11.5px] text-ink-soft">
            {hasSelection ? "Dashboard ukáže jen vybrané prodejny." : "Prázdný výběr = vše v okruhu níže."}
          </p>
        </div>
      </Field>

      <Field label="Okruh">
        <Segmented
          options={[
            { value: "bos", label: "BOS prodejny" },
            { value: "all", label: "Celá síť" },
          ]}
          value={scope}
          onChange={(v) => setScope(v as "all" | "bos")}
        />
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Field label="Měna" inline>
          <Segmented options={currencies.map((c) => ({ value: c, label: c }))} value={currency} onChange={setCurrency} />
        </Field>
        <Field label="Ceny" inline>
          <Toggle checked={vatInclusive} onChange={setVatInclusive} label="s DPH" />
        </Field>
      </div>

      <Field label={isNew ? "PIN (4-6 číslic)" : "Nový PIN (prázdné = ponechat)"}>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          maxLength={6}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder={isNew ? "Zvolte PIN" : "••••"}
          className="h-10 w-full rounded-xl border border-edge bg-paper px-3 text-[14px] tracking-[0.3em] text-ink-base outline-none transition-colors focus-visible:border-ink-base"
        />
        <p className="mt-1 text-[11.5px] text-ink-soft">PIN chrání odkaz - kdokoliv s odkazem a PINem uvidí dnešní tržby.</p>
      </Field>

      <div className="flex items-center justify-end gap-2 border-t border-edge pt-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-full px-4 text-[12.5px] font-medium text-ink-mid transition-colors hover:text-ink-base"
          >
            Zrušit
          </button>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink-base px-4 text-[12.5px] font-semibold text-paper disabled:opacity-40"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {isNew ? "Vytvořit odkaz" : "Uložit změny"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, inline = false, children }: { label: string; inline?: boolean; children: ReactNode }) {
  return (
    <label className={inline ? "flex items-center gap-2.5" : "flex flex-col gap-1.5"}>
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-mid">{label}</span>
      {children}
    </label>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div role="radiogroup" className="inline-flex h-9 shrink-0 items-center rounded-full border border-edge bg-paper p-0.5">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`inline-flex h-8 items-center rounded-full px-3 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-base focus-visible:ring-offset-1 focus-visible:ring-offset-paper ${
              active ? "bg-ink-base text-paper" : "text-ink-mid hover:text-ink-base"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
