import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/portal/auth-guard";
import { getAllTasks, markAllTasksSeen, markTaskSeen } from "@/lib/portal/tasks-db";

export const dynamic = "force-dynamic";

const schema = z.union([
  z.object({ taskId: z.string().max(100) }),
  z.object({ all: z.literal(true) }),
]);

// POST - označí úkol(y) za přečtené pro aktuálního uživatele. Nemění samotné
// úkoly (jen per-user seen mapu), proto neinvaliduje cache; nav badge se
// přepočítá při příštím renderu (getSeenMap se čte přímo z Redisu).
export async function POST(req: Request) {
  const g = await requireSession();
  if (!g.ok) return g.response;
  const email = g.session.user!.email!;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Neplatný vstup." }, { status: 400 });
  }

  if ("all" in parsed.data) {
    const ids = (await getAllTasks()).map((t) => t.id);
    await markAllTasksSeen(email, ids);
  } else {
    await markTaskSeen(email, parsed.data.taskId);
  }
  return NextResponse.json({ ok: true });
}
