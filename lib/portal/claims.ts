// Pohledávky pro Přílohu č. 1 smlouvy o postoupení pohledávek (claim-assignment
// i balíček claim-bundle). Obchodník vyplní jednotlivé pohledávky strukturovaně
// a z nich se při generování PDF poskládá tabulka + celková suma (vč. DPH).
//
// POZOR (DPH): Na rozdíl od zbytku aplikace, kde se částky zobrazují BEZ DPH,
// jsou výše pohledávek zde zadávané a sčítané VČETNĚ DPH (úmysl zadavatele).

export type ClaimOrigin = "kupni" | "fransizingova" | "manazerska" | "jina";

export const CLAIM_ORIGIN_OPTIONS: { value: ClaimOrigin; label: string }[] = [
  { value: "kupni", label: "Kupní smlouva" },
  { value: "fransizingova", label: "Franšízingová smlouva" },
  { value: "manazerska", label: "Manažerská smlouva" },
  { value: "jina", label: "Jiná smlouva" },
];

// Právní titul pohledávky - přednastavené možnosti (dropdown), aby se opakující
// se tituly nemusely psát dokola. "profit" doplňuje období (měsíc/rok),
// "other" libovolný text.
export type LegalTitleType =
  | "unjust-equipment"
  | "unjust-fee"
  | "profit"
  | "other";

// Kanonické texty pevných právních titulů (sdílené dropdownem i tabulkou).
const LEGAL_TITLE_EQUIPMENT =
  "Bezdůvodné obohacení za vrácení kupní ceny nábytku a vybavení provozovny vzniklé v důsledku ukončení kupní smlouvy";
const LEGAL_TITLE_FEE =
  "Bezdůvodné obohacení za vrácení vstupního franšízingového poplatku vzniklé v důsledku ukončení franšízingové smlouvy";

export const LEGAL_TITLE_OPTIONS: { value: LegalTitleType; label: string }[] = [
  { value: "unjust-equipment", label: LEGAL_TITLE_EQUIPMENT },
  { value: "unjust-fee", label: LEGAL_TITLE_FEE },
  { value: "profit", label: "Zisk z provozovny za… (měsíc a rok)" },
  { value: "other", label: "Jiný (vlastní text)" },
];

export interface ClaimItem {
  id: string;
  // Z jaké smlouvy pohledávka vznikla (dropdown). "jina" -> upřesnění v originOther.
  origin: ClaimOrigin;
  originOther?: string;
  // Datum uzavření zdrojové smlouvy (volný text) - v tabulce se zobrazí jako
  // „Kupní smlouva ze dne 12. 3. 2026".
  originDate?: string;
  // Právní titul pohledávky - dropdown. "profit" -> období v legalTitleProfitPeriod,
  // "other" -> volný text v legalTitleOther. legalTitle (níže) je legacy volný
  // text starších pohledávek.
  legalTitleType?: LegalTitleType;
  legalTitleProfitPeriod?: string; // měsíc a rok pro „zisk z provozovny za …"
  legalTitleOther?: string; // volný text pro „jiný"
  legalTitle?: string; // legacy: volný text dřívějších pohledávek
  // Výše pohledávky vč. DPH - syrový vstup uživatele (např. "150 000" / "150000,50").
  amount: string;
  // Dobrovolná pole:
  invoiceNumber?: string; // číslo faktury, pokud existuje
  dueDate?: string; // splatnost (volný text); prázdné u dosud neoznámených pohledávek
  note?: string; // vlastní poznámka
}

