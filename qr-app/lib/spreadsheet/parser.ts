import * as XLSX from "xlsx";
import { COLUMN_ALIAS_MAP } from "@/lib/constants";

export interface SheetSummary {
  name: string;
  rowCount: number;
  /** Column headers found on this sheet (sheets may differ) */
  headers: string[];
}

export interface ParsedSpreadsheet {
  fileName: string;
  fileSize: number;
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
  suggestedMapping: Record<string, string>;
  sheets: SheetSummary[];
}

/**
 * Normalizes a header string for alias matching (lowercase, trimmed, stripped of special characters)
 */
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[._\-]/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Returns true when `alias` appears in `norm` as whole word(s), e.g. "register no" in
 * "student register no", but not "id" inside "valid until".
 */
function containsWords(norm: string, alias: string): boolean {
  return ` ${norm} `.includes(` ${alias} `);
}

/**
 * Suggests standard field keys for ONE sheet's headers using the alias dictionary.
 *
 * Two passes so that an exact header ("Name") always wins over a loose partial match
 * from an earlier column ("Department Name"). Within a sheet each field key is used once.
 */
export function detectColumnMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const mappedKeys = new Set<string>();
  const normed = headers.map((h) => normalizeHeader(h));

  // Pass 1: exact alias matches
  headers.forEach((header, i) => {
    for (const [fieldKey, aliases] of Object.entries(COLUMN_ALIAS_MAP)) {
      if (mappedKeys.has(fieldKey)) continue;
      if (aliases.includes(normed[i])) {
        mapping[header] = fieldKey;
        mappedKeys.add(fieldKey);
        return;
      }
    }
  });

  // Pass 2: whole-word partial matches (e.g. "Student Register No." -> register_no).
  // The longest matching alias wins, so "Aadhar ID No" goes to aadhar, not "id no".
  headers.forEach((header, i) => {
    if (mapping[header]) return;
    const norm = normed[i];
    let best = "";
    let bestLen = 0;
    for (const [fieldKey, aliases] of Object.entries(COLUMN_ALIAS_MAP)) {
      if (mappedKeys.has(fieldKey)) continue;
      for (const alias of aliases) {
        if (alias.length >= 3 && alias.length > bestLen && containsWords(norm, alias)) {
          best = fieldKey;
          bestLen = alias.length;
        }
      }
    }
    if (best) {
      mapping[header] = best;
      mappedKeys.add(best);
    }
  });

  // Everything else is still imported, as its own custom field
  headers.forEach((header, i) => {
    if (mapping[header]) return;
    let genKey = normed[i].replace(/[^a-z0-9]/g, "_").replace(/^_+|_+$/g, "");
    if (!genKey) genKey = "col";
    let candidateKey = genKey;
    let counter = 1;
    while (mappedKeys.has(candidateKey) || COLUMN_ALIAS_MAP[candidateKey]) {
      candidateKey = `${genKey}_${counter++}`;
    }
    mapping[header] = candidateKey;
    mappedKeys.add(candidateKey);
  });

  return mapping;
}

/**
 * Builds one mapping for a whole workbook by detecting each sheet separately.
 * Different sheets may use different headers for the same field
 * ("Register Number" in one, "Reg No" in another) - both map to register_no.
 */
export function detectWorkbookMapping(sheetHeaders: string[][]): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const headers of sheetHeaders) {
    const perSheet = detectColumnMapping(headers);
    for (const [header, key] of Object.entries(perSheet)) {
      if (!(header in merged)) merged[header] = key;
    }
  }
  return merged;
}

/**
 * Finds the actual header row index (skipping institution banners, empty rows, etc.)
 */
function findHeaderRowIndex(rawRows: unknown[][]): number {
  if (rawRows.length <= 1) return 0;

  const keywords = [
    "name", "reg", "roll", "s no", "sl no", "serial", "student", "course",
    "dept", "id", "admission", "programme", "branch", "degree"
  ];

  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const row = (rawRows[i] || []).map((c) => String(c || "").trim());
    const nonEmpty = row.filter((c) => c.length > 0);
    if (nonEmpty.length >= 2) {
      const hasKeyword = nonEmpty.some((cell) => {
        const norm = normalizeHeader(cell);
        return keywords.some((kw) => norm === kw || norm.includes(kw));
      });
      if (hasKeyword) {
        return i;
      }
    }
  }

  for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
    const row = (rawRows[i] || []).map((c) => String(c || "").trim());
    if (row.filter((c) => c.length > 0).length >= 2) {
      return i;
    }
  }

  return 0;
}

