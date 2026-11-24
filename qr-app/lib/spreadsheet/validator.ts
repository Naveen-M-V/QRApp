import {
  FieldConfig,
  PayloadFormat,
  BlankHandling,
  DuplicateRule,
  StudentRecord,
  RowValidationIssue,
} from "@/types";

export interface ValidationSummary {
  totalRows: number;
  validStudents: StudentRecord[];
  skippedStudents: StudentRecord[];
  issues: RowValidationIssue[];
  duplicateCount: number;
  invalidCount: number;
  validCount: number;
}

/**
 * Inverts a column mapping (sheet column -> fieldKey) into fieldKey -> [columns].
 * Several columns may feed one field when sheets of a workbook use different
 * headers for the same thing ("Register Number" on one sheet, "Reg No" on another).
 */
export function buildKeyToColumns(mapping: Record<string, string>): Record<string, string[]> {
  const keyToCols: Record<string, string[]> = {};
  for (const [col, key] of Object.entries(mapping)) {
    if (!key) continue;
    (keyToCols[key] ||= []).push(col);
  }
  return keyToCols;
}

/**
 * Returns the trimmed value of a field for one row: the first mapped column that has a value.
 */
export function getFieldValue(
  row: Record<string, unknown>,
  fieldKey: string,
  keyToCols: Record<string, string[]>
): string {
  for (const col of keyToCols[fieldKey] || []) {
    const raw = row[col];
    if (raw === undefined || raw === null) continue;
    const val = String(raw).trim();
    if (val) return val;
  }
  return "";
}

/**
 * Formats a plain-text QR payload according to configured field ordering, labels, and formatting rules.
 * Strictly adheres to Section 6 of Developer Working Document:
 * - Plain text with one field per line
 * - No URL, no JSON, no database IDs
 * - Stable line breaks
 */
export function buildQRPayload(
  studentData: Record<string, string>,
  fields: FieldConfig[],
  mapping: Record<string, string>, // sheet column -> fieldKey
  format: PayloadFormat = "colon",
  blankHandling: BlankHandling = "omit"
): string {
  const keyToCols = buildKeyToColumns(mapping);
  const lines: string[] = [];

  for (const field of fields) {
    if (!field.active || !field.inQr) continue;
    // A field with no spreadsheet column mapped to it is never written into the QR,
    // even when blank values are set to "show" (otherwise every QR gets e.g. "Department: —")
    if (!keyToCols[field.key]) continue;

    let val = getFieldValue(studentData, field.key, keyToCols);

    if (!val) {
      if (blankHandling === "omit") continue;
      val = "—";
    }

    if (format === "value") {
      lines.push(val);
    } else if (format === "dash") {
      lines.push(`${field.qrLabel} - ${val}`);
    } else {
      // Default: "colon"
      lines.push(`${field.qrLabel}: ${val}`);
    }
  }

  return lines.join("\n");
}

/**
 * Validates spreadsheet data rows against field configs, required rules, and duplicate rules
 */
