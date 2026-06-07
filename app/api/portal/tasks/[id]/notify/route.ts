import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/portal/auth-guard";
import { getTask } from "@/lib/portal/tasks-db";
import { sendTaskNotificationEmail } from "@/lib/portal/email";

export const dynamic = "force-dynamic";

const schema = z.object({ email: z.string().trim().email() });

// POST - ruční odeslání e-mailové připomínky úkolu („Odeslat teď").
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;
  const { id } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Neplatný e-mail." }, { status: 400 });
  }
  const task = await getTask(id);
  if (!task) {
    return NextResponse.json({ ok: false, error: "Úkol nenalezen." }, { status: 404 });
  }

  await sendTaskNotificationEmail({
    to: parsed.data.email,
    badgeText: "Připomenutí úkolu",
    task: {
      id: task.id,
      title: task.title,
      assignee: task.assignee,
      deadline: task.deadline,
      status: task.status,
      body: task.body,
      subtasks: task.subtasks,
    },
  });

  return NextResponse.json({ ok: true });
}
