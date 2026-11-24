import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  parseSpreadsheetBuffer,
  detectColumnMapping,
  normalizeHeader,
} from "@/lib/spreadsheet/parser";
import {
  validateStudentRows,
  buildQRPayload,
} from "@/lib/spreadsheet/validator";
import { DEFAULT_FIELDS } from "@/lib/constants";

describe("Spreadsheet Processing Engine", () => {
  // Test 1: Valid XLSX upload
  it("Test 1: Valid XLSX upload parses correct rows and headers", () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Student Name", "Register Number", "Course", "Department"],
      ["E. Vignesh", "230101548645423", "B.Sc. Statistics", "Statistics"],
      ["R. Priyadharshini", "230101548645424", "B.Sc. Statistics", "Statistics"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });

    const result = parseSpreadsheetBuffer(buffer, "class_list.xlsx", buffer.byteLength);
    expect(result.headers).toEqual(["Student Name", "Register Number", "Course", "Department"]);
    expect(result.totalRows).toBe(2);
    expect(result.rows[0]["Student Name"]).toBe("E. Vignesh");
  });

  // Test 2: Valid CSV upload
  it("Test 2: Valid CSV upload parses identical structure to XLSX", () => {
    const csvContent = "Student Name,Register Number,Course\nJohn Doe,2401015,B.Com\nJane Doe,2401016,B.Com";
    const encoder = new TextEncoder();
    const buffer = encoder.encode(csvContent).buffer;

    const result = parseSpreadsheetBuffer(buffer, "class_list.csv", buffer.byteLength);
    expect(result.headers).toEqual(["Student Name", "Register Number", "Course"]);
    expect(result.totalRows).toBe(2);
    expect(result.rows[0]["Register Number"]).toBe("2401015");
  });

  // Test 2b: Valid XLS (BIFF8) upload
  it("Test 2b: Valid XLS upload parses binary Excel format", () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Student Name", "Register Number", "Course"],
      ["S. Anitha", "023010154864501", "M.Sc. Mathematics"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    const buffer = XLSX.write(wb, { type: "array", bookType: "biff8" });

    const result = parseSpreadsheetBuffer(buffer, "legacy_class_list.xls", buffer.byteLength);
    expect(result.headers).toEqual(["Student Name", "Register Number", "Course"]);
    expect(result.totalRows).toBe(1);
    expect(result.rows[0]["Register Number"]).toBe("023010154864501");
  });

  // Test 2c: Multi-sheet workbook upload
  it("Test 2c: Multi-sheet workbook parses all sheets and records sheet names", () => {
    const ws1 = XLSX.utils.aoa_to_sheet([
      ["Student Name", "Register Number", "Course"],
      ["Student BBA 1", "240101", "BBA"],
    ]);
    const ws2 = XLSX.utils.aoa_to_sheet([
      ["Student Name", "Register Number", "Course"],
      ["Student BCom 1", "240201", "B.Com"],
      ["Student BCom 2", "240202", "B.Com"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, "BBA 43nos");
    XLSX.utils.book_append_sheet(wb, ws2, "BCom A&F 64nos");
    const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });

    const result = parseSpreadsheetBuffer(buffer, "college.xlsx", buffer.byteLength);
    expect(result.totalRows).toBe(3);
    expect(result.sheets.length).toBe(2);
    expect(result.sheets[0].name).toBe("BBA 43nos");
    expect(result.sheets[0].rowCount).toBe(1);
    expect(result.sheets[1].name).toBe("BCom A&F 64nos");
    expect(result.sheets[1].rowCount).toBe(2);
    expect(result.rows[0]._sheetName).toBe("BBA 43nos");
    expect(result.rows[1]._sheetName).toBe("BCom A&F 64nos");
  });

  // Test 3: Unsupported file rejection
  it("Test 3: Rejects unsupported file types with human-readable error", () => {
    const dummyBuffer = new ArrayBuffer(16);
    expect(() => {
      parseSpreadsheetBuffer(dummyBuffer, "malicious.exe", 16);
    }).toThrow(/not a supported format/i);

    expect(() => {
      parseSpreadsheetBuffer(dummyBuffer, "document.pdf", 16);
    }).toThrow(/not a supported format/i);
  });

  // Test 4: Corrupt spreadsheet rejection
  it("Test 4: Safely rejects corrupt spreadsheets", () => {
    const corruptBuffer = new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44]).buffer;
    expect(() => {
      parseSpreadsheetBuffer(corruptBuffer, "corrupt.xlsx", 5);
    }).toThrow(/could not be parsed|corrupt|unsupported/i);
  });

  // Test 5: Missing required fields detection
  it("Test 5: Detects missing required fields and reports exact row numbers", () => {
    const rows = [
      { "Student Name": "Valid Student", "Register Number": "230101", "Course": "B.Sc." },
      { "Student Name": "", "Register Number": "230102", "Course": "B.Sc." }, // Missing Name!
      { "Student Name": "Another Student", "Register Number": "", "Course": "B.Sc." }, // Missing Register Number!
    ];
    const mapping = {
      "Student Name": "name",
      "Register Number": "register_no",
      "Course": "course",
    };

    const summary = validateStudentRows(rows, DEFAULT_FIELDS, mapping, "keep");
    expect(summary.validCount).toBe(1);
    expect(summary.invalidCount).toBe(2);
    expect(summary.issues[0].rowNumber).toBe(3); // Row 1 is header, row 2 is valid, row 3 is missing name
    expect(summary.issues[0].errorReason).toContain("Name");
    expect(summary.issues[1].rowNumber).toBe(4);
    expect(summary.issues[1].errorReason).toContain("Register / ID Number");
  });

  // Test 6: Duplicate register numbers handling
  it("Test 6: Identifies duplicate register numbers and respects duplicate rules", () => {
    const rows = [
      { "Student Name": "S. Keerthana", "Register Number": "230101548645426", "Course": "B.Sc. Statistics" },
      { "Student Name": "K. Mohammed Ashiq", "Register Number": "230101548645426", "Course": "B.Sc. Statistics" }, // Duplicate!
      { "Student Name": "Third Student", "Register Number": "230101548645427", "Course": "B.Sc. Statistics" },
    ];
    const mapping = {
      "Student Name": "name",
      "Register Number": "register_no",
      "Course": "course",
    };

    // 'keep' rule: 1st is kept, 2nd is flagged
    const summaryKeep = validateStudentRows(rows, DEFAULT_FIELDS, mapping, "keep");
    expect(summaryKeep.validCount).toBe(2);
    expect(summaryKeep.duplicateCount).toBe(1);
    expect(summaryKeep.issues[0].errorReason).toContain("Duplicate register number — same as row 2");

    // 'skip' rule: both occurrences flagged
    const summarySkip = validateStudentRows(rows, DEFAULT_FIELDS, mapping, "skip");
    expect(summarySkip.validCount).toBe(1);
    expect(summarySkip.duplicateCount).toBe(2);
  });

  // Test 7: Preservation of leading zeros
  it("Test 7: Strictly preserves leading zeros in student register numbers", () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Student Name", "Register Number", "Course"],
      ["M. Arun Kumar", "023010154864501", "B.Sc. Statistics"], // Notice leading zero "0"
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });

    const parsed = parseSpreadsheetBuffer(buffer, "test_zeros.xlsx", buffer.byteLength);
    expect(parsed.rows[0]["Register Number"]).toBe("023010154864501");
    expect(parsed.rows[0]["Register Number"].startsWith("0")).toBe(true);

    const mapping = { "Student Name": "name", "Register Number": "register_no", "Course": "course" };
    const summary = validateStudentRows(parsed.rows, DEFAULT_FIELDS, mapping);
    expect(summary.validStudents[0].registerNo).toBe("023010154864501");
    expect(summary.validStudents[0].qrPayload).toContain("Register No: 023010154864501");
  });

  // Test 8: Tamil and other Unicode characters
  it("Test 8: Preserves Tamil and multi-byte Unicode characters without corruption", () => {
    const rows = [
      {
        "Student Name": "இரா. பிரியதர்ஷினி (R. Priyadharshini)",
        "Register Number": "230101548645499",
        "Course": "பி.எஸ்சி. புள்ளியியல் (B.Sc. Statistics)",
      },
    ];
    const mapping = {
      "Student Name": "name",
      "Register Number": "register_no",
      "Course": "course",
    };

    const summary = validateStudentRows(rows, DEFAULT_FIELDS, mapping);
    expect(summary.validStudents[0].name).toBe("இரா. பிரியதர்ஷினி (R. Priyadharshini)");
    expect(summary.validStudents[0].qrPayload).toContain("Name: இரா. பிரியதர்ஷினி (R. Priyadharshini)");
    expect(summary.validStudents[0].qrPayload).toContain("Course: பி.எஸ்சி. புள்ளியியல் (B.Sc. Statistics)");
  });

  // Test 9: Long QR payload handling
  it("Test 9: Handles long QR records with graceful validation", () => {
    const longName = "A".repeat(250);
    const rows = [{ "Student Name": longName, "Register Number": "230101", "Course": "B.Sc. Statistics" }];
    const mapping = { "Student Name": "name", "Register Number": "register_no", "Course": "course" };

    const summary = validateStudentRows(rows, DEFAULT_FIELDS, mapping);
    expect(summary.validCount).toBe(1);
    expect(summary.validStudents[0].qrPayload.length).toBeGreaterThan(250);
  });

  // Test 10: Automatic column detection using aliases
  it("Test 10: Automatically matches spreadsheet headers to standard keys", () => {
    const detected = detectColumnMapping([
      "Roll No.",
      "Candidate Name",
      "Programme",
      "Dept.",
      "Batch",
      "Blood Grp",
    ]);

    expect(detected["Roll No."]).toBe("register_no");
    expect(detected["Candidate Name"]).toBe("name");
    expect(detected["Programme"]).toBe("course");
    expect(detected["Dept."]).toBe("department");
    expect(detected["Batch"]).toBe("academic_year");
    expect(detected["Blood Grp"]).toBe("blood_group");
  });

  // Test 10b: Every column is imported by default (no header defaults to empty / do not import)
  it("Test 10b: Automatically maps all columns from user Excel without defaulting to (Do not import)", () => {
    const userHeaders = [
      "DOB",
      "BG",
      "Aadhar NO.",
      "Father's Name",
      "Address",
      "Phone No.",
      "Mobile",
      "Photo No.",
      "Course",
    ];

    const detected = detectColumnMapping(userHeaders);

    // Verify none are empty / (Do not import)
    for (const h of userHeaders) {
      expect(detected[h]).toBeTruthy();
      expect(detected[h]).not.toBe("");
    }

    expect(detected["DOB"]).toBe("dob");
    expect(detected["BG"]).toBe("blood_group");
    expect(detected["Aadhar NO."]).toBe("aadhar");
    expect(detected["Father's Name"]).toBe("father_name");
    expect(detected["Address"]).toBe("address");
    expect(detected["Phone No."]).toBe("phone");
    expect(detected["Mobile"]).toBe("mobile");
    expect(detected["Photo No."]).toBe("photo_no");
    expect(detected["Course"]).toBe("course");
  });
});
