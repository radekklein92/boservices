"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Coins,
  Download,
  Loader2,
  Settings,
  X,
} from "lucide-react";
import { formatCzkRounded } from "@/lib/portal/claims";
import type {
  AssignedClaimsView,
  ContractClaimRef,
} from "@/lib/portal/assigned-claims";
import type { ClaimsOverlay } from "@/lib/portal/claims-overlay";
import { ClaimsBreakdownView } from "./assigned-claims/ClaimsBreakdownView";
import { ClaimsOverlayEditor } from "./assigned-claims/ClaimsOverlayEditor";

const contractsWord = (n: number) => (n === 1 ? "smlouvy" : "smluv");

const ICON_BTN =
  "grid h-9 w-9 shrink-0 place-items-center rounded-full border border-edge text-ink-mid transition-colors hover:border-ink-soft disabled:opacity-40 disabled:hover:border-edge";

// Postoupené pohledávky - dlaždice na dashboardu. Dlaždice ukazuje jen součet 3
// klíčových firem (BBI + TD1 + FLW); celkový součet a rozpad po všech dlužnících
// je až v modalu (+ drill-down). Admin má kolečko (overlay: ruční pohledávky +
// cross-ručení) a tlačítko stáhnout (PDF podklad pro insolvence).
export function AssignedClaimsPanel({
  view,
  keyTotal,
  overlay,
  contractClaims,
  companyOptions,
  isAdmin,
}: {
  view: AssignedClaimsView;
  keyTotal: number;
  overlay: ClaimsOverlay;
  contractClaims: ContractClaimRef[];
  companyOptions: string[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Dlaždice = 3 klíčové firmy, modal = celkový součet.
  const tileFormatted = formatCzkRounded(keyTotal);
  const grandFormatted = formatCzkRounded(view.total);

  const tileCaption =
    view.total === 0
      ? "zatím žádné postoupené pohledávky"
      : "vč. DPH · 3 klíčové společnosti";
  const modalCaption =
    view.contractsCount === 0 && view.manualClaimsCount === 0
      ? "zatím žádné postoupené pohledávky"
      : `vč. DPH · z ${view.contractsCount} ${contractsWord(view.contractsCount)}` +
        (view.manualClaimsCount > 0
          ? ` · +${view.manualClaimsCount} ručních`
          : "");

  // Prázdná dlaždice jde otevřít jen adminovi (aby mohl přidat ruční pohledávku).
  const disabled = view.total === 0 && !isAdmin;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function openModal() {
    // Když není co zobrazit a jsem admin, rovnou do editoru.
    setEditMode(isAdmin && view.breakdown.length === 0);
    setOpen(true);
  }

  function onSaved() {
    router.refresh();
    setEditMode(false);
  }

  async function downloadExport() {
    setDownloading(true);
    try {
      const res = await fetch("/api/portal/claims-overlay/export");
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Stažení selhalo.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers.get("X-Filename") ?? "postoupene-pohledavky-isir.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Stažení selhalo.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        disabled={disabled}
        className="group relative w-full overflow-hidden rounded-[24px] border border-edge bg-paper p-7 text-left transition-colors hover:border-ink-soft disabled:cursor-default disabled:hover:border-edge"
      >
        <Coins
          className="absolute -bottom-4 -right-4 h-32 w-32 text-ink-base/[0.04]"
          strokeWidth={1}
          aria-hidden="true"
        />
        <div className="relative">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink-mid">
              <Coins className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
              Postoupené pohledávky · BBI + TD1 + FLW
            </div>
            <ArrowUpRight
              className="h-4 w-4 shrink-0 text-ink-mid transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              strokeWidth={1.5}
            />
          </div>
          <div className="mt-5 font-extrabold leading-none tracking-[-0.045em] text-ink-base text-[clamp(2rem,4.6vw,2.85rem)]">
            {tileFormatted}
          </div>
          <div className="mt-2.5 text-[13px] text-ink-mid">{tileCaption}</div>
        </div>
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-ink-base/40 px-4 py-6 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <div
              className={`flex max-h-[82vh] w-full flex-col rounded-2xl border border-edge bg-paper shadow-[0_18px_42px_-18px_rgba(14,14,14,0.35)] ${editMode ? "max-w-[640px]" : "max-w-[560px]"}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 p-6 pb-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.22em] text-ink-soft">
                    <Coins className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                    Postoupené pohledávky
                  </div>
                  <div className="mt-1.5 text-[26px] font-extrabold leading-none tracking-[-0.04em] text-ink-base">
                    {grandFormatted}
                  </div>
                  <div className="mt-1.5 text-[12.5px] text-ink-mid">
                    {modalCaption} ·{" "}
                    {editMode ? "úpravy a ručení" : "rozpad po dlužnících"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={downloadExport}
                      disabled={downloading || view.breakdown.length === 0}
                      aria-label="Stáhnout podklad pro insolvence (PDF)"
                      title="Stáhnout PDF podklad pro přihlášky do insolvence"
                      className={ICON_BTN}
                    >
                      {downloading ? (
                        <Loader2
                          className="h-4 w-4 animate-spin"
                          strokeWidth={2}
                          aria-hidden="true"
                        />
                      ) : (
                        <Download className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                      )}
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setEditMode((v) => !v)}
                      aria-label={editMode ? "Zpět na přehled" : "Nastavení a úpravy"}
                      title={editMode ? "Zpět na přehled" : "Nastavení a úpravy"}
                      className={ICON_BTN}
                    >
                      {editMode ? (
                        <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                      ) : (
                        <Settings className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Zavřít"
                    className={ICON_BTN}
                  >
                    <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
              </div>

              {editMode ? (
                <ClaimsOverlayEditor
                  contractClaims={contractClaims}
                  companyOptions={companyOptions}
                  initialOverlay={overlay}
                  onSaved={onSaved}
                />
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
                  <ClaimsBreakdownView view={view} />
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
