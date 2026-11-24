import { StudentRecord } from "@/types";
import { DataService } from "@/lib/supabase/data-service";

export interface ParsedQRPayload {
  rawText: string;
  isStructured: boolean;
  fields: Record<string, string>;
  hasName: boolean;
  hasRegisterNo: boolean;
  detectedRegisterNo?: string;
  warnings: string[];
}

export interface VerificationResult {
  parsed: ParsedQRPayload;
  matchedStudent: StudentRecord | null;
  matchStatus: "not_found" | "exact_match" | "field_mismatch" | "unverified";
  differences: { field: string; scanned: string; stored: string }[];
}

/**
 * Parses raw text decoded from a QR code and determines if it complies with Athryan plain-text specification
 */
export function parseScannedPayload(rawText: string): ParsedQRPayload {
  const clean = rawText.trim();
  const lines = clean.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  const fields: Record<string, string> = {};
  const warnings: string[] = [];

  for (const line of lines) {
    // Check for "Label: Value" or "Label - Value"
    const colonIdx = line.indexOf(":");
    const dashIdx = line.indexOf(" - ");

    if (colonIdx > 0 && (dashIdx === -1 || colonIdx < dashIdx)) {
      const key = line.substring(0, colonIdx).trim();
      const val = line.substring(colonIdx + 1).trim();
      fields[key] = val;
    } else if (dashIdx > 0) {
      const key = line.substring(0, dashIdx).trim();
      const val = line.substring(dashIdx + 3).trim();
      fields[key] = val;
    } else {
      // Unstructured line
      warnings.push(`Unrecognized line format: "${line}"`);
    }
  }

  // Look for Register Number key
  let regNo: string | undefined = undefined;
  for (const [k, v] of Object.entries(fields)) {
    const lk = k.toLowerCase();
    if (lk.includes("register") || lk.includes("roll")) {
      regNo = v;
      break;
    }
  }

  // Look for Name key
  let hasName = false;
  for (const k of Object.keys(fields)) {
    if (k.toLowerCase().includes("name")) {
      hasName = true;
      break;
    }
  }

  return {
    rawText: clean,
    isStructured: Object.keys(fields).length > 0,
    fields,
    hasName,
    hasRegisterNo: !!regNo,
    detectedRegisterNo: regNo,
    warnings,
  };
}

/**
 * Compares scanned payload against database record
 */
export async function verifyAgainstDatabase(
  parsed: ParsedQRPayload
): Promise<VerificationResult> {
  if (!parsed.detectedRegisterNo) {
    return {
      parsed,
      matchedStudent: null,
      matchStatus: "unverified",
      differences: [],
    };
  }

  const student = await DataService.getStudentByRegisterNo(
    parsed.detectedRegisterNo
  );

  if (!student) {
    return {
      parsed,
      matchedStudent: null,
      matchStatus: "not_found",
      differences: [],
    };
  }

  // Compare fields
  const differences: { field: string; scanned: string; stored: string }[] = [];

  // Compare name if present
  if (parsed.fields["Name"] && student.name) {
    if (parsed.fields["Name"].toLowerCase() !== student.name.toLowerCase()) {
      differences.push({
        field: "Name",
        scanned: parsed.fields["Name"],
        stored: student.name,
      });
    }
  }

  // Compare Course
  if (parsed.fields["Course"] && student.course) {
    if (parsed.fields["Course"] !== student.course) {
      differences.push({
        field: "Course",
        scanned: parsed.fields["Course"],
        stored: student.course,
      });
    }
  }

  return {
    parsed,
    matchedStudent: student,
    matchStatus: differences.length === 0 ? "exact_match" : "field_mismatch",
    differences,
  };
}
