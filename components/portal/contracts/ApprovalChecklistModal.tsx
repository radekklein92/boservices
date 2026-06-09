"use client";

import { useEffect, useMemo, useState } from "react";
import {
  X,
  ShieldCheck,
  Check,
  Users,
  CalendarClock,
  FileText,
  GitCompare,
  Coins,
  Bell,
  Scale,
  ListChecks,
  AlertTriangle,
} from "lucide-react";
import type { Contract } from "@/lib/portal/contracts-db";
import { getVariantMeta } from "@/lib/portal/contract-types";
import { formatClaimsTotalAmount } from "@/lib/portal/claims";
import { BTN_PRIMARY } from "@/components/portal/ui/buttons";

type IconType = React.ComponentType<{
  className?: string;
  strokeWidth?: number;
  "aria-hidden"?: boolean;
}>;

type ChecklistItem = {
  id: string;
  Icon: IconType;
  title: string;
  // Konkrétní data ze smlouvy + instrukce, co ověřit.
  detail: React.ReactNode;
  // Zvýraznit (např. smlouva má změny oproti šabloně) - vizuální upozornění.
  alert?: boolean;
};

// Defenzivní čtení proměnné - vrátí trimnutou hodnotu nebo prázdný řetězec.
function v(contract: Contract, key: string): string {
  return (contract.variables?.[key] ?? "").trim();
}

// Řádek strany „Jméno (IČO …)" - IČO se přidá jen když existuje.
function party(name: string, ico: string): string {
  if (!name) return "nevyplněno";
  return ico ? `${name} (IČO ${ico})` : name;
}

function buildItems(
  contract: Contract,
  hasTemplateChanges: boolean,
  changeCount: number,
): ChecklistItem[] {
  // Položka „Změny oproti šabloně" je společná oběma typům.
  const changesItem: ChecklistItem = {
    id: "changes",
    Icon: GitCompare,
    title: "Změny oproti šabloně",
    alert: hasTemplateChanges,
    detail: hasTemplateChanges ? (
      <>
        Smlouva má{" "}
        <strong className="text-ink-deep">
          {changeCount} {changeCount === 1 ? "úpravu" : changeCount >= 2 && changeCount <= 4 ? "úpravy" : "úprav"}
        </strong>{" "}
        oproti schválené šabloně. Projdi je v „Přehledu změn" a ověř, že jsou
        záměrné a správné.
      </>
    ) : (
      <>Znění se shoduje se schválenou šablonou - žádné ruční úpravy.</>
    ),
  };

  const contentItem: ChecklistItem = {
    id: "content",
    Icon: FileText,
    title: "Celé znění smlouvy",
    detail:
      contract.type === "claim-bundle"
        ? "Pročetl/a jsem všechny tři části (Postoupení, Vedlejší ujednání, Oznámení) a znění je věcně i právně správné."
        : "Pročetl/a jsem celé znění smlouvy a je věcně i právně správné.",
  };

  if (contract.type === "withdrawal") {
    const variantLabel =
      getVariantMeta(contract.type, contract.variant ?? "")?.label ?? "neurčena";
    const place = v(contract, "place");
    const date = v(contract, "contractDate");
    const sellerName = v(contract, "sellerName");

    const parties: React.ReactNode[] = [
      <span key="client">
        <span className="text-ink-mid">Odstupující klient:</span>{" "}
        {contract.clientName || "nevyplněno"}
      </span>,
      <span key="provider">
        <span className="text-ink-mid">Poskytovatel:</span>{" "}
        {party(v(contract, "providerName"), v(contract, "providerIco"))}
      </span>,
      <span key="manager">
        <span className="text-ink-mid">Manažer:</span>{" "}
        {party(v(contract, "managerName"), v(contract, "managerIco"))}
      </span>,
    ];
    if (sellerName) {
      parties.push(
        <span key="seller">
          <span className="text-ink-mid">Prodávající:</span>{" "}
          {party(sellerName, v(contract, "sellerIco"))}
        </span>,
      );
    }

    return [
      {
        id: "variant",
        Icon: Scale,
        title: "Varianta odstoupení",
        detail: (
          <>
            <strong className="text-ink-deep">{variantLabel}.</strong> Ověř, že
            varianta odpovídá skutečnosti - rozhoduje, od které smlouvy se
            odstupuje a která tím zaniká.
          </>
        ),
      },
      {
        id: "parties",
        Icon: Users,
        title: "Identita smluvních stran",
        detail: (
          <div className="flex flex-col gap-0.5">
            {parties}
            <span className="mt-1 text-ink-soft">
              Ověř jména a IČO proti rejstříku i kartě klienta.
            </span>
          </div>
        ),
      },
      {
        id: "date",
        Icon: CalendarClock,
        title: "Datum a místo uzavření",
        detail: (
          <>
            <strong className="text-ink-deep">
              {date || "datum nevyplněno"}
            </strong>
            {place ? `, ${place}` : ""}. Zkontroluj datum účinnosti i s ohledem
            na případný úpadek některé ze stran.
          </>
        ),
      },
      changesItem,
      contentItem,
    ];
  }

  // claim-bundle (Postoupení pohledávek)
  const claims = contract.claims ?? [];
  const claimsCount = claims.length;
  const total = formatClaimsTotalAmount(claims);
  const debtorName = v(contract, "debtorName");

  return [
    {
      id: "claims",
      Icon: Coins,
      title: "Zadané pohledávky (Příloha č. 1)",
      alert: claimsCount === 0,
      detail:
        claimsCount === 0 ? (
          <strong className="text-ink-deep">
            Nejsou zadané žádné pohledávky - zkontroluj, zda je to záměr.
          </strong>
        ) : (
          <>
            <strong className="text-ink-deep">
              {claimsCount}{" "}
              {claimsCount === 1
                ? "pohledávka"
                : claimsCount >= 2 && claimsCount <= 4
                  ? "pohledávky"
                  : "pohledávek"}
            </strong>{" "}
            v celkové výši <strong className="text-ink-deep">{total} vč. DPH</strong>.
            Projdi u každé částku, dlužníka, právní titul a datum vzniku.
          </>
        ),
    },
    {
      id: "parties",
      Icon: Users,
      title: "Identita smluvních stran",
      detail: (
        <div className="flex flex-col gap-0.5">
          <span>
            <span className="text-ink-mid">Postupitel (klient):</span>{" "}
            {contract.clientName || "nevyplněno"}
          </span>
          <span>
            <span className="text-ink-mid">Postupník:</span> BOServices
          </span>
          <span>
            <span className="text-ink-mid">Dlužník:</span>{" "}
            {party(debtorName, v(contract, "debtorIco"))}
          </span>
          <span className="mt-1 text-ink-soft">
            Ověř jména a IČO proti rejstříku i kartě klienta.
          </span>
        </div>
      ),
    },
    {
      id: "fee",
      Icon: ListChecks,
      title: "Úplata za postoupení",
      detail:
        "Zkontroluj výši a splatnost úplaty ve Vedlejším ujednání o úplatě - sedí s dohodou.",
    },
    {
      id: "notice",
      Icon: Bell,
      title: "Oznámení dlužníkovi",
      detail:
        "Oznámení míří na správného dlužníka a obsahuje správné údaje k úhradě (číslo účtu, splatnost).",
    },
    changesItem,
    contentItem,
  ];
}

