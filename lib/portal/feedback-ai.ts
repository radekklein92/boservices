// AI vrstva feedback widgetu: vede s uživatelem krátký rozhovor o jeho podnětu
// a sestaví z něj kompletní zadání pro vývojáře. KLÍČOVÉ: dostává snímek stránky
// (PageContext), aby chápala, o čem uživatel mluví a na co ukazuje.
//
// Vzor (model, structured output) je shodný s invoice-ai.ts. Bez ANTHROPIC_API_KEY
// degraduje na passthrough - z textu uživatele rovnou složí návrh (feedback teče
// dál, jen bez doptávání).

import Anthropic from "@anthropic-ai/sdk";
import {
  FEEDBACK_LIMITS,
  type ChatMessage,
  type PageContext,
} from "./feedback-shared";

const MODEL = "claude-opus-4-8";

export type FeedbackAiResult =
  | { mode: "question"; message: string }
  | { mode: "draft"; title: string; spec: string };

// Structured output: model VŽDY vrátí všechna pole (additionalProperties:false,
// vše required) - nepoužitá pole jsou prázdný řetězec, stejně jako u invoice-ai.
const RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    mode: {
      type: "string",
      enum: ["question", "draft"],
      description:
        "'question' = potřebuji se ještě doptat. 'draft' = mám dost informací a předávám hotové zadání.",
    },
    message: {
      type: "string",
      description:
        "Když mode=question: jedna až dvě krátké, konkrétní doplňující otázky v češtině, lidsky. Když mode=draft: prázdný řetězec.",
    },
    title: {
      type: "string",
      description:
        "Když mode=draft: stručný výstižný název změny v češtině, rozkazovací způsob, max 80 znaků. Jinak prázdný řetězec.",
    },
    spec: {
      type: "string",
      description:
        "Když mode=draft: kompletní zadání pro vývojáře v češtině (markdown). Jinak prázdný řetězec.",
    },
  },
  required: ["mode", "message", "title", "spec"],
} as const;

function trimList(items: string[], max: number): string {
  return items
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max)
    .join(" · ");
}

// Čitelný blok kontextu stránky pro AI.
function pageBlock(page: PageContext): string {
  const lines: string[] = [
    "## Kontext stránky, na které uživatel právě je",
    `- Název stránky (title): ${page.title || "(neznámý)"}`,
    `- Typ stránky: ${page.routeLabel || "(neznámý)"}`,
    `- URL: ${page.path}`,
  ];
  if (page.headings.length) lines.push(`- Nadpisy: ${trimList(page.headings, FEEDBACK_LIMITS.headings)}`);
  if (page.fieldLabels.length)
    lines.push(`- Popisky polí a sloupců: ${trimList(page.fieldLabels, FEEDBACK_LIMITS.fieldLabels)}`);
  if (page.selection) lines.push(`- Uživatel si na stránce OZNAČIL text: "${page.selection}"`);
  if (page.picked)
    lines.push(
      `- Uživatel UKÁZAL na konkrétní prvek: text "${page.picked.text}"${
        page.picked.role ? ` (role: ${page.picked.role})` : ""
      }, selektor ${page.picked.selector}`,
    );
  if (page.visibleText)
    lines.push("- Viditelný obsah stránky (ořezáno):", '"""', page.visibleText, '"""');
  return lines.join("\n");
}

