import { NextResponse } from "next/server";
import { requireSession } from "@/lib/portal/auth-guard";
import {
  deleteTask,
  getTask,
  markTaskSeen,
  resolveLinkLabels,
  upsertTask,
} from "@/lib/portal/tasks-db";
import { taskUpdateSchema } from "@/lib/portal/tasks-schema";
import { bustTasks } from "@/lib/portal/revalidate";
import type { Task } from "@/lib/portal/tasks-shared";

export const dynamic = "force-dynamic";

// PUT - úprava úkolu (merge částečného vstupu do existujícího).
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;
  const { id } = await params;

  const existing = await getTask(id);
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Úkol nenalezen." }, { status: 404 });
  }

  const parsed = taskUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Neplatný vstup." },
      { status: 400 },
    );
  }
  const patch = parsed.data;

  const links = patch.links ?? existing.links;
  const linksChanged =
    !!patch.links &&
    (links.clientId !== existing.links.clientId ||
      links.locationId !== existing.links.locationId ||
      links.contractId !== existing.links.contractId);

  const updated: Task = {
    ...existing,
    ...patch,
    links,
    linkLabels: linksChanged ? await resolveLinkLabels(links) : existing.linkLabels,
    id: existing.id,
    createdAt: existing.createdAt,
    createdBy: existing.createdBy,
    updatedAt: new Date().toISOString(),
  };

  await upsertTask(updated, existing);
  await markTaskSeen(g.session.user!.email!, id);
  bustTasks();

  return NextResponse.json({ ok: true, task: updated });
}

// DELETE - smazání úkolu (úklid reverzních indexů + pořadí řeší deleteTask).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;
  const { id } = await params;
  await deleteTask(id);
  bustTasks();
  return NextResponse.json({ ok: true });
}
