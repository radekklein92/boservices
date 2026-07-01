"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatCzkRounded } from "@/lib/portal/claims";
import { TONE_INFO } from "@/lib/portal/tone";
import type { AssignedClaimsView } from "@/lib/portal/assigned-claims";

const claimsWord = (n: number) =>
  n === 1 ? "pohledávka" : n < 5 ? "pohledávky" : "pohledávek";

// Rozpad částky po firmách + rozklikávací seznam jednotlivých pohledávek, ze
// kterých se číslo skládá (pro náhled i jako podklad pro cross-ručení v editoru).
export function ClaimsBreakdownView({ view }: { view: AssignedClaimsView }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const maxTotal = view.breakdown.reduce((m, e) => Math.max(m, e.total), 0) || 1;

  function toggle(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  if (view.breakdown.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-edge bg-paper-warm/40 px-4 py-8 text-center text-[13px] text-ink-mid">
        Zatím žádné postoupené pohledávky.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <p className="text-[11.5px] leading-relaxed text-ink-mid">
        Každá pohledávka se počítá u dlužníka i u každého potvrzeného ručitele -
        součet sloupců proto odpovídá celkové částce.
      </p>

      {view.breakdown.map((e) => {
        const pct = view.total > 0 ? Math.round((e.total / view.total) * 100) : 0;
        const isOpen = expanded.has(e.name);
        const claims = isOpen
          ? view.rows.filter(
              (r) => r.debtorName === e.name || r.guarantors.includes(e.name),
            )
          : [];
        return (
          <div key={e.name} className="flex flex-col">
            <button
              type="button"
              onClick={() => toggle(e.name)}
              className="group flex flex-col gap-1.5 text-left"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[14px] font-semibold text-ink-base">
                  {e.name}
                </span>
                <span className="shrink-0 text-[14px] font-bold tabular-nums tracking-[-0.01em] text-ink-base">
                  {formatCzkRounded(e.total)}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-edge">
                <div
                  className="h-full rounded-full bg-ink-base transition-all"
                  style={{ width: `${Math.max(2, (e.total / maxTotal) * 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between gap-2 text-[11.5px] text-ink-mid">
                <span className="flex items-center gap-1">
                  <ChevronDown
                    className={`h-3 w-3 text-ink-soft transition-transform group-hover:text-ink-mid ${isOpen ? "rotate-180" : ""}`}
                    strokeWidth={2.5}
                    aria-hidden="true"
                  />
                  {e.claimsCount} {claimsWord(e.claimsCount)}
                  {e.asGuarantorTotal > 0 && (
                    <span className="text-ink-soft">
                      {" "}
                      · z ručení {formatCzkRounded(e.asGuarantorTotal)}
                    </span>
                  )}
                  {e.clamoraTotal > 0 && (
                    <span className="text-sky-700">
                      {" "}
                      · z Clamory {formatCzkRounded(e.clamoraTotal)}
                    </span>
                  )}
                </span>
                <span className="tabular-nums">{pct} %</span>
              </div>
            </button>

            {isOpen && (
              <div className="ml-1 mt-2 flex flex-col gap-2 border-l border-edge pl-3">
                {claims.map((r) => {
                  const isDebtor = r.debtorName === e.name;
                  return (
                    <div
                      key={`${r.id}#${e.name}`}
                      className="flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[12.5px] text-ink-deep">
                          {r.title}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px]">
                          <Badge
                            tone={
                              isDebtor
                                ? "border-edge bg-paper text-ink-mid"
                                : "border-amber-300 bg-amber-50 text-amber-800"
                            }
                          >
                            {isDebtor ? "Dlužník" : "Ručitel"}
                          </Badge>
                          {r.source === "manual" && (
                            <Badge tone="border-edge bg-paper-warm text-ink-soft">
                              Ruční
                            </Badge>
                          )}
                          {r.source === "clamora" && (
                            <Badge tone={TONE_INFO}>
                              Clamora
                            </Badge>
                          )}
                          {isDebtor && r.guarantors.length > 0 && (
                            <span className="text-ink-soft">
                              ručí: {r.guarantors.join(", ")}
                            </span>
                          )}
                          {!isDebtor && (
                            <span className="text-ink-soft">
                              dlužník: {r.debtorName}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-ink-base">
                        {formatCzkRounded(r.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 font-medium ${tone}`}
    >
      {children}
    </span>
  );
}
