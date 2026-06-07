"use client";

import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Building2, CalendarDays, Check, FileText, MapPin } from "lucide-react";
import {
  formatDeadline,
  STATUS_META,
  STATUS_ORDER,
  type Task,
  type TaskStatus,
} from "@/lib/portal/tasks-shared";

// Jemný tint sloupce + barva karty/akcentu podle stavu.
const COLUMN: Record<TaskStatus, { bg: string; ring: string; accent: string }> = {
  todo: { bg: "bg-edge-warm/50", ring: "ring-ink-base/15", accent: "#BFC3C7" },
  in_progress: { bg: "bg-amber-50/50", ring: "ring-amber-400/40", accent: "#F59E0B" },
  done: { bg: "bg-emerald-50/50", ring: "ring-emerald-400/40", accent: "#059669" },
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0]![0]! + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function KanbanBoard({
  tasks,
  onOpen,
  onMove,
  onToggleSubtask,
  isUnseen,
}: {
  tasks: Task[];
  onOpen: (t: Task) => void;
  onMove: (t: Task, status: TaskStatus) => void;
  onToggleSubtask: (t: Task, subtaskId: string) => void;
  isUnseen: (t: Task) => boolean;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const task = tasks.find((t) => t.id === active.id);
    const status = over.id as TaskStatus;
    if (task && task.status !== status) onMove(task, status);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {STATUS_ORDER.map((status) => (
          <Column
            key={status}
            status={status}
            tasks={tasks.filter((t) => t.status === status)}
            onOpen={onOpen}
            onToggleSubtask={onToggleSubtask}
            isUnseen={isUnseen}
          />
        ))}
      </div>
    </DndContext>
  );
}

function Column({
  status,
  tasks,
  onOpen,
  onToggleSubtask,
  isUnseen,
}: {
  status: TaskStatus;
  tasks: Task[];
  onOpen: (t: Task) => void;
  onToggleSubtask: (t: Task, subtaskId: string) => void;
  isUnseen: (t: Task) => boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const meta = STATUS_META[status];
  const col = COLUMN[status];
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col gap-2.5 rounded-2xl p-3 ring-1 transition-all ${col.bg} ${
        isOver ? `ring-2 ${col.ring}` : "ring-edge"
      }`}
    >
      <div className="flex items-center justify-between px-1.5 pt-1">
        <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-ink-deep">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.dot }} />
          {meta.label}
        </span>
        <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-paper px-1.5 text-[11px] font-bold text-ink-mid ring-1 ring-edge">
          {tasks.length}
        </span>
      </div>
      <div className="flex min-h-[80px] flex-col gap-2.5">
        {tasks.length === 0 ? (
          <div
            className={`flex min-h-[72px] items-center justify-center rounded-xl border border-dashed text-[11.5px] transition-colors ${
              isOver ? "border-ink-base/40 text-ink-mid" : "border-edge text-ink-soft"
            }`}
          >
            Sem přetáhni úkol
          </div>
        ) : (
          tasks.map((t) => (
            <Card
              key={t.id}
              task={t}
              accent={col.accent}
              onOpen={onOpen}
              onToggleSubtask={onToggleSubtask}
              unseen={isUnseen(t)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function Card({
  task,
  accent,
  onOpen,
  onToggleSubtask,
  unseen,
}: {
  task: Task;
  accent: string;
  onOpen: (t: Task) => void;
  onToggleSubtask: (t: Task, subtaskId: string) => void;
  unseen: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });
  const dl = formatDeadline(task.deadline);
  const subTotal = task.subtasks.length;
  const subDone = task.subtasks.filter((s) => s.done).length;
  const pct = subTotal ? Math.round((subDone / subTotal) * 100) : 0;
  const ll = task.linkLabels;
  const link = ll.locationName
    ? { Icon: MapPin, text: ll.locationName }
    : ll.clientName
      ? { Icon: Building2, text: ll.clientName }
      : ll.contractNumber
        ? { Icon: FileText, text: ll.contractNumber }
        : null;

  return (
    <div
      ref={setNodeRef}
      onClick={() => onOpen(task)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(task);
      }}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
          : undefined
      }
      className={`group relative cursor-grab touch-none rounded-2xl border border-edge bg-paper p-3.5 pl-4 shadow-[0_1px_2px_rgba(14,14,14,0.04)] transition-shadow active:cursor-grabbing ${
        isDragging
          ? "rotate-[0.6deg] shadow-[0_18px_40px_-16px_rgba(14,14,14,0.4)]"
          : "hover:shadow-[0_8px_24px_-14px_rgba(14,14,14,0.35)]"
      }`}
      {...attributes}
      {...listeners}
    >
      {/* Levý barevný akcent podle stavu */}
      <span
        className="absolute inset-y-2.5 left-0 w-[3px] rounded-full"
        style={{ background: accent }}
        aria-hidden="true"
      />

      <div className="flex items-start gap-1.5">
        {unseen && (
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-label="Nepřečteno" />
        )}
        <span className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-ink-base">
          {task.title}
        </span>
      </div>

      {(task.deadline || subTotal > 0 || link) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {task.deadline && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                dl.overdue
                  ? "bg-rose-50 text-rose-600"
                  : dl.soon
                    ? "bg-amber-50 text-amber-700"
                    : "bg-edge-warm text-ink-mid"
              }`}
            >
              <CalendarDays className="h-3 w-3" strokeWidth={1.75} />
              {dl.text}
            </span>
          )}
          {link && (
            <span className="inline-flex max-w-[150px] items-center gap-1 rounded-full bg-edge-warm px-2 py-0.5 text-[11px] font-medium text-ink-mid">
              <link.Icon className="h-3 w-3 shrink-0" strokeWidth={1.75} />
              <span className="truncate">{link.text}</span>
            </span>
          )}
        </div>
      )}

      {subTotal > 0 && (
        <div className="mt-2.5">
          <div className="flex items-center gap-2">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-edge">
              <span
                className={`block h-full rounded-full transition-all ${
                  subDone === subTotal ? "bg-emerald-500" : "bg-ink-base/70"
                }`}
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="shrink-0 text-[10.5px] tabular-nums text-ink-mid">
              {subDone}/{subTotal}
            </span>
          </div>
          <ul className="mt-2 flex flex-col gap-0.5">
            {task.subtasks.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSubtask(task, s.id);
                  }}
                  className="flex w-full items-center gap-1.5 rounded-md py-0.5 text-left transition-colors hover:bg-edge-warm"
                >
                  <span
                    className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded border transition-colors ${
                      s.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-ink-soft"
                    }`}
                  >
                    {s.done && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                  </span>
                  <span
                    className={`truncate text-[11.5px] ${
                      s.done ? "text-ink-soft line-through" : "text-ink-deep"
                    }`}
                  >
                    {s.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {task.assignee && (
        <div className="mt-3 flex items-center gap-1.5">
          <span
            className="grid h-6 w-6 place-items-center rounded-full bg-ink-base text-[9.5px] font-bold text-paper"
            title={task.assignee}
          >
            {initials(task.assignee)}
          </span>
          <span className="truncate text-[11.5px] text-ink-mid">{task.assignee}</span>
        </div>
      )}
    </div>
  );
}
