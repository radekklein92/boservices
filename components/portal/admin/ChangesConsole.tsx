"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  GitPullRequest,
  Loader2,
  MapPin,
  MessageSquarePlus,
  MousePointerClick,
  RefreshCw,
  Rocket,
  Send,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { Section } from "@/components/portal/ui/Section";
import { Chip } from "@/components/portal/ui/Chip";
import { Toggle } from "@/components/portal/ui/Toggle";
import { BTN_PRIMARY, BTN_ROW } from "@/components/portal/ui/buttons";
import { maskWho } from "@/lib/portal/masked-account";

type ChangeStatus =
  | "working"
  | "pr_open"
  | "checks_running"
  | "checks_failed"
  | "deployed"
  | "closed"
  | "unknown";

type LiveStatus = {
  status: ChangeStatus;
  prNumber?: number;
  prUrl?: string;
  prTitle?: string;
  previewUrl?: string;
  lastActivity?: { body: string; at: string; author: string };
} | null;

export type RequestRow = {
  issueNumber: number;
  issueUrl: string;
  title: string;
  request: string;
  requestedByEmail: string;
  requestedByName: string;
  createdAt: string;
  live: LiveStatus;
};

// Návrh z feedback widgetu (mezistav před požadavkem). Zrcadlí FeedbackDraft
// z lib/portal/feedback-db.ts (jen pole potřebná pro zobrazení).
export type FeedbackDraftRow = {
  id: string;
  title: string;
  spec: string;
  authorName: string;
  authorEmail: string;
  createdAt: string;
  page: {
    path: string;
    title: string;
    routeLabel: string;
    selection?: string;
    picked?: { text: string; selector: string; role?: string };
  };
};

type Mgmt = {
  editors: string[];
  enabled: boolean;
  adminUsers: { email: string; name: string }[];
};

