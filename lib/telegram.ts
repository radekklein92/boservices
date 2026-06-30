// Tenký klient Telegram Bot API. Bez TELEGRAM_BOT_TOKEN jsou všechny operace
// no-op a vrací { ok: false, reason: "not-configured" } — stejný vzor jako sync
// crony, aby build i deploy prošly i bez nastavené integrace.
//
// Zprávy posíláme jako plain text (žádné parse_mode) — nepotřebujeme formátování
// a vyhneme se escapování HTML/Markdown u jmen lokalit a klientů.

const apiUrl = (token: string, method: string) =>
  `https://api.telegram.org/bot${token}/${method}`;

export type TgInlineButton = { text: string; callback_data: string };
export type TgInlineKeyboard = { inline_keyboard: TgInlineButton[][] };

export type TgResult<T = unknown> =
  | { ok: true; result: T }
  | { ok: false; reason: "not-configured" | "error"; error: string };

function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

export function isTelegramConfigured(): boolean {
  return Boolean(botToken());
}

async function call<T>(
  method: string,
  payload: Record<string, unknown>,
): Promise<TgResult<T>> {
  const token = botToken();
  if (!token) {
    return {
      ok: false,
      reason: "not-configured",
      error: "TELEGRAM_BOT_TOKEN není nastaven.",
    };
  }
  try {
    const res = await fetch(apiUrl(token, method), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const json = (await res.json()) as {
      ok: boolean;
      result?: T;
      description?: string;
    };
    if (!res.ok || !json.ok) {
      return {
        ok: false,
        reason: "error",
        error: json.description || `Telegram API ${res.status}`,
      };
    }
    return { ok: true, result: json.result as T };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function tgSendMessage(
  chatId: string,
  text: string,
  replyMarkup?: TgInlineKeyboard,
): Promise<TgResult<{ message_id: number }>> {
  return call<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

// Zpráva s vynucenou odpovědí (force_reply) — klient agenta rovnou otevře pole
// pro odpověď na tuto zprávu. Vrací message_id, ať jde odpověď spárovat s akcí
// (mapování message_id → lokalita). Reply na zprávu bota dorazí i v privacy mode.
export async function tgSendForceReply(
  chatId: string,
  text: string,
  placeholder?: string,
): Promise<TgResult<{ message_id: number }>> {
  return call<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    reply_markup: {
      force_reply: true,
      ...(placeholder ? { input_field_placeholder: placeholder } : {}),
    },
  });
}

// Editace odeslané zprávy. Bez replyMarkup se inline klávesnice odstraní —
// využíváme po kliku, aby šlo tlačítka „spotřebovat" a potvrdit volbu.
export async function tgEditMessageText(
  chatId: string,
  messageId: number,
  text: string,
  replyMarkup?: TgInlineKeyboard,
): Promise<TgResult> {
  return call("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

// Potvrzení callback_query (zmizí „hodiny" na tlačítku); text je volitelný toast.
export async function tgAnswerCallbackQuery(
  callbackQueryId: string,
  text?: string,
): Promise<TgResult> {
  return call("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}
