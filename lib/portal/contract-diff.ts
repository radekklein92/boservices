import { diffWords } from "diff";

export interface DiffResult {
  hasChanges: boolean;
  changeCount: number;
  diffHtml: string;
}

/**
 * Porovná originální (snapshot šablony) HTML s aktuálním HTML smlouvy
 * a vrátí HTML s `<ins>` (přidáno) a `<del>` (smazáno) značkami.
 *
 * Použito v "Přehled změn" modalu a v "PDF s úpravami" generování.
 *
 * HTML obou stran se před diffem normalizuje, jinak by Tiptap normalization
 * (např. wrapování <li>content</li> → <li><p>content</p></li>) dělal masivní
 * falešné rozdíly i u drobných editů.
 */
export function htmlDiff(
  original: string,
  current: string,
): DiffResult {
  const normalizedOriginal = normalizeHtmlForDiff(original);
  const normalizedCurrent = normalizeHtmlForDiff(current);

  if (normalizedOriginal === normalizedCurrent) {
    return { hasChanges: false, changeCount: 0, diffHtml: current };
  }

  const parts = diffWords(normalizedOriginal, normalizedCurrent);
  let diffHtml = "";
  let changeCount = 0;
  let inChangeRun = false;

  for (const part of parts) {
    if (part.added) {
      diffHtml += `<ins>${part.value}</ins>`;
      if (!inChangeRun) {
        changeCount++;
        inChangeRun = true;
      }
    } else if (part.removed) {
      diffHtml += `<del>${part.value}</del>`;
      if (!inChangeRun) {
        changeCount++;
        inChangeRun = true;
      }
    } else {
      diffHtml += part.value;
      inChangeRun = false;
    }
  }

  return { hasChanges: true, changeCount, diffHtml };
}

// Normalizuje HTML do tvaru, ve kterém můžeme dva dokumenty smysluplně diff-ovat.
// Hlavní problém: Tiptap při ukládání obaluje obsah <li> do <p>, přidává/odebírá
// bílé znaky, normalizuje sebezavírací značky. Pokud to nevyrovnáme, diff vůči
// raw šabloně z default-templates.ts hlásí desítky falešných změn.
export function normalizeHtmlForDiff(html: string): string {
  return (
    html
      // 1. Sjednotit whitespace - newlines, taby na mezery
      .replace(/[\t\n\r]+/g, " ")
      // 2. Strip whitespace mezi tagy (`>   <` → `><`)
      .replace(/>\s+</g, "><")
      // 3. Tiptap wrapuje obsah <li> do <p>. Sjednotit obě konvence.
      .replace(/<li>\s*<p>/gi, "<li>")
      .replace(/<\/p>\s*<\/li>/gi, "</li>")
      // 4. <p>&nbsp;</p> ↔ <p></p> ↔ prázdné mezery - Tiptap pro prázdné odstavce
      //    používá <p></p>, šablona <p>&nbsp;</p>. Sjednotit na <p></p>.
      .replace(/<p>\s*&nbsp;\s*<\/p>/gi, "<p></p>")
      // 5. Collapse multi-space
      .replace(/  +/g, " ")
      // 6. Sjednotit self-closing - <br/> ↔ <br> ↔ <br />
      .replace(/<br\s*\/?>/gi, "<br>")
      .trim()
  );
}
