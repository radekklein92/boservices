"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowUpRight,
  Bold,
  Building2,
  Check,
  ChevronDown,
  FileText,
  GripVertical,
  Heading,
  Italic,
  List,
  ListOrdered,
  MapPin,
  Mail,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import type {
  Subtask,
  Task,
  TaskNotification,
  TaskStatus,
} from "@/lib/portal/tasks-shared";
import { EMPTY_LINKS } from "@/lib/portal/tasks-shared";
import { BTN_OUTLINE, BTN_PRIMARY } from "@/components/portal/ui/buttons";
import { MarkdownPreview, StatusDropdown } from "./task-ui";
import type { EntityOption, MemberOption, TaskEntityOptions } from "./types";

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const FIELD =
  "h-10 w-full rounded-lg border border-edge bg-paper px-3 text-[13.5px] text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base";
const LABEL = "text-[10.5px] font-medium uppercase tracking-[0.16em] text-ink-mid";

export function TaskSidePanel({
  task,
  members,
  options,
  currentUserName,
  onClose,
  onSaved,
  onDeleted,
}: {
  task: Partial<Task> | null;
  members: MemberOption[];
  options: TaskEntityOptions;
  currentUserName: string;
  onClose: () => void;
  onSaved: (t: Task) => void;
  onDeleted: (id: string) => void;
}) {
  const isNew = !task?.id;
  const [title, setTitle] = useState(task?.title ?? "");
  const [assignee, setAssignee] = useState(task?.assignee ?? "");
  const [requester, setRequester] = useState(
    task?.requester ?? (task?.id ? "" : currentUserName),
  );
  const [deadline, setDeadline] = useState(task?.deadline ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "todo");
  const [body, setBody] = useState(task?.body ?? "");
  const [subtasks, setSubtasks] = useState<Subtask[]>(task?.subtasks ?? []);
  const [notifications, setNotifications] = useState<TaskNotification[]>(
    task?.notifications ?? [],
  );
  const [links, setLinks] = useState(task?.links ?? EMPTY_LINKS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    if (!title.trim()) {
      setError("Zadejte název.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      title: title.trim(),
      assignee: assignee.trim(),
      requester: requester.trim(),
      deadline: deadline || null,
      status,
      body: body.trim() || null,
      subtasks,
      notifications,
      links,
    };
    try {
      const res = await fetch(
        isNew ? "/api/portal/tasks" : `/api/portal/tasks/${task!.id}`,
        {
          method: isNew ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Uložení selhalo.");
      onSaved(data.task as Task);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chyba");
      setSaving(false);
    }
  }

  async function remove() {
    if (isNew) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/portal/tasks/${task!.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Smazání selhalo.");
      onDeleted(task!.id!);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chyba");
      setSaving(false);
    }
  }

  const memberNames = useMemo(() => members.map((m) => m.name).filter(Boolean), [members]);
  const memberEmails = useMemo(() => members.map((m) => m.email).filter(Boolean), [members]);

  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <motion.div
        className="absolute inset-0 bg-ink-base/25 backdrop-blur-[1px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.aside
        className="relative flex h-full w-full max-w-[540px] flex-col bg-paper shadow-[-16px_0_48px_-24px_rgba(14,14,14,0.4)]"
        initial={{ x: 540 }}
        animate={{ x: 0 }}
        exit={{ x: 540 }}
        transition={{ type: "spring", stiffness: 380, damping: 38 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-edge px-6 py-4">
          <span className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink-mid">
            {isNew ? "Nový úkol" : "Úkol"}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-ink-mid transition-colors hover:bg-edge-warm hover:text-ink-base"
            aria-label="Zavřít"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-5">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Název úkolu"
              autoFocus
              className="w-full border-0 bg-transparent text-[18px] font-bold tracking-[-0.01em] text-ink-base outline-none placeholder:text-ink-soft"
            />

            <datalist id="task-members">
              {memberNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className={LABEL}>Řešitel</span>
                <input
                  list="task-members"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  placeholder="Jméno"
                  className={FIELD}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={LABEL}>Zadavatel</span>
                <input
                  list="task-members"
                  value={requester}
                  onChange={(e) => setRequester(e.target.value)}
                  placeholder="Jméno"
                  className={FIELD}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className={LABEL}>Termín</span>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className={FIELD}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className={LABEL}>Stav</span>
                <div>
                  <StatusDropdown value={status} onChange={setStatus} />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className={LABEL}>Popis</span>
              <RichTextEditor value={body} onChange={setBody} />
            </div>

            <SubtaskList items={subtasks} onChange={setSubtasks} />

            <NotificationList
              items={notifications}
              onChange={setNotifications}
              emails={memberEmails}
              taskId={isNew ? null : task!.id!}
            />

            <div className="flex flex-col gap-2.5">
              <span className={LABEL}>Vazby</span>
              <MultiEntityPicker
                Icon={Building2}
                placeholder="Připnout klienta"
                options={options.clients}
                selectedIds={links.clientIds}
                refs={task?.linkLabels?.clients ?? []}
                hrefBase="/portal/clients"
                onChange={(ids) => setLinks((l) => ({ ...l, clientIds: ids }))}
              />
              <MultiEntityPicker
                Icon={MapPin}
                placeholder="Připnout lokalitu"
                options={options.locations}
                selectedIds={links.locationIds}
                refs={task?.linkLabels?.locations ?? []}
                hrefBase="/portal/locations"
                onChange={(ids) => setLinks((l) => ({ ...l, locationIds: ids }))}
              />
              <MultiEntityPicker
                Icon={FileText}
                placeholder="Připnout smlouvu"
                options={options.contracts}
                selectedIds={links.contractIds}
                refs={task?.linkLabels?.contracts ?? []}
                hrefBase="/portal/contracts"
                onChange={(ids) => setLinks((l) => ({ ...l, contractIds: ids }))}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-edge px-6 py-4">
          {!isNew ? (
            confirmDelete ? (
              <span className="flex items-center gap-2 text-[12px] text-rose-600">
                Smazat?
                <button onClick={remove} className="font-semibold underline" type="button">
                  Ano
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-ink-mid underline"
                  type="button"
                >
                  Ne
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-mid transition-colors hover:text-rose-600"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} /> Smazat
              </button>
            )
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {error && <span className="text-[12px] text-rose-600">{error}</span>}
            <button type="button" onClick={onClose} className={BTN_OUTLINE}>
              Zrušit
            </button>
            <button type="button" onClick={save} disabled={saving} className={BTN_PRIMARY}>
              {saving ? "Ukládám…" : "Uložit"}
            </button>
          </div>
        </div>
      </motion.aside>
    </div>
  );
}

// ─────────────────────── RichTextEditor ─────────────────────────

function RichTextEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const ref = useRef<HTMLTextAreaElement | null>(null);

  function wrap(before: string, after = before) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value: v } = el;
    const sel = v.slice(s, e) || "text";
    const next = v.slice(0, s) + before + sel + after + v.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + sel.length);
    });
  }

  function prefixLine(prefix: string) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, value: v } = el;
    const lineStart = v.lastIndexOf("\n", s - 1) + 1;
    const next = v.slice(0, lineStart) + prefix + v.slice(lineStart);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + prefix.length, s + prefix.length);
    });
  }

  const Tool = ({
    Icon,
    onClick,
    title,
  }: {
    Icon: typeof Bold;
    onClick: () => void;
    title: string;
  }) => (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-md text-ink-mid transition-colors hover:bg-paper hover:text-ink-base"
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
    </button>
  );

  return (
    <div className="rounded-lg border border-edge bg-paper">
      <div className="flex items-center justify-between border-b border-edge px-2 py-1.5">
        <div className="flex items-center gap-0.5">
          <Tool Icon={Bold} title="Tučně" onClick={() => wrap("**")} />
          <Tool Icon={Italic} title="Kurzíva" onClick={() => wrap("_")} />
          <Tool Icon={Heading} title="Nadpis" onClick={() => prefixLine("## ")} />
          <Tool Icon={List} title="Odrážky" onClick={() => prefixLine("- ")} />
          <Tool Icon={ListOrdered} title="Číslovaný" onClick={() => prefixLine("1. ")} />
        </div>
        <div className="flex items-center gap-1 text-[11px]">
          {(["edit", "preview"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-md px-2 py-1 font-medium transition-colors ${
                tab === t ? "bg-edge-warm text-ink-base" : "text-ink-mid hover:text-ink-base"
              }`}
            >
              {t === "edit" ? "Psát" : "Náhled"}
            </button>
          ))}
        </div>
      </div>
      {tab === "edit" ? (
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={5}
          placeholder="Markdown: **tučně**, _kurzíva_, ## nadpis, - odrážka"
          className="w-full resize-y bg-transparent px-3 py-2.5 text-[13.5px] leading-relaxed text-ink-base outline-none placeholder:text-ink-soft"
        />
      ) : (
        <div className="px-3 py-2.5">
          <MarkdownPreview md={value} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────── SubtaskList ────────────────────────────

function SubtaskList({
  items,
  onChange,
}: {
  items: Subtask[];
  onChange: (s: Subtask[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const done = items.filter((s) => s.done).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  function add() {
    const t = draft.trim();
    if (!t) return;
    onChange([...items, { id: uid(), title: t, done: false }]);
    setDraft("");
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldI = items.findIndex((s) => s.id === active.id);
    const newI = items.findIndex((s) => s.id === over.id);
    onChange(arrayMove(items, oldI, newI));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className={LABEL}>Podúkoly</span>
        {items.length > 0 && (
          <span className="text-[11px] text-ink-mid">
            {done}/{items.length} hotovo
          </span>
        )}
      </div>
      {items.length > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-edge">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-1">
            {items.map((s) => (
              <SortableSubtask
                key={s.id}
                subtask={s}
                onToggle={() =>
                  onChange(items.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))
                }
                onDelete={() => onChange(items.filter((x) => x.id !== s.id))}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Přidat podúkol…"
          className={FIELD}
        />
        <button
          type="button"
          onClick={add}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-edge text-ink-mid transition-colors hover:border-ink-base hover:text-ink-base"
          aria-label="Přidat podúkol"
        >
          <Plus className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}

function SortableSubtask({
  subtask,
  onToggle,
  onDelete,
}: {
  subtask: Subtask;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: subtask.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group flex items-center gap-2 rounded-lg border border-transparent bg-paper-warm px-2 py-1.5 ${
        isDragging ? "opacity-60" : ""
      }`}
    >
      <button
        type="button"
        className="cursor-grab text-ink-soft opacity-0 transition-opacity group-hover:opacity-100"
        {...attributes}
        {...listeners}
        aria-label="Přetáhnout"
      >
        <GripVertical className="h-3.5 w-3.5" strokeWidth={1.5} />
      </button>
      <button
        type="button"
        onClick={onToggle}
        className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
          subtask.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-ink-soft"
        }`}
        aria-label="Hotovo"
      >
        {subtask.done && <Check className="h-3 w-3" strokeWidth={3} />}
      </button>
      <span
        className={`flex-1 text-[13px] ${subtask.done ? "text-ink-soft line-through" : "text-ink-base"}`}
      >
        {subtask.title}
      </span>
      <button
        type="button"
        onClick={onDelete}
        className="text-ink-soft opacity-0 transition-opacity hover:text-rose-600 group-hover:opacity-100"
        aria-label="Smazat podúkol"
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
      </button>
    </div>
  );
}

// ─────────────────────── NotificationList ───────────────────────

const DAYS_OPTIONS = [0, 1, 2, 3, 7, 14];
const daysLabel = (d: number) => (d === 0 ? "v den termínu" : `${d} d předem`);

function NotificationList({
  items,
  onChange,
  emails,
  taskId,
}: {
  items: TaskNotification[];
  onChange: (n: TaskNotification[]) => void;
  emails: string[];
  taskId: string | null;
}) {
  const [email, setEmail] = useState("");
  const [days, setDays] = useState(1);
  const [sentId, setSentId] = useState<string | null>(null);

  function add() {
    const e = email.trim();
    if (!e || !e.includes("@")) return;
    onChange([...items, { id: uid(), email: e, daysBefore: days }]);
    setEmail("");
  }

  async function sendNow(n: TaskNotification) {
    if (!taskId) return;
    try {
      const res = await fetch(`/api/portal/tasks/${taskId}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: n.email }),
      });
      if ((await res.json()).ok) {
        setSentId(n.id);
        setTimeout(() => setSentId((v) => (v === n.id ? null : v)), 3000);
      }
    } catch {
      // ticho
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className={LABEL}>E-mailové připomínky</span>
      {items.map((n) => (
        <div
          key={n.id}
          className="flex items-center gap-2 rounded-lg border border-edge bg-paper-warm px-2.5 py-1.5 text-[12.5px]"
        >
          <Mail className="h-3.5 w-3.5 shrink-0 text-ink-mid" strokeWidth={1.5} />
          <span className="min-w-0 flex-1 truncate text-ink-base">{n.email}</span>
          <span className="shrink-0 text-ink-mid">{daysLabel(n.daysBefore)}</span>
          {taskId && (
            <button
              type="button"
              onClick={() => sendNow(n)}
              className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-ink-mid transition-colors hover:text-ink-base"
            >
              {sentId === n.id ? "Odesláno" : "Odeslat teď"}
            </button>
          )}
          <button
            type="button"
            onClick={() => onChange(items.filter((x) => x.id !== n.id))}
            className="shrink-0 text-ink-soft hover:text-rose-600"
            aria-label="Odebrat"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input
          list="task-emails"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="e-mail@…"
          className={FIELD}
        />
        <datalist id="task-emails">
          {emails.map((e) => (
            <option key={e} value={e} />
          ))}
        </datalist>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="h-10 shrink-0 rounded-lg border border-edge bg-paper px-2 text-[12.5px] text-ink-base outline-none focus:border-ink-base"
        >
          {DAYS_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {daysLabel(d)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={add}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-edge text-ink-mid transition-colors hover:border-ink-base hover:text-ink-base"
          aria-label="Přidat připomínku"
        >
          <Plus className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </div>
      {!taskId && items.length > 0 && (
        <p className="text-[11px] text-ink-soft">
          Cron je rozešle automaticky. „Odeslat teď" bude dostupné po uložení úkolu.
        </p>
      )}
    </div>
  );
}

// ───────────────────── MultiEntityPicker ────────────────────────
// Více navázaných entit (klient/lokalita/smlouva). Vybrané = chipy: popisek je
// proklik na detail entity (nová záložka, ať se rozpracovaný úkol neztratí) +
// křížek pro odebrání. Pod chipy tlačítko pro přidání další (vyhledávací rozbal).

function MultiEntityPicker({
  Icon,
  placeholder,
  options,
  selectedIds,
  refs,
  hrefBase,
  onChange,
}: {
  Icon: typeof Building2;
  placeholder: string;
  options: EntityOption[];
  selectedIds: string[];
  refs: { id: string; label: string }[];
  hrefBase: string;
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const labelFor = (id: string) =>
    options.find((o) => o.id === id)?.label ??
    refs.find((r) => r.id === id)?.label ??
    id;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const avail = options.filter((o) => !selectedIds.includes(o.id));
    if (!q) return avail.slice(0, 40);
    return avail
      .filter((o) => `${o.label} ${o.sub ?? ""}`.toLowerCase().includes(q))
      .slice(0, 40);
  }, [options, query, selectedIds]);

  const add = (id: string) => {
    if (!selectedIds.includes(id)) onChange([...selectedIds, id]);
    setQuery("");
  };
  const remove = (id: string) => onChange(selectedIds.filter((x) => x !== id));

  return (
    <div ref={wrapRef} className="relative flex flex-col gap-1.5">
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedIds.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1.5 rounded-full border border-edge bg-paper-warm py-1 pl-2.5 pr-1.5 text-[12px] text-ink-base"
            >
              <Icon className="h-3 w-3 shrink-0 text-ink-mid" strokeWidth={1.5} />
              <Link
                href={`${hrefBase}/${id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-[180px] items-center gap-1 truncate font-medium transition-colors hover:text-ink-deep"
                title={`Otevřít detail v nové záložce: ${labelFor(id)}`}
              >
                <span className="truncate">{labelFor(id)}</span>
                <ArrowUpRight className="h-3 w-3 shrink-0 text-ink-soft" strokeWidth={1.75} />
              </Link>
              <button
                type="button"
                onClick={() => remove(id)}
                className="shrink-0 rounded-full p-0.5 text-ink-soft transition-colors hover:text-rose-600"
                aria-label="Odebrat vazbu"
              >
                <X className="h-3 w-3" strokeWidth={2} />
              </button>
            </span>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center gap-2 rounded-lg border border-edge bg-paper px-3 text-left text-[13px] text-ink-soft transition-colors hover:border-ink-base"
      >
        <Plus className="h-3.5 w-3.5 shrink-0 text-ink-mid" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 truncate">{placeholder}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-mid" strokeWidth={1.5} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-[260px] overflow-y-auto rounded-lg border border-edge bg-paper shadow-[0_12px_28px_-12px_rgba(14,14,14,0.25)]">
          <div className="sticky top-0 bg-paper p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Hledat…"
              className="h-8 w-full rounded-md border border-edge bg-paper px-2.5 text-[12.5px] outline-none focus:border-ink-base"
            />
          </div>
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-[12px] text-ink-mid">Nic nenalezeno.</div>
          ) : (
            <ul className="pb-1">
              {filtered.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => add(o.id)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-paper-warm"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] text-ink-base">{o.label}</span>
                      {o.sub && (
                        <span className="block truncate text-[11px] text-ink-mid">{o.sub}</span>
                      )}
                    </span>
                    <Plus className="h-3.5 w-3.5 shrink-0 text-ink-soft" strokeWidth={2} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
