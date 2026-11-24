import QRCode from "qrcode";
import { QRAppearanceSettings } from "@/types";
import { convertToPixels } from "@/lib/qr/dimensions";
import { generateBarcodeDataUrl, generateBarcodeSvg, BarcodeSettings } from "@/lib/barcode/generator";
import { pngDataUrlToJpeg } from "@/lib/image/encode";
import { StudentRecord } from "@/types";
import { getFieldValue } from "@/lib/spreadsheet/validator";

/**
 * Sanitizes a filename string to prevent path traversal or invalid filesystem characters
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
}

/**
 * Computes safe file name for a student record based on chosen naming scheme
 */
export function getStudentFileName(
  registerNo: string,
  studentName: string,
  namingScheme: QRAppearanceSettings["naming"] = "reg",
  extension: "png" | "svg" | "jpg" = "png",
  suffix?: string,
  serialNo?: string
): string {
  const safeSerial = sanitizeFilename(serialNo || "1");
  const safeReg = sanitizeFilename(registerNo || "STUDENT");
  const postFix = suffix ? `_${suffix}` : "";

  if (namingScheme === "serial") {
    return `${safeSerial}${postFix}.${extension}`;
  }
  if (namingScheme === "serial_reg") {
    return `${safeSerial}_${safeReg}${postFix}.${extension}`;
  }
  if (namingScheme === "regname") {
    const safeName = sanitizeFilename(studentName || "RECORD");
    return `${safeReg}_${safeName}${postFix}.${extension}`;
  }
  return `${safeReg}${postFix}.${extension}`;
}

/** Pseudo field key for the sheet (department / section) the row came from */
export const SHEET_NAME_PART = "__sheet";

/**
 * File name for one record using the chosen naming scheme, including the
 * 'custom' scheme (e.g. Register No + Course, or Sheet + S.No + Name).
 * Empty parts are skipped; if every part is empty the register number is used.
 */
export function buildStudentFileName(
  student: StudentRecord,
  appearance: Pick<QRAppearanceSettings, "naming" | "namingFields" | "namingSeparator">,
  extension: "png" | "svg" | "jpg",
  suffix: string | undefined,
  keyToCols: Record<string, string[]> | null,
  fallbackSerial: string
): string {
  if (appearance.naming !== "custom") {
    return getStudentFileName(
      student.registerNo,
      student.name,
      appearance.naming,
      extension,
      suffix,
      student.serialNo || fallbackSerial
    );
  }

  const partValue = (key: string): string => {
    if (key === SHEET_NAME_PART) return student.sheetName || "";
    if (key === "register_no") return student.registerNo || "";
    if (key === "name") return student.name || "";
    if (key === "serial_no") return student.serialNo || fallbackSerial;
    if (!keyToCols) return "";
    return getFieldValue(student.studentData as Record<string, unknown>, key, keyToCols);
  };

  const sep = appearance.namingSeparator === "-" ? "-" : "_";
  const parts = (appearance.namingFields || [])
    .filter(Boolean)
    .map((k) => sanitizeFilename(partValue(k)))
    .filter(Boolean);
  const base = (parts.length > 0 ? parts.join(sep) : sanitizeFilename(student.registerNo || "STUDENT")).slice(0, 150);
  return `${base}${suffix ? `_${suffix}` : ""}.${extension}`;
}

/**
 * Resolves pixel size based on settings (support for inches, cm, and pixels)
 */
export function resolvePixelSize(settings: Partial<QRAppearanceSettings> = {}): number {
  if (settings.sizeUnit && settings.sizeValue) {
    return convertToPixels(settings.sizeValue, settings.sizeUnit, settings.dpi || 300);
  }
  if (settings.size) {
    return parseInt(settings.size, 10) || 600;
  }
  return 600;
}

/**
 * Generates QR code as PNG data URL
 */
export async function generateQRDataUrl(
  text: string,
  settings: Partial<QRAppearanceSettings> = {}
): Promise<string> {
  const size = resolvePixelSize(settings);
  const margin = settings.quiet ? parseInt(settings.quiet, 10) : 4;
  const errorCorrectionLevel = settings.ecc || "M";
  const lightColor = settings.transparentBackground ? "#0000" : "#ffffff";

  return QRCode.toDataURL(text, {
    width: size,
    margin,
    errorCorrectionLevel,
    color: {
      dark: "#000000",
      light: lightColor,
    },
  });
}

/**
 * Generates QR code as SVG string
 */
export async function generateQRSvg(
  text: string,
  settings: Partial<QRAppearanceSettings> = {}
): Promise<string> {
  const size = resolvePixelSize(settings);
  const margin = settings.quiet ? parseInt(settings.quiet, 10) : 4;
  const errorCorrectionLevel = settings.ecc || "M";
  const lightColor = settings.transparentBackground ? "#0000" : "#ffffff";

  return QRCode.toString(text, {
    type: "svg",
    width: size,
    margin,
    errorCorrectionLevel,
    color: {
      dark: "#000000",
      light: lightColor,
    },
  });
}

/**
 * Generates the QR as a raster data URL in the format chosen in settings:
 * PNG (transparent or white) or JPEG (always white — JPEG has no transparency).
 */
export async function generateQRImageDataUrl(
  text: string,
  settings: Partial<QRAppearanceSettings> = {}
): Promise<string> {
  if (settings.format === "JPEG") {
    const png = await generateQRDataUrl(text, { ...settings, transparentBackground: false });
    return pngDataUrlToJpeg(png);
  }
  return generateQRDataUrl(text, settings);
}

/**
 * Barcode options derived from the QR appearance settings, so both codes share
 * the same size, background and file format.
 */
export function barcodeSettingsFromAppearance(settings: Partial<QRAppearanceSettings> = {}): BarcodeSettings {
  const isJpeg = settings.format === "JPEG";
  return {
    format: settings.barcodeFormat || "CODE128",
    displayValue: settings.includeBarcodeText !== false,
    sizeUnit: settings.sizeUnit,
    sizeValue: settings.sizeValue,
    dpi: settings.dpi || 300,
    transparent: !isJpeg && settings.transparentBackground === true,
    imageFormat: isJpeg ? "jpeg" : "png",
  };
}

/** File extension for the chosen output format */
export function extensionForFormat(format: QRAppearanceSettings["format"] | undefined): "png" | "svg" | "jpg" {
  if (format === "SVG") return "svg";
  if (format === "JPEG") return "jpg";
  return "png";
}

/**
 * Universal code generator: routes to Barcode or QR code generator based on settings.codeType
 * `barcodeText` is the value to encode in the barcode (e.g. register number).
 */
export async function generateCodeDataUrl(
  text: string,
  barcodeText: string,
  settings: Partial<QRAppearanceSettings> = {}
): Promise<string> {
  if (settings.codeType === "barcode") {
    return generateBarcodeDataUrl(barcodeText || text, barcodeSettingsFromAppearance(settings));
  }
  return generateQRImageDataUrl(text, settings);
}

/**
 * Universal SVG generator: routes to Barcode or QR code SVG generator
 */
export async function generateCodeSvg(
  text: string,
  barcodeText: string,
  settings: Partial<QRAppearanceSettings> = {}
): Promise<string> {
  if (settings.codeType === "barcode") {
    return generateBarcodeSvg(barcodeText || text, barcodeSettingsFromAppearance(settings));
  }
  return generateQRSvg(text, settings);
}
