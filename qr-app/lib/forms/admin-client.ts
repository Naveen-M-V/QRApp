import { createClient } from "@/lib/supabase/client";
import {
  CollectionForm,
  FormSubmission,
  formFromRow,
  newFormSlug,
  submissionFromRow,
} from "@/lib/forms/schema";

export const PHOTO_BUCKET = "student-photos";

function db() {
  const supabase = createClient();
  if (!supabase) {
    throw new Error("Forms need the online database. Add your Supabase keys in the hosting settings.");
  }
  return supabase;
}

function fail(error: { message?: string } | null, what: string): never {
  throw new Error(`${what}: ${error?.message || "unknown error"}`);
}

export type NewForm = Omit<CollectionForm, "id" | "slug" | "createdAt">;

export const FormsService = {
  async list(): Promise<(CollectionForm & { submissionCount: number })[]> {
    const supabase = db();
    const { data, error } = await supabase.from("collection_forms").select("*").order("created_at", { ascending: false });
    if (error) fail(error, "Could not load forms");
    const forms = (data || []).map(formFromRow);
    const counts = await Promise.all(
      forms.map((f) =>
        supabase.from("form_submissions").select("id", { count: "exact", head: true }).eq("form_id", f.id)
      )
    );
    return forms.map((f, i) => ({ ...f, submissionCount: counts[i].count ?? 0 }));
  },

  async get(id: string): Promise<CollectionForm | null> {
    const { data, error } = await db().from("collection_forms").select("*").eq("id", id).maybeSingle();
    if (error) fail(error, "Could not load the form");
    return data ? formFromRow(data) : null;
  },

  async create(input: NewForm): Promise<CollectionForm> {
    const supabase = db();
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("collection_forms")
      .insert({
        slug: newFormSlug(),
        title: input.title,
        description: input.description,
        departments: input.departments,
        fields: input.fields,
        require_photo: input.requirePhoto,
        is_open: input.isOpen,
        closes_at: input.closesAt,
        created_by: userData.user?.id ?? null,
      })
      .select("*")
      .single();
    if (error || !data) fail(error, "Could not create the form");
    return formFromRow(data);
  },

  async update(id: string, patch: Partial<Pick<CollectionForm, "isOpen" | "closesAt" | "title" | "description">>) {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.isOpen !== undefined) row.is_open = patch.isOpen;
    if (patch.closesAt !== undefined) row.closes_at = patch.closesAt;
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.description !== undefined) row.description = patch.description;
    const { error } = await db().from("collection_forms").update(row).eq("id", id);
    if (error) fail(error, "Could not update the form");
  },

  /** Deletes the form, all its submissions and their photos */
  async remove(id: string) {
    const supabase = db();
    const subs = await this.submissions(id);
    const paths = subs.map((s) => s.photoPath).filter((p): p is string => !!p);
    for (let i = 0; i < paths.length; i += 100) {
      await supabase.storage.from(PHOTO_BUCKET).remove(paths.slice(i, i + 100));
    }
    const { error } = await supabase.from("collection_forms").delete().eq("id", id);
    if (error) fail(error, "Could not delete the form");
  },

  async submissions(formId: string): Promise<FormSubmission[]> {
    const supabase = db();
    const all: FormSubmission[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from("form_submissions")
        .select("*")
        .eq("form_id", formId)
        .order("created_at", { ascending: true })
        .range(from, from + 999);
      if (error) fail(error, "Could not load submissions");
      all.push(...(data || []).map(submissionFromRow));
      if (!data || data.length < 1000) break;
    }
    return all;
  },

  /** Deletes every submission a student made on this form (and the photos) */
  async removeStudent(formId: string, registerNo: string, subs: FormSubmission[]) {
    const supabase = db();
    const mine = subs.filter((s) => s.formId === formId && s.registerNo === registerNo);
    const paths = mine.map((s) => s.photoPath).filter((p): p is string => !!p);
    if (paths.length) await supabase.storage.from(PHOTO_BUCKET).remove(paths);
    const { error } = await supabase.from("form_submissions").delete().in("id", mine.map((s) => s.id));
    if (error) fail(error, "Could not delete the submission");
  },

  /** Short-lived links for showing photos (the bucket itself is private) */
  async photoUrls(paths: string[]): Promise<Record<string, string>> {
    if (paths.length === 0) return {};
    const { data, error } = await db().storage.from(PHOTO_BUCKET).createSignedUrls(paths, 60 * 60);
    if (error) fail(error, "Could not load photos");
    const out: Record<string, string> = {};
    for (const d of data || []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
    return out;
  },

  async downloadPhoto(path: string): Promise<Blob> {
    const { data, error } = await db().storage.from(PHOTO_BUCKET).download(path);
    if (error || !data) fail(error, `Could not download ${path}`);
    return data;
  },
};

export function shareLink(slug: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/f/${slug}`;
}
