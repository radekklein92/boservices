import JSZip from "jszip";

// Minimální čtečka XLSX postavená na jszip (už je v projektu) - vyhneme se těžké
// závislosti SheetJS. Čte první list: hodnoty buněk + počet červeně vyplněných
// buněk na řádek (manuální výplň ze styles.xml). Pro náš formát (jeden list,
// hlavička v řádku 1) to stačí; není to univerzální XLSX parser.

export type XlsxColumn = { letter: string; label: string };

export interface ParsedXlsx {
  sheetName: string;
  columns: XlsxColumn[];
  rows: Array<Record<string, string>>;
  rowRedCounts: number[];
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#10;/g, " ")
    .replace(/&#xA;/gi, " ")
    .replace(/&amp;/g, "&");
}

// Sdílené řetězce: každý <si> může mít víc <t> (rich text) - spojíme je.
function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let txt = "";
    for (const t of si[1]!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) txt += t[1];
    out.push(decodeEntities(txt));
  }
  return out;
}

// styles.xml → pro každý cellXf index vrátí, zda jeho výplň je červená.
function parseRedStyles(xml: string): boolean[] {
  // fills: pořadové <fill>, červená = solid patternFill s fgColor rgb v červené.
  const fillRed: boolean[] = [];
  const fillsBlock = xml.match(/<fills[^>]*>([\s\S]*?)<\/fills>/)?.[1] ?? "";
  for (const fill of fillsBlock.matchAll(/<fill>([\s\S]*?)<\/fill>/g)) {
    const inner = fill[1]!;
    const solid = /patternType="solid"/.test(inner);
    const rgb = inner.match(/<fgColor[^>]*\brgb="([0-9A-Fa-f]{6,8})"/)?.[1];
    fillRed.push(solid && !!rgb && isReddish(rgb));
  }
  // cellXfs: pořadové <xf ... fillId="N">. Index = atribut s na buňce.
  const xfsBlock = xml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? "";
  const xfRed: boolean[] = [];
  for (const xf of xfsBlock.matchAll(/<xf\b([^>]*)\/?>/g)) {
    const fillId = xf[1]!.match(/\bfillId="(\d+)"/)?.[1];
    xfRed.push(fillId !== undefined ? (fillRed[Number(fillId)] ?? false) : false);
  }
  return xfRed;
}

function isReddish(rgb: string): boolean {
  // ARGB (8) nebo RGB (6) - vezmeme poslední 6 znaků = RRGGBB.
  const hex = rgb.slice(-6);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return r >= 180 && g <= 100 && b <= 100;
}

export async function parseXlsxSheet(
  data: ArrayBuffer | Uint8Array,
): Promise<ParsedXlsx> {
  const zip = await JSZip.loadAsync(data);

  const workbook = (await zip.file("xl/workbook.xml")?.async("string")) ?? "";
  const sheetEl = workbook.match(/<sheet\b[^>]*\/>/)?.[0] ?? "";
  const sheetName = decodeEntities(sheetEl.match(/\bname="([^"]*)"/)?.[1] ?? "List1");
  const rId = sheetEl.match(/r:id="([^"]+)"/)?.[1] ?? "";
  const rels = (await zip.file("xl/_rels/workbook.xml.rels")?.async("string")) ?? "";
  let target =
    rels
      .match(new RegExp(`<Relationship[^>]*Id="${rId}"[^>]*Target="([^"]+)"`))?.[1] ??
    "worksheets/sheet1.xml";
  target = target.replace(/^\//, "").replace(/^xl\//, "");
  const sheetPath = `xl/${target}`;

  const sheetXml =
    (await zip.file(sheetPath)?.async("string")) ??
    (await zip.file("xl/worksheets/sheet1.xml")?.async("string")) ??
    "";
  const sharedStrings = parseSharedStrings(
    (await zip.file("xl/sharedStrings.xml")?.async("string")) ?? "",
  );
  const xfRed = parseRedStyles(
    (await zip.file("xl/styles.xml")?.async("string")) ?? "",
  );

  // Projdi řádky a buňky.
  const rowsByNum = new Map<number, Record<string, string>>();
  const redByNum = new Map<number, number>();
  const allLetters = new Set<string>();

  const cellRe =
    /<c\s+r="([A-Z]+)(\d+)"((?:\s+[a-zA-Z:]+="[^"]*")*)\s*(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m: RegExpExecArray | null;
  while ((m = cellRe.exec(sheetXml)) !== null) {
    const letter = m[1]!;
    const rowNum = Number(m[2]!);
    const attrs = m[3] ?? "";
    const inner = m[4] ?? "";
    const t = attrs.match(/\bt="([^"]+)"/)?.[1];
    const s = attrs.match(/\bs="(\d+)"/)?.[1];

    let value = "";
    if (inner) {
      if (t === "inlineStr") {
        let txt = "";
        for (const tEl of inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) txt += tEl[1];
        value = decodeEntities(txt);
      } else {
        const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        if (v !== undefined) {
          value = t === "s" ? (sharedStrings[Number(v)] ?? "") : decodeEntities(v);
        }
      }
    }

    let row = rowsByNum.get(rowNum);
    if (!row) {
      row = {};
      rowsByNum.set(rowNum, row);
      redByNum.set(rowNum, 0);
    }
    if (value !== "") row[letter] = value;
    allLetters.add(letter);

    // Červená buňka (počítáme i prázdné, výplň bývá na celém řádku).
    if (s !== undefined && xfRed[Number(s)]) {
      redByNum.set(rowNum, (redByNum.get(rowNum) ?? 0) + 1);
    }
  }

  const header = rowsByNum.get(1) ?? {};
  const columns: XlsxColumn[] = [...allLetters]
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
    .map((letter) => ({ letter, label: header[letter] ?? "" }));

  const dataRowNums = [...rowsByNum.keys()]
    .filter((n) => n >= 2)
    .sort((a, b) => a - b);
  const rows: Array<Record<string, string>> = [];
  const rowRedCounts: number[] = [];
  for (const n of dataRowNums) {
    rows.push(rowsByNum.get(n) ?? {});
    rowRedCounts.push(redByNum.get(n) ?? 0);
  }

  return { sheetName, columns, rows, rowRedCounts };
}
