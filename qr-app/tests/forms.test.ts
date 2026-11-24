import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { DEFAULT_FIELDS } from "@/lib/constants";
import {
  CollectionForm,
  FormSubmission,
  formFieldsFromConfig,
  isFormAccepting,
  latestPerStudent,
  newFormSlug,
  validateSubmission,
} from "@/lib/forms/schema";
import { getPublicForm, submitForm } from "@/lib/forms/server";
import { submissionsWorkbook, workbookBytes } from "@/lib/forms/export";
import { parseSpreadsheetBuffer } from "@/lib/spreadsheet/parser";
import { validateStudentRows } from "@/lib/spreadsheet/validator";

const fields = formFieldsFromConfig(DEFAULT_FIELDS);
const form: CollectionForm = {
  id: "form-1",
  slug: "abcdefgh2345",
  title: "SVCAS — ID cards",
  description: "",
  departments: ["BBA", "B.Com Accounting & Finance"],
  fields,
  requirePhoto: true,
  isOpen: true,
  closesAt: null,
};

const goodValues = {
  name: "s. logeshwaran",
  register_no: "2313111096022",
  course: "BBA",
  dob: "2003-11-08",
  blood_group: "O-ve",
  aadhar: "901271673481",
  mobile: "+91 98847 22512",
  address: "5th Street, Guduvancheri",
};

describe("Form fields", () => {
  it("are built from the QR field config with sensible input types", () => {
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
    expect(byKey.serial_no).toBeUndefined();
    expect(byKey.photo_no).toBeUndefined();
    expect(byKey.dob.type).toBe("date");
    expect(byKey.mobile.type).toBe("tel");
    expect(byKey.aadhar.type).toBe("aadhaar");
    expect(byKey.blood_group.type).toBe("select");
    expect(byKey.address.type).toBe("textarea");
    expect(byKey.register_no.required && byKey.name.required).toBe(true);
    expect(byKey.register_no.heading).toBe("Register Number");
  });

  it("make unguessable share slugs", () => {
    const a = newFormSlug();
    expect(a).toMatch(/^[a-z0-9]{12}$/);
    expect(new Set(Array.from({ length: 200 }, newFormSlug)).size).toBe(200);
  });
});

describe("Submission validation", () => {
  it("normalises good input to the college sheet formats", () => {
    const { clean, errors, department } = validateSubmission(form, goodValues, "BBA");
    expect(errors).toEqual({});
    expect(department).toBe("BBA");
    expect(clean.name).toBe("S. LOGESHWARAN");
    expect(clean.dob).toBe("08.11.2003");
    expect(clean.aadhar).toBe("9012 7167 3481");
    expect(clean.mobile).toBe("9884722512");
  });

  it("rejects bad values with field-level messages", () => {
    const { errors } = validateSubmission(
      form,
      { ...goodValues, register_no: "", aadhar: "0123 4567 8901", mobile: "12345", dob: "2099-01-01", blood_group: "Z+" },
      "Physics"
    );
    expect(Object.keys(errors).sort()).toEqual(["__department", "aadhar", "blood_group", "dob", "mobile", "register_no"].sort());
  });

  it("closes on the closing date", () => {
    expect(isFormAccepting({ isOpen: true, closesAt: null })).toBe(true);
    expect(isFormAccepting({ isOpen: false, closesAt: null })).toBe(false);
    expect(isFormAccepting({ isOpen: true, closesAt: "2020-01-01T00:00:00Z" })).toBe(false);
  });
});

/** Minimal stand-in for the Supabase client calls the server makes */
function fakeDb(opts: { form?: Partial<CollectionForm> | null; existing?: number; failInsert?: boolean } = {}) {
  const state = {
    uploads: [] as { path: string; bytes: Uint8Array }[],
    removed: [] as string[],
    inserted: [] as Record<string, unknown>[],
  };
  const formRow =
    opts.form === null
      ? null
      : {
          id: form.id,
          slug: form.slug,
          title: form.title,
          description: "",
          departments: form.departments,
          fields: form.fields,
          require_photo: form.requirePhoto,
          is_open: true,
          closes_at: null,
          ...(opts.form ? { is_open: opts.form.isOpen ?? true, closes_at: opts.form.closesAt ?? null } : {}),
        };
  const db = {
    from(table: string) {
      const q = {
        _head: false,
        select(_c: string, o?: { head?: boolean }) {
          q._head = !!o?.head;
          return q;
        },
        eq() {
          return q;
        },
        maybeSingle: async () => ({ data: table === "collection_forms" ? formRow : null, error: null }),
        then(resolve: (v: unknown) => void) {
          resolve({ count: opts.existing ?? 0, error: null });
        },
        insert(row: Record<string, unknown>) {
          state.inserted.push(row);
          return {
            select: () => ({
              single: async () =>
                opts.failInsert ? { data: null, error: { message: "boom" } } : { data: { id: "abcd1234-0000" }, error: null },
            }),
          };
        },
      };
      return q;
    },
    storage: {
      from: () => ({
        upload: async (path: string, bytes: Uint8Array) => {
          state.uploads.push({ path, bytes });
          return { error: null };
        },
        remove: async (paths: string[]) => {
          state.removed.push(...paths);
          return { error: null };
        },
      }),
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: db as any, state };
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]);

