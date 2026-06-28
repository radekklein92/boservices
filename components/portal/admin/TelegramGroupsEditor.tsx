"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
  RefreshCw,
  Save,
} from "lucide-react";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { RE_AGENT_LABEL } from "@/components/portal/locations/locations-shared";
import type { ReAgent } from "@/lib/portal/locations-db";
import type {
  ReAgentGroups,
  SeenChat,
} from "@/lib/portal/telegram-groups-db";

const AGENTS: ReAgent[] = [
  "Krampera",
  "Siarik",
  "Kholova",
  "Gransky",
  "Neuzil",
];

const DATALIST_ID = "tg-seen-chats";

export function TelegramGroupsEditor({
  initialGroups,
  seenChats,
  botConfigured,
  webhookConfigured,
  webhookUrl,
}: {
  initialGroups: ReAgentGroups;
  seenChats: SeenChat[];
  botConfigured: boolean;
  webhookConfigured: boolean;
  webhookUrl: string;
}) {
  const [groups, setGroups] = useState<Record<ReAgent, string>>(() => {
    const init = {} as Record<ReAgent, string>;
    for (const a of AGENTS) init[a] = initialGroups[a] ?? "";
    return init;
  });
  const [seen, setSeen] = useState<SeenChat[]>(seenChats);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  function setChatId(agent: ReAgent, value: string) {
    setGroups((prev) => ({ ...prev, [agent]: value }));
    setMsg(null);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/portal/admin/telegram-groups", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Uložení selhalo");
      setMsg({ kind: "ok", text: "Mapování uloženo." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Chyba" });
    } finally {
      setSaving(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/portal/admin/telegram-groups");
      const json = await res.json();
      if (json.ok) setSeen(json.seenChats ?? []);
    } catch {
      /* ignore */
    } finally {
      setRefreshing(false);
    }
  }

  async function copyWebhook() {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setMsg({ kind: "ok", text: "Webhook URL zkopírováno." });
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Administrace"
        title="Telegram"
        lede="Dvakrát týdně (úterý a čtvrtek ráno) dostane každý RE agent do své Telegram skupiny seznam lokalit, které vyžadují pozornost, s tlačítky Vyřešeno / Řeším / Problém. Tady se nastavuje, která skupina patří kterému agentovi."
      />

      {/* Stav integrace */}
      <section className="rounded-3xl border border-edge bg-paper p-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <StatusDot
            ok={botConfigured}
            label="Bot token"
            hint={botConfigured ? "Nastaven" : "Chybí TELEGRAM_BOT_TOKEN"}
          />
          <StatusDot
            ok={webhookConfigured}
            label="Webhook secret"
            hint={
              webhookConfigured ? "Nastaven" : "Chybí TELEGRAM_WEBHOOK_SECRET"
            }
          />
        </div>
        <div className="mt-4 flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">
            URL webhooku (registruje se v Telegramu přes setWebhook)
          </span>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-edge bg-edge-warm px-3 py-2 font-mono text-[12px] text-ink-deep">
              {webhookUrl || "(NEXT_PUBLIC_SITE_URL není nastaveno)"}
            </code>
            <button
              type="button"
              onClick={copyWebhook}
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-edge bg-paper px-3.5 text-[12.5px] font-medium text-ink-deep transition-colors hover:border-ink-soft"
            >
              <Copy className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
              Kopírovat
            </button>
          </div>
        </div>
      </section>

      {/* Mapování agent -> skupina */}
      <section className="rounded-3xl border border-edge bg-paper p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-bold tracking-[-0.01em] text-ink-base">
            Skupiny RE agentů
          </h2>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            title="Načte chaty, kam byl bot přidán (po přidání bota do nové skupiny zde vyber chat_id)"
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-edge bg-paper px-3.5 text-[12.5px] font-medium text-ink-deep transition-colors hover:border-ink-soft disabled:opacity-50"
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
            Načíst viděné chaty
          </button>
        </div>

        <datalist id={DATALIST_ID}>
          {seen.map((c) => (
            <option key={c.chatId} value={c.chatId}>
              {c.title}
            </option>
          ))}
        </datalist>

        <div className="flex flex-col divide-y divide-edge">
          {AGENTS.map((agent) => (
            <div
              key={agent}
              className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4"
            >
              <label
                htmlFor={`tg-${agent}`}
                className="w-40 shrink-0 text-[13.5px] font-semibold text-ink-base"
              >
                {RE_AGENT_LABEL[agent]}
              </label>
              <input
                id={`tg-${agent}`}
                list={DATALIST_ID}
                value={groups[agent]}
                onChange={(e) => setChatId(agent, e.target.value)}
                placeholder="chat_id skupiny (např. -1001234567890)"
                className="h-10 w-full rounded-lg border border-edge bg-paper px-3 font-mono text-[13px] text-ink-base outline-none transition-colors placeholder:font-sans placeholder:text-ink-soft focus:border-ink-base"
              />
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-ink-base px-5 text-[13px] font-semibold text-paper transition-transform active:translate-y-px disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
            ) : (
              <Save className="h-4 w-4" strokeWidth={1.5} />
            )}
            Uložit mapování
          </button>
          {msg && (
            <span
              className={`inline-flex items-center gap-1.5 text-[13px] ${
                msg.kind === "ok" ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {msg.kind === "ok" ? (
                <Check className="h-4 w-4" strokeWidth={2} />
              ) : (
                <AlertTriangle className="h-4 w-4" strokeWidth={2} />
              )}
              {msg.text}
            </span>
          )}
        </div>

        <p className="mt-4 max-w-[70ch] text-[12.5px] leading-relaxed text-ink-mid">
          Nastavení: založ skupinu na Telegramu, přidej do ní bota, napiš ve
          skupině libovolnou zprávu (nebo bota přidej jako správce). Pak klikni na
          „Načíst viděné chaty", vyber chat_id u příslušného agenta a ulož.
          Prázdné pole agenta odmapuje (digest mu chodit nebude).
        </p>
      </section>
    </div>
  );
}

function StatusDot({
  ok,
  label,
  hint,
}: {
  ok: boolean;
  label: string;
  hint: string;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-ink-deep">
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          ok ? "bg-emerald-500" : "bg-amber-500"
        }`}
        aria-hidden="true"
      />
      <span className="font-medium">{label}</span>
      <span className="text-ink-soft">- {hint}</span>
    </span>
  );
}
