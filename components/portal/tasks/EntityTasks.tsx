import Link from "next/link";
import { ArrowUpRight, CalendarDays, ListChecks } from "lucide-react";
import {
  cachedListTasksByClient,
  cachedListTasksByContract,
  cachedListTasksByLocation,
} from "@/lib/portal/cached-db";
import { formatDeadline, STATUS_META, type Task } from "@/lib/portal/tasks-shared";

// Kompaktní sekce „Úkoly" pro detail klienta / lokality / smlouvy. Vykreslí se
// JEN když je na entitu navázaný aspoň jeden úkol (jinak vrací null). Řádek
// odkazuje do Úkolů s otevřeným detailem (?task=id).
export async function EntityTasks({
  kind,
  id,
}: {
  kind: "client" | "location" | "contract";
  id: string;
}) {
  const tasks =
    kind === "client"
      ? await cachedListTasksByClient(id)
      : kind === "location"
        ? await cachedListTasksByLocation(id)
        : await cachedListTasksByContract(id);

  if (!tasks.length) return null;

  // Otevřené napřed, hotové dolů; v rámci skupiny dle termínu.
  const sorted = [...tasks].sort((a, b) => {
    if ((a.status === "done") !== (b.status === "done")) {
      return a.status === "done" ? 1 : -1;
    }
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return a.deadline.localeCompare(b.deadline);
  });

  return (
    <section className="rounded-2xl border border-edge bg-paper p-6 md:p-7">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="inline-flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-[0.22em] text-ink-mid">
          <ListChecks className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
          Úkoly · {tasks.length}
        </div>
        <Link
          href="/portal/tasks"
          className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-mid transition-colors hover:text-ink-base"
        >
          Otevřít Úkoly
          <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
        </Link>
      </div>
      <div className="flex flex-col divide-y divide-edge">
        {sorted.map((t) => (
          <Row key={t.id} task={t} />
        ))}
      </div>
    </section>
  );
}

function Row({ task }: { task: Task }) {
  const meta = STATUS_META[task.status];
  const dl = formatDeadline(task.deadline);
  return (
    <Link
      href={`/portal/tasks?task=${task.id}`}
      className="group flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta.dot }} />
      <span
        className={`min-w-0 flex-1 truncate text-[13.5px] ${
          task.status === "done" ? "text-ink-mid line-through" : "text-ink-base"
        }`}
      >
        {task.title}
      </span>
      {task.assignee && (
        <span className="hidden shrink-0 text-[12px] text-ink-mid sm:block">{task.assignee}</span>
      )}
      {task.deadline && (
        <span
          className={`inline-flex shrink-0 items-center gap-1 text-[12px] ${
            dl.overdue ? "text-rose-600" : dl.soon ? "text-amber-700" : "text-ink-mid"
          }`}
        >
          <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
          {dl.text}
        </span>
      )}
    </Link>
  );
}
