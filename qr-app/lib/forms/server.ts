import { getAdminClient } from "@/lib/supabase/admin";
import {
  CollectionForm,
  PublicForm,
  formFromRow,
  isFormAccepting,
  isJpeg,
  photoStoragePath,
  PHOTO_MAX_BYTES,
  validateSubmission,
} from "@/lib/forms/schema";

export const PHOTO_BUCKET = "student-photos";
const SLUG_RE = /^[a-z0-9]{8,40}$/;
const MAX_SUBMISSIONS_PER_STUDENT = 5;

type Db = NonNullable<ReturnType<typeof getAdminClient>>;
export type ApiResult = { status: number; body: Record<string, unknown> };

async function loadForm(db: Db, slug: string): Promise<CollectionForm | null> {
  if (!SLUG_RE.test(slug)) return null;
  const { data, error } = await db.from("collection_forms").select("*").eq("slug", slug).maybeSingle();
  if (error || !data) return null;
  return formFromRow(data);
}

const NOT_FOUND: ApiResult = { status: 404, body: { error: "This form link is not valid. Check the link with your college office." } };
const NOT_CONFIGURED: ApiResult = {
  status: 503,
  body: { error: "The form service is not set up yet (missing server key). Please try again later." },
};

/** Public form definition for the student page */
export async function getPublicForm(slug: string, db: Db | null = getAdminClient()): Promise<ApiResult> {
  if (!db) return NOT_CONFIGURED;
  const form = await loadForm(db, slug);
  if (!form) return NOT_FOUND;
  if (!isFormAccepting(form)) {
    return { status: 410, body: { error: "This form is closed. Contact your college office.", title: form.title } };
  }
  const pub: PublicForm = {
    slug: form.slug,
    title: form.title,
    description: form.description,
    departments: form.departments,
    fields: form.fields,
    requirePhoto: form.requirePhoto,
  };
  return { status: 200, body: { form: pub } };
}

/** Validates and stores one student's submission (details + photo) */
export async function submitForm(slug: string, formData: FormData, db: Db | null = getAdminClient()): Promise<ApiResult> {
  if (!db) return NOT_CONFIGURED;
  const form = await loadForm(db, slug);
  if (!form) return NOT_FOUND;
  if (!isFormAccepting(form)) return { status: 410, body: { error: "This form is closed. Contact your college office." } };

  let payload: { department?: unknown; values?: Record<string, unknown>; consent?: unknown; website?: unknown };
  try {
    payload = JSON.parse(String(formData.get("payload") || "{}"));
  } catch {
    return { status: 400, body: { error: "Invalid submission." } };
  }

  // Honeypot: real people never see or fill this field
  if (typeof payload.website === "string" && payload.website.trim()) {
    return { status: 200, body: { ok: true, reference: "--------" } };
  }
  if (payload.consent !== true) {
    return { status: 400, body: { error: "Please tick the consent box to submit.", errors: { __consent: "Required" } } };
  }

  const { clean, department, errors } = validateSubmission(form, payload.values || {}, payload.department);

  const photo = formData.get("photo");
  let photoBytes: Uint8Array | null = null;
  if (photo && typeof photo === "object" && "arrayBuffer" in photo) {
    const blob = photo as Blob;
    if (blob.size > PHOTO_MAX_BYTES) errors.__photo = "Photo is too large. Please crop it again.";
    else {
      photoBytes = new Uint8Array(await blob.arrayBuffer());
      if (!isJpeg(photoBytes)) {
        errors.__photo = "Photo must be a JPEG image.";
        photoBytes = null;
      }
    }
  }
  if (form.requirePhoto && !photoBytes && !errors.__photo) errors.__photo = "Please add your photo.";

  if (Object.keys(errors).length > 0) {
    return { status: 400, body: { error: "Please correct the highlighted fields.", errors } };
  }

  const registerNo = clean.register_no;
  const { count } = await db
    .from("form_submissions")
    .select("id", { count: "exact", head: true })
    .eq("form_id", form.id)
    .eq("register_no", registerNo);
  if ((count ?? 0) >= MAX_SUBMISSIONS_PER_STUDENT) {
    return {
      status: 429,
      body: { error: "This register number has already been submitted several times. Contact your college office to make changes." },
    };
  }

  let photoPath: string | null = null;
  if (photoBytes) {
    photoPath = photoStoragePath(form.id, department, registerNo);
    const { error: upErr } = await db.storage
      .from(PHOTO_BUCKET)
      .upload(photoPath, photoBytes, { contentType: "image/jpeg", upsert: false });
    if (upErr) {
      console.error("photo upload failed", upErr);
      return { status: 500, body: { error: "Could not save your photo. Please try again." } };
    }
  }

  const { data: row, error: insErr } = await db
    .from("form_submissions")
    .insert({
      form_id: form.id,
      department,
      register_no: registerNo,
      student_name: clean.name || "",
      data: clean,
      photo_path: photoPath,
    })
    .select("id")
    .single();

  if (insErr || !row) {
    console.error("submission insert failed", insErr);
    if (photoPath) await db.storage.from(PHOTO_BUCKET).remove([photoPath]);
    return { status: 500, body: { error: "Could not save your details. Please try again." } };
  }

  return {
    status: 200,
    body: { ok: true, reference: String(row.id).slice(0, 8).toUpperCase(), resubmission: (count ?? 0) > 0 },
  };
}
