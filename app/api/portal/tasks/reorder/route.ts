import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/portal/auth-guard";
import { setTaskOrder } from "@/lib/portal/tasks-db";
import { bustTasks } from "@/lib/portal/revalidate";

export const dynamic = "force-dynamic";

const schema = z.object({ ids: z.array(z.string().max(100)).max(2000) });

// PATCH - uloží manuální (drag) pořadí úkolů.
export async function PATCH(req: Request) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Neplatný vstup." }, { status: 400 });
  }
  await setTaskOrder(parsed.data.ids);
  bustTasks();
  return NextResponse.json({ ok: true });
}
