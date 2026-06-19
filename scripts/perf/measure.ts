/**
 * Měření doby načítání portálových stránek proti produkci.
 *
 * Měří TTFB (čas do hlaviček) a total (čas do dočtení těla) pro každou stránku,
 * N opakování, vypíše p50/p95 a uloží baseline do scripts/perf/baseline.json.
 *
 * Autentizace (jedna z možností):
 *   PERF_COOKIE="__Secure-authjs.session-token=..."   - hotová session cookie
 *   PERF_EMAIL=... PERF_PASSWORD=...                    - přihlásí se přes credentials
 *
 * Volitelné:
 *   PERF_BASE_URL    (default https://www.boservices.cz)
 *   PERF_RUNS        (default 20)
 *   PERF_CONTRACT_ID (změří i /portal/contracts/<id>)
 *   PERF_LABEL       (jmenovka snapshotu, např. "baseline" / "po-fazi-1")
 *
 * Spuštění:  npx tsx scripts/perf/measure.ts
 */

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.PERF_BASE_URL ?? "https://www.boservices.cz").replace(/\/$/, "");
const RUNS = Number(process.env.PERF_RUNS ?? 20);
const LABEL = process.env.PERF_LABEL ?? "snapshot";

type PageDef = { name: string; path: string };

const PAGES: PageDef[] = [
  { name: "dashboard", path: "/portal" },
  { name: "contracts", path: "/portal/contracts" },
  { name: "clients", path: "/portal/clients" },
  { name: "locations", path: "/portal/locations" },
  { name: "commissions", path: "/portal/commissions" },
  { name: "tasks", path: "/portal/tasks" },
];
if (process.env.PERF_CONTRACT_ID) {
  PAGES.push({ name: "contract-detail", path: `/portal/contracts/${process.env.PERF_CONTRACT_ID}` });
}

function pct(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

function parseServerTiming(h: string | null): Record<string, number> {
  if (!h) return {};
  const out: Record<string, number> = {};
  for (const part of h.split(",")) {
    const name = part.trim().split(";")[0]!.trim();
    const dur = /dur=([\d.]+)/.exec(part);
    if (name && dur) out[name] = Number(dur[1]);
  }
  return out;
}

async function getAuthCookie(): Promise<string> {
  if (process.env.PERF_COOKIE) return process.env.PERF_COOKIE.trim();

  const email = process.env.PERF_EMAIL;
  const password = process.env.PERF_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Chybí autentizace. Nastav PERF_COOKIE, nebo PERF_EMAIL + PERF_PASSWORD.",
    );
  }

  // NextAuth v5 credentials flow: CSRF → callback/credentials → session cookie.
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const csrfCookies = csrfRes.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

  const body = new URLSearchParams({
    email: email.trim().toLowerCase(),
    password,
    csrfToken,
    callbackUrl: `${BASE}/portal`,
    json: "true",
  });

  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: csrfCookies },
    body,
    redirect: "manual",
  });

  const setCookies = res.headers.getSetCookie();
  const session = setCookies
    .map((c) => c.split(";")[0]!)
    .find((c) => /authjs\.session-token=/.test(c) && !/=$/.test(c.trim()));
  if (!session) {
    throw new Error(
      `Přihlášení selhalo (status ${res.status}). Zkontroluj e-mail/heslo, nebo použij PERF_COOKIE.`,
    );
  }
  return session;
}

