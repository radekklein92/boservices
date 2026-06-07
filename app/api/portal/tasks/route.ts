import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { requireSession } from "@/lib/portal/auth-guard";
import { getAllTasks, markTaskSeen, resolveLinkLabels, upsertTask } from "@/lib/portal/tasks-db";
import { taskInputSchema } from "@/lib/portal/tasks-schema";
import { bustTasks } from "@/lib/portal/revalidate";
import type { Task } from "@/lib/portal/tasks-shared";

export const dynamic = "force-dynamic";

// GET - seznam úkolů (kdokoli přihlášený). Drag pořadí respektuje getAllTasks.
export async function GET() {
  const g = await requireSession();
  if (!g.ok) return g.response;
  const tasks = await getAllTasks();
  return NextResponse.json({ ok: true, tasks });
}

// POST - vytvoření úkolu. Vytvářet a spravovat může kdokoli přihlášený.
export async function POST(req: Request) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const parsed = taskInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Neplatný vstup." },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const now = new Date().toISOString();
  const task: Task = {
    id: nanoid(),
    title: input.title,
    assignee: input.assignee,
    deadline: input.deadline,
    status: input.status,
    body: input.body,
    subtasks: input.subtasks,
    notifications: input.notifications,
    links: input.links,
    linkLabels: await resolveLinkLabels(input.links),
    createdBy: g.session.user!.email!,
    createdAt: now,
    updatedAt: now,
  };

  await upsertTask(task, null);
  await markTaskSeen(g.session.user!.email!, task.id);
  bustTasks();

  return NextResponse.json({ ok: true, task }, { status: 201 });
}
