import { PageHeader } from "@/components/portal/shell/PageHeader";
import { cachedListContracts } from "@/lib/portal/cached-db";
import { listAccountingCentersByLocation } from "@/lib/portal/locations-db";
import {
  buildFeeRows,
  buildSkippedFeesReport,
  computeMonthResults,
  defaultMonth,
  isRowActiveInMonth,
  navigableMonths,
  type FeeMonthResult,
} from "@/lib/portal/fees-page";
import {
  FeesClient,
  type EditableContract,
  type FeeRowView,
} from "@/components/portal/fees/FeesClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Poplatky" };

export default async function FeesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  // Viditelnost = kdokoli, kdo vidí Smlouvy (celá sekce Franšízing pro přihlášené).
  // Účetní střediska jen pro sloupec v Excel exportu.
  const [contracts, accountingCenters] = await Promise.all([
    cachedListContracts(),
    listAccountingCentersByLocation(),
  ]);

  const today = new Date();
  const rows = buildFeeRows(contracts);
  const months = navigableMonths(rows, today);

  const sp = await searchParams;
  const requested = sp.month;
  const selectedMonth =
    requested && months.includes(requested) ? requested : defaultMonth(months, today);

  const results = await computeMonthResults(rows, selectedMonth, today);

  // Report vynechaných smluv za zvolený měsíc (neúčinné / expirované / bez tržby) - pro kontrolu.
  const report = buildSkippedFeesReport(rows, results, selectedMonth);

  // Jen poplatky účinné ve zvoleném měsíci (prázdné/neúčinné se nezobrazují) a jen ty,
  // které za měsíc reálně generují poplatek. Smlouvy bez tržby (reason "no-revenue")
  // do hlavní tabulky nepatří - negenerují poplatek a jsou jen v reportu „Vynechané
  // smlouvy" (spolu s neúčinnými a expirovanými).
  const views: FeeRowView[] = rows
    .filter((r) => isRowActiveInMonth(r, selectedMonth))
    .filter((r) => results.get(r.key)?.reason !== "no-revenue")
    .map((r) => {
      const res: FeeMonthResult =
        results.get(r.key) ?? { status: "none", amount: null, currency: r.currency };
      return {
        ...r,
        status: res.status,
        computedAmount: res.amount,
        computedCurrency: res.currency,
        billedDays: res.billedDays,
        billedFrom: res.billedFrom,
        billedTo: res.billedTo,
      };
    });

  // Editovatelné smlouvy přítomné v zobrazených řádcích (pro modal s editorem period).
  const presentIds = new Set(views.map((r) => r.contractId));
  const editable: Record<string, EditableContract> = {};
  for (const c of contracts) {
    if (presentIds.has(c.id)) editable[c.id] = { contractType: c.type, feeTerms: c.feeTerms ?? null };
  }

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Franšízing"
        title="Poplatky"
        lede="Souhrn poplatků ze všech smluv. Za uzavřené měsíce vyčíslené z reálné tržby bez DPH (finální), v průběhu a do budoucna kvalifikovaný odhad. Fixní paušály se krátí poměrem na dny, kdy smlouva platila a prodejna byla v provozu (sloupec Dnů). Kliknutím na poplatek upravíte podmínky smlouvy."
      />
      <FeesClient
        rows={views}
        contracts={editable}
        selectedMonth={selectedMonth}
        months={months}
        report={report}
        accountingCenters={accountingCenters}
      />
    </div>
  );
}
