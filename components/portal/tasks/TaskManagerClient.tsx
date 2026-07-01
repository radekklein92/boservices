"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDownUp,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  FileText,
  GripVertical,
  KanbanSquare,
  ListChecks,
  MapPin,
  Plus,
  Rows3,
  Zap,
} from "lucide-react";
import {
  formatDeadline,
  isTaskUnseen,
  STATUS_META,
  STATUS_ORDER,
  type SeenMap,
  type Task,
  type TaskStatus,
} from "@/lib/portal/tasks-shared";
import { BTN_PRIMARY } from "@/components/portal/ui/buttons";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { SearchInput } from "@/components/portal/ui/SearchInput";
import { ResultCount } from "@/components/portal/ui/ResultCount";
import { StatusDropdown } from "./task-ui";
import { TaskSidePanel } from "./TaskSidePanel";
import { CommandPalette } from "./CommandPalette";
import { KanbanBoard } from "./KanbanBoard";
import type { MemberOption, TaskEntityOptions } from "./types";

type PanelState = Partial<Task> | null | false; // false = zavřeno, null = nový

export function TaskManagerClient({
  initialTasks,
  members,
  options,
  initialSeenMap,
  initialOpenTaskId,
  currentUserName,
}: {
  initialTasks: Task[];
  members: MemberOption[];
  options: TaskEntityOptions;
  initialSeenMap: SeenMap;
  initialOpenTaskId?: string;
  currentUserName: string;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [seenMap] = useState<SeenMap>(initialSeenMap);
  const [panel, setPanel] = useState<PanelState>(false);
  const [palette, setPalette] = useState(false);

  const [filterStatus, setFilterStatus] = useState<TaskStatus | "all">("all");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [sortDeadline, setSortDeadline] = useState<"asc" | "desc" | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "kanban">("list");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Otevři úkol z deep linku (?task=…) – např. z e-mailu.
  useEffect(() => {
    if (!initialOpenTaskId) return;
    const t = initialTasks.find((x) => x.id === initialOpenTaskId);
    if (t) setPanel(t);
  }, [initialOpenTaskId, initialTasks]);

  // Cmd/Ctrl+K = rychlé přidání.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Označ vše za přečtené (server) + refresh nav badge. Tečky během návštěvy
  // zůstanou (lokální seenMap neměníme).
  useEffect(() => {
    if (initialTasks.length === 0) return;
    fetch("/api/portal/tasks/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    })
      .then(() => router.refresh())
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const assigneeOptions = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => t.assignee && set.add(t.assignee));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "cs"));
  }, [tasks]);

  const dragEnabled =
    view === "list" &&
    filterStatus === "all" &&
    !filterAssignee &&
    !sortDeadline &&
    !search.trim();

  const filtered = useMemo(() => {
    let r = tasks;
    if (filterStatus !== "all") r = r.filter((t) => t.status === filterStatus);
    if (filterAssignee) r = r.filter((t) => t.assignee === filterAssignee);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.assignee.toLowerCase().includes(q) ||
          (t.body ?? "").toLowerCase().includes(q),
      );
    }
    if (sortDeadline) {
      r = [...r].sort((a, b) => {
        if (a.status === "done" && b.status !== "done") return 1;
        if (b.status === "done" && a.status !== "done") return -1;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return sortDeadline === "asc"
          ? a.deadline.localeCompare(b.deadline)
          : b.deadline.localeCompare(a.deadline);
      });
    }
    // Hotové úkoly vždy dolů (stabilní řazení zachová pořadí ostatních).
    r = [...r].sort(
      (a, b) => Number(a.status === "done") - Number(b.status === "done"),
    );
    return r;
  }, [tasks, filterStatus, filterAssignee, sortDeadline, search]);

  const counts = useMemo(() => {
    const c = { all: tasks.length, todo: 0, in_progress: 0, done: 0 } as Record<string, number>;
    tasks.forEach((t) => (c[t.status] += 1));
    return c;
  }, [tasks]);

  // ── mutace ──
  function upsertLocal(task: Task) {
    setTasks((prev) => {
      const i = prev.findIndex((t) => t.id === task.id);
      if (i === -1) return [task, ...prev];
      const next = [...prev];
      next[i] = task;
      return next;
    });
  }

  async function changeStatus(task: Task, status: TaskStatus) {
    upsertLocal({ ...task, status, updatedAt: new Date().toISOString() });
    try {
      const res = await fetch(`/api/portal/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.ok) upsertLocal(data.task as Task);
    } catch {
      router.refresh();
    }
  }

  async function toggleSubtask(task: Task, subtaskId: string) {
    const subtasks = task.subtasks.map((s) =>
      s.id === subtaskId ? { ...s, done: !s.done } : s,
    );
    upsertLocal({ ...task, subtasks, updatedAt: new Date().toISOString() });
    try {
      const res = await fetch(`/api/portal/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtasks }),
      });
      const data = await res.json();
      if (data.ok) upsertLocal(data.task as Task);
    } catch {
      router.refresh();
    }
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    // Pracujeme s viditelným pořadím (filtered = hotové dole), ať drag sedí
    // s tím, co uživatel vidí. V draggable stavu je filtered plná množina úkolů.
    const oldI = filtered.findIndex((t) => t.id === active.id);
    const newI = filtered.findIndex((t) => t.id === over.id);
    if (oldI === -1 || newI === -1) return;
    const next = arrayMove(filtered, oldI, newI);
    setTasks(next);
    fetch("/api/portal/tasks/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: next.map((t) => t.id) }),
    }).catch(() => {});
  }

  const isUnseen = (t: Task) => isTaskUnseen(t, seenMap);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Tým"
        title="Úkoly"
        lede="Interní úkoly týmu - termíny, podúkoly, e-mailové připomínky a vazby na klienty, lokality a smlouvy."
        actions={
          <button type="button" onClick={() => setPanel(null)} className={BTN_PRIMARY}>
            <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
            Nový úkol
          </button>
        }
      />

      {/* Stat karty */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Celkem"
          value={counts.all}
          active={filterStatus === "all"}
          onClick={() => setFilterStatus("all")}
        />
        {STATUS_ORDER.map((s) => (
          <StatCard
            key={s}
            label={STATUS_META[s].label}
            value={counts[s] ?? 0}
            dot={STATUS_META[s].dot}
            active={filterStatus === s}
            onClick={() => setFilterStatus((cur) => (cur === s ? "all" : s))}
          />
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3">
        {/* Řádek 1: hledání */}
        <SearchInput value={search} onChange={setSearch} placeholder="Hledat úkol…" />

        {/* Řádek 2: počet + pohledové ovladače vpravo (vzor Real Estate) */}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <ResultCount shown={filtered.length} total={tasks.length} />
          <div className="inline-flex h-9 overflow-hidden rounded-full border border-edge">
            <ViewBtn active={view === "list"} onClick={() => setView("list")} Icon={Rows3} />
            <ViewBtn active={view === "kanban"} onClick={() => setView("kanban")} Icon={KanbanSquare} />
          </div>

          <select
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
            className="h-9 rounded-full border border-edge bg-paper px-3 text-[12.5px] text-ink-deep outline-none transition-colors hover:border-ink-base focus:border-ink-base"
          >
            <option value="">Všichni řešitelé</option>
            {assigneeOptions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() =>
              setSortDeadline((s) => (s === "asc" ? "desc" : s === "desc" ? null : "asc"))
            }
            className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors ${
              sortDeadline
                ? "border-ink-base text-ink-base"
                : "border-edge text-ink-mid hover:border-ink-base hover:text-ink-base"
            }`}
            title="Řadit podle termínu"
          >
            <ArrowDownUp className="h-3.5 w-3.5" strokeWidth={1.5} />
            Termín {sortDeadline === "asc" ? "↑" : sortDeadline === "desc" ? "↓" : ""}
          </button>

          <button
            type="button"
            onClick={() => setPalette(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-edge px-3 text-[12.5px] font-medium text-ink-mid transition-colors hover:border-ink-base hover:text-ink-base"
            title="Rychlé přidání (Cmd+K)"
          >
            <Zap className="h-3.5 w-3.5" strokeWidth={1.5} />
            Rychle
            <kbd className="ml-0.5 hidden rounded border border-edge bg-paper-warm px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink-mid sm:inline-block">
              ⌘K
            </kbd>
          </button>
        </div>
      </div>

      {/* Obsah */}
      {filtered.length === 0 ? (
        <EmptyState onNew={() => setPanel(null)} hasTasks={tasks.length > 0} />
      ) : view === "kanban" ? (
        <KanbanBoard
          tasks={filtered}
          onOpen={(t) => setPanel(t)}
          onMove={changeStatus}
          onToggleSubtask={toggleSubtask}
          isUnseen={isUnseen}
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={filtered.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="overflow-hidden rounded-2xl border border-edge bg-paper">
              {filtered.map((t, i) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  even={i % 2 === 0}
                  dragEnabled={dragEnabled}
                  unseen={isUnseen(t)}
                  onOpen={() => setPanel(t)}
                  onStatus={(s) => changeStatus(t, s)}
                  onToggleSubtask={(sid) => toggleSubtask(t, sid)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <AnimatePresence>
        {palette && (
          <CommandPalette
            members={members}
            onClose={() => setPalette(false)}
            onCreated={(t) => {
              upsertLocal(t);
              setPalette(false);
            }}
            onOpenDetail={(draft) => {
              setPalette(false);
              setPanel(draft);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {panel !== false && (
          <TaskSidePanel
            task={panel}
            members={members}
            options={options}
            currentUserName={currentUserName}
            onClose={() => setPanel(false)}
            onSaved={(t) => {
              upsertLocal(t);
              setPanel(false);
            }}
            onDeleted={(id) => {
              setTasks((prev) => prev.filter((x) => x.id !== id));
              setPanel(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({
  label,
  value,
  dot,
  active,
  onClick,
}: {
  label: string;
  value: number;
  dot?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col gap-1 rounded-2xl border px-4 py-3 text-left transition-colors ${
        active ? "border-ink-base bg-ink-base text-paper" : "border-edge bg-paper hover:border-ink-soft"
      }`}
    >
      <span className="inline-flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.16em]">
        {dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} />}
        <span className={active ? "text-paper/80" : "text-ink-mid"}>{label}</span>
      </span>
      <span className="text-[22px] font-extrabold tracking-[-0.02em]">{value}</span>
    </button>
  );
}

