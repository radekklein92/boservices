// AI kontrola nahrané faktury proti výběru provize: vyextrahuje z PDF celkovou
// částku a variabilní symbol (Claude, document block) a deterministicky je
// porovná s očekávanými hodnotami.
//
// Graceful degradace: chybí-li ANTHROPIC_API_KEY nebo AI selže, vrátí
// { ok: true, skipped: true } s poznámkou - nahrání faktury se nezablokuje,
// admin ji ověří ručně. Blokuje se JEN při skutečné neshodě (AI proběhla).

import Anthropic from "@anthropic-ai/sdk";
import type { PayoutAiCheck } from "./payouts-db";

// Fixní poplatek (bez DPH), který si obchodníci občas fakturují k provizi navíc.
// AI kontrola proto akceptuje i fakturu vyšší přesně o tuto částku.
const INVOICE_FIX_AMOUNT = 60_000;

// Structured output schema - jen 2 pole, additionalProperties:false (požadavek
// structured outputs). Když hodnota chybí, model vrátí 0 / prázdný string.
const EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    totalAmount: {
      type: "number",
      description:
        "Celková částka k úhradě na faktuře (číslo, bez měny a oddělovačů). 0 pokud nenalezeno.",
    },
    variableSymbol: {
      type: "string",
      description:
        "Variabilní symbol z faktury (jen číslice). Prázdný řetězec pokud nenalezen.",
    },
  },
  required: ["totalAmount", "variableSymbol"],
} as const;

export async function verifyInvoice(
  pdfBytes: Buffer,
  expected: { amount: number; variableSymbol: string; isVatPayer: boolean },
): Promise<PayoutAiCheck> {
  const now = new Date().toISOString();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: true,
      skipped: true,
      reasons: ["AI kontrola přeskočena (chybí ANTHROPIC_API_KEY) - ověřte fakturu ručně."],
      checkedAt: now,
    };
  }

  try {
    // SDK timeout 50 s < maxDuration funkce (60 s) - když AI visí, vrátíme
    // graceful "skipped" (catch níže) dřív, než Vercel funkci tvrdě utne.
    const client = new Anthropic({ apiKey, timeout: 50_000 });
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: EXTRACT_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBytes.toString("base64"),
              },
            },
            {
              type: "text",
              text: "Z této faktury vyextrahuj celkovou částku k úhradě a variabilní symbol.",
            },
          ],
        },
      ],
    });

    const textBlock = res.content.find((b) => b.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : "";
    const parsed = JSON.parse(raw) as {
      totalAmount?: number;
      variableSymbol?: string;
    };

    const reasons: string[] = [];

    const vsExpected = expected.variableSymbol.replace(/\D/g, "");
    const vsGot = String(parsed.variableSymbol ?? "").replace(/\D/g, "");
    if (vsExpected && vsGot !== vsExpected) {
      reasons.push(
        `Variabilní symbol nesedí - na faktuře "${vsGot || "—"}", očekáváno "${vsExpected}".`,
      );
    }

    const got = Math.round(parsed.totalAmount ?? 0);
    const base = Math.round(expected.amount);
    const withVat = Math.round(expected.amount * 1.21);

    // K provizi se občas fakturuje fixní poplatek 60 000 Kč (bez DPH) navíc.
    // Akceptujeme proto i fakturu vyšší přesně o tento fix - jako druhý povolený
    // základ (base + fix). Fix vstupuje do základu daně, takže u plátce DPH platí
    // stejné pravidlo ×1,21 jako pro samotnou provizi. Není to rozpětí: bere se jen
    // přesná shoda na provizi NEBO na provizi + fix (±1 Kč na zaokrouhlení).
    const acceptedBases = [base, base + INVOICE_FIX_AMOUNT];
    const candidates = acceptedBases.flatMap((b) =>
      expected.isVatPayer ? [b, Math.round(b * 1.21)] : [b],
    );
    const amountOk = candidates.some((c) => Math.abs(got - c) <= 1);
    if (!amountOk) {
      reasons.push(
        `Částka nesedí - na faktuře ${got} Kč, očekáváno ${base} Kč${expected.isVatPayer ? ` (nebo ${withVat} Kč vč. DPH)` : ""} - případně o fix ${INVOICE_FIX_AMOUNT} Kč (bez DPH) více.`,
      );
    }

    return {
      ok: reasons.length === 0,
      extractedAmount: got,
      extractedVs: vsGot,
      reasons,
      checkedAt: now,
    };
  } catch (err) {
    // AI nedostupná / chyba parsování → nezablokovat, jen označit k ručnímu ověření.
    return {
      ok: true,
      skipped: true,
      reasons: [
        `AI kontrola selhala (${err instanceof Error ? err.message : "neznámá chyba"}) - ověřte fakturu ručně.`,
      ],
      checkedAt: now,
    };
  }
}
