import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/portal/auth-guard";
import {
  backfillToStatus,
  computeContractStatus,
  getContract,
  upsertContract,
} from "@/lib/portal/contracts-db";
import { getUser } from "@/lib/portal/users-db";
import { isApprovalGated } from "@/lib/portal/contract-types";
import { evaluateApprovalForContract } from "@/lib/portal/contract-approval";
import { getLocation, toLocationSnapshot } from "@/lib/portal/locations-db";
import { bustContracts } from "@/lib/portal/revalidate";

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  action: z.enum(["submit", "approve", "pick-signer", "signed", "client-signed"]),
  // Vyžadováno jen pro action=pick-signer (pokud není keepOriginal).
  signerEmail: z.string().trim().toLowerCase().email().optional(),
  // pick-signer: „zachovat původního" - nenastaví signerEmail.
  keepOriginal: z.boolean().optional(),
  // action=client-signed: datum podpisu klienta (kotva pro poplatky). Bez něj = dnes.
  signedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export async function POST(req: Request) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Neplatný vstup." },
      { status: 400 },
    );
  }

  const { ids, action, signerEmail, keepOriginal, signedAt } = parsed.data;
  const email = g.session.user!.email!;
  const nowIso = new Date().toISOString();
  // Datum podpisu klienta (kotva pro poplatky); poledne UTC proti TZ posunu. Bez něj = dnes.
  const clientSignedAnchor = signedAt ? `${signedAt}T12:00:00.000Z` : nowIso;

  // Pro action=approve si načteme aktuálního uživatele - u typů posuzovaných
  // podle lokality smí hromadně schvalovat jen schvalovatel šablon.
  const me = action === "approve" ? await getUser(email) : null;

  // Pro pick-signer si načteme usera předem (jeden lookup pro všech N smluv).
  // U „zachovat původního" (keepOriginal) žádného signera nehledáme.
  let signer: Awaited<ReturnType<typeof getUser>> = null;
  if (action === "pick-signer" && !keepOriginal) {
    if (!signerEmail) {
      return NextResponse.json(
        { ok: false, error: "Chybí email podepisujícího." },
        { status: 400 },
      );
    }
    signer = await getUser(signerEmail);
    if (!signer || !signer.isSigner || !signer.signerFunction) {
      return NextResponse.json(
        { ok: false, error: "Vybraný uživatel není podepisující." },
        { status: 400 },
      );
    }
  }

  let changed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const id of ids) {
    const contract = await getContract(id);
    if (!contract) {
      errors.push(`${id}: nenalezeno`);
      continue;
    }

    if (action === "submit") {
      // Odeslání z Konceptu ke schválení (jen typy posuzované podle lokality
      // s vybranou lokalitou). Splní-li klíč vše, projde rovnou do Schváleno,
      // jinak do Ke schválení (s důvody). Ostatní smlouvy se přeskočí.
      if (
        !isApprovalGated(contract.type) ||
        contract.status !== "koncept" ||
        !contract.locationId ||
        !contract.locationSnapshot
      ) {
        skipped++;
        continue;
      }
      // Vyhodnocení proti aktuálním datům z Transition (smlouva je v konceptu):
      // čerstvě obnovíme snapshot lokality z živého zrcadla.
      const loc = await getLocation(contract.locationId);
      const base = loc
        ? { ...contract, locationSnapshot: toLocationSnapshot(loc, nowIso) }
        : contract;
      const nc = loc?.local?.newco;
      const newco = nc
        ? { inFile: true, entitaCeip1: nc.entitaCeip1, operationalType: nc.operationalType }
        : null;
      const { auto, reasons } = evaluateApprovalForContract(base, newco);
      const updated = {
        ...base,
        submittedForApprovalAt: nowIso,
        submittedForApprovalBy: email,
        ...(auto
          ? {
              approvalDecision: "auto" as const,
              approvedAt: nowIso,
              approvedBy: email,
            }
          : {
              approvalDecision: "manual" as const,
              approvalReasons: reasons.map((r) => r.label),
            }),
        updatedAt: nowIso,
      };
      updated.status = computeContractStatus(updated);
      await upsertContract(updated);
      changed++;
      continue;
    }

    if (action === "approve") {
      if (contract.approvedAt) {
        skipped++;
        continue;
      }
      // Typy posuzované podle lokality: hromadně schválit lze jen smlouvu ve
      // stavu Ke schválení a jen schvalovatelem šablon.
      const gated = isApprovalGated(contract.type);
      if (gated && (contract.status !== "ke-schvaleni" || !me?.isTemplateApprover)) {
        skipped++;
        continue;
      }
      const updated = {
        ...contract,
        ...(gated ? { approvalDecision: "manual" as const } : {}),
        approvedAt: nowIso,
        approvedBy: email,
        updatedAt: nowIso,
      };
      updated.status = computeContractStatus(updated);
      await upsertContract(updated);
      changed++;
      continue;
    }

    if (action === "pick-signer") {
      // Vyžaduje, aby byla smlouva už schválená. Pokud není, automaticky
      // doplníme approvedAt (admin v jednom kroku schvaluje + pickuje).
      const updated = {
        ...contract,
        approvedAt: contract.approvedAt ?? nowIso,
        approvedBy: contract.approvedBy ?? email,
        // keepOriginal -> nech zástupce ze smlouvy (signerEmail prázdné).
        signerEmail: keepOriginal ? undefined : signer!.email,
        signerPickedAt: contract.signerPickedAt ?? nowIso,
        signerPickedBy: email,
        updatedAt: nowIso,
      };
      updated.status = computeContractStatus(updated);
      await upsertContract(updated);
      changed++;
      continue;
    }

    if (action === "signed") {
      if (contract.signedAt) {
        skipped++;
        continue;
      }
      // Dorovná předchozí milníky podle FLOW daného typu (postoupení má pořadí
      // podpisů otočené - klient→BOS), takže se doplní jen kroky před BOS podpisem.
      const updated = {
        ...contract,
        ...backfillToStatus(contract, "podepsano-bos", nowIso, email),
        updatedAt: nowIso,
      };
      updated.status = computeContractStatus(updated);
      await upsertContract(updated);
      changed++;
      continue;
    }

    if (action === "client-signed") {
      if (contract.clientSignedAt) {
        skipped++;
        continue;
      }
      // Dorovná předchozí milníky podle FLOW. U postoupení leží „Podepsáno BOS"
      // AŽ ZA klientským podpisem, takže se signedAt NEdoplní (jinak by status
      // omylem spadl na Podepsáno BOS). clientSignedAt přepíšeme na zadané datum
      // (kotva poplatků); předchozí milníky zůstanou na dnešku.
      const updated = {
        ...contract,
        ...backfillToStatus(contract, "podepsano-klientem", nowIso, email),
        clientSignedAt: clientSignedAnchor,
        clientSignedBy: email,
        updatedAt: nowIso,
      };
      updated.status = computeContractStatus(updated);
      await upsertContract(updated);
      changed++;
      continue;
    }
  }

  bustContracts();
  return NextResponse.json({ ok: true, changed, skipped, errors });
}