function ViewBtn({
  active,
  onClick,
  Icon,
}: {
  active: boolean;
  onClick: () => void;
  Icon: typeof Rows3;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`grid h-9 w-10 place-items-center transition-colors ${
        active ? "bg-ink-base text-paper" : "text-ink-mid hover:text-ink-base"
      }`}
    >
      <Icon className="h-4 w-4" strokeWidth={1.5} />
    </button>
  );
}

function EmptyState({ onNew, hasTasks }: { onNew: () => void; hasTasks: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-edge bg-paper-warm px-6 py-16 text-center">
      <ListChecks className="h-7 w-7 text-ink-soft" strokeWidth={1.3} />
      <p className="text-[14px] font-medium text-ink-base">
        {hasTasks ? "Žádný úkol neodpovídá filtru." : "Zatím žádné úkoly."}
      </p>
      {!hasTasks && (
        <button type="button" onClick={onNew} className={BTN_PRIMARY}>
          <Plus className="h-4 w-4" strokeWidth={1.5} /> Vytvořit první úkol
        </button>
      )}
    </div>
  );
}

function TaskRow({
  task,
  even,
  dragEnabled,
  unseen,
  onOpen,
  onStatus,
  onToggleSubtask,
}: {
  task: Task;
  even: boolean;
  dragEnabled: boolean;
  unseen: boolean;
  onOpen: () => void;
  onStatus: (s: TaskStatus) => void;
  onToggleSubtask: (subtaskId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !dragEnabled,
  });
  const [expanded, setExpanded] = useState(true);
  const dl = formatDeadline(task.deadline);
  const subTotal = task.subtasks.length;
  const subDone = task.subtasks.filter((s) => s.done).length;
  const pct = subTotal ? Math.round((subDone / subTotal) * 100) : 0;
  const ll = task.linkLabels;
  const hasLinks =
    ll.clients.length > 0 || ll.locations.length > 0 || ll.contracts.length > 0;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group border-b border-edge last:border-0 ${
        even ? "bg-paper" : "bg-paper-warm/40"
      } ${isDragging ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-3 px-3 py-3 sm:px-4">
        <button
          type="button"
          className={`hidden shrink-0 text-ink-soft transition-opacity sm:block ${
            dragEnabled ? "cursor-grab opacity-0 group-hover:opacity-100" : "cursor-default opacity-0"
          }`}
          {...attributes}
          {...listeners}
          aria-label="Přetáhnout"
          disabled={!dragEnabled}
        >
          <GripVertical className="h-4 w-4" strokeWidth={1.5} />
        </button>

        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-1.5">
            {unseen && task.status !== "done" && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-label="Nepřečteno" />
            )}
            <span
              className={`truncate text-[14px] font-medium ${
                task.status === "done" ? "text-ink-mid line-through" : "text-ink-base"
              }`}
            >
              {task.title}
            </span>
          </span>
          {(subTotal > 0 || hasLinks) && (
            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-mid">
              {subTotal > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-edge">
                    <span
                      className={`block h-full rounded-full transition-all ${
                        subDone === subTotal ? "bg-emerald-500" : "bg-ink-base/70"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="tabular-nums">
                    {subDone}/{subTotal}
                  </span>
                </span>
              )}
              {ll.clients.length > 0 && (
                <span className="inline-flex max-w-full items-center gap-1">
                  <Building2 className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                  <span className="truncate">{ll.clients.map((c) => c.label).join(", ")}</span>
                </span>
              )}
              {ll.locations.length > 0 && (
                <span className="inline-flex max-w-full items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                  <span className="truncate">{ll.locations.map((c) => c.label).join(", ")}</span>
                </span>
              )}
              {ll.contracts.length > 0 && (
                <span className="inline-flex max-w-full items-center gap-1">
                  <FileText className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                  <span className="truncate">{ll.contracts.map((c) => c.label).join(", ")}</span>
                </span>
              )}
            </span>
          )}
        </button>

        <span className="hidden w-28 shrink-0 truncate text-[12.5px] text-ink-deep sm:block">
          {task.assignee || "—"}
        </span>

        <span
          className={`hidden w-24 shrink-0 items-center gap-1 text-[12px] sm:inline-flex ${
            dl.overdue ? "text-rose-600" : dl.soon ? "text-amber-700" : "text-ink-mid"
          }`}
        >
          {task.deadline && <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.5} />}
          {task.deadline ? dl.text : ""}
        </span>

        <div className="shrink-0">
          <StatusDropdown value={task.status} onChange={onStatus} compact />
        </div>

        {subTotal > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-edge-warm hover:text-ink-base"
            aria-label={expanded ? "Sbalit podúkoly" : "Rozbalit podúkoly"}
            aria-expanded={expanded}
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
              strokeWidth={1.75}
            />
          </button>
        ) : (
          <span className="w-7 shrink-0" aria-hidden="true" />
        )}
      </div>

      <AnimatePresence initial={false}>
        {subTotal > 0 && expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pl-10 sm:px-4 sm:pl-11">
              <div className="rounded-xl border border-edge bg-paper-warm/60 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-edge">
                    <span
                      className={`block h-full rounded-full transition-all ${
                        subDone === subTotal ? "bg-emerald-500" : "bg-ink-base/70"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-ink-mid">
                    {subDone}/{subTotal}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-x-5 gap-y-1 sm:grid-cols-2">
                  {task.subtasks.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onToggleSubtask(s.id)}
                      className="flex items-center gap-2 rounded-md py-1 text-left transition-colors hover:bg-paper"
                    >
                      <span
                        className={`grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors ${
                          s.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-ink-soft"
                        }`}
                      >
                        {s.done && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                      <span
                        className={`text-[12.5px] ${
                          s.done ? "text-ink-soft line-through" : "text-ink-deep"
                        }`}
                      >
                        {s.title}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
