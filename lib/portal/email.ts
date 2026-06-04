import { Resend } from "resend";

let cached: Resend | null = null;

function getResend(): Resend | null {
  if (cached) return cached;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  cached = new Resend(key);
  return cached;
}

const FROM = process.env.FROM_EMAIL ?? "BOServices <noreply@boservices.cz>";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.boservices.cz";

function shell(title: string, eyebrow: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#FAFAF9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0E0E0E"><div style="max-width:560px;margin:0 auto;padding:32px 24px"><div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#6F7672">${eyebrow}</div><h1 style="font-size:28px;font-weight:800;letter-spacing:-.02em;margin:8px 0 24px;line-height:1.1">${title}</h1>${body}<hr style="border:none;border-top:1px solid #E8ECE9;margin:32px 0"/><div style="font-size:11px;color:#6F7672;letter-spacing:.04em">BOServices &middot; Provoz &middot; Lidé &middot; Standard &middot; Růst</div></div></body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${href}" style="display:inline-block;background:#0E0E0E;color:#fff;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px">${label}</a></p>`;
}

function fallbackLink(url: string): string {
  return `<p style="font-size:12px;line-height:1.55;color:#6F7672;margin-top:24px">Pokud tlačítko nefunguje, otevřete tento odkaz:<br/><a href="${url}" style="color:#0E0E0E;word-break:break-all">${url}</a></p>`;
}

export async function sendInviteEmail(opts: {
  to: string;
  name?: string;
  invitedBy: string;
  token: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.warn("[portal email] Resend not configured");
    return;
  }
  const url = `${SITE_URL}/portal/set-password?token=${opts.token}`;
  const greeting = opts.name ? `${opts.name},` : "dobrý den,";
  const body = `<p style="font-size:15px;line-height:1.6">${greeting}</p><p style="font-size:15px;line-height:1.6">${opts.invitedBy === "system" ? "Byli jste pozváni" : `${opts.invitedBy} vás pozval`} do portálu BOServices. Pro dokončení registrace si nastavte heslo.</p>${button(url, "Nastavit heslo")}<p style="font-size:13px;color:#6F7672">Odkaz vyprší za 7 dní.</p>${fallbackLink(url)}`;
  await resend.emails.send({
    from: FROM,
    to: [opts.to],
    subject: "Pozvánka do portálu BOServices",
    html: shell("Vítejte v portálu.", "BOServices portál", body),
  });
}

export async function sendResetEmail(opts: {
  to: string;
  name?: string;
  token: string;
  kind: "self-forgot" | "admin-reset";
}): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.warn("[portal email] Resend not configured");
    return;
  }
  const url = `${SITE_URL}/portal/set-password?token=${opts.token}`;
  const greeting = opts.name ? `${opts.name},` : "dobrý den,";
  const intro =
    opts.kind === "admin-reset"
      ? "admin resetoval vaše heslo k portálu. Pro nastavení nového hesla klikněte níže."
      : "vyžádali jste si obnovu hesla. Pro nastavení nového hesla klikněte níže.";
  const body = `<p style="font-size:15px;line-height:1.6">${greeting}</p><p style="font-size:15px;line-height:1.6">${intro}</p>${button(url, "Nastavit nové heslo")}<p style="font-size:13px;color:#6F7672">Odkaz vyprší za 1 hodinu. Pokud jste si reset nevyžádali, ignorujte tento e-mail.</p>${fallbackLink(url)}`;
  await resend.emails.send({
    from: FROM,
    to: [opts.to],
    subject: opts.kind === "admin-reset" ? "Reset hesla — portál BOServices" : "Obnova hesla — portál BOServices",
    html: shell(
      opts.kind === "admin-reset" ? "Admin resetoval vaše heslo." : "Obnova hesla",
      "BOServices portál",
      body,
    ),
  });
}

