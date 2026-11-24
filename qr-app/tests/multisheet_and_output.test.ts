import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { decode as decodePng } from "fast-png";
import { decode as decodeJpeg } from "jpeg-js";
import { parseSpreadsheetBuffer } from "@/lib/spreadsheet/parser";
import { validateStudentRows } from "@/lib/spreadsheet/validator";
import { createBatchZipArchive } from "@/lib/qr/zip-export";
import { generateQRImageDataUrl } from "@/lib/qr/generator";
import { generateBarcodeDataUrl, generateBarcodeSvg } from "@/lib/barcode/generator";
import { DEFAULT_FIELDS, DEFAULT_APPEARANCE } from "@/lib/constants";
import type { QRAppearanceSettings } from "@/types";

/** Workbook with 4 sheets that use different headings, a banner row, a Tamil sheet name and staff */
function buildWorkbook(): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["S.No", "Register Number", "Student Name", "Course"],
      [1, "023010154864501", "Arun", "B.Sc CS"],
      [2, "023010154864502", "Bala", "B.Sc CS"],
    ]),
    "CSE"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["SVCAS ECE Department List"],
      [],
      ["S.No", "Reg No", "Name", "Course"],
      [1, "023010154864601", "Chitra", "B.E ECE"],
      [2, "023010154864602", "Deepa", "B.E ECE"],
    ]),
    "ECE"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["S.No", "Register Number", "Student Name", "Course"],
      [1, "023010154864701", "முருகன்", "பி.ஏ தமிழ்"],
    ]),
    "தமிழ்"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["S.No", "Employee ID", "Staff Name", "Designation"],
      [1, "EMP001", "Dr. Kumar", "Professor"],
      [2, "EMP002", "Ms. Lakshmi", "Assistant Professor"],
    ]),
    "Staff"
  );
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}

function parseAndValidate() {
  const buf = buildWorkbook();
  const parsed = parseSpreadsheetBuffer(buf, "college.xlsx", buf.byteLength);
  const validation = validateStudentRows(parsed.rows, DEFAULT_FIELDS, parsed.suggestedMapping, "keep");
  return { parsed, validation };
}

async function zipFiles(appearance: QRAppearanceSettings) {
  const { parsed, validation } = parseAndValidate();
  const blob = await createBatchZipArchive(
    "college",
    validation.validStudents,
    validation.skippedStudents,
    validation.issues,
    parsed.totalRows,
    appearance,
    undefined,
    { columnMapping: parsed.suggestedMapping }
  );
  return JSZip.loadAsync(await blob.arrayBuffer());
}

const dataUrlBytes = (url: string) => new Uint8Array(Buffer.from(url.split(",")[1], "base64"));

describe("Multi-sheet workbooks", () => {
  it("maps different headings on different sheets to the same field", () => {
    const { parsed } = parseAndValidate();
    expect(parsed.suggestedMapping["Register Number"]).toBe("register_no");
    expect(parsed.suggestedMapping["Reg No"]).toBe("register_no");
    expect(parsed.suggestedMapping["Employee ID"]).toBe("register_no");
    expect(parsed.suggestedMapping["Student Name"]).toBe("name");
    expect(parsed.suggestedMapping["Name"]).toBe("name");
    expect(parsed.suggestedMapping["Staff Name"]).toBe("name");
    expect(parsed.suggestedMapping["Designation"]).toBe("designation");
    expect(parsed.sheets.map((s) => s.headers.length)).toEqual([4, 4, 4, 4]);
  });

  it("generates every row on every sheet, including staff", () => {
    const { validation } = parseAndValidate();
    expect(validation.issues).toEqual([]);
    expect(validation.validCount).toBe(7);
    const ece = validation.validStudents.find((s) => s.name === "Chitra")!;
    expect(ece.registerNo).toBe("023010154864601");
    expect(ece.qrPayload).toContain("Register No: 023010154864601");
  });

  it("reports the real Excel row number on each sheet (banner rows included)", () => {
    const { validation } = parseAndValidate();
    const byName = Object.fromEntries(validation.validStudents.map((s) => [s.name, s]));
    expect(byName["Arun"].rowNumber).toBe(2);
    expect(byName["Chitra"].rowNumber).toBe(4); // banner, blank, header, then data
    expect(byName["Dr. Kumar"].rowNumber).toBe(2);
    expect(byName["Ms. Lakshmi"].serialNo).toBe("2");
  });

  it("names the sheet when a duplicate is found on another sheet", () => {
    const { parsed } = parseAndValidate();
    const rows = parsed.rows.map((r) =>
      r["Name"] === "Deepa" ? { ...r, "Reg No": "023010154864501" } : r
    );
    const v = validateStudentRows(rows, DEFAULT_FIELDS, parsed.suggestedMapping, "keep");
    expect(v.issues).toHaveLength(1);
    expect(v.issues[0]).toMatchObject({ sheetName: "ECE", rowNumber: 5, status: "duplicate" });
    expect(v.issues[0].errorReason).toContain('row 2 of sheet "CSE"');
  });

  it("puts each sheet in its own folder in the ZIP", async () => {
    const zip = await zipFiles({ ...DEFAULT_APPEARANCE, naming: "serial" });
    const files = Object.keys(zip.files).filter((f) => !zip.files[f].dir).sort();
    expect(files).toEqual([
      "college/CSE/1.png",
      "college/CSE/2.png",
      "college/ECE/1.png",
      "college/ECE/2.png",
      "college/Staff/1.png",
      "college/Staff/2.png",
      "college/தமிழ்/1.png",
      "college_processing_report.csv",
    ]);
    const report = await zip.file("college_processing_report.csv")!.async("string");
    expect(report).toContain('4,"ECE","023010154864601","Chitra",Generated');
  });
});

