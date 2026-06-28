// Tenký klient nad GitHub REST API pro Konzoli změn (/portal/admin/changes).
// Žádná dependency navíc - jen fetch (stejný styl jako cron sync routy). Owner,
// repo a token z env. Bez env je vše no-op (isGithubConfigured() === false) a UI
// to hlásí jako "nenakonfigurováno".

import { getRedis } from "@/lib/redis";

const API = "https://api.github.com";

function cfg(): { token: string; owner: string; repo: string } | null {
  const token = process.env.GITHUB_BOT_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  if (!token || !owner || !repo) return null;
  return { token, owner, repo };
}

export function isGithubConfigured(): boolean {
  return cfg() !== null;
}

export function getRepoSlug(): string | null {
  const c = cfg();
  return c ? `${c.owner}/${c.repo}` : null;
}

// Label, kterým Portál značí "svoje" issues. Workflow claude.yml běží jen na
// issues s tímhle labelem = governance gate (Claude nikdo nespustí mimo Portál).
const LABEL = "claude-task";

async function gh<T>(path: string, init?: RequestInit): Promise<T> {
  const c = cfg();
  if (!c) throw new Error("GitHub not configured");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${c.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status}: ${text.slice(0, 300)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// Založí issue s @claude triggerem a labelem claude-task. GitHub neexistující
// label při zakládání issue sám vytvoří. Vrací číslo a URL issue.
export async function createChangeIssue(opts: {
  title: string;
  request: string;
  requestedBy: string;
}): Promise<{ number: number; url: string }> {
  const c = cfg();
  if (!c) throw new Error("GitHub not configured");
  const body =
    `@claude ${opts.request}\n\n` +
    `---\n` +
    `_Požadavek z Portálu (Konzole změn) - zadal ${opts.requestedBy}._`;
  const issue = await gh<{ number: number; html_url: string }>(
    `/repos/${c.owner}/${c.repo}/issues`,
    {
      method: "POST",
      body: JSON.stringify({ title: opts.title, body, labels: [LABEL] }),
    },
  );
  return { number: issue.number, url: issue.html_url };
}

export type ChangeStatus =
  | "working"
  | "pr_open"
  | "checks_running"
  | "checks_failed"
  | "deployed"
  | "closed"
  | "unknown";

export interface RequestLiveStatus {
  status: ChangeStatus;
  prNumber?: number;
  prUrl?: string;
  prTitle?: string;
  previewUrl?: string;
}

type TimelineEvent = {
  event?: string;
  source?: { issue?: { number?: number; pull_request?: unknown } };
};

// Najde PR navázaný na issue (Claude v PR uvádí "Closes #N" -> cross-reference
// na timeline issue). Vrací číslo posledního takového PR, nebo null.
async function findLinkedPr(c: { owner: string; repo: string }, issue: number): Promise<number | null> {
  const events = await gh<TimelineEvent[]>(
    `/repos/${c.owner}/${c.repo}/issues/${issue}/timeline?per_page=100`,
  );
  const prs = events
    .filter((e) => e.event === "cross-referenced" && e.source?.issue?.pull_request)
    .map((e) => e.source?.issue?.number)
    .filter((n): n is number => typeof n === "number");
  return prs.length ? prs[prs.length - 1] : null;
}

type Pull = {
  state: "open" | "closed";
  merged: boolean;
  title: string;
  html_url: string;
  head: { sha: string };
};

async function getPull(c: { owner: string; repo: string }, pr: number): Promise<Pull> {
  return gh<Pull>(`/repos/${c.owner}/${c.repo}/pulls/${pr}`);
}

// Souhrnný stav checků pro daný commit (combined status + check-runs dohromady).
async function getChecksState(
  c: { owner: string; repo: string },
  sha: string,
): Promise<"pending" | "success" | "failure"> {
  const [status, checks] = await Promise.all([
    gh<{ state: string; total_count: number }>(`/repos/${c.owner}/${c.repo}/commits/${sha}/status`),
    gh<{ check_runs: { status: string; conclusion: string | null }[] }>(
      `/repos/${c.owner}/${c.repo}/commits/${sha}/check-runs`,
    ),
  ]);
  const runs = checks.check_runs ?? [];
  const failConclusions = ["failure", "timed_out", "cancelled", "action_required", "stale"];
  if (status.state === "failure" || status.state === "error") return "failure";
  if (runs.some((r) => r.conclusion && failConclusions.includes(r.conclusion))) return "failure";
  const anyPending =
    status.state === "pending" || runs.some((r) => r.status !== "completed");
  if (anyPending) return "pending";
  return "success";
}

// Best-effort náhledová / produkční URL z posledního deploymentu commitu.
async function getPreviewUrl(c: { owner: string; repo: string }, sha: string): Promise<string | undefined> {
  const deployments = await gh<{ id: number }[]>(
    `/repos/${c.owner}/${c.repo}/deployments?sha=${sha}&per_page=5`,
  );
  if (!deployments.length) return undefined;
  const statuses = await gh<{ state: string; environment_url?: string }[]>(
    `/repos/${c.owner}/${c.repo}/deployments/${deployments[0].id}/statuses?per_page=10`,
  );
  const withUrl = statuses.find((s) => s.environment_url);
  return withUrl?.environment_url;
}

const statusCacheKey = (n: number) => `portal:devtools:status:${n}`;

// Živý stav požadavku s krátkou cache v Redisu (šetří GitHub rate limit při
// pollingu i při více současných adminech - sdílí se jeden bot token):
// terminální stav (nasazeno/zavřeno) se nemění -> cache 1 h; aktivní -> 25 s.
export async function getRequestStatus(issueNumber: number): Promise<RequestLiveStatus> {
  const r = getRedis();
  if (r) {
    const cached = await r.get<RequestLiveStatus>(statusCacheKey(issueNumber));
    if (cached) return cached;
  }
  const result = await computeRequestStatus(issueNumber);
  if (r) {
    const ttl = result.status === "deployed" || result.status === "closed" ? 3600 : 25;
    await r.set(statusCacheKey(issueNumber), result, { ex: ttl });
  }
  return result;
}

// Spočítá živý stav jednoho požadavku (issue -> PR -> checky -> deploy).
// Defenzivní: jakákoli dílčí chyba degraduje na hrubší stav, nikdy nevyhodí.
async function computeRequestStatus(issueNumber: number): Promise<RequestLiveStatus> {
  const c = cfg();
  if (!c) return { status: "unknown" };
  try {
    const prNumber = await findLinkedPr(c, issueNumber);
    if (!prNumber) {
      // Bez PR: buď Claude pracuje, nebo issue skončilo zavřené bez výsledku.
      const issue = await gh<{ state: string }>(
        `/repos/${c.owner}/${c.repo}/issues/${issueNumber}`,
      ).catch(() => null);
      return { status: issue?.state === "closed" ? "closed" : "working" };
    }
    const pull = await getPull(c, prNumber);
    const base = { prNumber, prUrl: pull.html_url, prTitle: pull.title };
    if (pull.merged) {
      const previewUrl = await getPreviewUrl(c, pull.head.sha).catch(() => undefined);
      return { ...base, status: "deployed", previewUrl };
    }
    if (pull.state === "closed") return { ...base, status: "closed" };
    const [checks, previewUrl] = await Promise.all([
      getChecksState(c, pull.head.sha).catch(() => "pending" as const),
      getPreviewUrl(c, pull.head.sha).catch(() => undefined),
    ]);
    const status: ChangeStatus =
      checks === "failure" ? "checks_failed" : checks === "success" ? "pr_open" : "checks_running";
    return { ...base, status, previewUrl };
  } catch {
    return { status: "unknown" };
  }
}

// Direkce SHA -> PR (pro notifikaci po nasazení). "List PRs associated with a
// commit" vrací i smergovaný PR.
export async function findPrForCommit(
  sha: string,
): Promise<{ number: number; html_url: string; title: string; body: string | null } | null> {
  const c = cfg();
  if (!c) return null;
  const prs = await gh<
    { number: number; html_url: string; title: string; body: string | null }[]
  >(`/repos/${c.owner}/${c.repo}/commits/${sha}/pulls`);
  return prs.length ? prs[0] : null;
}

export async function getCommitMessage(sha: string): Promise<string | undefined> {
  const c = cfg();
  if (!c) return undefined;
  const commit = await gh<{ commit: { message: string } }>(
    `/repos/${c.owner}/${c.repo}/commits/${sha}`,
  );
  // Jen první řádek (titulek commitu).
  return commit.commit.message.split("\n")[0];
}