// Vytvoří prázdnou pohledávku s unikátním id (pro React key + editaci).
export function newClaimItem(): ClaimItem {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `claim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { id, origin: "kupni", originOther: "", originDate: "", legalTitleProfitPeriod: "", legalTitleOther: "", amount: "", invoiceNumber: "", dueDate: "", note: "" };
}

// Tolerantní parser částky vč. DPH. Akceptuje mezery, nbsp, "Kč"/"CZK" a
// desetinnou čárku (české zvyklosti). Vrací 0 pro neplatný / prázdný vstup.
export function parseClaimAmount(raw: string | undefined | null): number {
  if (!raw) return 0;
  const cleaned = raw
    .replace(/ /g, "")
    .replace(/\s/g, "")
    .replace(/kč/gi, "")
    .replace(/czk/gi, "")
    .replace(/,/g, ".")
    .replace(/[^0-9.\-]/g, "");
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : 0;
}

// Formát částky v českém stylu: nbsp jako oddělovač tisíců, desetinná čárka,
// desetinná místa jen když jsou nenulová. Vždy se sufixem " Kč".
export function formatCzk(value: number): string {
  if (!Number.isFinite(value)) return "0 Kč";
  const rounded = Math.round(value * 100) / 100;
  const hasDecimals = Math.abs(rounded % 1) > 0.0001;
  const fixed = hasDecimals ? rounded.toFixed(2) : String(Math.round(rounded));
  const [intPartRaw, decPart] = fixed.split(".");
  const negative = intPartRaw!.startsWith("-");
  const digits = negative ? intPartRaw!.slice(1) : intPartRaw!;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const sign = negative ? "-" : "";
  return decPart ? `${sign}${grouped},${decPart} Kč` : `${sign}${grouped} Kč`;
}

// Jako formatCzk, ale zaokrouhleno na celé koruny (bez halířů) - pro přehledy
// na dashboardu, kde halíře jen ruší. Smluvní tabulky používají dál formatCzk.
export function formatCzkRounded(value: number): string {
  return formatCzk(Math.round(value));
}

export function computeClaimsTotal(claims: ClaimItem[]): number {
  return claims.reduce((sum, c) => sum + parseClaimAmount(c.amount), 0);
}

export function formatClaimsTotalAmount(claims: ClaimItem[]): string {
  return formatCzk(computeClaimsTotal(claims));
}

// Popisek sloupce "Vznikla ze smlouvy" vč. data uzavření zdrojové smlouvy:
// „Kupní smlouva ze dne 12. 3. 2026". Pro "jina" upřednostní upřesnění.
export function claimOriginLabel(item: ClaimItem): string {
  const base =
    item.origin === "jina"
      ? item.originOther?.trim() || "Jiná smlouva"
      : CLAIM_ORIGIN_OPTIONS.find((o) => o.value === item.origin)?.label ??
        "Jiná smlouva";
  const date = item.originDate?.trim();
  const withDate = date ? `${base} ze dne ${date}` : base;
  return `${withDate} uzavřená mezi Dlužníkem a Postupitelem`;
}

// Text právního titulu do tabulky. Z dropdownu (legalTitleType), s doplněním
// období u „zisk z provozovny" a vlastním textem u „jiný". Fallback na starší
// volný text legalTitle.
export function claimLegalTitle(item: ClaimItem): string {
  switch (item.legalTitleType) {
    case "unjust-equipment":
      return LEGAL_TITLE_EQUIPMENT;
    case "unjust-fee":
      return LEGAL_TITLE_FEE;
    case "profit": {
      const period = item.legalTitleProfitPeriod?.trim();
      return period ? `zisk z provozovny za ${period}` : "zisk z provozovny za";
    }
    case "other":
      return item.legalTitleOther?.trim() ?? "";
    default:
      return item.legalTitle?.trim() ?? "";
  }
}

// Pohledávka je "neprázdná", pokud má vyplněnou částku nebo některé textové pole.
function isNonEmptyClaim(c: ClaimItem): boolean {
  return Boolean(
    c.amount?.trim() ||
      c.invoiceNumber?.trim() ||
      c.dueDate?.trim() ||
      c.note?.trim() ||
      c.originOther?.trim() ||
      c.originDate?.trim() ||
      c.legalTitleType ||
      c.legalTitleProfitPeriod?.trim() ||
      c.legalTitleOther?.trim() ||
      c.legalTitle?.trim(),
  );
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Vygeneruje HTML tabulku pro Přílohu č. 1. Vkládá se jako RAW HTML placeholder
// {{claimsTable}}, proto se veškerý uživatelský text musí escapovat zde.
// Dědí styly table/th/td z PDF_PAGE_STYLES; jen zarovnání částek a tučný
// řádek "Celkem" doplníme inline.
export function renderClaimsTableHtml(claims: ClaimItem[]): string {
  const valid = claims.filter(isNonEmptyClaim);
  if (valid.length === 0) {
    return `<p><em>Seznam postupovaných pohledávek zatím není vyplněn.</em></p>`;
  }
  const rows = valid
    .map((c) => {
      const amount = formatCzk(parseClaimAmount(c.amount));
      const legal = esc(claimLegalTitle(c)) || "—";
      const invoice = esc(c.invoiceNumber?.trim() ?? "") || "—";
      const due = esc(c.dueDate?.trim() ?? "") || "—";
      const note = esc(c.note?.trim() ?? "") || "—";
      return `<tr><td>${esc(claimOriginLabel(c))}</td><td>${legal}</td><td>${invoice}</td><td style="text-align:right;white-space:nowrap">${amount}</td><td>${due}</td><td>${note}</td></tr>`;
    })
    .join("");
  const total = formatCzk(computeClaimsTotal(valid));
  return `<table><thead><tr><th>Týká se smlouvy</th><th>Právní titul</th><th>Číslo faktury</th><th style="text-align:right">Výše pohledávky (vč. DPH)</th><th>Splatnost</th><th>Poznámka</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="3" style="font-weight:700">Celkem</td><td style="text-align:right;font-weight:700;white-space:nowrap">${total}</td><td></td><td></td></tr></tfoot></table>`;
}

// Doplní do proměnných pro render systémově generované hodnoty z pohledávek:
//   - claimsTable: HTML tabulka Přílohy č. 1 (raw HTML placeholder)
//   - totalClaimsAmount: součet vč. DPH (jen pokud existují pohledávky, jinak
//     ponecháme případnou ruční hodnotu / warning highlight v těle smlouvy)
// Používá se v každé render cestě (generate i bulk-pdf), aby se chování nerozešlo.
export function buildClaimsVariables(
  baseVariables: Record<string, string>,
  claims: ClaimItem[],
): Record<string, string> {
  const out: Record<string, string> = {
    ...baseVariables,
    claimsTable: renderClaimsTableHtml(claims),
  };
  if (computeClaimsTotal(claims) > 0) {
    out.totalClaimsAmount = formatClaimsTotalAmount(claims);
  }
  return out;
}

// Token, kterým v šabloně označujeme místo pro vygenerovanou tabulku pohledávek.
export const CLAIMS_TOKEN = "{{claimsTable}}";

// Starší smlouvy (a šablony) mají místo tokenu původní statický odstavec
// "Doplňte tabulkou ...". Pro zpětnou kompatibilitu ho při renderu nahradíme
// tokenem, případně token doplníme hned za nadpis Přílohy č. 1.
const LEGACY_HINT_RE =
  /<p[^>]*>\s*<em>\s*Doplňte tabulkou[\s\S]*?<\/em>\s*<\/p>/i;
const APPENDIX_HEADING_RE = /(<h2[^>]*>\s*Příloha č\.\s*1[^<]*<\/h2>)/i;

export function ensureClaimsToken(html: string): string {
  if (html.includes(CLAIMS_TOKEN)) return html;
  if (LEGACY_HINT_RE.test(html)) return html.replace(LEGACY_HINT_RE, CLAIMS_TOKEN);
  if (APPENDIX_HEADING_RE.test(html)) {
    return html.replace(APPENDIX_HEADING_RE, `$1${CLAIMS_TOKEN}`);
  }
  return html;
}

// Obalí nadpis Přílohy č. 1 + tabulku do bloku, který v PDF začne na nové
// stránce a tabulku nezalomí přes konec stránky (CSS .claims-appendix).
// Idempotentní. Aplikuje se jen při renderu do PDF - uložené HTML zůstává čisté.
// Podpisy Postupitele i Postupníka s datem pod Přílohou č. 1 (stejně jako v
// samotné smlouvě o postoupení). Doplňuje se při renderu hned za tabulku
// pohledávek; placeholdery se resolvnou v renderTemplate. Není v uloženém HTML
// (čistý editor), přidává se jen pro PDF.
const APPENDIX_SIGN_BLOCK =
  `<div class="claims-appendix-sign"><p>V {{place}} dne {{contractDate}}.</p>` +
  `<p>&nbsp;</p>` +
  `<p>__________________________<br><strong>{{clientSignerName}}</strong>` +
  `<br>{{clientSignerRole}}<br>za Postupitele: {{clientName}}</p>` +
  `<p>&nbsp;</p>` +
  `<p>V _________ dne ______________ .</p>` +
  `<p>&nbsp;</p>` +
  `<p>__________________________<br><strong>{{providerStatutory1Name}}</strong>` +
  `<br>{{providerStatutory1Role}}<br>za Postupníka: {{providerName}}</p></div>`;

export function ensureAppendixSignature(html: string): string {
  if (html.includes('class="claims-appendix-sign"')) return html;
  if (!html.includes(CLAIMS_TOKEN)) return html;
  return html.replace(CLAIMS_TOKEN, `${CLAIMS_TOKEN}${APPENDIX_SIGN_BLOCK}`);
}

// Obal kolem celé Přílohy č. 1 (nadpis + tabulka + podpis Postupitele) -> CSS
// .claims-appendix ji odsadí na novou stránku. Obalujeme od nadpisu „Příloha č.
// 1" do KONCE dokumentu, protože příloha je v postoupení vždy poslední blok.
// Robustní vůči tomu, že Tiptap zabalí {{claimsTable}} do <p> (pak by užší regex
// kolem tokenu nematchnul a příloha by se nezalomila).
const APPENDIX_FROM_HEADING_RE = /(<h2[^>]*>\s*Příloha č\.\s*1[\s\S]*)$/i;

export function wrapClaimsAppendix(html: string): string {
  if (html.includes('class="claims-appendix"')) return html;
  if (!APPENDIX_HEADING_RE.test(html)) return html;
  return html.replace(
    APPENDIX_FROM_HEADING_RE,
    '<div class="claims-appendix">$1</div>',
  );
}

// Render-time příprava HTML smlouvy postoupení: doplní token tabulky, podpis
// Postupitele pod přílohou a obalí vše do bloku se zalomením na novou stránku.
export function prepareClaimsAppendix(html: string): string {
  return wrapClaimsAppendix(ensureAppendixSignature(ensureClaimsToken(html)));
}

// Clamora Bridge (Postupník) nemá DIČ -> odstraní z řádku „DIČ: {{providerDic}}".
// Číslo účtu Postupitele se doplňuje ručně při podpisu -> nahradí placeholder
// linkou. Idempotentní. Volat JEN pro typy postoupení (claim-assignment,
// claim-bundle) - ostatní smlouvy (BOServices) DIČ legitimně mají.
export function stripClamoraDicAndBank(html: string): string {
  return html
    .split(", DIČ: {{providerDic}}")
    .join("")
    .split("č. {{clientBankAccount}}")
    .join("č. ______________________");
}
