import * as XLSX from "xlsx";

export type CellValue = string | null;
export type RawRow = Record<string, CellValue>;

export interface ParsedSheet {
  name: string;
  /** Original header text (unlabelled columns get a stable placeholder). */
  headers: string[];
  /** 1-based worksheet row number of the header row, or null for header-less sheets. */
  headerRow: number | null;
  rows: { rowNumber: number; values: RawRow }[];
  range: string | null;
}

export interface ParsedWorkbook {
  sheetNames: string[];
  sheets: Map<string, ParsedSheet>;
}

/** Placeholder used for a header cell that is empty in the workbook. */
export function unlabelledHeader(colIndex: number) {
  return `(unlabelled column ${XLSX.utils.encode_col(colIndex)})`;
}

/** Normalise a header for matching only — stored headers keep their original text. */
export function headerKey(h: string) {
  return h.replace(/\s+/g, " ").trim().toLowerCase();
}

function cellToString(v: unknown): CellValue {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  return s.length === 0 ? null : s;
}

/**
 * Reads every worksheet. A sheet's header row is the first row among the first 10
 * that has at least `minHeaderCells` text cells; sheets without one are header-less.
 */
export function parseWorkbook(buffer: ArrayBuffer | Buffer, minHeaderCells = 2): ParsedWorkbook {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true, dense: true });
  const sheets = new Map<string, ParsedSheet>();

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: false, blankrows: true });
    const width = matrix.reduce((m, r) => Math.max(m, r.length), 0);

    let headerIdx = -1;
    for (let i = 0; i < Math.min(10, matrix.length); i++) {
      const textCells = matrix[i].filter((c) => typeof c === "string" && c.trim() !== "" && Number.isNaN(Number(c)));
      if (textCells.length >= minHeaderCells) {
        headerIdx = i;
        break;
      }
    }

    // Column letters are reported relative to the sheet, which may not start at column A.
    const firstCol = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]).s.c : 0;
    const headers: string[] = [];
    for (let c = 0; c < width; c++) {
      const h = headerIdx >= 0 ? cellToString(matrix[headerIdx][c]) : null;
      // A repeated header would overwrite the earlier column's values; keep both.
      const name = h ?? unlabelledHeader(firstCol + c);
      headers.push(headers.includes(name) ? `${name} (column ${XLSX.utils.encode_col(firstCol + c)})` : name);
    }

    const rows: ParsedSheet["rows"] = [];
    for (let i = headerIdx + 1; i < matrix.length; i++) {
      const r = matrix[i];
      if (!r.some((c) => cellToString(c) !== null)) continue;
      const values: RawRow = {};
      headers.forEach((h, c) => (values[h] = cellToString(r[c])));
      rows.push({ rowNumber: i + 1, values });
    }

    sheets.set(name, {
      name,
      headers,
      headerRow: headerIdx >= 0 ? headerIdx + 1 : null,
      rows,
      range: ws["!ref"] ?? null,
    });
  }

  return { sheetNames: wb.SheetNames, sheets };
}

/** Look up a column by normalised header; returns the original header text. */
export function findHeader(sheet: ParsedSheet, wanted: string): string | undefined {
  const k = headerKey(wanted);
  return sheet.headers.find((h) => headerKey(h) === k);
}

export function findHeaderByPrefix(sheet: ParsedSheet, prefix: string): string | undefined {
  const k = headerKey(prefix);
  return sheet.headers.find((h) => headerKey(h).startsWith(k));
}

export const clean = (v: CellValue | undefined) => {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t === "" ? null : t;
};
