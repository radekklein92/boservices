import { randomUUID } from "crypto";
import { getRedis } from "@/lib/redis";
import {
  listLocations,
  listLocationLocalMap,
  type ReAgent,
  type ReCheckInStatus,
} from "./locations-db";
import {
  LEASE_HOLDER_LABEL,
  reconcile,
} from "@/components/portal/locations/real-estate-shared";
import { getReAgentGroups, RE_AGENTS } from "./telegram-groups-db";
import {
  isTelegramConfigured,
  tgSendMessage,
  type TgInlineKeyboard,
} from "@/lib/telegram";

// Jádro digestu „stav lokalit" pro RE agenty. Cron i ruční spuštění deleguje sem
// (vzor runLocationsSync). Pro každého agenta s nastavenou skupinou pošle jednu
// zprávu na lokalitu vyžadující pozornost (nájem ještě nevyřešený) s inline
// tlačítky Vyřešeno / Řeším / Problém. Klik zpracuje webhook přes callback token.

// ── Callback tokeny ───────────────────────────────────────────────────────────
// callback_data má limit 64 B a locationId z Transition je opaque string neznámé
// délky → posíláme krátký token a skutečné { locationId, agent } držíme v Redisu.
const cbKey = (token: string) => `portal:telegram:cb:${token}`;
const CB_TTL_SECONDS = 60 * 60 * 24 * 10; // 10 dní (přežije út+čt cyklus)

export interface CallbackPayload {
  locationId: string;
  agent: ReAgent;
}

export async function storeCallbackToken(
  payload: CallbackPayload,
): Promise<string> {
  const r = getRedis();
  const token = randomUUID().replace(/-/g, "").slice(0, 12);
  if (r) await r.set(cbKey(token), payload, { ex: CB_TTL_SECONDS });
  return token;
}

export async function readCallbackToken(
  token: string,
): Promise<CallbackPayload | null> {
  const r = getRedis();
  if (!r) return null;
  return r.get<CallbackPayload>(cbKey(token));
}

// ── Sestavení zprávy ──────────────────────────────────────────────────────────

const CHECKIN_LABEL: Record<ReCheckInStatus, string> = {
  resolved: "Vyřešeno",
  in_progress: "Řeším",
  problem: "Problém",
};

function statusButtons(token: string): TgInlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "Vyřešeno", callback_data: `ci|${token}|resolved` },
        { text: "Řeším", callback_data: `ci|${token}|in_progress` },
        { text: "Problém", callback_data: `ci|${token}|problem` },
      ],
    ],
  };
}

function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("cs-CZ", {
      day: "numeric",
      month: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

// ── Runner ────────────────────────────────────────────────────────────────────

export interface AgentDigest {
  agent: ReAgent;
  chatId: string;
  count: number; // lokality vyžadující pozornost
  sent: number;
  failed: number;
  preview?: string[]; // jen v dryRun
}

export type DigestOutcome =
  | {
      ok: true;
      trigger: string;
      dryRun: boolean;
      agents: AgentDigest[];
      totalSent: number;
    }
  | { ok: false; reason: "not-configured"; error: string };

export async function runTelegramLocationDigest(
  trigger: string,
  opts: { dryRun?: boolean } = {},
): Promise<DigestOutcome> {
  const dryRun = Boolean(opts.dryRun);

  if (!isTelegramConfigured()) {
    return {
      ok: false,
      reason: "not-configured",
      error: "TELEGRAM_BOT_TOKEN není nastaven.",
    };
  }

  const groups = await getReAgentGroups();
  const configured = RE_AGENTS.filter((a) => groups[a]);
  if (configured.length === 0) {
    return {
      ok: false,
      reason: "not-configured",
      error: "Žádná Telegram skupina RE agenta není namapovaná.",
    };
  }

  const [locations, localMap] = await Promise.all([
    listLocations(),
    listLocationLocalMap(),
  ]);

  const agents: AgentDigest[] = [];
  let totalSent = 0;

  for (const agent of configured) {
    const chatId = groups[agent]!;
    // "K řešení" definujeme STEJNĚ jako Real Estate tabulka (default pohled), ať
    // počty sedí s portálem:
    //  - jen lokality z NewCo importu (local.newco) — ostatní se v tabulce neřeší,
    //  - červené (flaggedRed) jsou samostatná kategorie → jdou sem jen s příznakem
    //    "stejně řešit" (solveDespiteRed),
    //  - ostatní podle reconcile nájmu (needs).
    // Bez tohoto sladění by digest počítal i lokality mimo NewCo a všechny červené
    // (řádově víc, než kolik je v portálu "k řešení").
    const attention = locations.filter((l) => {
      if (l.re_agent !== agent) return false;
      const local = localMap.get(l.id);
      if (!local?.newco) return false;
      if (local.newco.flaggedRed) return Boolean(local.solveDespiteRed);
      return reconcile(l.lease_current_status, l.lease_target_status) === "needs";
    });

    const digest: AgentDigest = {
      agent,
      chatId,
      count: attention.length,
      sent: 0,
      failed: 0,
    };
    if (dryRun) digest.preview = [];

    for (const loc of attention) {
      const last = localMap.get(loc.id)?.reCheckIn;
      const lines = [
        "Stav převodu nájemní smlouvy",
        `Lokalita: ${loc.name}${loc.code ? ` (${loc.code})` : ""}`,
        `Nájem: aktuálně ${LEASE_HOLDER_LABEL[loc.lease_current_status]}, cíl ${LEASE_HOLDER_LABEL[loc.lease_target_status]}`,
        `Klient: ${loc.current_client_name || "-"}`,
      ];
      if (last) {
        lines.push(
          `Naposledy nahlášeno: ${CHECKIN_LABEL[last.status]} (${shortDate(last.at)})`,
        );
      }
      lines.push("", "V jakém stavu je převod nájemní smlouvy?");
      const text = lines.join("\n");

      if (dryRun) {
        digest.preview!.push(text);
        continue;
      }

      const token = await storeCallbackToken({ locationId: loc.id, agent });
      const res = await tgSendMessage(chatId, text, statusButtons(token));
      if (res.ok) {
        digest.sent++;
        totalSent++;
      } else {
        digest.failed++;
      }
    }

    agents.push(digest);
  }

  return { ok: true, trigger, dryRun, agents, totalSent };
}