async function measurePage(page: PageDef, cookie: string) {
  const ttfb: number[] = [];
  const total: number[] = [];
  const serverTimings: Record<string, number[]> = {};
  let redirected = false;
  let status = 0;

  // Warm-up (1x, nezapočítává se) - ať první cold-start nezkresluje medián.
  try {
    await fetch(`${BASE}${page.path}`, { headers: { cookie }, redirect: "manual" });
  } catch {
    /* ignore */
  }

  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    const res = await fetch(`${BASE}${page.path}`, { headers: { cookie }, redirect: "manual" });
    const tHeaders = performance.now();
    await res.arrayBuffer();
    const tBody = performance.now();

    status = res.status;
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location") ?? "";
      if (/login/.test(loc)) redirected = true;
    }

    ttfb.push(tHeaders - t0);
    total.push(tBody - t0);
    const st = parseServerTiming(res.headers.get("server-timing"));
    for (const [k, v] of Object.entries(st)) (serverTimings[k] ??= []).push(v);
  }

  ttfb.sort((a, b) => a - b);
  total.sort((a, b) => a - b);
  const stSummary: Record<string, { p50: number }> = {};
  for (const [k, arr] of Object.entries(serverTimings)) {
    arr.sort((a, b) => a - b);
    stSummary[k] = { p50: Math.round(pct(arr, 50)) };
  }

  return {
    name: page.name,
    path: page.path,
    status,
    redirectedToLogin: redirected,
    ttfb: { p50: Math.round(pct(ttfb, 50)), p95: Math.round(pct(ttfb, 95)) },
    total: { p50: Math.round(pct(total, 50)), p95: Math.round(pct(total, 95)) },
    serverTiming: stSummary,
  };
}

async function main() {
  console.log(`\nMěření proti ${BASE} (${RUNS} běhů/stránku, label="${LABEL}")\n`);
  const cookie = await getAuthCookie();

  const results = [];
  for (const page of PAGES) {
    process.stdout.write(`  ${page.name.padEnd(18)} `);
    const r = await measurePage(page, cookie);
    results.push(r);
    const warn = r.redirectedToLogin ? "  ⚠ REDIRECT NA LOGIN (auth neplatná?)" : "";
    console.log(
      `TTFB p50=${r.ttfb.p50}ms p95=${r.ttfb.p95}ms | total p50=${r.total.p50}ms p95=${r.total.p95}ms${warn}`,
    );
  }

  const anyAuthFail = results.some((r) => r.redirectedToLogin);
  if (anyAuthFail) {
    console.log("\n⚠ Některé stránky přesměrovaly na login - autentizace nefunguje, čísla nejsou validní.\n");
  }

  const snapshot = { label: LABEL, base: BASE, runs: RUNS, measuredAt: new Date().toISOString(), results };
  const outDir = HERE;
  await mkdir(outDir, { recursive: true });

  // Když měříme baseline, uložíme jako baseline.json; jinak přidáme do history.
  if (LABEL === "baseline") {
    await writeFile(join(outDir, "baseline.json"), JSON.stringify(snapshot, null, 2));
    console.log(`\nUloženo do scripts/perf/baseline.json`);
  } else {
    // Porovnání s baseline, pokud existuje.
    try {
      const baseline = JSON.parse(await readFile(join(outDir, "baseline.json"), "utf8")) as typeof snapshot;
      console.log(`\nPorovnání s baseline (total p50):`);
      for (const r of results) {
        const b = baseline.results.find((x) => x.name === r.name);
        if (b) {
          const diff = r.total.p50 - b.total.p50;
          const pctChg = b.total.p50 ? Math.round((diff / b.total.p50) * 100) : 0;
          const arrow = diff < 0 ? "↓" : diff > 0 ? "↑" : "=";
          console.log(`  ${r.name.padEnd(18)} ${b.total.p50}ms → ${r.total.p50}ms  ${arrow} ${pctChg > 0 ? "+" : ""}${pctChg}%`);
        }
      }
    } catch {
      console.log("\n(baseline.json zatím neexistuje - porovnání přeskočeno)");
    }
    await writeFile(join(outDir, `snapshot-${LABEL}.json`), JSON.stringify(snapshot, null, 2));
    console.log(`\nUloženo do scripts/perf/snapshot-${LABEL}.json`);
  }
}

main().catch((err) => {
  console.error("\nChyba měření:", err instanceof Error ? err.message : err);
  process.exit(1);
});