// E-mail upozornění pro schvalovatele šablon (User.isTemplateApprover).
// Volá se ručně tlačítkem "Připomenout emailem" + automaticky cronem
// každý den ve 20:00 Prague time, pokud existují pending šablony.
export async function sendTemplateApprovalReminder(opts: {
  to: string;
  approverName?: string;
  pendingTemplates: Array<{ label: string; deepLink: string }>;
}): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.warn("[portal email] Resend not configured");
    return;
  }
  if (opts.pendingTemplates.length === 0) return;
  const url = `${SITE_URL}/portal/templates`;
  const greeting = opts.approverName ? `${opts.approverName},` : "dobrý den,";
  const list = opts.pendingTemplates
    .map(
      (t) =>
        `<li style="margin:6px 0"><a href="${t.deepLink}" style="color:#0E0E0E;font-weight:600">${t.label}</a></li>`,
    )
    .join("");
  const count = opts.pendingTemplates.length;
  const word = count === 1 ? "šablona" : count < 5 ? "šablony" : "šablon";
  const body = `<p style="font-size:15px;line-height:1.6">${greeting}</p><p style="font-size:15px;line-height:1.6">${count} ${word} čeká na vaše schválení. Bez schválení se na všech smlouvách, kde jsou tyto šablony použity, zobrazuje upozornění.</p><ul style="font-size:14px;line-height:1.6;padding-left:20px;margin:16px 0">${list}</ul>${button(url, "Otevřít šablony")}${fallbackLink(url)}`;
  await resend.emails.send({
    from: FROM,
    to: [opts.to],
    subject: `Schválení šablon - ${count} ${word} čekají`,
    html: shell(
      "Šablony čekají na schválení.",
      "BOServices portál",
      body,
    ),
  });
}

// E-mail upozornění schvalovateli, že konkrétní smlouva čeká na schválení
// (typy posuzované podle lokality). Spouští se ručně tlačítkem
// „Připomenout e-mailem" na detailu / v seznamu smluv.
export async function sendContractApprovalReminder(opts: {
  to: string;
  approverName?: string;
  contractLabel: string;
  reason: string;
  deepLink: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.warn("[portal email] Resend not configured");
    return;
  }
  const greeting = opts.approverName ? `${opts.approverName},` : "dobrý den,";
  const body = `<p style="font-size:15px;line-height:1.6">${greeting}</p><p style="font-size:15px;line-height:1.6">Smlouva <strong>${opts.contractLabel}</strong> čeká na vaše schválení.</p><p style="font-size:14px;line-height:1.6;color:#6F7672">${opts.reason}</p>${button(opts.deepLink, "Otevřít smlouvu")}${fallbackLink(opts.deepLink)}`;
  await resend.emails.send({
    from: FROM,
    to: [opts.to],
    subject: `Smlouva čeká na schválení - ${opts.contractLabel}`,
    html: shell("Smlouva čeká na schválení.", "BOServices portál", body),
  });
}

// Denní souhrn pro schvalovatele - seznam všech smluv ve stavu Ke schválení.
// Volá cron každý den v 8:00 (Prague), pokud existují čekající smlouvy.
export async function sendContractsApprovalDigest(opts: {
  to: string;
  approverName?: string;
  contracts: Array<{ label: string; deepLink: string }>;
}): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.warn("[portal email] Resend not configured");
    return;
  }
  if (opts.contracts.length === 0) return;
  const url = `${SITE_URL}/portal/contracts`;
  const greeting = opts.approverName ? `${opts.approverName},` : "dobrý den,";
  const list = opts.contracts
    .map(
      (c) =>
        `<li style="margin:6px 0"><a href="${c.deepLink}" style="color:#0E0E0E;font-weight:600">${c.label}</a></li>`,
    )
    .join("");
  const count = opts.contracts.length;
  const word = count === 1 ? "smlouva" : count < 5 ? "smlouvy" : "smluv";
  const verb = count === 1 ? "čeká" : "čekají";
  const body = `<p style="font-size:15px;line-height:1.6">${greeting}</p><p style="font-size:15px;line-height:1.6">${count} ${word} ${verb} na vaše schválení. Bez schválení se nedostanou dál do podpisu.</p><ul style="font-size:14px;line-height:1.6;padding-left:20px;margin:16px 0">${list}</ul>${button(url, "Otevřít smlouvy")}${fallbackLink(url)}`;
  await resend.emails.send({
    from: FROM,
    to: [opts.to],
    subject: `Smlouvy ke schválení - ${count} ${word} ${verb}`,
    html: shell("Smlouvy čekají na schválení.", "BOServices portál", body),
  });
}
