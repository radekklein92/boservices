import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { put } from "@vercel/blob";
import {
  computeContractStatus,
  getContract,
  getContractIdByEnvelope,
  upsertContract,
  type Contract,
} from "@/lib/portal/contracts-db";
import { downloadSignedPdf } from "@/lib/portal/digisign";
import { sendNdaSignedEmail } from "@/lib/portal/email";
import { getRedis } from "@/lib/redis";
import { bustContracts } from "@/lib/portal/revalidate";

export const runtime = "nodejs";
export const maxDuration = 60;

// DigiSign webhook (envelope/recipient eventy). Payload viz Franšízárna - top-level
// `id` je ID UDÁLOSTI, envelopeId hledáme v envelope.id / data.envelope.id / entityId.
type Body = Record<string, unknown>;

function findEnvelopeId(body: Body): string | null {
  const env = body.envelope as Record<string, unknown> | undefined;
  if (env && typeof env.id === "string") return env.id;
  const data = body.data as Record<string, unknown> | undefined;
  const dataEnv = data?.envelope as Record<string, unknown> | undefined;
  if (dataEnv && typeof dataEnv.id === "string") return dataEnv.id;
  if (body.entityName === "envelope" && typeof body.entityId === "string") {
    return body.entityId;
  }
  return null;
}

function findEventName(body: Body): string | null {
  for (const key of ["name", "event", "type", "eventType", "action"]) {
    const v = body[key];
    if (typeof v === "string" && v.length) return v;
  }
  return null;
}

function verifySecret(req: NextRequest): boolean {
  const expected = process.env.DIGISIGN_WEBHOOK_SECRET;
  if (!expected) {
    console.warn("[digisign/webhook] DIGISIGN_WEBHOOK_SECRET nenastaven, přijímám bez ověření");
    return true;
  }
  const provided =
    req.nextUrl.searchParams.get("secret") || req.headers.get("x-digisign-secret");
  if (!provided) return false;
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// DigiSign event -> náš digisign status. recipient.signed = mezistav, finální až
// envelope.completed.
type DsStatus = "sent" | "signed" | "declined" | "voided";
function mapEvent(event: string | undefined): DsStatus | null {
  if (!event) return null;
  const e = event.toLowerCase();
  if (e.includes("recipient") && e.includes("signed")) return "sent";
  if (e.includes("completed")) return "signed";
  if (e.includes("declined") || e.includes("rejected")) return "declined";
  if (e.includes("voided") || e.includes("cancel")) return "voided";
  if (e.includes("delivered") || e.includes("opened") || e.includes("viewed")) return "sent";
  if (e.includes("sent")) return "sent";
  if (e.includes("signed")) return "signed";
  return null;
}

export async function POST(req: NextRequest) {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const raw = await req.text();
  let body: Body;
  try {
    body = JSON.parse(raw) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Defenzivní log do Redisu (posledních 50) pro debug.
  try {
    const r = getRedis();
    if (r) {
      await r.lpush(
        "portal:digisign:webhook:log",
        JSON.stringify({ receivedAt: new Date().toISOString(), body }),
      );
      await r.ltrim("portal:digisign:webhook:log", 0, 49);
    }
  } catch {
    /* ignore */
  }

  const envelopeId = findEnvelopeId(body);
  const eventName = findEventName(body);
  if (!envelopeId) {
    return NextResponse.json({ ok: true, ignored: "no-envelope-id" });
  }

  const contractId = await getContractIdByEnvelope(envelopeId);
  if (!contractId) {
    return NextResponse.json({ ok: true, ignored: "unknown-envelope", envelopeId });
  }
  const contract = await getContract(contractId);
  if (!contract) {
    return NextResponse.json({ ok: true, ignored: "contract-deleted" });
  }

  const newStatus = mapEvent(eventName ?? undefined);
  if (!newStatus) {
    return NextResponse.json({ ok: true, ignored: "unmapped-event", eventName });
  }

  // Idempotence: z finálního stavu (signed) už neměníme, no-op stavy ignorujeme.
  if (contract.digisignStatus === "signed") {
    return NextResponse.json({ ok: true, ignored: "already-signed" });
  }
  if (contract.digisignStatus === newStatus) {
    return NextResponse.json({ ok: true, ignored: "no-change" });
  }

  const now = new Date().toISOString();
  const updated: Contract = { ...contract, digisignStatus: newStatus, updatedAt: now };

  if (newStatus === "signed") {
    // Stáhnout podepsané PDF a uložit jako sken (privátní blob - stahuje se přes
    // /download/scan). Doplnit oba podpisy -> status archivováno.
    try {
      const pdf = await downloadSignedPdf(envelopeId);
      const path = `portal/contracts/${contract.id}/scans/${Date.now()}-nda-podepsano.pdf`;
      const uploaded = await put(path, pdf, {
        access: "private",
        contentType: "application/pdf",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      updated.scanPdfUrl = uploaded.url;
      updated.scanPdfPath = uploaded.pathname;
      updated.scanUploadedAt = now;
      updated.scanUploadedBy = "DigiSign";
    } catch (e) {
      console.error("[digisign/webhook] stažení/uložení podepsaného PDF selhalo:", e);
    }
    if (!updated.signedAt) {
      updated.signedAt = now;
      updated.signedBy = "DigiSign";
    }
    if (!updated.clientSignedAt) {
      updated.clientSignedAt = now;
      updated.clientSignedBy = "DigiSign";
    }
    updated.status = computeContractStatus(updated);

    // Notifikace zakladateli (best-effort).
    try {
      const to = contract.digisignSentBy || contract.createdBy;
      if (to) {
        await sendNdaSignedEmail({
          to,
          clientName: contract.clientName,
          number: contract.number,
          contractId: contract.id,
        });
      }
    } catch (e) {
      console.warn("[digisign/webhook] notifikační e-mail selhal:", e);
    }
  }

  await upsertContract(updated);
  bustContracts();
  return NextResponse.json({ ok: true, status: newStatus });
}
