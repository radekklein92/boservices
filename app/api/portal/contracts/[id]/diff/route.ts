import { NextResponse } from "next/server";
import { requireSession } from "@/lib/portal/auth-guard";
import { getContract } from "@/lib/portal/contracts-db";
import { getOrSeedContractTemplate } from "@/lib/portal/contract-templates-db";
import {
  CONTRACT_TYPE_META,
  isBundleType,
  type ClaimBundleSectionType,
} from "@/lib/portal/contract-types";
import { htmlDiff } from "@/lib/portal/contract-diff";
import {
  resolveForEditing,
  extractPlaceholderTokens,
  KEEP_DYNAMIC_TOKENS,
} from "@/lib/portal/contract-render";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const { id } = await params;
  const contract = await getContract(id);
  if (!contract) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  // Bundle: vrátí diff za každou ze 3 sekcí. Agregovaný `hasChanges`/`changeCount`
  // je součet napříč sekcemi; UI ukáže záložky.
  if (isBundleType(contract.type) && contract.bundleSections) {
    const sections = contract.bundleSections.map((section) => {
      const result = htmlDiff(section.templateSnapshot, section.html);
      return {
        type: section.type,
        hasChanges: result.hasChanges,
        changeCount: result.changeCount,
        diffHtml: result.diffHtml,
        snapshotHtml: section.templateSnapshot,
        currentHtml: section.html,
      };
    });
    const totalCount = sections.reduce((sum, s) => sum + s.changeCount, 0);
    return NextResponse.json({
      ok: true,
      hasChanges: totalCount > 0,
      changeCount: totalCount,
      // Bundle vrací sekce; legacy klienti, kteří očekávají diffHtml, dostanou
      // konkatenovaný diff jako fallback (s nadpisy sekcí).
      diffHtml: sections
        .map(
          (s) =>
            `<h2>${sectionTitle(s.type)}</h2>${s.hasChanges ? s.diffHtml : "<p><em>Beze změn proti šabloně.</em></p>"}`,
        )
        .join("\n"),
      sections,
    });
  }

  // Pro starší smlouvy bez snapshotu použijeme aktuální šablonu jako
  // fallback (lepší než nic - aspoň ukáže rozdíl proti aktuálnímu znění).
  let snapshot = contract.templateSnapshot;
  if (!snapshot) {
    const template = await getOrSeedContractTemplate(contract.type);
    snapshot = template.html;
  }

  // Když je znění zapečené (vyplněné hodnoty), zapečeme stejnými proměnnými
  // i šablonu pro porovnání - diff pak ukáže jen uživatelské úpravy, ne rozdíl
  // token vs. hodnota. Staré nezapečené smlouvy (html ještě s tokeny) porovnáme
  // surově proti surové šabloně jako dosud.
  const tokens = extractPlaceholderTokens(contract.html);
  const isBaked = ![...tokens].some((t) => !KEEP_DYNAMIC_TOKENS.has(t));
  const snapshotForDiff = isBaked
    ? resolveForEditing(snapshot, contract.variables)
    : snapshot;
  const result = htmlDiff(snapshotForDiff, contract.html);
  return NextResponse.json({
    ok: true,
    hasChanges: result.hasChanges,
    changeCount: result.changeCount,
    diffHtml: result.diffHtml,
    snapshotHtml: snapshotForDiff,
    currentHtml: contract.html,
  });
}

function sectionTitle(sectionType: ClaimBundleSectionType): string {
  return CONTRACT_TYPE_META[sectionType].fullName;
}