function buildSystem(page: PageContext, userName: string): string {
  return [
    "Jsi produktový analytik interního firemního portálu BOServices (Next.js aplikace).",
    `Bavíš se s uživatelem portálu (${userName}), který chce dát zpětnou vazbu nebo navrhnout změnu přímo na stránce, kde právě je.`,
    "Tvým úkolem je z jeho podnětu sestavit KOMPLETNÍ, jednoznačné zadání pro vývojáře (který ho bude implementovat přes Claude Code).",
    "",
    "Jak postupovat:",
    "- Využívej kontext stránky níže, abys chápal, o čem uživatel mluví (když řekne 'tohle', 'tady', 'tenhle sloupec', 'to tlačítko' - dohledej to v kontextu, hlavně v označeném textu a ukázaném prvku).",
    "- Ptej se MÁLO a k věci: max 1-2 krátké otázky na jednu zprávu, a jen když to opravdu potřebuješ k jednoznačnému zadání. Když je podnět jasný, rovnou předej zadání (mode=draft).",
    "- Necílíš na vyčerpávající výslech - zpravidla stačí 1 až 3 zprávy uživatele, pak draftuj.",
    "- Otázky piš lidsky a srozumitelně (uživatel nemusí být technik). Zadání naopak piš konkrétně pro vývojáře.",
    "",
    "Když draftuješ (mode=draft), pole 'spec' napiš jako markdown s těmito sekcemi:",
    "- **Kde**: stránka (název + URL) a konkrétní místo/prvek, kterého se to týká.",
    "- **Co a proč**: co chce uživatel změnit a jaký to má smysl.",
    "- **Jak konkrétně / akceptační kritéria**: ověřitelné body, podle kterých poznáme, že je hotovo.",
    "- **Na co dát pozor**: co se NEMÁ rozbít nebo změnit.",
    "Domněnky, které jsi nedostal od uživatele, výslovně označ slovem 'Předpoklad:'. Nevymýšlej požadavky, které uživatel neřekl.",
    "",
    "Styl: česky, plná diakritika, bez emoji, bez dlouhých pomlček (jen krátká -).",
    "",
    pageBlock(page),
  ].join("\n");
}

// Sanitizace transcriptu pro Anthropic API: zahodit úvodní asistentské zprávy
// (uvítací hláška se posílá jen pro zobrazení), sloučit po sobě jdoucí stejné
// role, oříznout délku i počet. Výsledek začíná uživatelem a střídá role.
function toAnthropicMessages(
  messages: ChatMessage[],
): Array<{ role: "user" | "assistant"; content: string }> {
  const capped = messages.slice(-FEEDBACK_LIMITS.transcript);
  let start = 0;
  while (start < capped.length && capped[start].role !== "user") start++;
  const trimmed = capped.slice(start);
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of trimmed) {
    const content = m.content.trim().slice(0, FEEDBACK_LIMITS.messageChars);
    if (!content) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${content}`;
    else out.push({ role: m.role, content });
  }
  return out;
}

// Passthrough bez AI: z textu uživatele rovnou složí použitelný návrh.
function fallbackDraft(messages: ChatMessage[], page: PageContext): FeedbackAiResult {
  const userText = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content.trim())
    .filter(Boolean)
    .join("\n\n");
  const firstLine = (userText.split("\n")[0] || "Návrh změny").trim();
  const title = firstLine.length > 70 ? `${firstLine.slice(0, 67)}...` : firstLine;
  const ctxLines = [
    `- Stránka: ${page.routeLabel || page.title} (${page.path})`,
    page.picked ? `- Ukázaný prvek: "${page.picked.text}" (${page.picked.selector})` : "",
    page.selection ? `- Označený text: "${page.selection}"` : "",
  ].filter(Boolean);
  const spec = [
    "**Co a proč**", userText || "(bez popisu)", "", "**Kde**", ...ctxLines,
  ].join("\n");
  return { mode: "draft", title: title.slice(0, FEEDBACK_LIMITS.title), spec };
}

export async function feedbackTurn(opts: {
  messages: ChatMessage[];
  page: PageContext;
  userName: string;
}): Promise<FeedbackAiResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallbackDraft(opts.messages, opts.page);

  const messages = toAnthropicMessages(opts.messages);
  if (!messages.length) {
    return { mode: "question", message: "Jasně, do toho. Co bys na téhle stránce chtěl/a změnit?" };
  }

  try {
    const client = new Anthropic({ apiKey, timeout: 50_000 });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: buildSystem(opts.page, opts.userName),
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: RESULT_SCHEMA },
      },
      messages,
    });
    const textBlock = res.content.find((b) => b.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : "";
    const parsed = JSON.parse(raw) as {
      mode?: string;
      message?: string;
      title?: string;
      spec?: string;
    };
    const title = (parsed.title ?? "").trim();
    const spec = (parsed.spec ?? "").trim();
    if (parsed.mode === "draft" && (title || spec)) {
      return {
        mode: "draft",
        title: (title || "Návrh změny").slice(0, FEEDBACK_LIMITS.title),
        spec: spec.slice(0, FEEDBACK_LIMITS.spec),
      };
    }
    const message = (parsed.message ?? "").trim();
    return {
      mode: "question",
      message: message || "Můžeš to prosím trochu upřesnit?",
    };
  } catch {
    // AI nedostupná / chyba parsování → ať se feedback neztratí, složíme návrh.
    return fallbackDraft(opts.messages, opts.page);
  }
}
