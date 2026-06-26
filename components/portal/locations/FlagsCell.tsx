"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  DEFAULT_FLAG_COLOR,
  DEFAULT_FLAG_ICON,
  FLAG_COLORS,
  FLAG_COLOR_ORDER,
  FLAG_ICONS,
  FLAG_ICON_KEYS,
  flagIconComp,
  flagTone,
} from "./re-flags-shared";
import type { ReFlag, ReFlagColor, ReFlagIcon } from "@/lib/portal/re-flags-shared";

// Buňka flagů v Real Estate tabulce. Zavřená ukazuje přiřazené flagy jako barevné
// chipy; po kliknutí otevře popover (createPortal na body, ať se neořízne v
// overflow-auto kontejneru tabulky — vzor TransitionSelectCell) s:
//  1) seznamem katalogu (checkbox = přiřazeno této lokalitě),
//  2) inline editací flagu (přejmenovat/přebarvit/smazat) pro autora nebo admina,
//  3) vytvořením nového flagu (název + barva), který se rovnou přiřadí.
export function FlagsCell({
  locationId,
  flagIds,
  flags,
  currentUserEmail,
  isAdmin,
  onFlagsApplied,
  onCatalogChanged,
  onFlagDeleted,
}: {
  locationId: string;
  flagIds: string[];
  flags: ReFlag[];
  currentUserEmail: string;
  isAdmin: boolean;
  onFlagsApplied: (locationId: string, flagIds: string[]) => void;
  onCatalogChanged: (next: ReFlag[]) => void;
  onFlagDeleted: (flagId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Vytvoření nového flagu.
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState<ReFlagColor>(DEFAULT_FLAG_COLOR);
  const [newIcon, setNewIcon] = useState<ReFlagIcon>(DEFAULT_FLAG_ICON);
  const [createBusy, setCreateBusy] = useState(false);

  // Inline editace existujícího flagu.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editColor, setEditColor] = useState<ReFlagColor>(DEFAULT_FLAG_COLOR);
  const [editIcon, setEditIcon] = useState<ReFlagIcon>(DEFAULT_FLAG_ICON);
  const [editBusy, setEditBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const assigned = useMemo(() => {
    const set = new Set(flagIds);
    // Pořadí dle katalogu (stabilní), jen flagy, které v katalogu existují.
    return flags.filter((f) => set.has(f.id));
  }, [flags, flagIds]);

  const POPOVER_W = 288;

  useEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    // hrubý odhad výšky (řádky katalogu + create) pro auto-flip
    const estH = Math.min(420, 120 + flags.length * 40);
    const below = window.innerHeight - rect.bottom;
    const top = below < estH + 8 ? Math.max(8, rect.top - estH - 6) : rect.bottom + 6;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_W - 8));
    setPos({ top, left });
  }, [open, flags.length]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  // Reset efemérních stavů při zavření.
  useEffect(() => {
    if (open) return;
    setCreating(false);
    setNewLabel("");
    setNewColor(DEFAULT_FLAG_COLOR);
    setNewIcon(DEFAULT_FLAG_ICON);
    setEditingId(null);
    setConfirmDeleteId(null);
  }, [open]);

  function canManage(flag: ReFlag): boolean {
    return flag.createdBy === currentUserEmail || isAdmin;
  }

  function flash(err: boolean) {
    setError(err);
    if (err) setTimeout(() => setError(false), 2600);
  }

  // Uloží nové přiřazení (optimistic + rollback). rollback = stav před změnou.
  async function persistAssign(next: string[], rollback: string[]) {
    onFlagsApplied(locationId, next);
    setPending(true);
    setError(false);
    try {
      const res = await fetch(`/api/portal/locations/${locationId}/flags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagIds: next }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "save failed");
      onFlagsApplied(locationId, (data.flagIds ?? next) as string[]);
    } catch {
      onFlagsApplied(locationId, rollback);
      flash(true);
    } finally {
      setPending(false);
    }
  }

  function toggleAssign(flagId: string) {
    const has = flagIds.includes(flagId);
    const next = has ? flagIds.filter((f) => f !== flagId) : [...flagIds, flagId];
    persistAssign(next, flagIds);
  }

  async function createFlag() {
    const label = newLabel.trim();
    if (!label || createBusy) return;
    setCreateBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/portal/re-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, color: newColor, icon: newIcon }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "create failed");
      const flag = data.flag as ReFlag;
      onCatalogChanged([...flags, flag]);
      setNewLabel("");
      setNewColor(DEFAULT_FLAG_COLOR);
      setNewIcon(DEFAULT_FLAG_ICON);
      setCreating(false);
      // Nový flag rovnou přiřadit této lokalitě.
      persistAssign([...flagIds, flag.id], flagIds);
    } catch {
      flash(true);
    } finally {
      setCreateBusy(false);
    }
  }

  function startEdit(flag: ReFlag) {
    setEditingId(flag.id);
    setEditLabel(flag.label);
    setEditColor(flag.color);
    setEditIcon(flag.icon ?? DEFAULT_FLAG_ICON);
    setConfirmDeleteId(null);
  }

  async function saveEdit(flag: ReFlag) {
    const label = editLabel.trim();
    if (!label || editBusy) return;
    setEditBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/portal/re-flags/${flag.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, color: editColor, icon: editIcon }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "update failed");
      const updated = data.flag as ReFlag;
      onCatalogChanged(flags.map((f) => (f.id === updated.id ? updated : f)));
      setEditingId(null);
    } catch {
      flash(true);
    } finally {
      setEditBusy(false);
    }
  }

  async function removeFlag(flag: ReFlag) {
    if (editBusy) return;
    setEditBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/portal/re-flags/${flag.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "delete failed");
      onFlagDeleted(flag.id);
      setEditingId(null);
      setConfirmDeleteId(null);
    } catch {
      flash(true);
    } finally {
      setEditBusy(false);
    }
  }

  function PickerLabel({ children }: { children: ReactNode }) {
    return (
      <span className="block text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-soft">
        {children}
      </span>
    );
  }

  function ColorDots({
    value,
    onPick,
  }: {
    value: ReFlagColor;
    onPick: (c: ReFlagColor) => void;
  }) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        {FLAG_COLOR_ORDER.map((c) => (
          <button
            key={c}
            type="button"
            title={FLAG_COLORS[c].label}
            onClick={(e) => {
              e.stopPropagation();
              onPick(c);
            }}
            className={`h-4 w-4 rounded-full ${FLAG_COLORS[c].dot} transition-transform hover:scale-110 ${
              value === c ? "ring-2 ring-ink-base ring-offset-1 ring-offset-paper" : ""
            }`}
          />
        ))}
      </div>
    );
  }

  // Mřížka ikon. Vybraná ikona se obarví zvolenou barvou flagu (živý náhled).
  function IconGrid({
    value,
    color,
    onPick,
  }: {
    value: ReFlagIcon;
    color: ReFlagColor;
    onPick: (i: ReFlagIcon) => void;
  }) {
    const tone = flagTone(color).text;
    return (
      <div className="grid grid-cols-8 gap-1">
        {FLAG_ICON_KEYS.map((key) => {
          const Ico = FLAG_ICONS[key].Icon;
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              title={FLAG_ICONS[key].label}
              onClick={(e) => {
                e.stopPropagation();
                onPick(key);
              }}
              className={`grid h-7 w-7 place-items-center rounded-md border transition-colors ${
                active
                  ? `border-ink-base bg-paper-warm ${tone}`
                  : "border-transparent text-ink-mid hover:bg-paper-warm"
              }`}
            >
              <Ico className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <>
      {/* Trigger vedle názvu prodejny: jen ikonky přiřazených flagů (label v
          tooltipu). Prázdný stav = decentní „+", který se zvýrazní při hoveru řádku. */}
      <button
        ref={btnRef}
        type="button"
        aria-label="Flagy lokality"
        title={assigned.length === 0 ? "Přidat flag" : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`inline-flex max-w-[160px] flex-wrap items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-edge-warm ${
          assigned.length === 0 && !pending && !error
            ? "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            : ""
        }`}
      >
        {assigned.length === 0 ? (
          <Plus className="h-3.5 w-3.5 text-ink-soft" strokeWidth={1.5} aria-hidden="true" />
        ) : (
          assigned.map((f) => {
            const Ico = flagIconComp(f.icon);
            return (
              <span
                key={f.id}
                title={f.label}
                aria-label={f.label}
                className={`inline-flex ${flagTone(f.color).text}`}
              >
                <Ico className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </span>
            );
          })
        )}
        {pending && (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-ink-soft" aria-hidden="true" />
        )}
        {error && <span className="text-[11px] text-red-600">chyba</span>}
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: POPOVER_W, zIndex: 120 }}
            className="flex max-h-[70vh] flex-col overflow-hidden rounded-xl border border-edge bg-paper shadow-[0_12px_28px_-12px_rgba(14,14,14,0.3)]"
          >
            <div className="flex items-center justify-between border-b border-edge px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-mid">
                Flagy lokality
              </span>
              {pending && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-soft" aria-hidden="true" />
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-auto py-1">
              {flags.length === 0 ? (
                <p className="px-3 py-3 text-[12px] text-ink-soft">
                  Zatím žádné flagy. Vytvořte první níže.
                </p>
              ) : (
                flags.map((f) => {
                  const isEditing = editingId === f.id;
                  const checked = flagIds.includes(f.id);
                  if (isEditing) {
                    return (
                      <div key={f.id} className="border-b border-edge/60 px-3 py-2">
                        <input
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit(f);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          maxLength={60}
                          autoFocus
                          className="mb-2 w-full rounded-lg border border-ink-base bg-paper px-2 py-1 text-[12.5px] text-ink-base outline-none"
                        />
                        <div className="mb-2 space-y-2">
                          <PickerLabel>Barva</PickerLabel>
                          <ColorDots value={editColor} onPick={setEditColor} />
                          <PickerLabel>Ikona</PickerLabel>
                          <IconGrid value={editIcon} color={editColor} onPick={setEditIcon} />
                        </div>
                        {confirmDeleteId === f.id ? (
                          <div className="flex items-center justify-between gap-2 text-[12px]">
                            <span className="text-red-600">Smazat ze všech lokalit?</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeFlag(f);
                                }}
                                disabled={editBusy}
                                className="rounded-md bg-red-600 px-2 py-1 text-[11.5px] font-medium text-white disabled:opacity-50"
                              >
                                Smazat
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDeleteId(null);
                                }}
                                className="rounded-md border border-edge px-2 py-1 text-[11.5px] text-ink-mid"
                              >
                                Zrušit
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteId(f.id);
                              }}
                              className="inline-flex items-center gap-1 text-[12px] text-red-600 hover:underline"
                            >
                              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                              Smazat
                            </button>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingId(null);
                                }}
                                className="rounded-md border border-edge px-2 py-1 text-[11.5px] text-ink-mid"
                              >
                                Zrušit
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  saveEdit(f);
                                }}
                                disabled={editBusy || !editLabel.trim()}
                                className="inline-flex items-center gap-1 rounded-md bg-ink-base px-2 py-1 text-[11.5px] font-medium text-paper disabled:opacity-50"
                              >
                                {editBusy ? (
                                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                                ) : (
                                  <Check className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                                )}
                                Uložit
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div key={f.id} className="flex items-center gap-1 pr-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleAssign(f.id);
                        }}
                        className="flex flex-1 items-center gap-2 px-3 py-1.5 text-left text-[12.5px] text-ink-base transition-colors hover:bg-paper-warm"
                      >
                        {(() => {
                          const Ico = flagIconComp(f.icon);
                          return (
                            <Ico
                              className={`h-4 w-4 shrink-0 ${flagTone(f.color).text}`}
                              strokeWidth={1.75}
                              aria-hidden="true"
                            />
                          );
                        })()}
                        <span className="flex-1 truncate">{f.label}</span>
                        {checked && (
                          <Check className="h-3.5 w-3.5 shrink-0 text-ink-base" strokeWidth={2} aria-hidden="true" />
                        )}
                      </button>
                      {canManage(f) && (
                        <button
                          type="button"
                          title="Upravit flag"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEdit(f);
                          }}
                          className="shrink-0 rounded-md p-1 text-ink-soft transition-colors hover:bg-paper-warm hover:text-ink-base"
                        >
                          <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Vytvoření nového flagu */}
            <div className="border-t border-edge px-3 py-2">
              {creating ? (
                <div>
                  <input
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") createFlag();
                      if (e.key === "Escape") setCreating(false);
                    }}
                    maxLength={60}
                    autoFocus
                    placeholder="Název flagu…"
                    className="mb-2 w-full rounded-lg border border-ink-base bg-paper px-2 py-1 text-[12.5px] text-ink-base outline-none placeholder:text-ink-soft"
                  />
                  <div className="mb-2 space-y-2">
                    <PickerLabel>Barva</PickerLabel>
                    <ColorDots value={newColor} onPick={setNewColor} />
                    <PickerLabel>Ikona</PickerLabel>
                    <IconGrid value={newIcon} color={newColor} onPick={setNewIcon} />
                  </div>
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCreating(false);
                        setNewLabel("");
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-edge px-2 py-1 text-[11.5px] text-ink-mid"
                    >
                      <X className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
                      Zrušit
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        createFlag();
                      }}
                      disabled={createBusy || !newLabel.trim()}
                      className="inline-flex items-center gap-1 rounded-md bg-ink-base px-2 py-1 text-[11.5px] font-medium text-paper disabled:opacity-50"
                    >
                      {createBusy ? (
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                      ) : (
                        <Plus className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                      )}
                      Vytvořit
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCreating(true);
                  }}
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-deep transition-colors hover:text-ink-base"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                  Nový flag
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
