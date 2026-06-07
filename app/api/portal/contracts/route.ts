import { NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { requireSession } from "@/lib/portal/auth-guard";
import { getClient } from "@/lib/portal/clients-db";
import {
  isContractType,
  hasVariants,
  isBundleType,
  isApprovalGated,
  isValidVariantForType,
  getDefaultVariantForType,
  CONTRACT_TYPE_META,
  CLAIM_BUNDLE_SECTIONS,
  type ContractVariant,
} from "@/lib/portal/contract-types";
import { getLocation } from "@/lib/portal/locations-db";
import {
  checkContractEligibility,
  requiredFranchiseVariant,
} from "@/lib/portal/contract-eligibility";
import type { Contract } from "@/lib/portal/contracts-db";
import {
  composeWithdrawalDeps,
  resolveForEditing,
} from "@/lib/portal/contract-render";
import { ensureClaimsToken } from "@/lib/portal/claims";
import { getOrSeedContractTemplate } from "@/lib/portal/contract-templates-db";
import { bustContracts } from "@/lib/portal/revalidate";
import {
  countContracts,
  getNextContractNumber,
  listContracts,
  upsertContract,
  type BundleSection,
} from "@/lib/portal/contracts-db";
import {
  buildClientVariables,
  buildDefaultContractMeta,
  getProviderDefaults,
} from "@/lib/portal/contract-render";

const createSchema = z.object({
  clientId: z.string().trim().min(1),
  type: z.string().trim().min(1),
  variant: z.string().trim().optional(),
  franchiseFeePercent: z.number().int().min(3).max(8).optional(),
  // Povinné jen pro typy posuzované podle lokality (isApprovalGated).
  locationId: z.string().trim().optional(),
});

export async function GET(req: Request) {
  const g = await requireSession();
  if (!g.ok) return g.response;
  // Volitelná paginace: ?limit=N&offset=M. Bez parametrů vrátíme vše
  // (backwards compat s existujícím UI). UI prozatím paginaci nepoužívá.
  const url = new URL(req.url);
  const limitRaw = url.searchParams.get("limit");
  const offsetRaw = url.searchParams.get("offset");
  const limit = limitRaw ? Math.max(1, Math.min(500, Number(limitRaw))) : undefined;
  const offset = offsetRaw ? Math.max(0, Number(offsetRaw)) : 0;
  const [contracts, total] = await Promise.all([
    listContracts({ limit, offset }),
    limit !== undefined ? countContracts() : Promise.resolve(undefined),
  ]);
  return NextResponse.json({
    ok: true,
    contracts,
    ...(total !== undefined ? { total, limit, offset } : {}),
  });
}

export async function POST(req: Request) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success || !isContractType(parsed.data.type)) {
    return NextResponse.json(
      { ok: false, error: "Vyberte klienta a typ smlouvy." },
      { status: 400 },
    );
  }
  const {
    clientId,
    type,
    variant: rawVariant,
    franchiseFeePercent: rawFeePercent,
    locationId,
  } = parsed.data;

  const client = await getClient(clientId);
  if (!client) {
    return NextResponse.json(
      { ok: false, error: "Klient nenalezen." },
      { status: 404 },
    );
  }

  // Typy posuzované podle lokality vyžadují výběr lokality - nasnapshotujeme
  // její stav (kategorie, nájem, nový režim) pro pozdější vyhodnocení klíče.
  let locationSnapshot: Contract["locationSnapshot"];
  if (isApprovalGated(type)) {
    if (!locationId) {
      return NextResponse.json(
        { ok: false, error: "Vyberte lokalitu." },
        { status: 400 },
      );
    }
    const location = await getLocation(locationId);
    if (!location) {
      return NextResponse.json(
        { ok: false, error: "Lokalita nenalezena." },
        { status: 404 },
      );
    }
    locationSnapshot = {
      name: location.name,
      category: location.category,
      leaseStatus: location.lease_current_status,
      newMode: location.new_mode,
      capturedAt: new Date().toISOString(),
    };

    // Soulad typu/varianty se stavem lokality (spolupráce=Operations,
    // provozování=Full; franšíza variantou dle nájmu). Při nesouladu nelze
    // smlouvu vytvořit - je nutné upravit data v Transition a synchronizovat.
    const elig = checkContractEligibility({
      type,
      leaseStatus: location.lease_current_status,
      newMode: location.new_mode,
    });
    if (!elig.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: `${elig.reason} Nejdřív upravte hodnoty v aplikaci Transition a synchronizujte data.`,
        },
        { status: 400 },
      );
    }
  }

  let variant: ContractVariant | undefined;
  if (hasVariants(type)) {
    if (rawVariant && isValidVariantForType(type, rawVariant)) {
      variant = rawVariant as ContractVariant;
    } else {
      variant = getDefaultVariantForType(type) as ContractVariant | undefined;
    }
  }
  // Franšíza: varianta je dána nájmem (na franšízanta = A/„AB", jinak B) -
  // přepíšeme bez ohledu na to, co poslal klient (bezpečnostní síť).
  if (type === "franchise" && locationSnapshot) {
    variant = requiredFranchiseVariant(locationSnapshot.leaseStatus) as ContractVariant;
  }

  // Bundle: load 3 source templates (claim-assignment, side-fee, assignment-notice).
  // Pro NE-bundle: load 1 template. Default letterhead=true (pokud šablona
  // nemá explicitně uložené false). Pro bundle se použije letterhead první
  // sekce (claim-assignment) jako reprezentativní.
  let bundleSections: BundleSection[] | undefined;
  let templateHtml = "";
  let templateSnapshot = "";
  let letterhead = true;

  if (isBundleType(type)) {
    const sourceTemplates = await Promise.all(
      CLAIM_BUNDLE_SECTIONS.map((sectionType) =>
        getOrSeedContractTemplate(sectionType),
      ),
    );
    // ensureClaimsToken: starší šablona claim-assignment může mít ještě statický
    // text „Doplňte tabulkou…"; nahradíme ho tokenem {{claimsTable}}, aby nová
    // smlouva měla v editoru rovnou placeholder pro generovanou tabulku. Pro
    // ostatní sekce (side-fee, assignment-notice) je to no-op.
    bundleSections = sourceTemplates.map((tpl, i) => {
      const html = ensureClaimsToken(tpl.html);
      return {
        type: CLAIM_BUNDLE_SECTIONS[i]!,
        html,
        templateSnapshot: html,
      };
    });
    letterhead = sourceTemplates[0]?.letterhead ?? true;
  } else {
    const template = await getOrSeedContractTemplate(type, variant);
    // Žádná runtime injekce tokenu - šablona je zdroj pravdy. Token tabulky
    // pohledávek ({{claimsTable}}) je natvrdo v šabloně postoupení
    // (claim-assignment); ostatní typy ho nemají a nedostávají. Render PDF má
    // navíc safety net (prepareClaimsAppendix), který token doplní jen u typů
    // postoupení, kdyby ve starší smlouvě chyběl.
    templateHtml = template.html;
    templateSnapshot = templateHtml;
    letterhead = template.letterhead ?? true;
  }

  const now = new Date();
  const meta = buildDefaultContractMeta(now);
  const number = await getNextContractNumber(now);
  // Provider defaults podle typu smlouvy:
  // - withdrawal: prázdné (Manažer i Poskytovatel se vybírá chip-pickerem)
  // - claim-bundle / claim-assignment / side-fee / assignment-notice:
  //   Clamora Bridge s.r.o. (Postupník)
  // - ostatní: BOServices (sjednaný Poskytovatel)
  const providerVars = type === "withdrawal" ? {} : getProviderDefaults(type);
  const variables: Record<string, string> = {
    ...meta,
    ...providerVars,
    ...buildClientVariables(client),
    contractNumber: number,
    effectiveDate: meta.contractDate ?? "",
  };

  // Franšízový a marketingový poplatek - placeholder {{franchiseFeePercent}}.
  // Varianta B = pevně 8 %, varianta AB = volba 0-8 (default 8) z modálu.
  if (type === "franchise") {
    const feePercent = variant === "B" ? 8 : (rawFeePercent ?? 8);
    variables.franchiseFeePercent = String(feePercent);
  }

  // Odstoupení od smluv: default „všechny smlouvy v balíčku se ukončují" (MS i
  // KS). Inline klauzule se složí přes compose; manažer se doplní výběrem firmy
  // v detailu (managerPartyLine se přepočítá). U varianty B lze MS vypnout
  // (nemusela být podepsaná), KS u obou.
  if (type === "withdrawal") {
    Object.assign(
      variables,
      composeWithdrawalDeps(variant ?? "A", {
        msIncluded: true,
        ksDropped: true,
        manager: {},
      }),
    );
  }

  const nowIso = now.toISOString();
  const id = nanoid(12);

  // Zapéct placeholdery do editovatelného znění (NE-bundle); templateSnapshot
  // zůstává surová šablona pro diff. Bundle zůstává na tokenech.
  const html = isBundleType(type)
    ? templateHtml
    : resolveForEditing(templateHtml, variables);

  await upsertContract({
    id,
    type,
    clientId: client.id,
    clientName: client.companyName,
    status: "koncept",
    html,
    templateSnapshot: templateSnapshot || undefined,
    bundleSections,
    variant,
    letterhead,
    ...(isApprovalGated(type) ? { locationId, locationSnapshot } : {}),
    variables,
    number,
    createdBy: g.session.user!.email!,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  bustContracts();
  return NextResponse.json({ ok: true,
    id,
    typeName: CONTRACT_TYPE_META[type].fullName,
  });
}