export function validateStudentRows(
  rows: Record<string, string>[],
  fields: FieldConfig[],
  mapping: Record<string, string>,
  duplicateRule: DuplicateRule = "keep",
  format: PayloadFormat = "colon",
  blankHandling: BlankHandling = "omit"
): ValidationSummary {
  const keyToCols = buildKeyToColumns(mapping);
  const val = (row: Record<string, string>, key: string) => getFieldValue(row, key, keyToCols);
  const optional = (row: Record<string, string>, key: string) => val(row, key) || undefined;

  const requiredFields = fields.filter((f) => f.active && f.required);

  // Real position of each row: its sheet and its 1-based row number inside that sheet
  const sheetOf = (row: Record<string, string>) => (row._sheetName as string) || "Sheet1";
  const rowNumberOf = (row: Record<string, string>, idx: number) => {
    const n = parseInt(String(row._rowNumber ?? ""), 10);
    return Number.isFinite(n) && n > 0 ? n : idx + 2; // fallback: row 1 is header
  };

  // Serial numbers restart at 1 on every sheet so each sheet folder is numbered 1, 2, 3...
  const sheetCounters = new Map<string, number>();
  const sheetPositions = rows.map((row) => {
    const sheet = sheetOf(row);
    const next = (sheetCounters.get(sheet) || 0) + 1;
    sheetCounters.set(sheet, next);
    return next;
  });

  const registerNoSeen = new Map<string, number>(); // registerNo -> first row index
  const duplicateIndices = new Set<number>();

  // Pass 1: Identify duplicate register numbers (across the whole workbook)
  rows.forEach((row, idx) => {
    const reg = val(row, "register_no");
    if (!reg) return;

    if (registerNoSeen.has(reg)) {
      duplicateIndices.add(idx);
      if (duplicateRule === "skip") {
        // In 'skip' rule, both the first and subsequent occurrences are skipped
        duplicateIndices.add(registerNoSeen.get(reg)!);
      }
    } else {
      registerNoSeen.set(reg, idx);
    }
  });

  const validStudents: StudentRecord[] = [];
  const skippedStudents: StudentRecord[] = [];
  const issues: RowValidationIssue[] = [];

  // Pass 2: Row validation
  rows.forEach((row, idx) => {
    const rowNumber = rowNumberOf(row, idx);
    const sheetName = sheetOf(row);
    const name = val(row, "name");
    const regNo = val(row, "register_no");
    const serialNo = val(row, "serial_no") || String(sheetPositions[idx]);

    const baseRecord = {
      sheetName,
      rowNumber,
      serialNo,
      registerNo: regNo,
      course: optional(row, "course"),
      department: optional(row, "department"),
      academicYear: optional(row, "academic_year"),
      bloodGroup: optional(row, "blood_group"),
      studentData: row,
    };

    // 1. Check duplicate
    if (duplicateIndices.has(idx)) {
      const firstIdx = registerNoSeen.get(regNo) ?? idx;
      const isFirst = firstIdx === idx;
      const firstRow = rows[firstIdx];
      const firstSheet = sheetOf(firstRow);
      const firstWhere =
        firstSheet === sheetName
          ? `row ${rowNumberOf(firstRow, firstIdx)}`
          : `row ${rowNumberOf(firstRow, firstIdx)} of sheet "${firstSheet}"`;
      const reason = isFirst
        ? `Duplicate register number (first occurrence, excluded by policy)`
        : `Duplicate register number — same as ${firstWhere}`;

      issues.push({
        rowNumber,
        sheetName,
        registerNo: regNo,
        studentName: name,
        status: "duplicate",
        errorReason: reason,
      });

      skippedStudents.push({
        ...baseRecord,
        name: name || "(empty)",
        qrPayload: "",
        status: "dup",
        errorReason: reason,
      });
      return;
    }

    // 2. Check missing required fields
    const missingReqs = requiredFields
      .filter((reqField) => !val(row, reqField.key))
      .map((reqField) => reqField.label);

    if (missingReqs.length > 0) {
      const reason = `Missing required field${missingReqs.length > 1 ? "s" : ""}: ${missingReqs.join(", ")}`;
      issues.push({
        rowNumber,
        sheetName,
        registerNo: regNo,
        studentName: name,
        status: "invalid",
        errorReason: reason,
      });

      skippedStudents.push({
        ...baseRecord,
        name: name || "(empty)",
        qrPayload: "",
        status: "skip",
        errorReason: reason,
      });
      return;
    }

    // Valid record
    validStudents.push({
      ...baseRecord,
      name,
      qrPayload: buildQRPayload(row, fields, mapping, format, blankHandling),
      status: "gen",
    });
  });

  const duplicateCount = issues.filter((i) => i.status === "duplicate").length;
  const invalidCount = issues.filter((i) => i.status === "invalid").length;

  return {
    totalRows: rows.length,
    validStudents,
    skippedStudents,
    issues,
    duplicateCount,
    invalidCount,
    validCount: validStudents.length,
  };
}
