import { FieldConfig } from "@/types";

/** How a field is shown in the student form */
export type FormInputType = "text" | "textarea" | "date" | "tel" | "aadhaar" | "select" | "number";

export interface FormFieldDef {
  key: string; // same key as the QR field (register_no, name, course, ...)
  label: string; // shown to the student
  heading: string; // Excel column heading used on export (matches the generator's aliases)
  type: FormInputType;
  required: boolean;
  options?: string[];
  help?: string;
}

export interface CollectionForm {
  id: string;
  slug: string;
  title: string; // e.g. "SVCAS Chennai — ID Card Details 2026"
  description: string;
  departments: string[]; // dropdown in the form; each becomes a sheet / folder
  fields: FormFieldDef[];
  requirePhoto: boolean;
  isOpen: boolean;
  closesAt: string | null;
  createdAt?: string;
}

/** What the public form page receives (no internal ids beyond what it needs) */
export type PublicForm = Pick<CollectionForm, "slug" | "title" | "description" | "departments" | "fields" | "requirePhoto">;

export interface FormSubmission {
  id: string;
  formId: string;
  department: string;
  registerNo: string;
  studentName: string;
  data: Record<string, string>;
  photoPath: string | null;
  createdAt: string;
}

export const BLOOD_GROUPS = [
  "A+ve", "A-ve", "B+ve", "B-ve", "AB+ve", "AB-ve", "O+ve", "O-ve",
  "A1+ve", "A1-ve", "A1B+ve", "A1B-ve", "A2+ve", "A2-ve", "A2B+ve", "A2B-ve",
];

/** Passport photo: 3.5 × 4.5 cm at 300 DPI */
export const PHOTO_WIDTH = 413;
export const PHOTO_HEIGHT = 531;
export const PHOTO_MAX_BYTES = 1_500_000;

/** Fields that never go on the form (generated or replaced by the photo upload) */
const NOT_ON_FORM = new Set(["serial_no", "photo_no"]);

export function inputTypeFor(key: string, type: FieldConfig["type"]): FormInputType {
  if (key === "dob" || key === "valid_until" || type === "Date") return "date";
  if (["mobile", "phone", "emergency_contact"].includes(key)) return "tel";
  if (key === "aadhar") return "aadhaar";
  if (key === "blood_group") return "select";
  if (key === "address") return "textarea";
  if (type === "Number") return "number";
  return "text";
}

/** Builds the form's field list from the QR Field Manager configuration */
export function formFieldsFromConfig(fields: FieldConfig[]): FormFieldDef[] {
  return fields
    .filter((f) => f.active && !NOT_ON_FORM.has(f.key))
    .map((f) => {
      const type = inputTypeFor(f.key, f.type);
      return {
        key: f.key,
        label: f.key === "register_no" ? "Register Number" : f.label,
        heading: (f.col || f.label).trim(),
        type,
        required: f.required || f.key === "register_no" || f.key === "name",
        options: type === "select" ? BLOOD_GROUPS : undefined,
        help: f.key === "aadhar" ? "12 digits" : undefined,
      };
    });
}

/** URL-safe, unguessable form id for share links */
export function newFormSlug(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
}

const MAX_LEN: Partial<Record<FormInputType, number>> = { textarea: 400 };

/** yyyy-mm-dd (from <input type=date>) -> dd.mm.yyyy, the format used in the college sheets */
export function toSheetDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : value;
}

export interface ValidationResult {
  clean: Record<string, string>;
  department: string;
  errors: Record<string, string>;
}

/**
 * Validates and normalises one submission. Used in the browser (instant feedback)
 * and again on the server (the only check that counts).
 */
