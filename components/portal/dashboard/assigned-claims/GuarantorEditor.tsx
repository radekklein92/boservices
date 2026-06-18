"use client";

import { Info, Plus, Trash2 } from "lucide-react";
import { newGuarantor, type Guarantor } from "@/lib/portal/claims-overlay";
import { CompanyPicker } from "./CompanyPicker";

// Editor seznamu ručitelů jedné pohledávky. Každý ručitel = firma + povinné
// potvrzení, že ručení vzniklo > 1 rok před návrhem na insolvenci (bez něj se
// firma do součtů nezapočítá - v insolvenci by bylo odporovatelné).
export function GuarantorEditor({
  value,
  companyOptions,
  onChange,
}: {
  value: Guarantor[];
  companyOptions: string[];
  onChange: (next: Guarantor[]) => void;
}) {
  function update(id: string, patch: Partial<Guarantor>) {
    onChange(value.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }
  function remove(id: string) {
    onChange(value.filter((g) => g.id !== id));
  }
  function add() {
    onChange([...value, newGuarantor()]);
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50/60 px-3 py-2 text-[11.5px] leading-relaxed text-amber-900">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
        <span>
          Ručení lze uplatnit, jen pokud vzniklo <strong>více než rok před
          podáním návrhu na insolvenci</strong> (jinak je odporovatelné).
          Potvrďte zaškrtnutím - bez potvrzení se u dané firmy nezapočítá.
        </span>
      </div>

      {value.length > 0 && (
        <div className="flex flex-col gap-2">
          {value.map((g) => {
            const willCount = g.confirmedOverOneYear && g.company.trim().length > 0;
            return (
              <div
                key={g.id}
                className="flex flex-col gap-2 rounded-lg border border-edge bg-paper-warm/40 p-2.5"
              >
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <CompanyPicker
                      value={g.company}
                      onChange={(v) => update(g.id, { company: v })}
                      options={companyOptions}
                      placeholder="Firma, která ručí"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(g.id)}
                    aria-label="Odebrat ručitele"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-edge text-ink-mid transition-colors hover:border-rose-400 hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <label className="flex cursor-pointer items-center gap-2 text-[12px] text-ink-deep">
                    <input
                      type="checkbox"
                      checked={g.confirmedOverOneYear}
                      onChange={(e) =>
                        update(g.id, { confirmedOverOneYear: e.target.checked })
                      }
                      className="h-4 w-4 shrink-0 rounded border-edge accent-ink-base"
                    />
                    Ručení vzniklo více než rok před návrhem na insolvenci
                  </label>
                  {g.company.trim() && !willCount && (
                    <span className="shrink-0 text-[11px] font-medium text-amber-700">
                      nezapočítá se
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={add}
        className="inline-flex h-9 w-fit items-center gap-1.5 rounded-full border border-edge px-3 text-[12px] font-medium text-ink-deep transition-colors hover:border-ink-base hover:text-ink-base"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />
        Přidat ručitele
      </button>
    </div>
  );
}
