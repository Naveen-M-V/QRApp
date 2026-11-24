import * as XLSX from "xlsx";
import JSZip from "jszip";
import { CollectionForm, FormSubmission, latestPerStudent } from "@/lib/forms/schema";

const ID_KEYS = new Set(["register_no", "aadhar", "mobile", "phone", "emergency_contact"]);

function safeName(s: string, fallback: string) {
  return s.replace(/[\\/:*?"<>|\x00-\x1F]/g, "_").trim().slice(0, 80) || fallback;
}

/** Excel sheet names: max 31 chars, no []:*?/\ and unique */
function sheetName(dept: string, used: Set<string>) {
  const base = (dept || "Students").replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Students";
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 28)} ${i}`;
  used.add(name.toLowerCase());
  return name;
}

/**
 * One sheet per department, latest submission per student, columns in form order.
 * Headings use the generator's usual column names, so the file maps automatically.
 */
export function submissionsWorkbook(form: CollectionForm, submissions: FormSubmission[]): XLSX.WorkBook {
  const latest = latestPerStudent(submissions);
  const groups = new Map<string, FormSubmission[]>();
  const order = form.departments.length ? form.departments : [""];
  for (const d of order) groups.set(d, []);
  for (const s of latest) {
    if (!groups.has(s.department)) groups.set(s.department, []);
    groups.get(s.department)!.push(s);
  }

  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  const headings = ["S.No.", ...form.fields.map((f) => f.heading)];
  for (const [dept, rows] of groups) {
    if (rows.length === 0) continue;
    rows.sort((a, b) => a.registerNo.localeCompare(b.registerNo));
    const aoa: (string | number)[][] = [headings];
    rows.forEach((s, i) => aoa.push([i + 1, ...form.fields.map((f) => s.data[f.key] || "")]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // keep IDs as text
    form.fields.forEach((f, c) => {
      if (!ID_KEYS.has(f.key)) return;
      for (let r = 1; r <= rows.length; r++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c: c + 1 })];
        if (cell) {
          cell.t = "s";
          cell.z = "@";
        }
      }
    });
    ws["!cols"] = headings.map((h) => ({ wch: h === "Address" ? 50 : Math.max(10, h.length + 4) }));
    XLSX.utils.book_append_sheet(wb, ws, sheetName(dept, used));
  }
  if (wb.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headings]), "Students");
  }
  return wb;
}

export function workbookBytes(wb: XLSX.WorkBook): Uint8Array<ArrayBuffer> {
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

/** Photos ZIP: one folder per department, each photo named <register number>.jpg */
export async function photosZip(
  submissions: FormSubmission[],
  download: (path: string) => Promise<Blob>,
  onProgress?: (done: number, total: number) => void
): Promise<{ blob: Blob; missing: string[] }> {
  const latest = latestPerStudent(submissions);
  const zip = new JSZip();
  const missing: string[] = [];
  const withPhoto = latest.filter((s) => s.photoPath);
  for (const s of latest) if (!s.photoPath) missing.push(s.registerNo);
  let done = 0;
  for (const s of withPhoto) {
    try {
      const blob = await download(s.photoPath!);
      const folder = safeName(s.department, "All");
      zip.file(`${folder}/${safeName(s.registerNo, "student")}.jpg`, await blob.arrayBuffer());
    } catch {
      missing.push(s.registerNo);
    }
    onProgress?.(++done, withPhoto.length);
  }
  return { blob: await zip.generateAsync({ type: "blob" }), missing };
}