export function validateSubmission(
  form: Pick<CollectionForm, "fields" | "departments">,
  raw: Record<string, unknown>,
  rawDepartment: unknown
): ValidationResult {
  const clean: Record<string, string> = {};
  const errors: Record<string, string> = {};

  let department = typeof rawDepartment === "string" ? rawDepartment.trim() : "";
  if (form.departments.length > 0) {
    if (!form.departments.includes(department)) errors.__department = "Choose your department";
  } else {
    department = "";
  }

  for (const field of form.fields) {
    let v = typeof raw[field.key] === "string" ? (raw[field.key] as string).trim().replace(/\s+/g, " ") : "";
    if (field.type === "textarea" && typeof raw[field.key] === "string") {
      v = (raw[field.key] as string).trim().replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
    }

    if (!v) {
      if (field.required) errors[field.key] = `${field.label} is required`;
      continue;
    }

    if (v.length > (MAX_LEN[field.type] ?? 120)) {
      errors[field.key] = `${field.label} is too long`;
      continue;
    }

    switch (field.type) {
      case "tel": {
        const digits = v.replace(/[^\d]/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
        if (!/^\d{10}$/.test(digits)) errors[field.key] = "Enter a 10-digit mobile number";
        else v = digits;
        break;
      }
      case "aadhaar": {
        const digits = v.replace(/\D/g, "");
        if (!/^[2-9]\d{11}$/.test(digits)) errors[field.key] = "Aadhaar number must be 12 digits";
        else v = `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8)}`;
        break;
      }
      case "date": {
        const iso = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
        const d = iso ? new Date(`${iso}T00:00:00Z`) : null;
        if (!d || isNaN(d.getTime()) || d.getUTCFullYear() < 1900 || d > new Date()) {
          errors[field.key] = "Enter a valid date";
        } else v = toSheetDate(iso);
        break;
      }
      case "select":
        if (field.options && !field.options.includes(v)) errors[field.key] = `Choose a ${field.label.toLowerCase()}`;
        break;
      case "number":
        if (!/^-?\d+(\.\d+)?$/.test(v)) errors[field.key] = "Enter a number";
        break;
    }

    if (field.key === "register_no" && !errors[field.key]) {
      v = v.toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9/\-]{2,29}$/.test(v)) errors[field.key] = "Use letters and digits only (as on your college ID)";
    }
    if (field.key === "name" && !errors[field.key]) v = v.toUpperCase();

    if (!errors[field.key]) clean[field.key] = v;
  }

  return { clean, department, errors };
}

/** True when the form currently accepts submissions */
export function isFormAccepting(form: Pick<CollectionForm, "isOpen" | "closesAt">, now = new Date()): boolean {
  if (!form.isOpen) return false;
  if (form.closesAt && new Date(form.closesAt) < now) return false;
  return true;
}

/** Storage path for a student's photo: <form id>/<department>/<register no>_<time>.jpg */
export function photoStoragePath(formId: string, department: string, registerNo: string, at = Date.now()): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "x";
  return `${formId}/${safe(department || "all")}/${safe(registerNo)}_${at}.jpg`;
}

/** Checks the uploaded bytes really are a JPEG */
export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

// --- Database row mapping -------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
export function formFromRow(r: any): CollectionForm {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description || "",
    departments: Array.isArray(r.departments) ? r.departments : [],
    fields: Array.isArray(r.fields) ? r.fields : [],
    requirePhoto: r.require_photo !== false,
    isOpen: r.is_open !== false,
    closesAt: r.closes_at || null,
    createdAt: r.created_at,
  };
}

export function submissionFromRow(r: any): FormSubmission {
  return {
    id: r.id,
    formId: r.form_id,
    department: r.department || "",
    registerNo: r.register_no,
    studentName: r.student_name,
    data: r.data || {},
    photoPath: r.photo_path || null,
    createdAt: r.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Latest submission per register number (students may submit again to correct mistakes) */
export function latestPerStudent(subs: FormSubmission[]): FormSubmission[] {
  const byReg = new Map<string, FormSubmission>();
  for (const s of [...subs].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) byReg.set(s.registerNo, s);
  return Array.from(byReg.values());
}