// Potvrzovací modal před schválením Odstoupení / Postoupení pohledávek.
// Administrátor musí aktivně odškrtnout všechny kontrolní body - teprve pak se
// odemkne tlačítko „Schválit". Body jsou kontextové podle typu smlouvy a nesou
// konkrétní data (částky, strany, počet úprav) - ne obecné fráze.
export function ApprovalChecklistModal({
  contract,
  hasTemplateChanges,
  changeCount,
  submitterName,
  onClose,
  onConfirm,
  pending,
}: {
  contract: Contract;
  hasTemplateChanges: boolean;
  changeCount: number;
  // Jméno přihlášeného uživatele - pro upozornění o převzetí odpovědnosti.
  submitterName?: string;
  onClose: () => void;
  onConfirm: () => void;
  pending?: boolean;
}) {
  const items = useMemo(
    () => buildItems(contract, hasTemplateChanges, changeCount),
    [contract, hasTemplateChanges, changeCount],
  );
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const allChecked = checked.size === items.length;
  const who = submitterName?.trim() ? submitterName.trim() : "odesílatel";

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const typeLabel =
    contract.type === "withdrawal"
      ? "Odstoupení od smluv"
      : "Postoupení pohledávek";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-base/40 px-4 py-10 backdrop-blur-sm md:py-16"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-[600px] rounded-2xl border border-edge bg-paper p-6 shadow-[0_18px_42px_-18px_rgba(14,14,14,0.35)] md:p-7">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-mid">
              Kontrola před schválením · {typeLabel}
            </div>
            <h2 className="mt-1 font-bold text-ink-base text-[1.15rem] leading-[1.2] tracking-[-0.02em]">
              Zkontroloval/a jsi opravdu všechno?
            </h2>
          </div>
          <button
            type="button"
            aria-label="Zavřít"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-mid transition-colors hover:bg-edge-warm hover:text-ink-base"
          >
            <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        <p className="mb-5 text-[13px] leading-relaxed text-ink-mid">
          Schválení tento koncept uzamkne a posune k podpisu. Projdi každý bod a
          potvrď ho zaškrtnutím - tlačítko „Schválit" se odemkne, až bude
          odškrtnuté vše.
        </p>

        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const isOn = checked.has(item.id);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => toggle(item.id)}
                  aria-pressed={isOn}
                  className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
                    isOn
                      ? "border-ink-base/30 bg-edge-warm/60"
                      : "border-edge bg-paper hover:border-ink-base/30"
                  }`}
                >
                  <span
                    className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors ${
                      isOn
                        ? "border-ink-base bg-ink-base text-paper"
                        : "border-edge bg-paper text-transparent"
                    }`}
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <item.Icon
                        className={`h-3.5 w-3.5 shrink-0 ${item.alert ? "text-amber-600" : "text-ink-mid"}`}
                        strokeWidth={1.75}
                        aria-hidden={true}
                      />
                      <span className="text-[13.5px] font-semibold text-ink-base">
                        {item.title}
                      </span>
                      {item.alert && (
                        <span className="ml-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-amber-700">
                          pozor
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-[12.5px] leading-relaxed text-ink-mid">
                      {item.detail}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-900">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span>
            Schválením přebíráš jako{" "}
            <strong className="font-semibold">{who}</strong> odpovědnost za
            případné chyby ve smlouvě.
          </span>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-edge pt-5">
          <span className="text-[12px] font-medium text-ink-mid">
            {checked.size}/{items.length} zkontrolováno
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-full px-4 text-[13px] font-medium text-ink-mid transition-colors hover:text-ink-base"
            >
              Zrušit
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending || !allChecked}
              className={BTN_PRIMARY}
              title={allChecked ? undefined : "Zaškrtni všechny body"}
            >
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              {pending ? "Schvaluji…" : "Schválit smlouvu"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
