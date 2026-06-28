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
import { downloadSignedPdf, getEnvelope } from "@/lib/portal/digisign";
import { getRedis } from "@/lib/redis";
import { bustContracts } from "@/lib/portal/revalidate";
import { ensureContractFeeTerms } from "@/lib/portal/contract-fee-ai";

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

// Best-effort: e-mail recipienta z payloadu. Když chybí, doptá se getEnvelope().
function findRecipientEmail(body: Body): string | null {
  const rec = body.recipient as Record<string, unknown> | undefined;
  if (rec && typeof rec.email === "string") return rec.email;
  const data = body.data as Record<string, unknown> | undefined;
  const dataRec = data?.recipient as Record<string, unknown> | undefined;
  if (dataRec && typeof dataRec.email === "string") return dataRec.email;
  return null;
}

function isRecipientSignedEvent(event: string | undefined): boolean {
  if (!event) return false;
  const e = event.toLowerCase();
  return e.includes("recipient") && e.includes("signed");
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

  // Stale-envelope guard: event patří jiné (staré/zrušené) obálce než aktuální -
  // bez něj by eventy po opakovaném odeslání přepsaly stav. (Převzato z Clamory.)
  if (contract.digisignEnvelopeId && contract.digisignEnvelopeId !== envelopeId) {
    return NextResponse.json({ ok: true, ignored: "stale-envelope", envelopeId });
  }

  // Idempotence: z finálního stavu (signed) už neměníme.
  if (contract.digisignStatus === "signed") {
    return NextResponse.json({ ok: true, ignored: "already-signed" });
  }

  const now = new Date().toISOString();

  // ── Mezistav: některý recipient podepsal (před envelope.completed) ──
  // Zaznamenáme KDO: klient → digisignClientSignedAt (informativní, status zůstává
  // „k-podpisu"); BOS → signedAt + status „podepsano-bos". Vlastní idempotence,
  // protože status „sent" se opakuje pro oba podpisy (obecný no-change guard by
  // druhý podpis spolkl).
  if (isRecipientSignedEvent(eventName ?? undefined)) {
    let email = findRecipientEmail(body);
    if (!email) {
      try {
        const env = await getEnvelope(envelopeId);
        const signed = (env.recipients ?? []).filter(
          (r) =>
            !!r.signedAt ||
            (r.status ?? "").toLowerCase().includes("signed") ||
            (r.status ?? "").toLowerCase() === "completed",
        );
        if (signed.length === 1) email = signed[0]!.email;
      } catch (err) {
        console.warn("[digisign/webhook] getEnvelope pro recipienta selhal:", err);
      }
    }
    const e = (email ?? "").trim().toLowerCase();
    const clientEmail = (contract.variables?.clientEmail ?? "").trim().toLowerCase();
    const bosEmail = (contract.signerEmail ?? "").trim().toLowerCase();

    const updated: Contract = { ...contract, digisignStatus: "sent", updatedAt: now };
    let signedParty: "client" | "bos" | "unknown" = "unknown";
    if (e && clientEmail && e === clientEmail) {
      if (contract.digisignClientSignedAt) {
        return NextResponse.json({ ok: true, ignored: "client-already-signed" });
      }
      updated.digisignClientSignedAt = now;
      signedParty = "client";
    } else if (e && bosEmail && e === bosEmail) {
      if (contract.signedAt) {
        return NextResponse.json({ ok: true, ignored: "bos-already-signed" });
      }
      updated.signedAt = now;
      updated.signedBy = "DigiSign";
      updated.status = computeContractStatus(updated);
      signedParty = "bos";
    } else if (contract.digisignStatus === "sent") {
      // Neznámý recipient a stav už „sent" - nic nového.
      return NextResponse.json({ ok: true, ignored: "recipient-unrecognized" });
    }

    await upsertContract(updated);
    bustContracts();
    return NextResponse.json({ ok: true, status: "sent", signedParty });
  }

  // Obecná idempotence pro ne-recipient eventy (declined/voided/sent/completed).
  if (contract.digisignStatus === newStatus) {
    return NextResponse.json({ ok: true, ignored: "no-change" });
  }

  const updated: Contract = { ...contract, digisignStatus: newStatus, updatedAt: now };

  if (newStatus === "signed") {
    // Stáhnout podepsané PDF a uložit jako sken (privátní blob - stahuje se přes
    // /download/scan). Doplnit oba podpisy -> status archivováno.
    try {
      const pdf = await downloadSignedPdf(envelopeId);
      const path = `portal/contracts/${contract.id}/scans/${Date.now()}-${contract.type}-podepsano.pdf`;
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
    // Vlastní e-mail neposíláme - DigiSign rozesílá podepsaným stranám vlastní
    // notifikaci o dokončení automaticky.
  }

  await upsertContract(updated);
  bustContracts();

  // Po dokončení podpisu (klient i BOS) vytáhnout poplatky ze smlouvy (AI) -
  // jen approval-gated typy, idempotentní a best-effort (selhání nezablokuje
  // webhook, uloží feeTermsError, cron/tlačítko zkusí znovu).
  if (newStatus === "signed") {
    await ensureContractFeeTerms(updated);
  }

  return NextResponse.json({ ok: true, status: newStatus });
}