const STATUS_META: Record<ChangeStatus, { label: string; tone: string }> = {
  working: { label: "Claude pracuje", tone: "border-amber-200 bg-amber-50 text-amber-700" },
  checks_running: { label: "Checky běží", tone: "border-amber-200 bg-amber-50 text-amber-700" },
  pr_open: { label: "PR připraven", tone: "border-sky-200 bg-sky-50 text-sky-700" },
  checks_failed: { label: "Checky selhaly", tone: "border-red-200 bg-red-50 text-red-700" },
  deployed: { label: "Nasazeno", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  closed: { label: "Zavřeno bez nasazení", tone: "border-edge bg-edge-warm text-ink-mid" },
  unknown: { label: "Zjišťuji stav", tone: "border-edge bg-edge-warm text-ink-mid" },
};

const TERMINAL: ChangeStatus[] = ["deployed", "closed"];

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("cs-CZ", {
      day: "numeric",
      month: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// "working" déle než tohle bez PR = nejspíš spadlý/uvázlý běh (akce normálně
// otevře PR do pár minut) -> ukážeme upozornění + odkaz na logy.
const STALE_MINUTES = 10;

// Lehké očištění GitHub markdownu pro zobrazení (odkazy -> text, obrázky a
// nadpisové # pryč). Vykresluje se jako prostý text, takže žádné riziko injection.
function cleanMarkdown(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Inline "Průběh od Claude" - poslední komentář z issue, sbalený na pár řádků.
function Activity({
  activity,
}: {
  activity: { body: string; at: string; author: string };
}) {
  const [open, setOpen] = useState(false);
  const text = cleanMarkdown(activity.body);
  return (
    <div className="mt-1 rounded-xl border border-edge bg-edge-warm/40 px-3 py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-[12px] font-medium text-ink-mid transition-colors hover:text-ink-base"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
          strokeWidth={1.75}
        />
        Průběh od Claude
        <span className="ml-auto font-normal text-ink-soft">{fmt(activity.at)}</span>
      </button>
      <div
        className={`mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-deep ${
          open ? "" : "line-clamp-3"
        }`}
      >
        {text}
      </div>
    </div>
  );
}

export function ChangesConsole({
  initialRequests,
  initialFeedback,
  configured,
  enabled,
  canSubmit,
  isSuperadmin,
  repoSlug,
}: {
  initialRequests: RequestRow[];
  initialFeedback: FeedbackDraftRow[];
  configured: boolean;
  enabled: boolean;
  canSubmit: boolean;
  isSuperadmin: boolean;
  repoSlug: string | null;
}) {
  const [rows, setRows] = useState<RequestRow[]>(initialRequests);
  const [feedback, setFeedback] = useState<FeedbackDraftRow[]>(initialFeedback);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [request, setRequest] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [mgmt, setMgmt] = useState<Mgmt | null>(null);
  const [savingMgmt, setSavingMgmt] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [reqRes, fbRes] = await Promise.all([
        fetch("/api/portal/admin/changes"),
        fetch("/api/portal/admin/feedback"),
      ]);
      const reqJson = await reqRes.json();
      if (reqJson.ok) setRows(reqJson.requests as RequestRow[]);
      const fbJson = await fbRes.json();
      if (fbJson.ok) setFeedback(fbJson.drafts as FeedbackDraftRow[]);
    } catch {
      /* tichá chyba - příští tik to zkusí znovu */
    } finally {
      setRefreshing(false);
    }
  }, []);

  async function promoteFeedback(id: string) {
    setBusyId(id);
    setMsg(null);
    try {
      const res = await fetch(`/api/portal/admin/feedback/${id}/promote`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Spuštění selhalo");
      setFeedback((prev) => prev.filter((f) => f.id !== id));
      setRows((prev) => [json.request as RequestRow, ...prev]);
      setMsg({
        kind: "ok",
        text: `Spuštěno (issue #${json.request.issueNumber}). Claude se do toho pustí.`,
      });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Spuštění selhalo" });
    } finally {
      setBusyId(null);
    }
  }

  async function dismissFeedback(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/portal/admin/feedback/${id}/dismiss`, { method: "POST" });
      const json = await res.json();
      if (json.ok) setFeedback((prev) => prev.filter((f) => f.id !== id));
    } catch {
      /* ignore */
    } finally {
      setBusyId(null);
    }
  }

  async function copyFeedback(f: FeedbackDraftRow) {
    try {
      await navigator.clipboard.writeText(`${f.title}\n\n${f.spec}`);
      setCopiedId(f.id);
      setTimeout(() => setCopiedId(null), 1600);
    } catch {
      /* clipboard nedostupný */
    }
  }

  // Auto-poll, dokud je aspoň jeden požadavek v neukončeném stavu.
  useEffect(() => {
    const active = rows.some((r) => !r.live || !TERMINAL.includes(r.live.status));
    if (!active) return;
    const id = setInterval(() => {
      void refresh();
    }, 30000);
    return () => clearInterval(id);
  }, [rows, refresh]);

  // Superadmin: načti allowlist + stav vypínače.
  useEffect(() => {
    if (!isSuperadmin) return;
    fetch("/api/portal/admin/changes/editors")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setMgmt({ editors: j.editors, enabled: j.enabled, adminUsers: j.adminUsers });
      })
      .catch(() => {});
  }, [isSuperadmin]);

  async function submit() {
    if (title.trim().length < 3 || request.trim().length < 10) {
      setMsg({ kind: "err", text: "Vyplňte název (min. 3 znaky) a popis (min. 10 znaků)." });
      return;
    }
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/portal/admin/changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, request }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Odeslání selhalo");
      setRows((prev) => [json.request as RequestRow, ...prev]);
      setTitle("");
      setRequest("");
      setMsg({
        kind: "ok",
        text: `Požadavek odeslán (issue #${json.request.issueNumber}). Claude se do toho pustí.`,
      });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Chyba" });
    } finally {
      setSubmitting(false);
    }
  }

  const saveMgmt = useCallback(
    async (next: Partial<{ editors: string[]; enabled: boolean }>) => {
      setSavingMgmt(true);
      try {
        const res = await fetch("/api/portal/admin/changes/editors", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        const json = await res.json();
        if (json.ok) {
          setMgmt((prev) =>
            prev ? { ...prev, editors: json.editors, enabled: json.enabled } : prev,
          );
        }
      } catch {
        /* ignore */
      } finally {
        setSavingMgmt(false);
      }
    },
    [],
  );

  function toggleEditor(email: string) {
    if (!mgmt) return;
    const has = mgmt.editors.includes(email);
    const editors = has
      ? mgmt.editors.filter((e) => e !== email)
      : [...mgmt.editors, email];
    setMgmt({ ...mgmt, editors });
    void saveMgmt({ editors });
  }

  const submitNote = !configured
    ? "Napojení na GitHub zatím není nakonfigurováno - doplňte přístupové údaje (viz nastavení) a vraťte se sem."
    : !enabled
      ? "Konzole změn je vypnutá. Zapne ji superadmin."
      : "Nemáte oprávnění odesílat požadavky. Požádejte superadmina o zařazení mezi editory.";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Administrace"
        title="Změny portálu"
        lede="Napište, co se má v Portálu změnit. Claude (AI) změnu připraví jako Pull request, projede povinné checky a po zelené se sama nasadí do produkce. Tady vidíte stav každého požadavku."
        actions={
          <button type="button" onClick={() => void refresh()} disabled={refreshing} className={BTN_ROW}>
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
            )}
            Obnovit
          </button>
        }
      />

      {!configured && (
        <Banner tone="amber">
          GitHub není nakonfigurován (chybí GITHUB_BOT_TOKEN / GITHUB_OWNER / GITHUB_REPO). Odesílání
          požadavků je dočasně nedostupné.
        </Banner>
      )}
      {configured && !enabled && (
        <Banner tone="amber">
          Konzole změn je teď vypnutá (kill switch).{" "}
          {isSuperadmin ? "Zapnout ji můžete dole v sekci Přístup a vypínač." : "Zapne ji superadmin."}
        </Banner>
      )}

      {feedback.length > 0 && (
        <Section
          title="Návrhy z portálu"
          hint="Podněty od uživatelů portálu (přes feedback widget). Spusťte implementaci, zkopírujte si zadání, nebo návrh zamítněte."
        >
          <div className="flex flex-col divide-y divide-edge">
            {feedback.map((f) => (
              <FeedbackItem
                key={f.id}
                draft={f}
                canPromote={canSubmit && configured}
                busy={busyId === f.id}
                copied={copiedId === f.id}
                onPromote={() => void promoteFeedback(f.id)}
                onDismiss={() => void dismissFeedback(f.id)}
                onCopy={() => void copyFeedback(f)}
              />
            ))}
          </div>
        </Section>
      )}

      <Section
        title="Nový požadavek"
        hint={
          configured && repoSlug
            ? `Cíl: repozitář ${repoSlug}`
            : "Popište změnu jako byste ji zadávali kolegovi - čím konkrétněji, tím lépe."
        }
      >
        {canSubmit ? (
          <div className="flex flex-col gap-3">
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setMsg(null);
              }}
              maxLength={120}
              placeholder="Stručný název (např. Zúžit sloupec Lokalita na mobilu)"
              className="h-11 w-full rounded-lg border border-edge bg-paper px-3.5 text-[14px] text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base"
            />
            <textarea
              value={request}
              onChange={(e) => {
                setRequest(e.target.value);
                setMsg(null);
              }}
              rows={5}
              maxLength={4000}
              placeholder="Co přesně se má změnit a kde. Můžete uvést stránku, chování, vzhled, příklady…"
              className="w-full resize-y rounded-lg border border-edge bg-paper px-3.5 py-2.5 text-[14px] leading-relaxed text-ink-base outline-none transition-colors placeholder:text-ink-soft focus:border-ink-base"
            />
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => void submit()} disabled={submitting} className={BTN_PRIMARY}>
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
                ) : (
                  <Send className="h-4 w-4" strokeWidth={1.5} />
                )}
                Odeslat požadavek
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
          </div>
        ) : (
          <p className="flex items-start gap-2 text-[13.5px] leading-relaxed text-ink-mid">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" strokeWidth={1.5} />
            {submitNote}
          </p>
        )}
      </Section>

      <Section title="Požadavky" hint="Posledních 20 požadavků a jejich stav (automaticky se obnovuje).">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-[13.5px] text-ink-soft">Zatím žádné požadavky.</p>
        ) : (
          <div className="flex flex-col divide-y divide-edge">
            {rows.map((r) => {
              const st = r.live?.status ?? "unknown";
              const ageMin = (Date.now() - Date.parse(r.createdAt)) / 60000;
              const stale = (st === "working" || st === "unknown") && ageMin > STALE_MINUTES;
              const meta = stale
                ? {
                    label: "Možná uvázlo - zkontrolovat",
                    tone: "border-amber-300 bg-amber-100 text-amber-800",
                  }
                : STATUS_META[st];
              return (
                <div key={r.issueNumber} className="flex flex-col gap-2 py-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[14px] font-semibold text-ink-base">{r.title}</span>
                    <Chip tone={meta.tone}>
                      {stale && <Clock className="h-3 w-3" strokeWidth={2} aria-hidden="true" />}
                      {meta.label}
                    </Chip>
                  </div>
                  <p className="line-clamp-2 max-w-[80ch] text-[13px] leading-relaxed text-ink-mid">
                    {r.request}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-soft">
                    <span>
                      {maskWho(r.requestedByName)} · {fmt(r.createdAt)}
                    </span>
                    <a
                      href={r.issueUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-ink-mid hover:text-ink-base"
                    >
                      Issue #{r.issueNumber}
                      <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
                    </a>
                    {r.live?.prUrl && (
                      <a
                        href={r.live.prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-ink-mid hover:text-ink-base"
                      >
                        <GitPullRequest className="h-3 w-3" strokeWidth={1.5} />
                        PR #{r.live.prNumber}
                      </a>
                    )}
                    {r.live?.previewUrl && (
                      <a
                        href={r.live.previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-ink-mid hover:text-ink-base"
                      >
                        Náhled
                        <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
                      </a>
                    )}
                    {(stale || st === "checks_failed") && repoSlug && (
                      <a
                        href={`https://github.com/${repoSlug}/actions/workflows/claude.yml`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-ink-mid hover:text-ink-base"
                      >
                        Logy běhu
                        <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
                      </a>
                    )}
                  </div>
                  {r.live?.lastActivity && <Activity activity={r.live.lastActivity} />}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {isSuperadmin && (
        <Section
          title="Přístup a vypínač"
          hint="Kdo smí odesílat požadavky a hlavní vypínač celé konzole. Spravuje jen superadmin."
        >
          {mgmt ? (
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="text-[13.5px] font-semibold text-ink-base">Hlavní vypínač</span>
                  <span className="text-[12px] text-ink-soft">
                    Vypnuto = nikdo nemůže odeslat požadavek (kód i stránka zůstanou).
                  </span>
                </div>
                <Toggle
                  checked={mgmt.enabled}
                  disabled={savingMgmt}
                  onChange={(v) => {
                    setMgmt({ ...mgmt, enabled: v });
                    void saveMgmt({ enabled: v });
                  }}
                  label={mgmt.enabled ? "Zapnuto" : "Vypnuto"}
                />
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-[13.5px] font-semibold text-ink-base">Editoři (smí odesílat)</span>
                {mgmt.adminUsers.length === 0 ? (
                  <p className="text-[12.5px] text-ink-soft">Žádní admini k zařazení.</p>
                ) : (
                  <div className="flex flex-col divide-y divide-edge/60">
                    {mgmt.adminUsers.map((u) => {
                      const on = mgmt.editors.includes(u.email.toLowerCase());
                      return (
                        <button
                          key={u.email}
                          type="button"
                          onClick={() => toggleEditor(u.email.toLowerCase())}
                          disabled={savingMgmt}
                          className="flex items-center justify-between gap-3 py-2.5 text-left transition-colors hover:opacity-80 disabled:opacity-50"
                        >
                          <span className="flex flex-col">
                            <span className="text-[13.5px] font-medium text-ink-base">{u.name}</span>
                            <span className="text-[12px] text-ink-soft">{u.email}</span>
                          </span>
                          <span
                            className={`grid h-6 w-6 place-items-center rounded-full border transition-colors ${
                              on
                                ? "border-ink-base bg-ink-base text-paper"
                                : "border-edge bg-paper text-transparent"
                            }`}
                            aria-hidden="true"
                          >
                            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="py-2 text-[13px] text-ink-soft">Načítám…</p>
          )}
        </Section>
      )}
    </div>
  );
}

function Banner({ tone, children }: { tone: "amber"; children: ReactNode }) {
  const cls =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-edge bg-edge-warm text-ink-deep";
  return (
    <div className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-[13px] leading-relaxed ${cls}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
      <span>{children}</span>
    </div>
  );
}

// Jeden návrh z feedbacku v Konzoli změn. „Spustit implementaci" = stejná akce
// jako ruční požadavek (gated editor+konzole), jen předvyplněná z návrhu.
function FeedbackItem({
  draft,
  canPromote,
  busy,
  copied,
  onPromote,
  onDismiss,
  onCopy,
}: {
  draft: FeedbackDraftRow;
  canPromote: boolean;
  busy: boolean;
  copied: boolean;
  onPromote: () => void;
  onDismiss: () => void;
  onCopy: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[14px] font-semibold text-ink-base">{draft.title}</span>
        <Chip tone="border-violet-200 bg-violet-50 text-violet-700">
          <MessageSquarePlus className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
          Návrh
        </Chip>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-soft">
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
          {draft.page.routeLabel || draft.page.title || draft.page.path}
        </span>
        <span>
          {maskWho(draft.authorName)} · {fmt(draft.createdAt)}
        </span>
        {draft.page.picked?.text && (
          <span className="inline-flex items-center gap-1" title={draft.page.picked.selector}>
            <MousePointerClick className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
            „{draft.page.picked.text.slice(0, 40)}"
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-[12px] font-medium text-ink-mid transition-colors hover:text-ink-base"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
          strokeWidth={1.75}
        />
        Zadání
      </button>
      <div
        className={`whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-deep ${
          open ? "" : "line-clamp-2"
        }`}
      >
        {draft.spec}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onPromote}
          disabled={!canPromote || busy}
          className={BTN_ROW}
          title={
            canPromote
              ? "Založí požadavek (issue) a spustí Claude"
              : "Spustit může jen editor se zapnutou konzolí"
          }
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
          ) : (
            <Rocket className="h-3.5 w-3.5" strokeWidth={1.5} />
          )}
          Spustit implementaci
        </button>
        <button type="button" onClick={onCopy} className={BTN_ROW}>
          {copied ? (
            <Check className="h-3.5 w-3.5" strokeWidth={2} />
          ) : (
            <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
          )}
          {copied ? "Zkopírováno" : "Kopírovat zadání"}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          disabled={busy}
          className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-[12px] font-medium text-ink-mid transition-colors hover:text-red-600 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
          Zamítnout
        </button>
      </div>
    </div>
  );
}
