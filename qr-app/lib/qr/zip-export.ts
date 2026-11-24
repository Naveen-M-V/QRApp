import JSZip from "jszip";
import { StudentRecord, RowValidationIssue, QRAppearanceSettings } from "@/types";
import {
  generateQRImageDataUrl,
  generateQRSvg,
  buildStudentFileName,
  barcodeSettingsFromAppearance,
  extensionForFormat,
} from "./generator";
import { generateBarcodeDataUrl, generateBarcodeSvg } from "@/lib/barcode/generator";
import { buildKeyToColumns, getFieldValue } from "@/lib/spreadsheet/validator";

/**
 * Creates a CSV processing audit report string
 */
export function generateProcessingReportCsv(
  batchName: string,
  totalRows: number,
  validStudents: StudentRecord[],
  skippedStudents: StudentRecord[],
  issues: RowValidationIssue[]
): string {
  const generatedCount = validStudents.length;
  const skippedCount = skippedStudents.length;

  const header = [
    `# Athryan QR Manager - Processing Audit Report`,
    `# Batch Name: ${batchName}`,
    `# Generated At: ${new Date().toISOString()}`,
    `# Total Input Rows: ${totalRows}`,
    `# Successful QR Codes: ${generatedCount}`,
    `# Skipped / Error Rows: ${skippedCount}`,
    `# Verification Equation: ${totalRows} = ${generatedCount} + ${skippedCount}`,
    "",
    "Row Number,Sheet Name,Register Number,Student Name,Status,Reason / Details",
  ];

  const rows: string[] = [];

  // Add successful records
  validStudents.forEach((s, idx) => {
    const rowNum = s.rowNumber ?? idx + 2;
    const cleanSheet = `"${(s.sheetName || "Sheet1").replace(/"/g, '""')}"`;
    const cleanName = `"${(s.name || "").replace(/"/g, '""')}"`;
    const cleanReg = `"${(s.registerNo || "").replace(/"/g, '""')}"`;
    rows.push(`${rowNum},${cleanSheet},${cleanReg},${cleanName},Generated,Code created successfully`);
  });

  // Add skipped / invalid records
  issues.forEach((issue) => {
    const cleanSheet = `"${(issue.sheetName || "Sheet1").replace(/"/g, '""')}"`;
    const cleanName = `"${(issue.studentName || "").replace(/"/g, '""')}"`;
    const cleanReg = `"${(issue.registerNo || "").replace(/"/g, '""')}"`;
    const cleanReason = `"${(issue.errorReason || "").replace(/"/g, '""')}"`;
    const statusText = issue.status === "duplicate" ? "Skipped (Duplicate)" : "Invalid";
    rows.push(`${issue.rowNumber},${cleanSheet},${cleanReg},${cleanName},${statusText},${cleanReason}`);
  });

  return [...header, ...rows].join("\r\n");
}

export interface ZipExportOptions {
  /** Sheet column -> field key mapping, used to read the barcode field's value */
  columnMapping?: Record<string, string>;
}

const csvCell = (v: string) => `"${(v || "").replace(/"/g, '""')}"`;

/**
 * Generates a ZIP archive containing all successful code images (QR, Barcode, or both)
 * in one folder per sheet, plus the processing audit report.
 */
