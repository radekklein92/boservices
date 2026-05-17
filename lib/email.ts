import { Resend } from "resend";
import type { Lead } from "./redis";

let cached: Resend | null = null;

function getResend(): Resend | null {
  if (cached) return cached;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  cached = new Resend(key);
  return cached;
}

const FROM =
  process.env.FROM_EMAIL ?? "BOServices <onboarding@resend.dev>";
const NOTIFY = process.env.NOTIFY_EMAIL ?? "klein@wearetwist.com";

export async function notifyLead(lead: Lead): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  const subject = `Nová poptávka - ${lead.company ?? lead.name}`;
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0E0E0E">
      <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#6F7672">BOServices · nový lead</div>
      <h1 style="font-size:24px;font-weight:800;letter-spacing:-.02em;margin:6px 0 24px">${escapeHtml(
        lead.company ?? lead.name,
      )}</h1>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <tr><td style="padding:6px 0;color:#6F7672;width:120px">Jméno</td><td>${escapeHtml(lead.name)}</td></tr>
        <tr><td style="padding:6px 0;color:#6F7672">E-mail</td><td><a href="mailto:${encodeURIComponent(lead.email)}" style="color:#0E0E0E">${escapeHtml(lead.email)}</a></td></tr>
        ${lead.company ? `<tr><td style="padding:6px 0;color:#6F7672">Společnost</td><td>${escapeHtml(lead.company)}</td></tr>` : ""}
        <tr><td style="padding:6px 0;color:#6F7672">Jazyk</td><td>${escapeHtml(lead.locale)}</td></tr>
        <tr><td style="padding:6px 0;color:#6F7672">Čas</td><td>${escapeHtml(lead.createdAt)}</td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #E8ECE9;margin:24px 0"/>
      <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#6F7672;margin-bottom:8px">Zpráva</div>
      <div style="font-size:15px;line-height:1.55;white-space:pre-wrap">${escapeHtml(lead.message)}</div>
    </div>
  `;

  await resend.emails.send({
    from: FROM,
    to: [NOTIFY],
    subject,
    replyTo: lead.email,
    html,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
