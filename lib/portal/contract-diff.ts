import { diffArrays } from "diff";

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
 * Dvoufázový diff:
 *  1) HTML se rozdělí na bloky (odstavce, položky seznamu, nadpisy) a porovná
 *     se po blocích (diffArrays). Tím se zarovnají nezměněné klauzule a změna
 *     zůstane lokální - neproplétají se shodná slova napříč různými větami.
 *  2) Uvnitř změněného bloku (přepis) se udělá ještě slovní diff (diffWords),
 *     takže přepis se ukáže jako přeškrtnutý starý + podtržený nový text.
 *
 * HTML se nejdřív normalizuje (Tiptap re-serializace by jinak dělala falešné
 * rozdíly i u drobných editů).
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

  const origBlocks = segmentBlocks(normalizedOriginal);
  const currBlocks = segmentBlocks(normalizedCurrent);
  const parts = diffArrays(origBlocks, currBlocks);

  let diffHtml = "";
  let changeCount = 0;
  // Počítáme souvislé úseky změn (jeden zásah = 1), ne jednotlivé bloky -
  // přidání 10-položkového seznamu najednou je „1 změna", ne 10.
  let inChangeRun = false;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;

    if (!part.added && !part.removed) {
      diffHtml += part.value.join("");
      inChangeRun = false;
      continue;
    }

    if (!inChangeRun) {
      changeCount++;
      inChangeRun = true;
    }

    // Přepis: odebraný běh bloků následovaný přidaným = páruj 1:1 a uvnitř
    // každého páru udělej slovní diff. Přebytky vykresli jako čisté del/ins.
    if (part.removed && parts[i + 1]?.added) {
      const removedBlocks = part.value;
      const addedBlocks = parts[i + 1]!.value;
      const pairs = Math.min(removedBlocks.length, addedBlocks.length);
      for (let j = 0; j < pairs; j++) {
        diffHtml += intraBlockDiff(removedBlocks[j]!, addedBlocks[j]!);
      }
      for (let j = pairs; j < removedBlocks.length; j++) {
        diffHtml += `<del>${removedBlocks[j]}</del>`;
      }
      for (let j = pairs; j < addedBlocks.length; j++) {
        diffHtml += `<ins>${addedBlocks[j]}</ins>`;
      }
      i++; // přidaný běh jsme už zpracovali (zůstáváme v change-runu)
      continue;
    }

    // Čistě odebrané nebo čistě přidané bloky.
    const tag = part.removed ? "del" : "ins";
    for (const block of part.value) {
      diffHtml += `<${tag}>${block}</${tag}>`;
    }
  }

  return { hasChanges: true, changeCount, diffHtml };
}

// Rozdělí normalizované HTML na bloky (jeden blok = jedna klauzule/řádek).
// Dělí za blokovými uzavíracími tagy. Konkatenace bloků zpět dá původní HTML.
const BLOCK_CLOSE_RE = /(<\/(?:p|li|h1|h2|h3|blockquote|td|th|tr)>)/gi;

function segmentBlocks(html: string): string[] {
  const SEP = "";
  return html
    .replace(BLOCK_CLOSE_RE, `$1${SEP}`)
    .split(SEP)
    .filter((s) => s.length > 0);
}

// Tokenizace HTML na atomické značky + slova + mezery. Diff pak běží nad
// tokeny, takže nikdy nerozsekne tag a <ins>/<del> se nezanoří skrz <strong>.
const HTML_WORD_RE = /<[^>]+>|[^<\s]+|\s+/g;
function tokenizeHtmlWords(s: string): string[] {
  return s.match(HTML_WORD_RE) ?? [];
}
const isTag = (t: string) => t.charCodeAt(0) === 60; // '<'

// Slovní diff uvnitř jednoho (zarovnaného) bloku. Značky zůstávají strukturální
// (mimo ins/del), ins/del obaluje JEN text - výsledek je vždy validně zanořený
// (např. <strong><ins>Twistcafe</ins></strong>), ne mis-nested přes tagy.
function intraBlockDiff(a: string, b: string): string {
  if (a === b) return a;
  let out = "";
  for (const part of diffArrays(tokenizeHtmlWords(a), tokenizeHtmlWords(b))) {
    if (!part.added && !part.removed) {
      out += part.value.join("");
      continue;
    }
    const tag = part.added ? "ins" : "del";
    let open = false;
    for (const tok of part.value) {
      if (isTag(tok)) {
        if (open) {
          out += `</${tag}>`;
          open = false;
        }
        out += tok;
      } else {
        if (!open) {
          out += `<${tag}>`;
          open = true;
        }
        out += tok;
      }
    }
    if (open) out += `</${tag}>`;
  }
  return out;
}

// Normalizuje HTML do tvaru, ve kterém můžeme dva dokumenty smysluplně diff-ovat.
// Hlavní problém: Tiptap při ukládání obaluje obsah <li> do <p>, přidává/odebírá
// bílé znaky, normalizuje sebezavírací značky. Pokud to nevyrovnáme, diff vůči
// raw šabloně z default-templates.ts hlásí desítky falešných změn.
export function normalizeHtmlForDiff(html: string): string {
  return (
    html
      // 0. Odstranit pomocné značky zapečených hodnot (data-ph) - porovnáváme text.
      .replace(/<span[^>]*\bdata-ph="[^"]*"[^>]*>([\s\S]*?)<\/span>/g, "$1")
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
