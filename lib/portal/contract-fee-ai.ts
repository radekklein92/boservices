// AI extrakce poplatků ze smlouvy: z textu (contract.html) vytáhne strukturované
// poplatkové periody, účinnost a odloženou fakturaci (Claude, structured output).
// Vzor: lib/portal/invoice-ai.ts (Anthropic SDK, json_schema, graceful degradace).
//
// Graceful: chybí-li ANTHROPIC_API_KEY nebo AI selže, vrátí null - podpis se
// NEzablokuje, jen se na smlouvu uloží feeTermsError a cron / tlačítko zkusí znovu.
//
// Server-only (Redis + Anthropic). Volá se z trigger routes, cronu a tlačítka.

import Anthropic from "@anthropic-ai/sdk";
import {
  clientSignedAtEffective,
  upsertContract,
  type Contract,
} from "./contracts-db";
import {
  CONTRACT_TYPE_META,
  getVariantMeta,
} from "./contract-types";
import {
  franchiseFeePercentValue,
  operatingFeeAmountValue,
} from "./contract-fees";
import {
  resolveRelativePeriods,
  shouldExtractFeeTerms,
  type AmountPeriod,
  type AiConfidence,
  type ContractFeeTerms,
  type FeeKind,
  type FeePeriod,
} from "./contract-fee-terms";
import { bustContracts } from "./revalidate";

const MODEL = "claude-opus-4-8";

// Structured output: jen pole, která plní model. Audit pole (source, extractedAt,
// aiModel, updatedBy/updatedAt) NEdáváme modelu - doplníme v kódu po parse.
// additionalProperties:false + vše required + prázdné hodnoty 0/""/[] (požadavek
// structured outputs - žádné null, žádné minLength/minimum).
const FEE_PERIOD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    label: {
      type: "string",
      description:
        'Lidský název poplatku, např. „Franšízingový a marketingový poplatek" nebo „Zaváděcí snížený poplatek".',
    },
    kind: {
      type: "string",
      enum: ["franchise", "marketing", "operation", "cooperation", "other"],
      description:
        'Druh poplatku. Procento z obratu u franšízy = "franchise". Fixní odměna u provozování/spolupráce = "operation".',
    },
    percent: {
      type: "number",
      description:
        "Sazba v procentech (např. 8 pro 8 %). 0 pokud je poplatek pevná částka v Kč.",
    },
    percentBase: {
      type: "string",
      description:
        'Z čeho se procento počítá, např. „měsíční obrat bez DPH". Prázdné, pokud poplatek není procentuální.',
    },
    amount: {
      type: "number",
      description:
        "Pevná částka bez DPH (číslo bez měny a oddělovačů, „30 000 Kč" => 30000). 0 pokud je poplatek procentuální.",
    },
    amountPeriod: {
      type: "string",
      enum: ["monthly", "yearly", "one-time", "none"],
      description:
        'Perioda pevné částky. „none" pokud je poplatek procentuální. Jednorázový poplatek = „one-time".',
    },
    from: {
      type: "string",
      description:
        "Absolutní datum začátku platnosti této periody ve formátu RRRR-MM-DD, POKUD je v textu uvedeno konkrétní datum. Jinak prázdné.",
    },
    to: {
      type: "string",
      description:
        "Absolutní datum konce této periody (RRRR-MM-DD). Prázdné = trvale / bez konce / do konce smlouvy.",
    },
    relativeFromMonth: {
      type: "number",
      description:
        'Když text říká „od účinnosti" nebo „prvních N měsíců": 0 = od účinnosti smlouvy. Jinak pořadové číslo měsíce, od kterého perioda běží.',
    },
    relativeToMonth: {
      type: "number",
      description:
        'Když je perioda omezená relativně, např. „prvních 6 měsíců": vyplň 6. 0 = bez relativního konce.',
    },
    note: {
      type: "string",
      description:
        "Doplňující poznámka k periodě (DPH, splatnost, den fakturace). Prázdné pokud nic.",
    },
  },
  required: [
    "label",
    "kind",
    "percent",
    "percentBase",
    "amount",
    "amountPeriod",
    "from",
    "to",
    "relativeFromMonth",
    "relativeToMonth",
    "note",
  ],
} as const;

