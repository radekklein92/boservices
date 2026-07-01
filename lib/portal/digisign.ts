// DigiSign REST API client (https://api.digisign.org).
// Dokumentace: https://help.digisign.org/cs/articles/9766040-zakladni-pouziti-rest-api
//
// Přeneseno z projektu Franšízárna. Env (samostatný DigiSign účet pro BOServices):
//   DIGISIGN_ACCESS_KEY, DIGISIGN_SECRET_KEY, DIGISIGN_BASE_URL,
//   DIGISIGN_BRANDING_ID (volitelně), DIGISIGN_WEBHOOK_SECRET (pro webhook).
//
// Hlavní funkce:
//   - sendForSigning() - end-to-end: file → envelope → recipients → tags → send
//   - getEnvelope(envelopeId), downloadSignedPdf(envelopeId), cancelEnvelope(...)

const BASE_URL = process.env.DIGISIGN_BASE_URL || "https://api.staging.digisign.org";

// Normalizace telefonu na E.164 (DigiSign vyžaduje mobile u role signer).
//   "+420 724 855 719" → "+420724855719"; "724855719" → "+420724855719" (ČR default)
function normalizeMobile(input: string): string {
  const cleaned = input.replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (/^420\d{9}$/.test(cleaned) || /^421\d{9}$/.test(cleaned)) return `+${cleaned}`;
  if (/^\d{9}$/.test(cleaned)) return `+420${cleaned}`;
  return cleaned;
}

interface CachedToken {
  token: string;
  exp: number; // unix seconds
}
let cached: CachedToken | null = null;

