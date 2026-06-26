import { redirect } from "next/navigation";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import { isTelegramConfigured } from "@/lib/telegram";
import {
  getReAgentGroups,
  listSeenChats,
} from "@/lib/portal/telegram-groups-db";
import { TelegramGroupsEditor } from "@/components/portal/admin/TelegramGroupsEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Telegram" };

export default async function TelegramAdminPage() {
  const session = await getSession();
  if (!session?.user?.email) redirect("/portal/login");
  if (!isAdminRole(session.user?.role)) redirect("/portal");

  const [groups, seenChats] = await Promise.all([
    getReAgentGroups(),
    listSeenChats(),
  ]);

  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const webhookUrl = `${base}/api/telegram/webhook`;

  return (
    <TelegramGroupsEditor
      initialGroups={groups}
      seenChats={seenChats}
      botConfigured={isTelegramConfigured()}
      webhookConfigured={Boolean(process.env.TELEGRAM_WEBHOOK_SECRET)}
      webhookUrl={webhookUrl}
    />
  );
}
