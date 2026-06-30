import { NextResponse } from "next/server";
import {
  getLocation,
  patchLocationLocal,
  type LeaseStatus,
  type ReAgent,
  type ReCheckInStatus,
} from "@/lib/portal/locations-db";
import { readCallbackToken, statusButtons } from "@/lib/portal/telegram-digest";
import { agentByChatId, recordSeenChat } from "@/lib/portal/telegram-groups-db";
import {
  tgAnswerCallbackQuery,
  tgEditMessageText,
  type TgInlineKeyboard,
} from "@/lib/telegram";
import { bustLocations } from "@/lib/portal/revalidate";
import { writeTransitionField } from "@/lib/portal/transition";
import { notifyLocationProblem } from "@/lib/email";
import { LEASE_HOLDER_LABEL } from "@/components/portal/locations/real-estate-shared";

// Příjem Telegram updatů. Dvě věci:
// 1) callback_query (klik na Vyřešeno/Řeším/Problém):
//      - Řeším → uložit hlášení agenta (reCheckIn) lokálně, nájem se nemění.
//      - Problém → uložit hlášení + upozornit admina e-mailem.
//      - Vyřešeno → dvoukrokově: nejdřív se zeptat „na koho je nájem napsaný",
//        po výběru držitele srovnat aktuální i cílový nájem write-through do
//        Transition (→ reconcile = vyřešeno) a uložit hlášení reCheckIn=resolved.
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

// Cílový držitel nájmu, který lze v Telegramu vybrat při „Vyřešeno". Záměrně jen
// konkrétní destinace (TWIST je tranzitní, neurčené stavy nejsou „vyřešeno") —
// shodné s přehledem „Nájem cílově" nad Real Estate tabulkou. Krátké kódy kvůli
// 64B limitu callback_data.
const LEASE_RESOLVE: Record<string, LeaseStatus> = {
  f: "prepis_na_fransizanta",
  b: "prepis_na_ceip",
  t: "prepis_jinam",
};

// Dovětek otázky přidaný do zprávy v kroku „na koho je nájem". Drží se jako
// marker, ať ho jde při „Zpět" / potvrzení zase odříznout.
const RESOLVE_PROMPT =
  "\n\nNa koho je nájemní smlouva napsaná? Vyber cílového držitele - tím se nájem srovná a lokalita přepadne do Vyřešeno:";

function resolveButtons(token: string): TgInlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "Na franšízanta", callback_data: `cl|${token}|f` },
        { text: "Na BOS", callback_data: `cl|${token}|b` },
      ],
      [{ text: "Na třetí stranu", callback_data: `cl|${token}|t` }],
      [{ text: "Zpět", callback_data: `cl|${token}|back` }],
    ],
  };
}

function stamp(iso: string): string {
  return new Date(iso).toLocaleString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const kind = parts[0]; // "ci" = volba stavu, "cl" = volba držitele nájmu
  const token = parts[1];
  const arg = parts[2];
  if ((kind !== "ci" && kind !== "cl") || parts.length !== 3 || !token || !arg) {
    await tgAnswerCallbackQuery(cb.id, "Neznámá akce.");
    return;
  }

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
  // Lokalita měla v digestu poznámku → tlačítka/otázka jely v režimu „souhlasí?".
  const hasNote = Boolean(payload.hasNote);

  // ── Krok 2: výběr cílového držitele nájmu po „Vyřešeno" ──
  if (kind === "cl") {
    await handleLeaseChoice(
      cb,
      token,
      arg,
      payload.locationId,
      agent,
      chatId,
      hasNote,
    );
    return;
  }

  // ── kind === "ci": klik na Vyřešeno / Řeším / Problém ──
  if (!isStatus(arg)) {
    await tgAnswerCallbackQuery(cb.id, "Neznámá akce.");
    return;
  }
  const status = arg;

  // „Vyřešeno" nezapisuje hned — nejdřív se zeptáme, na koho je nájem napsaný.
  // Skutečné vyřešení (srovnání aktuální=cíl v Transition) proběhne až po výběru.
  if (status === "resolved") {
    await tgAnswerCallbackQuery(cb.id, "Na koho je nájemní smlouva napsaná?");
    if (chatId && cb.message?.message_id != null) {
      const base = cb.message.text ?? "";
      await tgEditMessageText(
        chatId,
        cb.message.message_id,
        base + RESOLVE_PROMPT,
        resolveButtons(token),
      );
    }
    return;
  }

  // Řeším / Problém → uložit hlášení agenta (reCheckIn), stav nájmu se nemění.
  const at = new Date().toISOString();
  await patchLocationLocal(
    payload.locationId,
    { reCheckIn: { status, by: agent, at } },
    `telegram:${agent}`,
  );
  bustLocations();

  await tgAnswerCallbackQuery(cb.id, "Uloženo.");

  if (chatId && cb.message?.message_id != null) {
    const base = cb.message.text ?? "";
    // U „Řeším" s poznámkou potvrzujeme i její platnost (stav v DB zůstává Řeším).
    const reportedLabel =
      status === "in_progress" && hasNote
        ? "Řeším, poznámka souhlasí"
        : STATUS_LABEL[status];
    await tgEditMessageText(
      chatId,
      cb.message.message_id,
      `${base}\n\nNahlášeno: ${reportedLabel} - ${stamp(at)}`,
    );
  }

  // „Problém" navíc upozorní admina e-mailem (s kontextem lokality a nájmu).
  if (status === "problem") {
    const loc = await getLocation(payload.locationId);
    if (loc) {
      await notifyLocationProblem({
        locationName: loc.name,
        locationCode: loc.code,
        clientName: loc.current_client_name,
        agent,
        leaseCurrentLabel: LEASE_HOLDER_LABEL[loc.lease_current_status],
        leaseTargetLabel: LEASE_HOLDER_LABEL[loc.lease_target_status],
        at,
      });
    }
  }
}