async function getAccessToken(): Promise<string> {
  const accessKey = process.env.DIGISIGN_ACCESS_KEY;
  const secretKey = process.env.DIGISIGN_SECRET_KEY;
  if (!accessKey || !secretKey) {
    throw new Error(
      "DIGISIGN_ACCESS_KEY a DIGISIGN_SECRET_KEY musí být nastaveny v .env",
    );
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (cached && cached.exp > nowSec + 60) return cached.token;

  const res = await fetch(`${BASE_URL}/api/auth-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessKey, secretKey }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`DigiSign auth selhala (${res.status}): ${txt}`);
  }
  const data = (await res.json()) as { token: string; exp: number };
  cached = { token: data.token, exp: data.exp };
  return data.token;
}

async function ds<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
    body,
    signal: init.signal ?? AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`DigiSign ${init.method ?? "GET"} ${path} → ${res.status}: ${txt}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.arrayBuffer()) as unknown as T;
}

interface UploadedFile {
  id: string;
  originalName: string;
}
async function uploadFile(buffer: Buffer, fileName: string): Promise<UploadedFile> {
  const token = await getAccessToken();
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(buffer)], { type: "application/pdf" }),
    fileName,
  );
  const res = await fetch(`${BASE_URL}/api/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`DigiSign upload selhal (${res.status}): ${txt}`);
  }
  return (await res.json()) as UploadedFile;
}

interface CreatedEnvelope {
  id: string;
  status: string;
}
interface CreatedDocument {
  id: string;
}
interface CreatedRecipient {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface DigiSignSigner {
  name: string;
  email: string;
  phone?: string | null;
  // Zástupný text (anchor) v PDF, na který se zakotví podpisové pole. DigiSign
  // ho najde a pole umístí přesně tam (správná stránka). Bez něj fallback na
  // vypočtené absolutní pozice na poslední stránce.
  placeholder?: string;
}

// Default DigiSign signature pole = 55 × 21 mm = 156 × 60 pt
export const SIGNATURE_TAG_WIDTH_PT = 156;
export const SIGNATURE_TAG_HEIGHT_PT = 60;

export interface SignatureTagPosition {
  page: number; // 1-based
  xPosition: number; // top-left origin
  yPosition: number;
}

// Bezpečné pozice podpisových polí na poslední stránce PDF (žádný anchor text).
export async function computeSignaturePositions(
  pdfBuffer: Buffer,
  signerCount: number,
): Promise<SignatureTagPosition[]> {
  const { PDFDocument } = await import("pdf-lib");
  const pdfDoc = await PDFDocument.load(
    pdfBuffer.buffer.slice(
      pdfBuffer.byteOffset,
      pdfBuffer.byteOffset + pdfBuffer.byteLength,
    ) as ArrayBuffer,
  );

  const pageCount = pdfDoc.getPageCount();
  const lastPageIndex = pageCount - 1;
  const lastPage = pdfDoc.getPage(lastPageIndex);
  const { width: pageWidth, height: pageHeight } = lastPage.getSize();

  const margin = 50;
  const colGap = 32;
  const rowGap = 18;
  const yBottom = pageHeight - SIGNATURE_TAG_HEIGHT_PT - margin;

  const positions: SignatureTagPosition[] = [];
  const cols = signerCount > 1 ? 2 : 1;
  const rows = Math.ceil(signerCount / cols);
  const colWidth = (pageWidth - 2 * margin - (cols - 1) * colGap) / cols;

  for (let i = 0; i < signerCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = margin + col * (colWidth + colGap);
    const y = yBottom - (rows - 1 - row) * (SIGNATURE_TAG_HEIGHT_PT + rowGap);
    positions.push({
      page: lastPageIndex + 1,
      xPosition: Math.round(x),
      yPosition: Math.round(Math.max(0, y)),
    });
  }
  return positions;
}

export interface SendForSigningArgs {
  pdfBuffer: Buffer;
  fileName: string;
  envelopeName: string;
  emailSubject: string;
  emailBody: string; // HTML
  emailBodyCompleted?: string; // HTML
  signers: DigiSignSigner[];
}

export interface SendForSigningResult {
  envelopeId: string;
  documentId: string;
  recipients: CreatedRecipient[];
}

export async function sendForSigning(
  args: SendForSigningArgs,
): Promise<SendForSigningResult> {
  const file = await uploadFile(args.pdfBuffer, args.fileName);

  // Branding se posílá jako samotné UUID, NE jako IRI (IRI hází 'Invalid IRI').
  const brandingId = process.env.DIGISIGN_BRANDING_ID?.trim();
  const envelope = await ds<CreatedEnvelope>("/api/envelopes", {
    method: "POST",
    json: {
      name: args.envelopeName,
      emailSubject: args.emailSubject,
      emailBody: args.emailBody,
      emailBodyCompleted: args.emailBodyCompleted ?? args.emailBody,
      ...(brandingId ? { branding: brandingId } : {}),
    },
  });

  const doc = await ds<CreatedDocument>(
    `/api/envelopes/${envelope.id}/documents`,
    { method: "POST", json: { file: `/api/files/${file.id}`, name: args.envelopeName } },
  );

  // DigiSign u role 'signer' VYŽADUJE 'mobile' (jinak 'This value should not be blank').
  const recipients: CreatedRecipient[] = [];
  for (const signer of args.signers) {
    if (!signer.phone || !signer.phone.trim()) {
      throw new Error(
        `Signatář ${signer.name} (${signer.email}) nemá vyplněný telefon, ` +
          `který DigiSign vyžaduje pro odeslání obálky.`,
      );
    }
    const r = await ds<CreatedRecipient>(
      `/api/envelopes/${envelope.id}/recipients`,
      {
        method: "POST",
        json: {
          role: "signer",
          name: signer.name,
          email: signer.email,
          mobile: normalizeMobile(signer.phone),
        },
      },
    );
    recipients.push(r);
  }

  // Umístění podpisového pole: primárně přes zástupný text (anchor) - DigiSign
  // ho najde v PDF a pole položí přesně na něj (bottom_left = anchor je v levém
  // dolním rohu pole, pole roste nahoru nad kotvu). Bez anchoru fallback na
  // vypočtené absolutní pozice na poslední stránce.
  const needPositions = args.signers.some((s) => !s.placeholder);
  const positions = needPositions
    ? await computeSignaturePositions(args.pdfBuffer, args.signers.length)
    : [];
  for (let i = 0; i < args.signers.length; i++) {
    const recipient = recipients[i]!;
    const signer = args.signers[i]!;
    const placement = signer.placeholder
      ? { placeholder: signer.placeholder, positioning: "bottom_left" }
      : {
          page: positions[i]!.page,
          xPosition: positions[i]!.xPosition,
          yPosition: positions[i]!.yPosition,
        };
    await ds(`/api/envelopes/${envelope.id}/tags`, {
      method: "POST",
      json: {
        document: `/api/envelopes/${envelope.id}/documents/${doc.id}`,
        recipient: `/api/envelopes/${envelope.id}/recipients/${recipient.id}`,
        type: "signature",
        ...placement,
      },
    });
  }

  await ds(`/api/envelopes/${envelope.id}/send`, { method: "POST" });

  return { envelopeId: envelope.id, documentId: doc.id, recipients };
}

interface EnvelopeStatus {
  id: string;
  status: string; // draft | sent | completed | declined | voided | expired
  recipients?: Array<{ id: string; email: string; status: string; signedAt?: string }>;
}

export async function getEnvelope(envelopeId: string): Promise<EnvelopeStatus> {
  return ds<EnvelopeStatus>(`/api/envelopes/${envelopeId}`);
}

export async function downloadSignedPdf(envelopeId: string): Promise<Buffer> {
  const token = await getAccessToken();
  const url = `${BASE_URL}/api/envelopes/${envelopeId}/download?output=combined&include_log=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`DigiSign download selhal (${res.status}): ${txt}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

// Zruší odeslanou obálku (musí být 'sent'/'correction', draft nelze).
export async function cancelEnvelope(envelopeId: string, reason: string): Promise<void> {
  await ds(`/api/envelopes/${envelopeId}/cancel`, { method: "POST", json: { reason } });
}
