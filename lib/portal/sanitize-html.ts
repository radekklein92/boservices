import DOMPurify from "isomorphic-dompurify";

// Sanitizace HTML smlouvy / diffu před vložením do živého DOMu
// (dangerouslySetInnerHTML) nebo do PDF (puppeteer renderuje HTML v headless
// Chrome). HTML konceptu smlouvy může uložit kterýkoli přihlášený uživatel přes
// PUT /api/portal/contracts/[id], takže do náhledu změn / PDF nesmí propadnout
// <script>, on*-handlery ani jiné XSS vektory.
//
// Povolené zůstávají strukturální a formátovací značky smluv i diff markup
// (<ins>/<del> z contract-diff). DOMPurify default odstraní script, on*
// atributy i javascript:/data: URI; navíc explicitně zakazujeme vkládané
// dokumenty (iframe/object/embed) a formuláře.
export function sanitizeContractHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["ins", "del"],
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "style"],
    FORBID_ATTR: ["style"],
  });
}
