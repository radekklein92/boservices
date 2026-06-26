// Minimální XLSX (OOXML SpreadsheetML) writer nad jszip - bez těžké závislosti
// (exceljs), protože jszip už v projektu je a je turbopack-safe. Protějšek
// parseru v ./xlsx.ts (ten XLSX čte, tohle ho píše). Zvládne víc listů,
// textové i číselné buňky, tučnou hlavičku, číselný formát s tisíci oddělovači
// a šířky sloupců. Pro účetní export to bohatě stačí; není to obecná tabulková
// knihovna (žádné vzorce, slučování, styly per buňka navíc).
//
// Inline strings (ne sharedStrings) kvůli jednoduchosti - výstup je o něco
// větší, ale validní a Excel/LibreOffice/Google Sheets ho otevřou.

import JSZip from "jszip";

export type CellValue = string | number | null | undefined;

export interface XlsxColumn {
  header: string;
  width?: number; // v "znacích" (Excel column width), default 14
}

export interface XlsxSheet {
  name: string; // název listu (Excel limit 31 znaků, viz sanitizeSheetName)
  columns: XlsxColumn[];
  rows: CellValue[][];
}

// Styl indexy do cellXfs ve styles.xml (viz STYLES_XML níže).
const STYLE_DEFAULT = 0; // text, normální
const STYLE_HEADER = 1; // text, tučně
const STYLE_NUMBER = 2; // číslo, formát #,##0

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// 0 -> "A", 25 -> "Z", 26 -> "AA" ... (Excel sloupcová písmena).
function colLetter(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

// Název listu: max 31 znaků, bez \ / ? * [ ] : (Excel pravidla).
function sanitizeSheetName(name: string, fallback: string): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, " ").trim();
  return (cleaned || fallback).slice(0, 31);
}

function isFiniteNumber(v: CellValue): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function cellXml(ref: string, value: CellValue, headerRow: boolean): string {
  if (value === null || value === undefined || value === "") return "";
  if (isFiniteNumber(value)) {
    return `<c r="${ref}" s="${STYLE_NUMBER}"><v>${value}</v></c>`;
  }
  const style = headerRow ? STYLE_HEADER : STYLE_DEFAULT;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
}

function rowXml(cells: CellValue[], rowIndex: number, headerRow: boolean): string {
  const r = rowIndex + 1; // 1-based
  const parts = cells
    .map((v, c) => cellXml(`${colLetter(c)}${r}`, v, headerRow))
    .filter(Boolean)
    .join("");
  return `<row r="${r}">${parts}</row>`;
}

function colsXml(columns: XlsxColumn[]): string {
  if (!columns.length) return "";
  const cols = columns
    .map(
      (col, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${col.width ?? 14}" customWidth="1"/>`,
    )
    .join("");
  return `<cols>${cols}</cols>`;
}

function sheetXml(sheet: XlsxSheet): string {
  const headerRow = rowXml(
    sheet.columns.map((c) => c.header),
    0,
    true,
  );
  const dataRows = sheet.rows
    .map((cells, i) => rowXml(cells, i + 1, false))
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${colsXml(sheet.columns)}<sheetData>${headerRow}${dataRows}</sheetData></worksheet>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

function contentTypesXml(sheetCount: number): string {
  const overrides = Array.from(
    { length: sheetCount },
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}</Types>`;
}

function workbookXml(sheetNames: string[]): string {
  const sheets = sheetNames
    .map(
      (name, i) =>
        `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`;
}

// rId1..N = listy, rId(N+1) = styles.
function workbookRelsXml(sheetCount: number): string {
  const sheetRels = Array.from(
    { length: sheetCount },
    (_, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
  ).join("");
  const stylesRel = `<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRels}${stylesRel}</Relationships>`;
}

// Sestaví .xlsx soubor (ZIP) z listů. Vrací Uint8Array - izomorfní (Node i
// prohlížeč): server ho zabalí do Response, klient do Blobu ke stažení.
// Záměrně NE "nodebuffer" (chybí v browseru) - uint8array funguje všude.
export async function buildXlsx(sheets: XlsxSheet[]): Promise<Uint8Array> {
  if (!sheets.length) throw new Error("buildXlsx: alespoň jeden list je potřeba");
  const names = sheets.map((s, i) => sanitizeSheetName(s.name, `List ${i + 1}`));

  const zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypesXml(sheets.length));
  zip.file("_rels/.rels", RELS_XML);
  zip.file("xl/workbook.xml", workbookXml(names));
  zip.file("xl/_rels/workbook.xml.rels", workbookRelsXml(sheets.length));
  zip.file("xl/styles.xml", STYLES_XML);
  sheets.forEach((sheet, i) => {
    zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sheet));
  });

  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
