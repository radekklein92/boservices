import { NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { getAllTasks } from "@/lib/portal/tasks-db";
import { sendTaskNotificationEmail } from "@/lib/portal/email";
import { toISODate } from "@/lib/portal/tasks-shared";

// Vercel Cron Job. vercel.json: "0 7 * * *" (denně 7:00 UTC = 8:00/9:00 Prague).
// Pro každý úkol s termínem a nehotovým stavem projde jeho notifikace; když
// (termín − daysBefore) == dnes, pošle e-mail. Dedupe přes klíč s TTL 25 h,
// ať se při více spuštěních za den e-mail neposílá dvakrát.
//
// Autentizace stejná jako u ostatních cronů: Authorization: Bearer <CRON_SECRET>
// (na local devu bez CRON_SECRET se auth přeskočí).

function badgeFor(daysBefore: number): string {
  if (daysBefore === 0) return "Dnes je termín";
  if (daysBefore === 1) return "Zítra je termín";
  const word = daysBefore >= 5 ? "dní" : "dny";
  return `Za ${daysBefore} ${word} je termín`;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const r = getRedis();
  if (!r) {
    return NextResponse.json({ ok: false, error: "Redis not configured" }, { status: 500 });
  }

  const todayStr = toISODate(new Date());
  const tasks = await getAllTasks();
  let sent = 0;
  const failed: string[] = [];

  for (const task of tasks) {
    if (!task.deadline || task.status === "done") continue;
    if (!task.notifications.length) continue;

    for (const notif of task.notifications) {
      const target = new Date(`${task.deadline}T00:00:00`);
      if (Number.isNaN(target.getTime())) continue;
      target.setDate(target.getDate() - notif.daysBefore);
      if (toISODate(target) !== todayStr) continue;

      const cacheKey = `portal:task-email-notif:${task.id}:${notif.id}:${todayStr}`;
      const already = await r.get(cacheKey);
      if (already) continue;

      try {
        await sendTaskNotificationEmail({
          to: notif.email,
          badgeText: badgeFor(notif.daysBefore),
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
        await r.set(cacheKey, "1", { ex: 60 * 60 * 25 });
        sent++;
      } catch (err) {
        console.error(`[tasks-notify] e-mail failed for ${notif.email}`, err);
        failed.push(notif.email);
      }
    }
  }

  return NextResponse.json({ ok: true, sent, ...(failed.length ? { failed } : {}) });
}
