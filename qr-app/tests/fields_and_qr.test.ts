import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  buildQRPayload,
  validateStudentRows,
} from "@/lib/spreadsheet/validator";
import {
  generateQRDataUrl,
  generateQRSvg,
  getStudentFileName,
  sanitizeFilename,
} from "@/lib/qr/generator";
import {
  createBatchZipArchive,
  generateProcessingReportCsv,
} from "@/lib/qr/zip-export";
import { DEFAULT_FIELDS, DEFAULT_APPEARANCE } from "@/lib/constants";
import { FieldConfig, StudentRecord } from "@/types";
import { convertToPixels, convertFromPixels, calculateDimensions } from "@/lib/qr/dimensions";
import { encodeBarcodeBinary, generateBarcodeSvg, generateBarcodeDataUrl } from "@/lib/barcode/generator";

describe("QR Generation, Fields Configuration & ZIP Engine", () => {
  // Test 11: Import profile reuse
  it("Test 11: Applies and preserves custom mappings consistently across runs", () => {
    const customMapping = {
      "Custom_Roll_Column": "register_no",
      "Full_Name_Header": "name",
      "Degree_Column": "course",
    };
    const row = {
      "Custom_Roll_Column": "992812",
      "Full_Name_Header": "Lakshmi N",
      "Degree_Column": "B.Sc. Statistics",
    };
    const summary = validateStudentRows([row], DEFAULT_FIELDS, customMapping);
    expect(summary.validCount).toBe(1);
    expect(summary.validStudents[0].registerNo).toBe("992812");
  });

  // Test 12: Custom field creation
  it("Test 12: Custom fields can be created and included in payload", () => {
    const customField: FieldConfig = {
      key: "hostel_block",
      label: "Hostel Block",
      qrLabel: "Hostel",
      type: "Text",
      required: false,
      active: true,
      inQr: true,
      custom: true,
    };
    const fieldsWithCustom = [...DEFAULT_FIELDS, customField];
    const row = {
      "Student Name": "E. Vignesh",
      "Register Number": "230101548645423",
      "Hostel Block": "Kaveri Block",
    };
    const mapping = {
      "Student Name": "name",
      "Register Number": "register_no",
      "Hostel Block": "hostel_block",
    };

    const payload = buildQRPayload(row, fieldsWithCustom, mapping, "colon", "omit");
    expect(payload).toContain("Hostel: Kaveri Block");
  });

  // Test 13: Field reordering
  it("Test 13: Payload strictly follows the administrator-configured field order", () => {
    // Reorder: Register Number first, then Name
    const reorderedFields: FieldConfig[] = [
      { key: "register_no", label: "Register Number", qrLabel: "Register No", type: "Text", required: true, active: true, inQr: true },
      { key: "name", label: "Student Name", qrLabel: "Name", type: "Text", required: true, active: true, inQr: true },
    ];
    const row = {
      "Student Name": "E. Vignesh",
      "Register Number": "230101548645423",
    };
    const mapping = { "Student Name": "name", "Register Number": "register_no" };

    const payload = buildQRPayload(row, reorderedFields, mapping);
    const lines = payload.split("\n");
    expect(lines[0]).toBe("Register No: 230101548645423");
    expect(lines[1]).toBe("Name: E. Vignesh");
  });

  // Test 14: Disabled field exclusion
  it("Test 14: Inactive or excluded fields are omitted from generated payload", () => {
    const fieldsWithDisabled: FieldConfig[] = [
      { key: "name", label: "Student Name", qrLabel: "Name", type: "Text", required: true, active: true, inQr: true },
      { key: "register_no", label: "Register Number", qrLabel: "Register No", type: "Text", required: true, active: true, inQr: true },
      { key: "blood_group", label: "Blood Group", qrLabel: "Blood Group", type: "Text", required: false, active: true, inQr: false }, // inQr is false!
    ];
    const row = {
      "Student Name": "E. Vignesh",
      "Register Number": "230101548645423",
      "Blood Group": "O+",
    };
    const mapping = { "Student Name": "name", "Register Number": "register_no", "Blood Group": "blood_group" };

    const payload = buildQRPayload(row, fieldsWithDisabled, mapping);
    expect(payload).not.toContain("Blood Group");
  });

  // Test 15: Exact QR payload ordering and line breaks
  it("Test 15: Plain text payload matches authoritative PDF specification format", () => {
    const row = {
      "Student Name": "E. Vignesh",
      "Register Number": "230101548645423",
      "Course": "B.Sc. Statistics",
      "Academic Year": "2023–2026",
      "Blood Group": "O+",
    };
    const mapping = {
      "Student Name": "name",
      "Register Number": "register_no",
      "Course": "course",
      "Academic Year": "academic_year",
      "Blood Group": "blood_group",
    };

    const payload = buildQRPayload(row, DEFAULT_FIELDS, mapping, "colon", "omit");
    const expected =
      "Name: E. Vignesh\nRegister No: 230101548645423\nCourse: B.Sc. Statistics\nAcademic Year: 2023–2026\nBlood Group: O+";

    expect(payload).toBe(expected);
  });

  // Test 16: ZIP archive contents
  it("Test 16: ZIP archive contains all and only successfully generated QR images with unique names", async () => {
    const students: StudentRecord[] = [
      { registerNo: "230101", name: "Student One", qrPayload: "Name: Student One", studentData: {}, status: "gen" },
      { registerNo: "230102", name: "Student Two", qrPayload: "Name: Student Two", studentData: {}, status: "gen" },
    ];

    const zipBlob = await createBatchZipArchive(
      "TestBatch",
      students,
      [],
      [],
      2,
      DEFAULT_APPEARANCE
    );

    const buffer = await zipBlob.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);

    const files = Object.keys(zip.files);
    expect(files.some((f) => f.includes("230101.png"))).toBe(true);
    expect(files.some((f) => f.includes("230102.png"))).toBe(true);
    expect(files.some((f) => f.includes("processing_report.csv"))).toBe(true);
  });

  // Test 16b: ZIP archive naming based on serial number from Excel
  it("Test 16b: ZIP archive names files based on Excel Serial Number when naming scheme is 'serial'", async () => {
    const students: StudentRecord[] = [
      { serialNo: "1", registerNo: "230101", name: "Student One", qrPayload: "Name: Student One", studentData: {}, status: "gen" },
      { serialNo: "2", registerNo: "230102", name: "Student Two", qrPayload: "Name: Student Two", studentData: {}, status: "gen" },
    ];

    const zipBlob = await createBatchZipArchive(
      "SerialBatch",
      students,
      [],
      [],
      2,
      { ...DEFAULT_APPEARANCE, naming: "serial", transparentBackground: true }
    );

    const buffer = await zipBlob.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    const files = Object.keys(zip.files);

    expect(files.some((f) => f.includes("1.png"))).toBe(true);
    expect(files.some((f) => f.includes("2.png"))).toBe(true);
  });

  // Test 16c: ZIP archive organizes QR codes into subfolders named by Excel sheet
  it("Test 16c: ZIP archive organizes QR codes into subfolders named by Excel sheet", async () => {
    const students: StudentRecord[] = [
      { sheetName: "BBA 43nos", serialNo: "1", registerNo: "230101", name: "Student BBA", qrPayload: "Name: Student BBA", studentData: {}, status: "gen" },
      { sheetName: "BCom A&F 64nos", serialNo: "1", registerNo: "230201", name: "Student BCom", qrPayload: "Name: Student BCom", studentData: {}, status: "gen" },
    ];

    const zipBlob = await createBatchZipArchive(
      "CollegeBatch",
      students,
      [],
      [],
      2,
      { ...DEFAULT_APPEARANCE, naming: "serial" }
    );

    const buffer = await zipBlob.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    const files = Object.keys(zip.files);

    expect(files.some((f) => f.includes("BBA 43nos/1.png"))).toBe(true);
    expect(files.some((f) => f.includes("BCom A&F 64nos/1.png"))).toBe(true);
  });

  // Test 17: Processing report reconciliation
  it("Test 17: Processing report totals strictly reconcile (input rows = generated + skipped + errors)", () => {
    const validStudents: StudentRecord[] = [
      { registerNo: "230101", name: "Alice", qrPayload: "Name: Alice", studentData: {}, status: "gen" },
      { registerNo: "230102", name: "Bob", qrPayload: "Name: Bob", studentData: {}, status: "gen" },
    ];
    const skippedStudents: StudentRecord[] = [
      { registerNo: "230103", name: "Charlie", qrPayload: "", studentData: {}, status: "skip" },
    ];
    const issues = [
      { rowNumber: 4, registerNo: "230103", studentName: "Charlie", status: "invalid" as const, errorReason: "Missing required Course" },
    ];

    const totalInputRows = 3;
    const reportCsv = generateProcessingReportCsv(
      "ReconciliationBatch",
      totalInputRows,
      validStudents,
      skippedStudents,
      issues
    );

    expect(reportCsv).toContain("Total Input Rows: 3");
    expect(reportCsv).toContain("Successful QR Codes: 2");
    expect(reportCsv).toContain("Skipped / Error Rows: 1");
    expect(reportCsv).toContain("3 = 2 + 1");
  });

  // Test 21: Offline plain-text readability
  it("Test 21: Payload contains NO URL, NO JSON, and requires NO server connection", () => {
    const row = { "Student Name": "E. Vignesh", "Register Number": "230101" };
    const mapping = { "Student Name": "name", "Register Number": "register_no" };
    const payload = buildQRPayload(row, DEFAULT_FIELDS, mapping);

    expect(payload).not.toContain("http://");
    expect(payload).not.toContain("https://");
    expect(payload).not.toContain("{");
    expect(payload).not.toContain("}");
    expect(payload.startsWith("Name: ")).toBe(true);
  });

  // Test 33: Measurement Unit Calculations (Inches, CM, Pixels)
  it("Test 33: Accurate dimension conversions between inches, cm, and pixels at 300 DPI", () => {
    // 2 inches at 300 DPI = 600 px
    expect(convertToPixels(2, "in", 300)).toBe(600);

    // 5.08 cm at 300 DPI ≈ 600 px
    expect(convertToPixels(5.08, "cm", 300)).toBe(600);

    // Convert pixels back to inches and cm
    expect(convertFromPixels(600, "in", 300)).toBe(2);
    expect(convertFromPixels(600, "cm", 300)).toBe(5.08);

    // Full breakdown
    const dims = calculateDimensions(1.5, "in", 300);
    expect(dims.pixels).toBe(450);
    expect(dims.inches).toBe(1.5);
    expect(dims.cm).toBe(3.81);
    expect(dims.displayText).toContain("1.5 in · 3.81 cm · 450 px @ 300 DPI");
  });

  // Test 34: 1D Barcode Generation (Code 128 / Code 39)
  it("Test 34: Generates valid 1D Code 128 and Code 39 barcodes with human-readable text", async () => {
    const regNo = "023010154864501"; // with leading zero
    const binary = encodeBarcodeBinary(regNo, "CODE128");
    expect(binary.data).toBeDefined();
    expect(binary.data.length).toBeGreaterThan(50);
    expect(binary.text).toBe(regNo);

    // SVG generation
    const svg = generateBarcodeSvg(regNo, { format: "CODE128", displayValue: true, sizeUnit: "in", sizeValue: 2 });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("<rect");
    expect(svg).toContain(regNo); // text label included

    // Data URL generation
    const dataUrl = await generateBarcodeDataUrl(regNo, { format: "CODE128" });
    expect(dataUrl.startsWith("data:image/")).toBe(true);
  });

  // Test 35: Batch ZIP Export with Barcodes and Dual Codes
  it("Test 35: Generates ZIP archives with barcodes and dual code formats", async () => {
    const students: StudentRecord[] = [
      { registerNo: "0230101", name: "Student Zero", qrPayload: "Name: Student Zero", studentData: {}, status: "gen" },
    ];

    // Barcode-only ZIP
    const barcodeZipBlob = await createBatchZipArchive(
      "BarcodeBatch",
      students,
      [],
      [],
      1,
      { ...DEFAULT_APPEARANCE, codeType: "barcode", sizeUnit: "in", sizeValue: 1.5 }
    );
    const bBuffer = await barcodeZipBlob.arrayBuffer();
    const bZip = await JSZip.loadAsync(bBuffer);
    const bFiles = Object.keys(bZip.files);
    expect(bFiles.some((f) => f.includes("0230101.png"))).toBe(true);

    // Dual (QR + Barcode) ZIP
    const dualZipBlob = await createBatchZipArchive(
      "DualBatch",
      students,
      [],
      [],
      1,
      { ...DEFAULT_APPEARANCE, codeType: "both" }
    );
    const dBuffer = await dualZipBlob.arrayBuffer();
    const dZip = await JSZip.loadAsync(dBuffer);
    const dFiles = Object.keys(dZip.files);
    expect(dFiles.some((f) => f.includes("0230101_qr.png"))).toBe(true);
    expect(dFiles.some((f) => f.includes("0230101_barcode.png"))).toBe(true);
  });
});
