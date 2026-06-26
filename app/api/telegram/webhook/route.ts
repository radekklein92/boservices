import { NextResponse } from "next/server";
import {
  patchLocationLocal,
  type ReCheckInStatus,
} from "@/lib/portal/locations-db";
import { readCallbackToken } from "@/lib/portal/telegram-digest";
import { agentByChatId, recordSeenChat } from "@/lib/portal/telegram-groups-db";
import { tgAnswerCallbackQuery, tgEditMessageText } from "@/lib/telegram";
import { bustLocations } from "@/lib/portal/revalidate";

// Příjem Telegram updatů. Dvě věci:
// 1) callback_query (klik na Vyřešeno/Řeším/Problém) → zápis reCheckIn lokálně
//    (patchLocationLocal, NE write-through do Transition) + potvrzení do zprávy.
// 2) evidence „viděných" chatů (přidání bota / zpráva ve skupině) pro admin výběr
//    chat_id při nastavení mapování.
// Ověření přes hlavičku X-Telegram-Bot-Api-Secret-Token (setWebhook secret_token).

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<ReCheckInStatus, string> = {
  resolved: "Vyřešeno",
  in_progress: "Řeším",
  problem: "Problém",
};

function isStatus(v: string): v is ReCheckInStatus {
  return v === "resolved" || v === "in_progress" || v === "problem";
}

interface TgChat {
  id: number | string;
  title?: string;
  username?: string;
}
interface TgMessage {
  message_id: number;
  text?: string;
  chat: TgChat;
}
interface TgCallbackQuery {
  id: string;
  data?: string;
  message?: TgMessage;
}
interface TgUpdate {
  message?: TgMessage;
  my_chat_member?: { chat: TgChat };
  callback_query?: TgCallbackQuery;
}

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== secret) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Evidovat „viděné" chaty (přidání bota / zpráva) pro výběr chat_id v adminu.
  const chat = update.message?.chat ?? update.my_chat_member?.chat;
  if (chat?.id != null) {
    await recordSeenChat(
      String(chat.id),
      chat.title ?? chat.username ?? String(chat.id),
      new Date().toISOString(),
    );
  }

  if (update.callback_query?.data) {
    await handleCallback(update.callback_query);
  }

  // Telegram očekává 2xx, jinak update opakuje.
  return NextResponse.json({ ok: true });
}

async function handleCallback(cb: TgCallbackQuery): Promise<void> {
  const parts = (cb.data ?? "").split("|");
  const status = parts[2];
  if (parts[0] !== "ci" || parts.length !== 3 || !status || !isStatus(status)) {
    await tgAnswerCallbackQuery(cb.id, "Neznámá akce.");
    return;
  }
  const token = parts[1]!;

  const payload = await readCallbackToken(token);
  if (!payload) {
    await tgAnswerCallbackQuery(
      cb.id,
      "Tlačítko vypršelo, počkej na další zprávu.",
    );
    return;
  }

  const chatId =
    cb.message?.chat?.id != null ? String(cb.message.chat.id) : "";
  // Agent z mapování skupiny (dedikovaná) má přednost; token je fallback.
  const agent = (chatId ? await agentByChatId(chatId) : null) ?? payload.agent;
  const at = new Date().toISOString();

  await patchLocationLocal(
    payload.locationId,
    { reCheckIn: { status, by: agent, at } },
    `telegram:${agent}`,
  );
  bustLocations();

  await tgAnswerCallbackQuery(cb.id, "Uloženo.");

  // Potvrzení do zprávy + sundání tlačítek (editMessageText bez reply_markup).
  if (chatId && cb.message?.message_id != null) {
    const stamp = new Date(at).toLocaleString("cs-CZ", {
      day: "numeric",
      month: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const base = cb.message.text ?? "";
    await tgEditMessageText(
      chatId,
      cb.message.message_id,
      `${base}\n\nNahlášeno: ${STATUS_LABEL[status]} - ${stamp}`,
    );
  }
}
