"use client";

import { useEffect, useState } from "react";
import { LineChart, Loader2, X } from "lucide-react";
import { ReTrendPanel, type Point } from "./ReTrendChart";

// ─────────────────────────────────────────────────────────────────────────────
// „Vývoj v čase" — tlačítko v toolbaru Real Estate, které otevře modal s grafem
// (ReTrendPanel). Data se fetchnou z /api/portal/real-estate-trend. Tentýž panel
// se renderuje i na Dashboardu (tam ale se server-side daty, bez modalu).
// ─────────────────────────────────────────────────────────────────────────────

export function ReTrendButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Týdenní vývoj počtů Řešit / Vyřešeno / Červeně"
        className="inline-flex h-9 items-center gap-2 rounded-full border border-edge bg-paper px-3.5 text-[12.5px] font-medium text-ink-deep transition-colors hover:border-ink-soft"
      >
        <LineChart className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
        Vývoj v čase
      </button>
      {open && <ReTrendModal onClose={() => setOpen(false)} />}
    </>
  );
}

type State =
  | { status: "loading" }
  | { status: "error"; msg: string }
  | { status: "ready"; points: Point[] };

function ReTrendModal({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/portal/real-estate-trend", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data?.ok) throw new Error(data?.error ?? "Nepodařilo se načíst data");
        const points: Point[] = Array.isArray(data.points) ? data.points : [];
        if (alive) setState({ status: "ready", points });
      } catch (e) {
        if (alive) {
          setState({
            status: "error",
            msg: e instanceof Error ? e.message : "Neznámá chyba",
          });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-base/40 px-4 py-8 backdrop-blur-sm md:py-12"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-[920px] rounded-3xl border border-edge bg-paper p-6 shadow-[0_18px_42px_-18px_rgba(14,14,14,0.35)] sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink-mid">
              <span
                aria-hidden="true"
                className="mr-3 inline-block h-px w-6 translate-y-[-3px] bg-ink-base/50 align-middle"
              />
              Real Estate
            </div>
            <h2 className="text-[1.4rem] font-extrabold tracking-[-0.025em] text-ink-base">
              Vývoj v čase
            </h2>
            <p className="max-w-[58ch] text-[13px] leading-relaxed text-ink-mid">
              Týdenní počty lokalit podle stavu řešení nájmu. Snímek se ukládá
              automaticky každé pondělí; hodnota za aktuální týden je živá.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zavřít"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-edge bg-paper text-ink-mid transition-colors hover:border-ink-soft hover:text-ink-base"
          >
            <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-6">
          {state.status === "loading" && <LoadingBox />}
          {state.status === "error" && <ErrorBox msg={state.msg} />}
          {state.status === "ready" && <ReTrendPanel points={state.points} />}
        </div>
      </div>
    </div>
  );
}

function LoadingBox() {
  return (
    <div className="grid h-[360px] place-items-center rounded-2xl border border-edge bg-paper-warm">
      <span className="inline-flex items-center gap-2 text-[13px] text-ink-mid">
        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} aria-hidden="true" />
        Načítám vývoj…
      </span>
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="grid h-[360px] place-items-center rounded-2xl border border-dashed border-edge bg-paper-warm px-6 text-center">
      <div>
        <p className="text-[14px] font-semibold text-ink-base">
          Data se nepodařilo načíst
        </p>
        <p className="mt-1 font-mono text-[12px] text-ink-soft">{msg}</p>
      </div>
    </div>
  );
}
