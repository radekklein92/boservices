// Sdílené typy a čisté helpery feedback widgetu (AI chat → návrh změny).
// Importují to OBĚ strany (server: db/ai/api, client: widget/capture), takže tu
// NESMÍ být nic server-only ani DOM-only - jen typy, mapa rout a konstanty.

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

// Prvek, na který uživatel ukázal tlačítkem „Ukázat prvek".
export interface PickedElement {
  text: string;
  selector: string;
  role?: string;
}

// Snímek kontextu stránky, který se posílá AI, aby chápala, o čem uživatel mluví.
export interface PageContext {
  path: string; // pathname + search
  title: string; // document.title
  routeLabel: string; // lidský název stránky (mapa níže)
  headings: string[]; // h1/h2/h3
  fieldLabels: string[]; // label/th (struktura formulářů a tabulek)
  visibleText: string; // ořezaný viditelný text <main>
  selection?: string; // co si uživatel označil myší
  picked?: PickedElement; // prvek, na který ukázal
}

// Limity (jeden zdroj pravdy pro client capture i server zod validaci).
export const FEEDBACK_LIMITS = {
  visibleText: 4000,
  selection: 600,
  pickedText: 400,
  selector: 400,
  headings: 25,
  fieldLabels: 40,
  transcript: 16, // kolik posledních zpráv posíláme AI
  messageChars: 4000,
  title: 160,
  spec: 8000,
} as const;

// Mapa route → lidský název. Zrcadlí registr v SidebarNav.tsx + detailové a POS
// routy. Pořadí: konkrétnější (s [id]) PŘED obecnější. První shoda vyhrává.
const ROUTE_LABELS: Array<[RegExp, string]> = [
  [/^\/portal\/?$/, "Dashboard"],
  [/^\/portal\/tasks/, "Úkoly"],
  [/^\/portal\/clients\/[^/]+\/edit/, "Úprava klienta"],
  [/^\/portal\/clients\/[^/]+/, "Detail klienta"],
  [/^\/portal\/clients/, "Klienti"],
  [/^\/portal\/contracts\/[^/]+/, "Detail smlouvy"],
  [/^\/portal\/contracts/, "Smlouvy"],
  [/^\/portal\/locations\/[^/]+/, "Detail lokality"],
  [/^\/portal\/locations/, "Lokality"],
  [/^\/portal\/real-estate/, "Real Estate"],
  [/^\/portal\/commissions/, "Provize"],
  [/^\/portal\/templates\/[^/]+/, "Editor šablony"],
  [/^\/portal\/templates/, "Šablony smluv"],
  [/^\/portal\/users/, "Uživatelé"],
  [/^\/portal\/admin\/changes/, "Změny portálu"],
  [/^\/portal\/admin\/telegram/, "Telegram"],
  [/^\/portal\/admin\/pos-pairing/, "Párování pokladen"],
  [/^\/portal\/design-system/, "Design system"],
  [/^\/portal\/pos\/produkty\/[^/]+/, "Tržby - Detail produktu"],
  [/^\/portal\/pos\/produkty/, "Tržby - Produkty"],
  [/^\/portal\/pos\/prodejny\/[^/]+/, "Tržby - Detail prodejny"],
  [/^\/portal\/pos\/prodejny/, "Tržby - Prodejny"],
  [/^\/portal\/pos\/koncepty/, "Tržby - Koncepty"],
  [/^\/portal\/pos\/mesta/, "Tržby - Města"],
  [/^\/portal\/pos\/uctenky\/[^/]+/, "Tržby - Detail účtenky"],
  [/^\/portal\/pos\/uctenky/, "Tržby - Účtenky"],
  [/^\/portal\/pos\/zive/, "Tržby - Živě"],
  [/^\/portal\/pos\/reporty/, "Tržby - Reporty"],
  [/^\/portal\/pos/, "Tržby - Přehled"],
];

export function routeLabelFor(path: string, fallback = ""): string {
  const clean = path.split("?")[0];
  for (const [re, label] of ROUTE_LABELS) {
    if (re.test(clean)) return label;
  }
  return fallback;
}