const FEE_TERMS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    effectiveFrom: {
      type: "string",
      description:
        'Datum účinnosti smlouvy RRRR-MM-DD, JEN pokud je odložené (jiné než den podpisu). Prázdné = účinnost dnem podpisu.',
    },
    invoicingStartsFrom: {
      type: "string",
      description:
        "Datum, od kdy se začíná fakturovat (RRRR-MM-DD), JEN pokud je fakturace odložená oproti účinnosti. Jinak prázdné.",
    },
    currency: {
      type: "string",
      description:
        "Měna fakturace (CZK/EUR/PLN). Default CZK, pokud text neurčuje jinak.",
    },
    periods: {
      type: "array",
      items: FEE_PERIOD_SCHEMA,
      description:
        "Všechny poplatkové periody. Jednu periodu na každou souvislou sazbu. Zaváděcí snížený poplatek = samostatná perioda s relativeToMonth. NEVYTVÁŘEJ periody, které v textu nejsou (např. jednorázový poplatek 0 Kč vynech).",
    },
    summary: {
      type: "string",
      description:
        "Jedna česká věta shrnující, kolik a jak se fakturuje.",
    },
    aiConfidence: {
      type: "string",
      enum: ["high", "medium", "low", "none"],
      description:
        'Jak jistá je extrakce. „none" když v textu žádný poplatek není.',
    },
    aiNotes: {
      type: "string",
      description:
        "Co bylo v textu nejasné nebo nedohledatelné. Prázdné, pokud bylo vše jednoznačné.",
    },
  },
  required: [
    "effectiveFrom",
    "invoicingStartsFrom",
    "currency",
    "periods",
    "summary",
    "aiConfidence",
    "aiNotes",
  ],
} as const;

const SYSTEM_PROMPT = `Jsi asistent, který z textu české smlouvy přesně vytáhne strukturovaná data o POPLATCÍCH a ODMĚNÁCH, které platí KLIENT (Příjemce / Franšízant) Poskytovateli (BOServices / Manažer).

Pravidla:
- Vyplňuj POUZE to, co je v textu. Nic si nedomýšlej. Když poplatek v textu není, vrať prázdné periods a aiConfidence „none".
- Procentuální poplatek (např. „% z měsíčního obratu") patří k franšízovým smlouvám: percent = sazba, amount = 0, amountPeriod = „none", kind = „franchise".
- Pevná částka v Kč (např. „měsíční odměna 30 000 Kč") patří ke smlouvám o provozování a o spolupráci: amount = částka bez DPH, percent = 0, amountPeriod = „monthly" (nebo „one-time"/„yearly" dle textu), kind = „operation".
- Jednorázový poplatek ve výši 0 Kč NEVYTVÁŘEJ jako periodu.
- ZAVÁDĚCÍ / snížený poplatek na první období je SAMOSTATNÁ perioda. Když text říká „po dobu prvních N měsíců od účinnosti je poplatek X %", vytvoř dvě periody: (1) zaváděcí s relativeFromMonth=0, relativeToMonth=N, sazbou X %; (2) standardní s relativeFromMonth=N, relativeToMonth=0 (bez konce), běžnou sazbou.
- Datum účinnosti (effectiveFrom) vyplň JEN když je odložené (jiné než den podpisu). „nabývá účinnosti dnem podpisu" => effectiveFrom prázdné.
- Odloženou fakturaci (invoicingStartsFrom) vyplň jen když text říká, že se začíná fakturovat později než od účinnosti.
- RELATIVNÍ období („prvních 6 měsíců", „od účinnosti") vracej v polích relativeFromMonth / relativeToMonth. Absolutní from/to vyplň jen tehdy, když je v textu KONKRÉTNÍ datum (např. „do 31. 12. 2026"). Nepřepočítávej relativní na absolutní sám - to udělá aplikace z data podpisu.
- Měna: default CZK, pokud text výslovně neurčuje jinou.
- Veškeré částky jsou bez DPH (čísla bez měny a oddělovačů: „30 000 Kč" => 30000).`;

const FEE_KINDS: ReadonlySet<string> = new Set([
  "franchise",
  "marketing",
  "operation",
  "cooperation",
  "other",
]);
const AMOUNT_PERIODS: ReadonlySet<string> = new Set([
  "monthly",
  "yearly",
  "one-time",
  "none",
]);
const CONFIDENCES: ReadonlySet<string> = new Set([
  "high",
  "medium",
  "low",
  "none",
]);

function newId(): string {
  return globalThis.crypto.randomUUID();
}

// Defenzivní normalizace jedné periody z AI výstupu na FeePeriod (+ id).
function normalizePeriod(raw: unknown): FeePeriod {
  const p = (raw ?? {}) as Record<string, unknown>;
  const kind = String(p.kind ?? "other");
  const amountPeriod = String(p.amountPeriod ?? "none");
  return {
    id: newId(),
    label: String(p.label ?? "").trim(),
    kind: (FEE_KINDS.has(kind) ? kind : "other") as FeeKind,
    percent: Number(p.percent) || 0,
    percentBase: String(p.percentBase ?? "").trim(),
    amount: Number(p.amount) || 0,
    amountPeriod: (AMOUNT_PERIODS.has(amountPeriod)
      ? amountPeriod
      : "none") as AmountPeriod,
    from: String(p.from ?? "").trim(),
    to: String(p.to ?? "").trim(),
    relativeFromMonth: Math.max(0, Math.trunc(Number(p.relativeFromMonth) || 0)),
    relativeToMonth: Math.max(0, Math.trunc(Number(p.relativeToMonth) || 0)),
    note: String(p.note ?? "").trim(),
  };
}

