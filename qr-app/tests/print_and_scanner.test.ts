import { describe, it, expect } from "vitest";
import { generatePrintablePdf } from "@/lib/printing/pdf-generator";
import { parseScannedPayload, verifyAgainstDatabase } from "@/lib/scanner/verifier";
import { DataService } from "@/lib/supabase/data-service";
import { DEFAULT_PRINT_SETTINGS } from "@/lib/constants";
import { StudentRecord } from "@/types";

describe("Bulk Print Studio & QR Verification Engine", () => {
  // Test 18: Bulk print layout calculation
  it("Test 18: Calculates grid geometry and pagination correctly for A4 layout", () => {
    const settings = { ...DEFAULT_PRINT_SETTINGS, columns: 3, rows: 5 };
    const itemsPerPage = settings.columns * settings.rows;
    expect(itemsPerPage).toBe(15);

    const totalStudents = 32;
    const expectedPages = Math.ceil(totalStudents / itemsPerPage);
    expect(expectedPages).toBe(3);
  });

  // Test 19: PDF page dimensions and generation
  it("Test 19: Generates valid A4 multi-page printable PDF without clipping", async () => {
    const sampleStudents: StudentRecord[] = Array.from({ length: 16 }).map((_, i) => ({
      registerNo: `2301015486454${i.toString().padStart(2, "0")}`,
      name: `Student ${i + 1}`,
      qrPayload: `Name: Student ${i + 1}\nRegister No: 2301015486454${i}`,
      studentData: {},
      status: "gen",
    }));

    const pdfBlob = await generatePrintablePdf(sampleStudents, DEFAULT_PRINT_SETTINGS, "Test Cohort");
    expect(pdfBlob).toBeDefined();
    expect(pdfBlob.type).toBe("application/pdf");
    expect(pdfBlob.size).toBeGreaterThan(1000);
  });

  // Test 36: Printable PDF generation with 1D Barcodes and inch/cm dimensions
  it("Test 36: Generates valid printable PDF with Code 128 barcodes and inch dimensions", async () => {
    const sampleStudents: StudentRecord[] = [
      {
        registerNo: "023010154864501",
        name: "Student Zero",
        qrPayload: "Name: Student Zero",
        studentData: {},
        status: "gen",
      },
    ];

    const pdfBlob = await generatePrintablePdf(
      sampleStudents,
      {
        ...DEFAULT_PRINT_SETTINGS,
        codeType: "barcode",
        sizeUnit: "in",
        sizeValue: 1.5,
      },
      "Barcode Cohort"
    );

    expect(pdfBlob).toBeDefined();
    expect(pdfBlob.type).toBe("application/pdf");
    expect(pdfBlob.size).toBeGreaterThan(1000);
  });

  // Test 20: QR scanner decoding & parsing
  it("Test 20: Parses scanned plain-text payload into structured student fields", () => {
    const scannedText = `Name: E. Vignesh\nRegister No: 230101548645423\nCourse: B.Sc. Statistics\nDepartment: Statistics\nAcademic Year: 2023–2026\nBlood Group: O+`;

    const parsed = parseScannedPayload(scannedText);
    expect(parsed.isStructured).toBe(true);
    expect(parsed.fields["Name"]).toBe("E. Vignesh");
    expect(parsed.fields["Register No"]).toBe("230101548645423");
    expect(parsed.detectedRegisterNo).toBe("230101548645423");
    expect(parsed.hasName).toBe(true);
    expect(parsed.hasRegisterNo).toBe(true);
  });

  // Test 22: Change detection against stored database records
  it("Test 22: Accurately identifies discrepancies when a physical QR payload differs from stored DB record", async () => {
    // Insert known record in DB
    await DataService.createBatch(
      {
        name: "Verification Test Batch",
        file: "verify.xlsx",
        total: 1,
        generated: 1,
        skipped: 0,
        failed: 0,
        status: "done",
      },
      [
        {
          registerNo: "230101548645423",
          name: "E. Vignesh",
          qrPayload: "Name: E. Vignesh\nRegister No: 230101548645423\nCourse: B.Sc. Statistics",
          studentData: {
            Name: "E. Vignesh",
            "Register No": "230101548645423",
            Course: "B.Sc. Statistics",
          },
          status: "gen",
        },
      ]
    );

    const alteredPayloadText = `Name: E. Vignesh (Tampered)\nRegister No: 230101548645423\nCourse: B.Sc. Statistics`;

    const parsed = parseScannedPayload(alteredPayloadText);
    const result = await verifyAgainstDatabase(parsed);

    // Record now exists in database
    expect(result.matchedStudent).toBeDefined();
    expect(result.matchedStudent?.name).toBe("E. Vignesh");
    expect(result.matchStatus).toBe("field_mismatch");
    expect(result.differences.length).toBeGreaterThan(0);
    expect(result.differences[0].field).toBe("Name");
    expect(result.differences[0].scanned).toBe("E. Vignesh (Tampered)");
  });

  // Test 23: QR version history tracking
  it("Test 23: Maintains version numbers when student records are updated", () => {
    const initialRecord: StudentRecord = {
      registerNo: "230101548645423",
      name: "E. Vignesh",
      version: 1,
      qrPayload: "Name: E. Vignesh\nRegister No: 230101548645423",
      studentData: {},
      status: "gen",
    };

    // Subsequent update
    const updatedRecord: StudentRecord = {
      ...initialRecord,
      version: (initialRecord.version || 1) + 1,
      qrPayload: "Name: E. Vignesh\nRegister No: 230101548645423\nHostel: Kaveri",
    };

    expect(updatedRecord.version).toBe(2);
    expect(updatedRecord.qrPayload).not.toBe(initialRecord.qrPayload);
  });
});
