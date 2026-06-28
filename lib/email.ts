import { Resend } from "resend";
import type { Lead } from "./redis";
import { formatCzkRounded } from "./portal/claims";

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

// Notifikace adminům, že obchodník nahrál fakturu k výběru provize.
export async function notifyPayoutInvoice(opts: {
  merchantName: string;
  amount: number; // bez DPH
  variableSymbol: string;
  customerName: string;
  aiOk: boolean;
  aiNote?: string;
  invoicePdf?: Buffer; // nahraná faktura - přiloží se k e-mailu (admin ověří ručně)
  invoiceFilename?: string;
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  const subject = `Faktura k provizi - ${opts.merchantName} (VS ${opts.variableSymbol})`;
  const aiLine = opts.aiOk
    ? "AI kontrola: VS a částka sedí."
    : `Pozor - ${escapeHtml(opts.aiNote ?? "AI kontrola neproběhla, ověřte ručně.")}`;
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0E0E0E">
      <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#6F7672">BOServices · faktura k provizi</div>
      <h1 style="font-size:22px;font-weight:800;letter-spacing:-.02em;margin:6px 0 24px">${escapeHtml(opts.merchantName)}</h1>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <tr><td style="padding:6px 0;color:#6F7672;width:160px">Částka (bez DPH)</td><td>${escapeHtml(formatCzkRounded(opts.amount))}</td></tr>
        <tr><td style="padding:6px 0;color:#6F7672">Variabilní symbol</td><td>${escapeHtml(opts.variableSymbol)}</td></tr>
        <tr><td style="padding:6px 0;color:#6F7672">Odběratel</td><td>${escapeHtml(opts.customerName)}</td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #E8ECE9;margin:20px 0"/>
      <div style="font-size:13.5px;line-height:1.55;color:#2A2A2A">${aiLine}</div>
      <div style="font-size:13px;line-height:1.55;color:#6F7672;margin-top:12px">Fakturu můžete zadat k úhradě v portálu (Provize → Spravovat).</div>
    </div>
  `;

  const attachments = opts.invoicePdf
    ? [
        {
          filename:
            opts.invoiceFilename ??
            `faktura-${opts.variableSymbol.replace(/\//g, "-")}.pdf`,
          content: opts.invoicePdf,
        },
      ]
    : undefined;

  await resend.emails.send({ from: FROM, to: [NOTIFY], subject, html, attachments });
}

// Notifikace obchodníkovi (vlastníkovi výběru), že se změnil stav jeho výběru
// provize - typicky když admin zadá k úhradě nebo označí jako uhrazené.
export async function notifyPayoutStatus(opts: {
  to: string; // e-mail obchodníka
  amount: number; // bez DPH
  variableSymbol: string;
  statusLabel: string;
  paid: boolean; // true = stav "uhrazeno"
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  const subject = `Výběr provize: ${opts.statusLabel} - VS ${opts.variableSymbol}`;
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0E0E0E">
      <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#6F7672">BOServices · výběr provize</div>
      <h1 style="font-size:22px;font-weight:800;letter-spacing:-.02em;margin:6px 0 24px">${escapeHtml(opts.statusLabel)}</h1>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <tr><td style="padding:6px 0;color:#6F7672;width:160px">Stav</td><td>${escapeHtml(opts.statusLabel)}</td></tr>
        <tr><td style="padding:6px 0;color:#6F7672">Částka (bez DPH)</td><td>${escapeHtml(formatCzkRounded(opts.amount))}</td></tr>
        <tr><td style="padding:6px 0;color:#6F7672">Variabilní symbol</td><td>${escapeHtml(opts.variableSymbol)}</td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #E8ECE9;margin:20px 0"/>
      <div style="font-size:13.5px;line-height:1.55;color:#2A2A2A">${
        opts.paid
          ? "Vaše provize byla označena jako uhrazená."
          : "Stav vašeho výběru provize se změnil."
      }</div>
      <div style="font-size:13px;line-height:1.55;color:#6F7672;margin-top:12px">Detail najdete v portálu (Provize).</div>
    </div>
  `;

  await resend.emails.send({ from: FROM, to: [opts.to], subject, html });
}

// Notifikace adminovi: výběry provize, které "visí" ve stavu Zadáno k úhradě
// déle než 48 h, aniž by je někdo označil jako uhrazené. Cron opakuje à 48 h.
export async function notifyPayoutOverdue(
  items: {
    merchantName: string;
    amount: number; // bez DPH
    variableSymbol: string;
    queuedSince: string; // ISO - od kdy je ve stavu Zadáno k úhradě
  }[],
): Promise<void> {
  const resend = getResend();
  if (!resend || items.length === 0) return;

  const subject =
    items.length === 1
      ? `Čeká na úhradu >48 h - ${items[0]!.merchantName} (VS ${items[0]!.variableSymbol})`
      : `${items.length} výběry provize čekají na úhradu déle než 48 h`;

  const rows = items
    .map(
      (it) => `
        <tr>
          <td style="padding:8px 0;border-top:1px solid #E8ECE9">${escapeHtml(it.merchantName)} <span style="color:#6F7672">· VS ${escapeHtml(it.variableSymbol)}</span><br/><span style="font-size:12px;color:#6F7672">od ${escapeHtml(it.queuedSince.slice(0, 10))}</span></td>
          <td style="padding:8px 0;border-top:1px solid #E8ECE9;text-align:right;white-space:nowrap;vertical-align:top">${escapeHtml(formatCzkRounded(it.amount))}</td>
        </tr>`,
    )
    .join("");

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0E0E0E">
      <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#6F7672">BOServices · čeká na úhradu</div>
      <h1 style="font-size:22px;font-weight:800;letter-spacing:-.02em;margin:6px 0 16px">Zadáno k úhradě déle než 48 hodin</h1>
      <div style="font-size:14px;line-height:1.55;color:#2A2A2A;margin-bottom:16px">Následující výběry provize jsou ve stavu „Zadáno k úhradě" víc než 48 hodin a nikdo je neoznačil jako uhrazené:</div>
      <table style="border-collapse:collapse;width:100%;font-size:14px">${rows}</table>
      <hr style="border:none;border-top:1px solid #E8ECE9;margin:20px 0"/>
      <div style="font-size:13px;line-height:1.55;color:#6F7672">Připomínka se opakuje každých 48 h, dokud stav nezměníte na „Uhrazeno". Portál → Provize → Spravovat.</div>
    </div>
  `;

  await resend.emails.send({ from: FROM, to: [NOTIFY], subject, html });
}

// Notifikace adminovi: RE agent klikl v Telegramu na „Problém" u lokality —
// převod nájemní smlouvy vázne a potřebuje pozornost. Posílá se na NOTIFY.
export async function notifyLocationProblem(opts: {
  locationName: string;
  locationCode: string | null;
  clientName: string | null;
  agent: string;
  leaseCurrentLabel: string;
  leaseTargetLabel: string;
  at: string; // ISO
}): Promise<void> {
  const resend = getResend();
  if (!resend) return;

  const codePart = opts.locationCode ? ` (${opts.locationCode})` : "";
  const subject = `Problém s nájmem - ${opts.locationName}${codePart}`;
  const when = new Date(opts.at).toLocaleString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0E0E0E">
      <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#B42318">BOServices · problém s nájmem</div>
      <h1 style="font-size:22px;font-weight:800;letter-spacing:-.02em;margin:6px 0 24px">${escapeHtml(opts.locationName)}${escapeHtml(codePart)}</h1>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <tr><td style="padding:6px 0;color:#6F7672;width:160px">Nahlásil</td><td>${escapeHtml(opts.agent)}</td></tr>
        <tr><td style="padding:6px 0;color:#6F7672">Klient</td><td>${escapeHtml(opts.clientName || "-")}</td></tr>
        <tr><td style="padding:6px 0;color:#6F7672">Nájem aktuálně</td><td>${escapeHtml(opts.leaseCurrentLabel)}</td></tr>
        <tr><td style="padding:6px 0;color:#6F7672">Nájem cílově</td><td>${escapeHtml(opts.leaseTargetLabel)}</td></tr>
        <tr><td style="padding:6px 0;color:#6F7672">Čas</td><td>${escapeHtml(when)}</td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #E8ECE9;margin:20px 0"/>
      <div style="font-size:13.5px;line-height:1.55;color:#2A2A2A">RE agent označil převod nájemní smlouvy na této lokalitě jako problémový. Detail a historie hlášení jsou v portálu.</div>
      <div style="font-size:13px;line-height:1.55;color:#6F7672;margin-top:12px">Portál → Real Estate.</div>
    </div>
  `;

  await resend.emails.send({ from: FROM, to: [NOTIFY], subject, html });
}

// Notifikace adminovi: pokladny (DW shops) bez napárované prodejny. Posílá se na
// NOTIFY, když denní cron (nebo admin na vyžádání) najde nenapárované pokladny.
export async function notifyUnpairedShops(
  items: {
    name: string;
    cloudId: string | null; // číslo cloudu (Dotykačka), null u Trdlokafe
    brandName: string;
  }[],
  opts: { pairingUrl: string } = { pairingUrl: "https://www.boservices.cz/portal/admin/pos-pairing" },
): Promise<void> {
  const resend = getResend();
  if (!resend || items.length === 0) return;

  const subject =
    items.length === 1
      ? `Nenapárovaná pokladna - ${items[0]!.name}`
      : `${items.length} nenapárovaných pokladen`;

  const rows = items
    .map(
      (it) => `
        <tr>
          <td style="padding:8px 0;border-top:1px solid #E8ECE9">${escapeHtml(it.name)}<br/><span style="font-size:12px;color:#6F7672">${escapeHtml(it.brandName)}</span></td>
          <td style="padding:8px 0;border-top:1px solid #E8ECE9;text-align:right;white-space:nowrap;vertical-align:top;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px">${it.cloudId ? "Cloud " + escapeHtml(it.cloudId) : "<span style='color:#6F7672'>bez cloudu</span>"}</td>
        </tr>`,
    )
    .join("");

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0E0E0E">
      <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#B42318">BOServices · párování pokladen</div>
      <h1 style="font-size:22px;font-weight:800;letter-spacing:-.02em;margin:6px 0 16px">${items.length} ${items.length === 1 ? "pokladna nemá" : items.length < 5 ? "pokladny nemají" : "pokladen nemá"} prodejnu</h1>
      <div style="font-size:14px;line-height:1.55;color:#2A2A2A;margin-bottom:16px">Následující pokladny z pokladního systému zatím nejsou napárované na žádnou prodejnu (a nejsou ignorované):</div>
      <table style="border-collapse:collapse;width:100%;font-size:14px">${rows}</table>
      <hr style="border:none;border-top:1px solid #E8ECE9;margin:20px 0"/>
      <div style="font-size:13px;line-height:1.55;color:#6F7672">Napárovat je můžete v portálu: <a href="${escapeHtml(opts.pairingUrl)}" style="color:#0E0E0E">Párování pokladen</a>.</div>
    </div>
  `;

  await resend.emails.send({ from: FROM, to: [NOTIFY], subject, html });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