// Vytáhne poplatky ze smlouvy přes Claude. Vrací hotové ContractFeeTerms (vč.
// dopočtu absolutních dat z relativních) nebo null (chybí klíč / chyba / parse).
export async function extractContractFeeTerms(
  contract: Contract,
): Promise<ContractFeeTerms | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const signedISO = (clientSignedAtEffective(contract) ?? "").slice(0, 10);
    const meta = CONTRACT_TYPE_META[contract.type];
    const variantMeta = contract.variant
      ? getVariantMeta(contract.type, contract.variant)
      : null;
    const hintPercent = franchiseFeePercentValue(contract);
    const hintAmount = operatingFeeAmountValue(contract);

    const userMessage = [
      `Typ smlouvy: ${meta.fullName}${variantMeta ? ` (varianta ${variantMeta.label})` : ""}.`,
      `Datum podpisu klientem (předpokládaná účinnost, pokud není v textu odložená): ${signedISO || "neznámé"}.`,
      "",
      "Strojově detekované hodnoty (HINT, ověř proti textu, neřiď se jimi slepě):",
      `- franšízový poplatek: ${hintPercent !== null ? `${hintPercent} %` : "—"}`,
      `- pevná odměna: ${hintAmount !== null ? `${hintAmount} Kč` : "—"}`,
      "",
      "Text smlouvy (HTML, ignoruj značky):",
      contract.html,
      "",
      "Vrať strukturovaná data o poplatcích klienta dle schématu.",
    ].join("\n");

    // SDK timeout 50 s < maxDuration funkce (60 s) - graceful chyba dřív, než Vercel utne.
    const client = new Anthropic({ apiKey, timeout: 50_000 });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: FEE_TERMS_SCHEMA },
      },
      messages: [{ role: "user", content: [{ type: "text", text: userMessage }] }],
    });

    const textBlock = res.content.find((b) => b.type === "text");
    const rawText = textBlock && "text" in textBlock ? textBlock.text : "";
    const parsed = JSON.parse(rawText) as Record<string, unknown>;

    const confidence = String(parsed.aiConfidence ?? "none");
    const periodsRaw = Array.isArray(parsed.periods) ? parsed.periods : [];
    const now = new Date().toISOString();

    const terms: ContractFeeTerms = {
      effectiveFrom: String(parsed.effectiveFrom ?? "").trim(),
      invoicingStartsFrom: String(parsed.invoicingStartsFrom ?? "").trim(),
      currency: String(parsed.currency ?? "").trim() || "CZK",
      periods: periodsRaw.map(normalizePeriod),
      summary: String(parsed.summary ?? "").trim(),
      source: "ai",
      aiModel: MODEL,
      aiConfidence: (CONFIDENCES.has(confidence)
        ? confidence
        : "none") as AiConfidence,
      aiNotes: String(parsed.aiNotes ?? "").trim(),
      extractedAt: now,
      updatedBy: "",
      updatedAt: now,
    };

    // Dopočti absolutní from/to z relativních měsíců vůči datu účinnosti/podpisu.
    return resolveRelativePeriods(terms, signedISO);
  } catch {
    return null;
  }
}

export interface EnsureFeeTermsResult {
  ok: boolean;
  skipped?: "not-eligible" | "manual-locked" | "no-key-or-error";
  feeTerms?: ContractFeeTerms;
}

// Idempotentní extrakce + uložení. Nepřepíše ručně upravené (source != "ai")
// bez force. Bezpečné volat z triggerů, cronu i tlačítka. Selhání AI nehodí
// výjimku - jen uloží feeTermsError (podpis se nezablokuje).
export async function ensureContractFeeTerms(
  contract: Contract,
  opts?: { force?: boolean },
): Promise<EnsureFeeTermsResult> {
  const force = opts?.force ?? false;

  if (!shouldExtractFeeTerms(contract)) {
    return { ok: false, skipped: "not-eligible" };
  }
  // Ruční korekce nepřepisovat bez force; čistě AI-vygenerované přepsat smí.
  if (contract.feeTerms && contract.feeTerms.source !== "ai" && !force) {
    return { ok: false, skipped: "manual-locked", feeTerms: contract.feeTerms };
  }

  const terms = await extractContractFeeTerms(contract);
  if (!terms) {
    const failed: Contract = {
      ...contract,
      feeTermsError:
        "AI extrakce poplatků se nezdařila (chybí ANTHROPIC_API_KEY nebo chyba) - doplňte ručně nebo zkuste znovu.",
      updatedAt: new Date().toISOString(),
    };
    await upsertContract(failed);
    bustContracts();
    return { ok: false, skipped: "no-key-or-error" };
  }

  const { feeTermsError: _drop, ...rest } = contract;
  void _drop;
  const updated: Contract = {
    ...rest,
    feeTerms: terms,
    updatedAt: new Date().toISOString(),
  };
  await upsertContract(updated);
  bustContracts();
  return { ok: true, feeTerms: terms };
}
