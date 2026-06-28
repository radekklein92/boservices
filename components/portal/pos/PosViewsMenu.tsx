"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bookmark, Check, Loader2, Plus, Star, Trash2 } from "lucide-react";
import type { MeInfo, ViewLite, ViewsData } from "./pos-filter-shared";

// Uložené pohledy: aplikace (navigace), výchozí (hvězda), mazání (autor|admin),
// uložení aktuálního filtru (soukromý/sdílený). Po mutaci router.refresh()
// (loader přečte čerstvé pohledy z Redisu).

export function PosViewsMenu({
  views,
  me,
  currentFilter,
}: {
  views: ViewsData;
  me: MeInfo;
  currentFilter: string; // serializovaný query string aktuálního filtru
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const total = views.own.length + views.shared.length;

  const apply = (v: ViewLite) => {
    setOpen(false);
    router.push(v.filter ? `${pathname}?${v.filter}` : pathname, { scroll: false });
  };

  const setDefault = async (id: string | null) => {
    setBusy(true);
    try {
      await fetch("/api/portal/pos/views/default", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewId: id }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await fetch(`/api/portal/pos/views/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/portal/pos/views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), filter: currentFilter, shared }),
      });
      if (res.ok) {
        setName("");
        setShared(false);
        setSaving(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const canDelete = (v: ViewLite) =>
    me.isAdmin || v.ownerEmail.toLowerCase() === me.email.toLowerCase();

  const Row = ({ v }: { v: ViewLite }) => {
    const isDefault = views.defaultId === v.id;
    return (
      <div className="group flex items-center gap-1 rounded-lg pl-1 pr-1 hover:bg-edge-warm">
        <button
          type="button"
          onClick={() => apply(v)}
          className="min-w-0 flex-1 truncate px-2 py-2 text-left text-[13px] text-ink-deep"
        >
          {v.name}
          {v.shared && v.ownerEmail.toLowerCase() !== me.email.toLowerCase() && (
            <span className="ml-1.5 text-[11px] text-ink-soft">· {v.ownerEmail.split("@")[0]}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setDefault(isDefault ? null : v.id)}
          disabled={busy}
          title={isDefault ? "Zrušit výchozí" : "Nastavit jako výchozí"}
          className={`grid h-7 w-7 place-items-center rounded-md transition-colors ${
            isDefault ? "text-amber-500" : "text-ink-soft opacity-0 group-hover:opacity-100 hover:text-ink-base"
          }`}
        >
          <Star className="h-3.5 w-3.5" strokeWidth={2} fill={isDefault ? "currentColor" : "none"} aria-hidden="true" />
        </button>
        {canDelete(v) && (
          <button
            type="button"
            onClick={() => remove(v.id)}
            disabled={busy}
            title="Smazat pohled"
            className="grid h-7 w-7 place-items-center rounded-md text-ink-soft opacity-0 transition-colors hover:text-red-600 group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Pohledy"
        title="Pohledy"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-edge bg-paper text-ink-deep transition-colors hover:border-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-base focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      >
        <Bookmark className="h-4 w-4 text-ink-mid" strokeWidth={1.75} aria-hidden="true" />
        {total > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full border border-paper bg-ink-deep px-1 font-mono text-[9.5px] font-medium leading-none text-paper">
            {total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-[300px] overflow-hidden rounded-2xl border border-edge bg-paper shadow-[0_12px_40px_-12px_rgba(0,0,0,0.25)]">
          <div className="max-h-[min(55vh,380px)] overflow-y-auto p-1.5">
            {total === 0 && (
              <p className="px-3 py-5 text-center text-[12.5px] text-ink-mid">
                Zatím žádné uložené pohledy.
              </p>
            )}
            {views.own.length > 0 && (
              <>
                <div className="px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
                  Moje pohledy
                </div>
                {views.own.map((v) => (
                  <Row key={v.id} v={v} />
                ))}
              </>
            )}
            {views.shared.length > 0 && (
              <>
                <div className="mt-1 px-2 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
                  Sdílené
                </div>
                {views.shared.map((v) => (
                  <Row key={v.id} v={v} />
                ))}
              </>
            )}
          </div>

          <div className="border-t border-edge p-2">
            {saving ? (
              <div className="flex flex-col gap-2">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && save()}
                  placeholder="Název pohledu"
                  maxLength={60}
                  className="h-9 w-full rounded-lg border border-edge bg-paper px-2.5 text-[13px] text-ink-base outline-none focus:border-ink-base"
                />
                <label className="flex items-center gap-2 px-1 text-[12.5px] text-ink-deep">
                  <button
                    type="button"
                    onClick={() => setShared((s) => !s)}
                    className={`grid h-[18px] w-[18px] place-items-center rounded-[6px] border transition-colors ${
                      shared ? "border-ink-base bg-ink-base text-paper" : "border-edge bg-paper"
                    }`}
                  >
                    {shared && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}
                  </button>
                  Sdílet s týmem
                </label>
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSaving(false);
                      setName("");
                    }}
                    className="h-8 rounded-full px-3 text-[12px] font-medium text-ink-mid hover:text-ink-base"
                  >
                    Zrušit
                  </button>
                  <button
                    type="button"
                    onClick={save}
                    disabled={busy || !name.trim()}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink-base px-3.5 text-[12px] font-semibold text-paper disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                    Uložit
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSaving(true)}
                className="inline-flex w-full items-center gap-2 rounded-lg px-2 py-2 text-[12.5px] font-medium text-ink-deep transition-colors hover:bg-edge-warm"
              >
                <Plus className="h-4 w-4 text-ink-mid" strokeWidth={2} aria-hidden="true" />
                Uložit aktuální filtr
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