export async function createBatchZipArchive(
  batchName: string,
  validStudents: StudentRecord[],
  skippedStudents: StudentRecord[],
  issues: RowValidationIssue[],
  totalRows: number,
  appearance: QRAppearanceSettings,
  onProgress?: (percent: number, current: number, total: number) => void,
  options: ZipExportOptions = {}
): Promise<Blob> {
  const zip = new JSZip();
  const folderName = sanitizeFilename(batchName) || "QR_Batch";
  const codeFolder = zip.folder(folderName) || zip;

  const total = validStudents.length;
  const isSvg = appearance.format === "SVG";
  const ext = extensionForFormat(appearance.format);
  const codeType = appearance.codeType || "qr";
  const barcodeOpts = barcodeSettingsFromAppearance(appearance);
  const barcodeField = appearance.barcodeField || "register_no";
  const keyToCols = options.columnMapping ? buildKeyToColumns(options.columnMapping) : null;
  const barcodeWarnings: string[] = [];

  const uniqueSheets = Array.from(new Set(validStudents.map((s) => s.sheetName).filter(Boolean)));
  const hasMultipleSheets = uniqueSheets.length > 1;

  // Track filenames per sheet folder so serial numbers 1, 2, 3 don't conflict across sheets
  const usedFileNamesBySheet = new Map<string, Set<string>>();
  const getSheetSet = (sName: string) => {
    if (!usedFileNamesBySheet.has(sName)) {
      usedFileNamesBySheet.set(sName, new Set<string>());
    }
    return usedFileNamesBySheet.get(sName)!;
  };

  const uniqueName = (used: Set<string>, fileName: string, i: number) => {
    let name = fileName;
    if (used.has(name)) {
      const base = name.slice(0, -(ext.length + 1));
      name = `${base}_${i + 1}.${ext}`;
    }
    used.add(name);
    return name;
  };

  const addRaster = (folder: JSZip, fileName: string, dataUrl: string) => {
    folder.file(fileName, dataUrl.replace(/^data:image\/[^;]+;base64,/, ""), { base64: true });
  };

  for (let i = 0; i < total; i++) {
    const student = validStudents[i];
    const sheetKey = student.sheetName || "Sheet1";
    const usedFileNames = getSheetSet(sheetKey);

    // Target folder: separate into subfolder by sheet name if multiple sheets exist or sheet has custom name
    let targetFolder = codeFolder;
    if (student.sheetName && (hasMultipleSheets || student.sheetName !== "Sheet1")) {
      const safeSheetFolder = sanitizeFilename(student.sheetName);
      targetFolder = codeFolder.folder(safeSheetFolder) || codeFolder;
    }

    // 1. Generate Barcode (if codeType is 'barcode' or 'both')
    if (codeType === "barcode" || codeType === "both") {
      const fieldValue =
        barcodeField === "register_no" || !keyToCols
          ? student.registerNo
          : getFieldValue(student.studentData as Record<string, unknown>, barcodeField, keyToCols);

      // Try the chosen field, then fall back to the register number
      const candidates = [fieldValue, student.registerNo].filter(
        (v, idx, arr): v is string => !!v && arr.indexOf(v) === idx
      );
      let encoded: { value: string; content: string } | null = null;
      let lastError = "";
      for (const value of candidates) {
        try {
          const content = isSvg
            ? generateBarcodeSvg(value, barcodeOpts)
            : await generateBarcodeDataUrl(value, barcodeOpts);
          encoded = { value, content };
          break;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
        }
      }

      const where = `${csvCell(sheetKey)},${student.rowNumber ?? ""},${csvCell(student.registerNo)},${csvCell(student.name)}`;
      if (!encoded) {
        barcodeWarnings.push(`${where},${csvCell(fieldValue)},No barcode created,${csvCell(lastError || "Empty value")}`);
      } else {
        if (encoded.value !== fieldValue) {
          barcodeWarnings.push(
            `${where},${csvCell(fieldValue)},Used register number instead,${csvCell(fieldValue ? lastError : "Barcode field is empty")}`
          );
        }
        const suffix = codeType === "both" ? "barcode" : undefined;
        const barcodeFileName = uniqueName(
          usedFileNames,
          buildStudentFileName(student, appearance, ext, suffix, keyToCols, String(i + 1)),
          i
        );
        if (isSvg) targetFolder.file(barcodeFileName, encoded.content);
        else addRaster(targetFolder, barcodeFileName, encoded.content);
      }
    }

    // 2. Generate QR Code (if codeType is 'qr' or 'both')
    if (codeType === "qr" || codeType === "both") {
      const suffix = codeType === "both" ? "qr" : undefined;
      const qrFileName = uniqueName(
        usedFileNames,
        buildStudentFileName(student, appearance, ext, suffix, keyToCols, String(i + 1)),
        i
      );

      if (isSvg) {
        targetFolder.file(qrFileName, await generateQRSvg(student.qrPayload, appearance));
      } else {
        addRaster(targetFolder, qrFileName, await generateQRImageDataUrl(student.qrPayload, appearance));
      }
    }

    if (onProgress) {
      const pct = Math.round(((i + 1) / total) * 100);
      onProgress(pct, i + 1, total);
    }
  }

  // Include processing report CSV inside the ZIP
  const reportCsv = generateProcessingReportCsv(
    batchName,
    totalRows,
    validStudents,
    skippedStudents,
    issues
  );
  zip.file(`${folderName}_processing_report.csv`, reportCsv);

  if (barcodeWarnings.length > 0) {
    zip.file(
      `${folderName}_barcode_warnings.csv`,
      ["Sheet Name,Row Number,Register Number,Name,Barcode Value,Result,Reason", ...barcodeWarnings].join("\r\n")
    );
  }

  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 80);
}