/**
 * Parses an ArrayBuffer or Uint8Array of an XLSX or CSV file
 * Guarantees string preservation of roll numbers and leading zeros
 */
export function parseSpreadsheetBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  fileSize: number
): ParsedSpreadsheet {
  // Validate file extension
  if (!/\.(xlsx|xls|csv)$/i.test(fileName)) {
    throw new Error(
      `"${fileName}" is not a supported format. Please upload an Excel (.xlsx, .xls) or CSV (.csv) file.`
    );
  }

  // Validate binary magic bytes
  const bytes = new Uint8Array(buffer);
  if (/\.xlsx$/i.test(fileName)) {
    if (
      bytes.length < 4 ||
      bytes[0] !== 0x50 ||
      bytes[1] !== 0x4b ||
      bytes[2] !== 0x03 ||
      bytes[3] !== 0x04
    ) {
      throw new Error(
        "The uploaded file could not be parsed. The file may be corrupt or encrypted."
      );
    }
  } else if (/\.xls$/i.test(fileName)) {
    // OLE2 / BIFF8 signature: D0 CF 11 E0
    if (
      bytes.length >= 4 &&
      (bytes[0] !== 0xd0 ||
        bytes[1] !== 0xcf ||
        bytes[2] !== 0x11 ||
        bytes[3] !== 0xe0)
    ) {
      throw new Error(
        "The uploaded file could not be parsed. The file may be corrupt or encrypted."
      );
    }
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: "array",
      cellText: true,
      raw: false, // Ensures all cells are formatted as text, preserving leading zeros!
    });
  } catch {
    throw new Error(
      "The uploaded file could not be parsed. The file may be corrupt or encrypted."
    );
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error(
      "The uploaded file could not be parsed. The file may be corrupt, empty, or unsupported."
    );
  }

  const allRows: Record<string, string>[] = [];
  const allHeadersSet = new Set<string>();
  const sheetsSummary: SheetSummary[] = [];

  for (const sheetName of workbook.SheetNames) {
    // The downloadable template carries a help tab — never import it as data
    if (/^\s*instructions\s*$/i.test(sheetName)) continue;
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet["!ref"]) continue;

    // Convert to JSON with string values and header row
    const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false,
    });
    if (!rawRows || rawRows.length === 0) continue;

    const headerIdx = findHeaderRowIndex(rawRows);
    const headerRow: string[] = (rawRows[headerIdx] || []).map((h: unknown) =>
      String(h || "").trim()
    );

    const validHeaders = headerRow.filter((h) => h.length > 0);
    if (validHeaders.length === 0) continue;

    let sheetRowCount = 0;
    for (let i = headerIdx + 1; i < rawRows.length; i++) {
      const rowArray = rawRows[i];
      if (!rowArray || rowArray.length === 0) continue;

      const isEmpty = rowArray.every(
        (cell: unknown) => cell === undefined || cell === null || String(cell).trim() === ""
      );
      if (isEmpty) continue;

      const rowObj: Record<string, string> = {
        _sheetName: sheetName,
        // Actual 1-based row number inside this sheet, so reports point to the right Excel row
        _rowNumber: String(i + 1),
      };

      for (let j = 0; j < headerRow.length; j++) {
        const headerName = headerRow[j];
        if (!headerName) continue;
        const cellVal = rowArray[j];
        rowObj[headerName] = cellVal !== undefined && cellVal !== null ? String(cellVal).trim() : "";
      }

      allRows.push(rowObj);
      sheetRowCount++;
    }

    if (sheetRowCount > 0) {
      validHeaders.forEach((h) => allHeadersSet.add(h));
      sheetsSummary.push({
        name: sheetName,
        rowCount: sheetRowCount,
        headers: validHeaders,
      });
    }
  }

  if (allRows.length === 0) {
    throw new Error(
      "The sheet is empty. Put headings like Student Name and Register Number in the first row."
    );
  }

  const combinedHeaders = Array.from(allHeadersSet);
  const suggestedMapping = detectWorkbookMapping(sheetsSummary.map((sh) => sh.headers));

  return {
    fileName,
    fileSize,
    headers: combinedHeaders,
    rows: allRows,
    totalRows: allRows.length,
    suggestedMapping,
    sheets: sheetsSummary,
  };
}
