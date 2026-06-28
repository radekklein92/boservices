import { notFound } from "next/navigation";
import { PageHeader } from "@/components/portal/shell/PageHeader";
import { isAdminRole } from "@/lib/portal/auth-guard";
import { getSession } from "@/lib/portal/get-session";
import { cachedListContracts } from "@/lib/portal/cached-db";
import { isSalespersonEmail } from "@/lib/portal/commissions";
import {
  addMonthKey,
  buildFeeRows,
  computeFeeForMonth,
  FEES_MIN_MONTH,
  getMonthlyNetSeriesByLocation,
  monthKeyOf,
  monthsNeededFor,
  type MonthNet,
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
  const [session, contracts] = await Promise.all([getSession(), cachedListContracts()]);
  const email = session?.user?.email;
  const isAdmin = isAdminRole(session?.user?.role);
  // Vidí jen admini + obchodníci (shodně s Provizemi).
  if (!isAdmin && !isSalespersonEmail(email)) notFound();

  const today = new Date();
  const sp = await searchParams;
  // Default = poslední uzavřený měsíc, nikdy ne dřív než od května 2026.
  const lastClosed = addMonthKey(monthKeyOf(today), -1);
  const defaultMonth = lastClosed < FEES_MIN_MONTH ? FEES_MIN_MONTH : lastClosed;
  const requested = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : defaultMonth;
  const selectedMonth = requested < FEES_MIN_MONTH ? FEES_MIN_MONTH : requested;

  const rows = buildFeeRows(contracts);

  // Měsíční net série z DW (graceful degradace, když POS API není dostupné -
  // procentní poplatky pak zůstanou bez statusu, jen se sazbou).
  let series = new Map<string, Map<string, MonthNet>>();
  try {
    series = await getMonthlyNetSeriesByLocation(monthsNeededFor(selectedMonth, today));
  } catch {
    series = new Map();
  }

  const views: FeeRowView[] = rows.map((r) => {
    const res = computeFeeForMonth(r, series.get(r.locationId), selectedMonth, today);
    return { ...r, status: res.status, computedAmount: res.amount, computedCurrency: res.currency };
  });

  // Editovatelné smlouvy přítomné v řádcích (pro modal s editorem period).
  const presentIds = new Set(rows.map((r) => r.contractId));
  const editable: Record<string, EditableContract> = {};
  for (const c of contracts) {
    if (presentIds.has(c.id)) editable[c.id] = { contractType: c.type, feeTerms: c.feeTerms ?? null };
  }

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Franšízing"
        title="Poplatky"
        lede="Souhrn poplatků ze všech smluv. Za uzavřené měsíce vyčíslené z reálné tržby bez DPH (finální), v průběhu a do budoucna kvalifikovaný odhad. Kliknutím na poplatek upravíte podmínky smlouvy."
      />
      <FeesClient
        rows={views}
        contracts={editable}
        selectedMonth={selectedMonth}
        minMonth={FEES_MIN_MONTH}
      />
    </div>
  );
}