// Druhý krok „Vyřešeno": agent vybral, na koho je nájem napsaný. Srovnáme aktuální
// i cílový nájem na vybraného držitele write-through do Transition (zdroj pravdy)
// → reconcile() = resolved → lokalita přepadne do „Vyřešeno". „Zpět" obnoví
// původní tři tlačítka.
async function handleLeaseChoice(
  cb: TgCallbackQuery,
  token: string,
  arg: string,
  locationId: string,
  agent: ReAgent,
  chatId: string,
  hasNote: boolean,
): Promise<void> {
  if (arg === "back") {
    await tgAnswerCallbackQuery(cb.id);
    if (chatId && cb.message?.message_id != null) {
      const base = (cb.message.text ?? "").split(RESOLVE_PROMPT)[0] ?? "";
      await tgEditMessageText(
        chatId,
        cb.message.message_id,
        base,
        statusButtons(token, hasNote),
      );
    }
    return;
  }

  const lease = LEASE_RESOLVE[arg];
  if (!lease) {
    await tgAnswerCallbackQuery(cb.id, "Neznámá volba.");
    return;
  }

  const actor = `telegram:${agent}`;
  // Transition public API bere jedno pole na request → dva zápisy (cíl + aktuální)
  // na stejnou hodnotu. Při selhání tlačítka necháme, ať to jde zkusit znovu
  // (zápis je idempotentní).
  const r1 = await writeTransitionField(
    locationId,
    "lease_target_status",
    lease,
    actor,
  );
  if (!r1.ok) {
    await tgAnswerCallbackQuery(cb.id, `Nepovedlo se uložit: ${r1.error}`);
    return;
  }
  const r2 = await writeTransitionField(
    locationId,
    "lease_current_status",
    lease,
    actor,
  );
  if (!r2.ok) {
    await tgAnswerCallbackQuery(cb.id, `Nepovedlo se uložit: ${r2.error}`);
    return;
  }

  // Uložit i hlášení agenta (reCheckIn = Vyřešeno), ať sloupec „Hlášení agenta"
  // sedí se srovnaným nájmem.
  const at = new Date().toISOString();
  await patchLocationLocal(
    locationId,
    { reCheckIn: { status: "resolved", by: agent, at } },
    actor,
  );
  bustLocations();

  await tgAnswerCallbackQuery(cb.id, "Vyřešeno, nájem srovnán.");

  if (chatId && cb.message?.message_id != null) {
    const base = (cb.message.text ?? "").split(RESOLVE_PROMPT)[0] ?? "";
    await tgEditMessageText(
      chatId,
      cb.message.message_id,
      `${base}\n\nNahlášeno: Vyřešeno - nájem ${LEASE_HOLDER_LABEL[lease]} - ${stamp(at)}`,
    );
  }
}
