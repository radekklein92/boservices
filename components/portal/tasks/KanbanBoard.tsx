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
import { CalendarDays, ListChecks } from "lucide-react";
import {
  formatDeadline,
  STATUS_META,
  STATUS_ORDER,
  type Task,
  type TaskStatus,
} from "@/lib/portal/tasks-shared";

export function KanbanBoard({
  tasks,
  onOpen,
  onMove,
  isUnseen,
}: {
  tasks: Task[];
  onOpen: (t: Task) => void;
  onMove: (t: Task, status: TaskStatus) => void;
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {STATUS_ORDER.map((status) => (
          <Column
            key={status}
            status={status}
            tasks={tasks.filter((t) => t.status === status)}
            onOpen={onOpen}
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
  isUnseen,
}: {
  status: TaskStatus;
  tasks: Task[];
  onOpen: (t: Task) => void;
  isUnseen: (t: Task) => boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const meta = STATUS_META[status];
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col gap-2 rounded-2xl border p-3 transition-colors ${
        isOver ? "border-ink-base bg-edge-warm" : "border-edge bg-paper-warm"
      }`}
    >
      <div className="flex items-center justify-between px-1">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-deep">
          <span className="h-2 w-2 rounded-full" style={{ background: meta.dot }} />
          {meta.label}
        </span>
        <span className="text-[11px] text-ink-mid">{tasks.length}</span>
      </div>
      <div className="flex min-h-[60px] flex-col gap-2">
        {tasks.map((t) => (
          <Card key={t.id} task={t} onOpen={onOpen} unseen={isUnseen(t)} />
        ))}
      </div>
    </div>
  );
}

function Card({
  task,
  onOpen,
  unseen,
}: {
  task: Task;
  onOpen: (t: Task) => void;
  unseen: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });
  const dl = formatDeadline(task.deadline);
  const subDone = task.subtasks.filter((s) => s.done).length;

  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={`rounded-xl border border-edge bg-paper p-3 ${isDragging ? "opacity-50 shadow-lg" : ""}`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-0.5 cursor-grab touch-none text-ink-soft"
          {...attributes}
          {...listeners}
          aria-label="Přetáhnout"
        >
          <span className="block h-1 w-4 rounded-full bg-ink-soft" />
          <span className="mt-1 block h-1 w-4 rounded-full bg-ink-soft" />
        </button>
        <button type="button" onClick={() => onOpen(task)} className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-1.5">
            {unseen && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />}
            <span className="line-clamp-2 text-[13px] font-medium leading-snug text-ink-base">
              {task.title}
            </span>
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-ink-mid">
            {task.assignee && <span>{task.assignee}</span>}
            {task.deadline && (
              <span
                className={`inline-flex items-center gap-1 ${
                  dl.overdue ? "text-rose-600" : dl.soon ? "text-amber-700" : ""
                }`}
              >
                <CalendarDays className="h-3 w-3" strokeWidth={1.5} /> {dl.text}
              </span>
            )}
            {task.subtasks.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <ListChecks className="h-3 w-3" strokeWidth={1.5} /> {subDone}/{task.subtasks.length}
              </span>
            )}
          </span>
        </button>
      </div>
    </div>
  );
}
