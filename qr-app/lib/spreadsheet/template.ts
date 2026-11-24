import * as XLSX from "xlsx";
import { FieldConfig } from "@/types";

/** Columns typed as numbers in Excel lose leading zeros / turn into 9.01E+11 — keep them as text */
const TEXT_FIELDS = new Set(["register_no", "aadhar", "mobile", "phone", "emergency_contact", "photo_no"]);
const PREFORMATTED_ROWS = 1000;

/**
 * Heading written in the template for a field. Uses the field's usual Excel column name
 * when it has one (these are recognised automatically on upload), else its label.
 */
export function templateHeading(field: FieldConfig): string {
  return (field.col || field.label).trim();
}

/**
 * Builds a blank data-collection workbook from the configured fields:
 * - "Students" sheet with one heading per active field, in field order
 * - ID / number columns pre-formatted as Text so leading zeros survive
 * - "Instructions" sheet explaining required fields and the one-sheet-per-department layout
 */
export function buildTemplateWorkbook(fields: FieldConfig[], institutionName = ""): XLSX.WorkBook {
  const active = fields.filter((f) => f.active);
  const headings = active.map(templateHeading);

  const ws: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet([headings]);
  // Pre-format ID-type columns as text for the first rows people will type into
  active.forEach((field, c) => {
    if (!TEXT_FIELDS.has(field.key)) return;
    for (let r = 1; r <= PREFORMATTED_ROWS; r++) {
      ws[XLSX.utils.encode_cell({ r, c })] = { t: "s", v: "", z: "@" };
    }
  });
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: PREFORMATTED_ROWS, c: Math.max(0, headings.length - 1) } });
  ws["!cols"] = active.map((f) => ({
    wch: f.key === "address" ? 50 : Math.max(12, templateHeading(f).length + 4),
  }));

  const required = active.filter((f) => f.required).map(templateHeading);
  const instructions = [
    [`${institutionName ? institutionName + " — " : ""}QR / ID Card Data Template`],
    [],
    ["How to fill this in"],
    ["1.", "Enter one person (student or staff) per row, starting on row 2. Do not change the headings in row 1."],
    ["2.", `Required columns: ${required.join(", ") || "none"}. Rows missing these are skipped.`],
    ["3.", "Register / ID numbers must be unique across the whole file."],
    ["4.", "One sheet per department, class or section: right-click the 'Students' tab → Move or Copy → Create a copy, then rename the tab (e.g. 'BBA', 'BCom A&F'). Each sheet becomes its own folder of QR codes."],
    ["5.", "ID, Aadhaar and phone columns are already set to Text so leading zeros are kept. If you paste data, use Paste Special → Values."],
    ["6.", "Leave a cell empty if you don't have the information. Extra columns you add are imported too."],
    [],
    ["Columns in this template"],
    ...active.map((f) => [templateHeading(f), f.required ? "Required" : "Optional", f.help || ""]),
  ];
  const info = XLSX.utils.aoa_to_sheet(instructions);
  info["!cols"] = [{ wch: 22 }, { wch: 110 }, { wch: 50 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Students");
  XLSX.utils.book_append_sheet(wb, info, "Instructions");
  return wb;
}