function submission(values = goodValues, extra: Record<string, unknown> = {}, photo: Uint8Array | null = JPEG) {
  const fd = new FormData();
  fd.append("payload", JSON.stringify({ department: "BBA", values, consent: true, ...extra }));
  if (photo) fd.append("photo", new Blob([new Uint8Array(photo)], { type: "image/jpeg" }), "photo.jpg");
  return fd;
}

describe("Server: public form + submit", () => {
  it("hides closed and unknown forms", async () => {
    expect((await getPublicForm("abcdefgh2345", fakeDb().db)).status).toBe(200);
    expect((await getPublicForm("abcdefgh2345", fakeDb({ form: { isOpen: false } }).db)).status).toBe(410);
    expect((await getPublicForm("abcdefgh2345", fakeDb({ form: null }).db)).status).toBe(404);
    expect((await getPublicForm("../etc", fakeDb().db)).status).toBe(404);
    expect((await getPublicForm("abcdefgh2345", null)).status).toBe(503);
  });

  it("stores a valid submission with its photo under form/department/register no", async () => {
    const { db, state } = fakeDb();
    const res = await submitForm("abcdefgh2345", submission(), db);
    expect(res.status).toBe(200);
    expect(res.body.reference).toBe("ABCD1234");
    expect(state.uploads).toHaveLength(1);
    expect(state.uploads[0].path).toMatch(/^form-1\/BBA\/2313111096022_\d+\.jpg$/);
    expect(state.inserted[0]).toMatchObject({ department: "BBA", register_no: "2313111096022", student_name: "S. LOGESHWARAN" });
    expect((state.inserted[0].data as Record<string, string>).dob).toBe("08.11.2003");
  });

  it("re-validates on the server and refuses bad data, missing consent, non-JPEG photos", async () => {
    const bad = await submitForm("abcdefgh2345", submission({ ...goodValues, aadhar: "123" }), fakeDb().db);
    expect(bad.status).toBe(400);
    expect((bad.body.errors as Record<string, string>).aadhar).toBeTruthy();

    const noConsent = await submitForm("abcdefgh2345", submission(goodValues, { consent: false }), fakeDb().db);
    expect(noConsent.status).toBe(400);

    const png = await submitForm("abcdefgh2345", submission(goodValues, {}, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2])), fakeDb().db);
    expect((png.body.errors as Record<string, string>).__photo).toMatch(/JPEG/);

    const noPhoto = await submitForm("abcdefgh2345", submission(goodValues, {}, null), fakeDb().db);
    expect((noPhoto.body.errors as Record<string, string>).__photo).toBeTruthy();
  });

  it("drops bot submissions, limits repeats, and cleans up the photo if saving fails", async () => {
    const bot = fakeDb();
    expect((await submitForm("abcdefgh2345", submission(goodValues, { website: "spam" }), bot.db)).status).toBe(200);
    expect(bot.state.inserted).toHaveLength(0);

    expect((await submitForm("abcdefgh2345", submission(), fakeDb({ existing: 5 }).db)).status).toBe(429);

    const failing = fakeDb({ failInsert: true });
    expect((await submitForm("abcdefgh2345", submission(), failing.db)).status).toBe(500);
    expect(failing.state.removed).toEqual([failing.state.uploads[0].path]);
  });
});

describe("Export", () => {
  const mk = (reg: string, name: string, dept: string, at: string, extra: Record<string, string> = {}): FormSubmission => ({
    id: reg + at,
    formId: form.id,
    department: dept,
    registerNo: reg,
    studentName: name,
    data: { name, register_no: reg, course: dept, mobile: "9884722512", aadhar: "9012 7167 3481", ...extra },
    photoPath: `form-1/${dept}/${reg}.jpg`,
    createdAt: at,
  });
  const subs = [
    mk("0231001", "ARUN", "BBA", "2026-11-01T10:00:00Z"),
    mk("0231002", "BALA", "BBA", "2026-11-01T11:00:00Z"),
    mk("0231001", "ARUN K", "BBA", "2026-11-02T10:00:00Z"), // correction
    mk("0341001", "CHITRA", "B.Com Accounting & Finance", "2026-11-01T12:00:00Z"),
  ];

  it("keeps only each student's latest submission", () => {
    const latest = latestPerStudent(subs);
    expect(latest).toHaveLength(3);
    expect(latest.find((s) => s.registerNo === "0231001")!.studentName).toBe("ARUN K");
  });

  it("writes one sheet per department that the generator maps automatically, keeping leading zeros", () => {
    const bytes = workbookBytes(submissionsWorkbook(form, subs));
    const wb = XLSX.read(bytes, { type: "array" });
    expect(wb.SheetNames).toEqual(["BBA", "B.Com Accounting & Finance"]);

    const parsed = parseSpreadsheetBuffer(bytes.buffer, "form.xlsx", bytes.byteLength);
    const v = validateStudentRows(parsed.rows, DEFAULT_FIELDS, parsed.suggestedMapping);
    expect(v.issues).toEqual([]);
    expect(v.validStudents.map((s) => `${s.sheetName}|${s.registerNo}|${s.name}`)).toEqual([
      "BBA|0231001|ARUN K",
      "BBA|0231002|BALA",
      "B.Com Accounting & Finance|0341001|CHITRA",
    ]);
    for (const f of fields) expect(parsed.suggestedMapping[f.heading], f.heading).toBe(f.key);
  });
});