describe("Output formats and sizes", () => {
  it("writes JPEG files at the exact requested pixel size", async () => {
    const zip = await zipFiles({ ...DEFAULT_APPEARANCE, format: "JPEG", sizeUnit: "px", sizeValue: 800, naming: "reg" });
    const jpgs = Object.keys(zip.files).filter((f) => f.endsWith(".jpg"));
    expect(jpgs).toHaveLength(7);
    const bytes = await zip.file(jpgs[0])!.async("uint8array");
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]); // JPEG signature
    const img = decodeJpeg(bytes);
    expect([img.width, img.height]).toEqual([800, 800]);
    expect(img.data[0]).toBeGreaterThan(240); // corner is white, not black/transparent
  });

  it("keeps QR transparency for PNG and drops it for JPEG", async () => {
    const png = decodePng(dataUrlBytes(await generateQRImageDataUrl("Name: Test", { ...DEFAULT_APPEARANCE, sizeValue: 300 })));
    expect(png.width).toBe(300);
    expect(png.channels).toBe(4);
    expect(png.data[3]).toBe(0); // corner pixel fully transparent

    const jpegUrl = await generateQRImageDataUrl("Name: Test", { ...DEFAULT_APPEARANCE, format: "JPEG", sizeValue: 300 });
    expect(jpegUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("makes the barcode exactly as wide as the requested size", async () => {
    for (const width of [300, 600, 1200]) {
      const url = await generateBarcodeDataUrl("023010154864701", { sizeUnit: "px", sizeValue: width });
      expect(decodePng(dataUrlBytes(url)).width).toBe(width);
    }
    // 2 inches at 300 DPI = 600 px
    const inch = await generateBarcodeDataUrl("023010154864701", { sizeUnit: "in", sizeValue: 2, dpi: 300 });
    expect(decodePng(dataUrlBytes(inch)).width).toBe(600);
    expect(generateBarcodeSvg("023010154864701", { sizeUnit: "px", sizeValue: 600 })).toContain('width="600"');
  });

  it("supports transparent barcodes (PNG and SVG) and white JPEG barcodes", async () => {
    const png = decodePng(dataUrlBytes(await generateBarcodeDataUrl("EMP001", { sizeValue: 400, transparent: true })));
    expect(png.data[3]).toBe(0);
    const opaque = decodePng(dataUrlBytes(await generateBarcodeDataUrl("EMP001", { sizeValue: 400 })));
    expect(opaque.data[3]).toBe(255);
    expect(generateBarcodeSvg("EMP001", { transparent: true })).not.toContain('fill="#ffffff"');
    const jpeg = await generateBarcodeDataUrl("EMP001", { sizeValue: 400, imageFormat: "jpeg", transparent: true });
    expect(decodeJpeg(dataUrlBytes(jpeg)).width).toBe(400);
  });
});

describe("Barcode field", () => {
  it("encodes the chosen field and falls back to the register number when it can't be encoded", async () => {
    const zip = await zipFiles({
      ...DEFAULT_APPEARANCE,
      codeType: "barcode",
      barcodeField: "course",
      naming: "reg",
      sizeValue: 600,
    });
    const files = Object.keys(zip.files).filter((f) => f.endsWith(".png"));
    // Every row that has a register number gets a barcode
    expect(files).toHaveLength(7);
    const warnings = await zip.file("college_barcode_warnings.csv")!.async("string");
    // Tamil course can't go into Code 128 -> register number used, and logged
    expect(warnings).toContain('"தமிழ்",2,"023010154864701"');
    expect(warnings).toContain("Used register number instead");
    // Staff sheet has no Course column -> also falls back, with the reason given
    expect(warnings).toContain("Barcode field is empty");
  });

  it("uses the register number by default and writes no warnings file", async () => {
    const zip = await zipFiles({ ...DEFAULT_APPEARANCE, codeType: "both", naming: "reg" });
    expect(zip.file("college_barcode_warnings.csv")).toBeNull();
    expect(zip.file("college/Staff/EMP001_barcode.png")).not.toBeNull();
    expect(zip.file("college/Staff/EMP001_qr.png")).not.toBeNull();
  });
});

describe("Custom file naming", () => {
  it("names files from chosen fields, e.g. Register No + Course", async () => {
    const zip = await zipFiles({
      ...DEFAULT_APPEARANCE,
      naming: "custom",
      namingFields: ["register_no", "course"],
      namingSeparator: "_",
    });
    expect(zip.file("college/CSE/023010154864501_B.Sc_CS.png")).not.toBeNull();
    expect(zip.file("college/தமிழ்/023010154864701_பி.ஏ_தமிழ்.png")).not.toBeNull();
    // Staff sheet has no Course column -> that part is skipped
    expect(zip.file("college/Staff/EMP001.png")).not.toBeNull();
  });

  it("supports the sheet name, dashes and three parts, with suffixes in dual mode", async () => {
    const zip = await zipFiles({
      ...DEFAULT_APPEARANCE,
      codeType: "both",
      naming: "custom",
      namingFields: ["__sheet", "serial_no", "name"],
      namingSeparator: "-",
    });
    expect(zip.file("college/ECE/ECE-1-Chitra_qr.png")).not.toBeNull();
    expect(zip.file("college/ECE/ECE-1-Chitra_barcode.png")).not.toBeNull();
    expect(zip.file("college/Staff/Staff-2-Ms._Lakshmi_qr.png")).not.toBeNull();
  });

  it("falls back to the register number when every chosen part is empty", async () => {
    const zip = await zipFiles({ ...DEFAULT_APPEARANCE, naming: "custom", namingFields: ["department"] });
    expect(zip.file("college/CSE/023010154864502.png")).not.toBeNull();
  });
});

describe("Unmapped fields", () => {
  it("never appear in the QR text, even when blanks are shown as —", () => {
    const { parsed } = parseAndValidate();
    const v = validateStudentRows(parsed.rows, DEFAULT_FIELDS, parsed.suggestedMapping, "keep", "colon", "show");
    const arun = v.validStudents.find((s) => s.name === "Arun")!;
    expect(arun.qrPayload).not.toContain("Department");
    expect(arun.qrPayload).not.toContain("Academic Year");
    // A mapped column that is empty for this row is still shown as —
    const staff = v.validStudents.find((s) => s.name === "Dr. Kumar")!;
    expect(staff.qrPayload).toContain("Course: —");
  });
});

describe("Data collection template", () => {
  it("has one heading per active field that is matched automatically, with ID columns as Text", async () => {
    const { buildTemplateWorkbook, templateHeading } = await import("@/lib/spreadsheet/template");
    const wb = buildTemplateWorkbook(DEFAULT_FIELDS, "SVCAS");
    expect(wb.SheetNames).toEqual(["Students", "Instructions"]);

    const out: ArrayBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const back = XLSX.read(out, { type: "array", cellNF: true });
    const ws = back.Sheets["Students"];
    const headings = DEFAULT_FIELDS.filter((f) => f.active).map(templateHeading);
    expect(XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 })[0]).toEqual(headings);
    const regCol = headings.indexOf("Register Number");
    expect(ws[XLSX.utils.encode_cell({ r: 1, c: regCol })].z).toBe("@");

    // Fill in two departments and upload: every column maps, the Instructions tab is ignored
    const fill = (sheet: string, rows: string[][]) =>
      XLSX.utils.book_append_sheet(back, XLSX.utils.aoa_to_sheet([headings, ...rows]), sheet);
    const row = (reg: string, name: string) => headings.map((h) => (h === "Register Number" ? reg : h === "Student Name" ? name : ""));
    fill("BBA", [row("0230101548001", "Arun")]);
    fill("BCom", [row("0230101548002", "Bala")]);
    delete back.Sheets["Students"];
    back.SheetNames = back.SheetNames.filter((n) => n !== "Students");

    const buf: ArrayBuffer = XLSX.write(back, { type: "array", bookType: "xlsx" });
    const parsed = parseSpreadsheetBuffer(buf, "filled.xlsx", buf.byteLength);
    expect(parsed.sheets.map((s) => s.name)).toEqual(["BBA", "BCom"]);
    for (const h of headings) {
      const key = parsed.suggestedMapping[h];
      expect(DEFAULT_FIELDS.some((f) => f.key === key), `${h} -> ${key}`).toBe(true);
    }
    const v = validateStudentRows(parsed.rows, DEFAULT_FIELDS, parsed.suggestedMapping);
    expect(v.validStudents.map((s) => s.registerNo)).toEqual(["0230101548001", "0230101548002"]);
  });
});
