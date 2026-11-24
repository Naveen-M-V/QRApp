"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Loader2, ShieldCheck, AlertCircle } from "lucide-react";
import { PhotoCropper } from "@/components/forms/PhotoCropper";
import { FormFieldDef, PublicForm, validateSubmission } from "@/lib/forms/schema";

type Stage = "loading" | "unavailable" | "form" | "done";

function StudentForm() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug || "";

  const [stage, setStage] = useState<Stage>("loading");
  const [form, setForm] = useState<PublicForm | null>(null);
  const [unavailable, setUnavailable] = useState({ title: "", message: "" });

  const [values, setValues] = useState<Record<string, string>>({});
  const [department, setDepartment] = useState("");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ reference: string; resubmission: boolean } | null>(null);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/forms/${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (r.ok && body.form) {
          setForm(body.form);
          setStage("form");
        } else {
          setUnavailable({ title: body.title || "", message: body.error || "This form is not available." });
          setStage("unavailable");
        }
      })
      .catch(() => {
        setUnavailable({ title: "", message: "Could not load the form. Check your internet connection and try again." });
        setStage("unavailable");
      });
  }, [slug]);

  const setValue = (key: string, v: string) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setFormError("");

    const check = validateSubmission(form, values, department);
    const errs: Record<string, string> = { ...check.errors };
    if (form.requirePhoto && !photo) errs.__photo = "Please add your photo and tap “Use this photo”.";
    if (!consent) errs.__consent = "Please tick this box to submit.";
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      setFormError("Please correct the highlighted fields.");
      const first = document.querySelector("[data-error='true']");
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("payload", JSON.stringify({ department, values, consent, website }));
      if (photo) fd.append("photo", photo, "photo.jpg");
      const r = await fetch(`/api/forms/${encodeURIComponent(slug)}/submit`, { method: "POST", body: fd });
      const body = await r.json().catch(() => ({}));
      if (r.ok && body.ok) {
        setResult({ reference: body.reference, resubmission: !!body.resubmission });
        setStage("done");
        window.scrollTo({ top: 0 });
      } else {
        setErrors(body.errors || {});
        setFormError(body.error || "Could not submit. Please try again.");
      }
    } catch {
      setFormError("Could not submit — check your internet connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F1E9] text-[#292326] px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-xl">
        {stage === "loading" && (
          <div className="flex items-center justify-center gap-2 py-24 text-sm text-[#776D6A]">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading form…
          </div>
        )}

        {stage === "unavailable" && (
          <div className="bg-white rounded-xl border border-[#E7DED4] p-6 text-center mt-10">
            <AlertCircle className="w-8 h-8 text-[#A11F15] mx-auto mb-3" />
            {unavailable.title && <h1 className="font-bold text-[#632D3B] mb-1">{unavailable.title}</h1>}
            <p className="text-sm text-[#776D6A]">{unavailable.message}</p>
          </div>
        )}

        {stage === "done" && result && (
          <div className="bg-white rounded-xl border border-[#E7DED4] p-6 text-center mt-10">
            <CheckCircle2 className="w-10 h-10 text-[#0F6B50] mx-auto mb-3" />
            <h1 className="text-lg font-bold text-[#632D3B]">Details submitted</h1>
            <p className="text-sm text-[#776D6A] mt-2">
              Thank you. Your reference is <span className="font-mono font-semibold text-[#292326]">{result.reference}</span>.
            </p>
            <p className="text-xs text-[#776D6A] mt-4 leading-relaxed">
              {result.resubmission
                ? "This replaces your earlier submission."
                : "Made a mistake? Open the same link and submit again with the same register number — your latest submission is the one used."}
            </p>
          </div>
        )}

        {stage === "form" && form && (
          <form onSubmit={submit} noValidate className="space-y-4">
            <header className="text-center mb-2">
              <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-[#632D3B] text-[#F7F1E9] font-bold border border-[#C7A878] mb-3">
                ID
              </div>
              <h1 className="text-xl font-bold text-[#632D3B] leading-snug">{form.title}</h1>
              {form.description && <p className="text-sm text-[#776D6A] mt-1.5 whitespace-pre-line">{form.description}</p>}
            </header>

            <section className="bg-white rounded-xl border border-[#E7DED4] p-4 sm:p-5 space-y-4">
              {form.departments.length > 0 && (
                <Field label="Department / Class" required error={errors.__department}>
                  <select
                    value={department}
                    onChange={(e) => {
                      setDepartment(e.target.value);
                      setErrors((p) => ({ ...p, __department: "" }));
                    }}
                    className={inputCls(!!errors.__department)}
                  >
                    <option value="">Select…</option>
                    {form.departments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              {form.fields.map((f) => (
                <Field key={f.key} label={f.label} required={f.required} error={errors[f.key]} help={f.help}>
                  <FieldInput field={f} value={values[f.key] || ""} onChange={(v) => setValue(f.key, v)} invalid={!!errors[f.key]} />
                </Field>
              ))}

              {/* Honeypot — hidden from people */}
              <input
                type="text"
                name="website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                className="hidden"
                aria-hidden="true"
              />
            </section>

            {form.requirePhoto && (
              <section className="bg-white rounded-xl border border-[#E7DED4] p-4 sm:p-5" data-error={!!errors.__photo}>
                <p className="text-sm font-semibold mb-3">
                  Photo for ID card <span className="text-[#A11F15]">*</span>
                </p>
                <PhotoCropper
                  onChange={(b) => {
                    setPhoto(b);
                    if (b) setErrors((p) => ({ ...p, __photo: "" }));
                  }}
                  error={errors.__photo}
                />
              </section>
            )}

            <section className="bg-white rounded-xl border border-[#E7DED4] p-4 sm:p-5" data-error={!!errors.__consent}>
              <label className="flex items-start gap-3 text-xs leading-relaxed text-[#292326] cursor-pointer">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => {
                    setConsent(e.target.checked);
                    setErrors((p) => ({ ...p, __consent: "" }));
                  }}
                  className="mt-0.5 w-4 h-4 accent-[#632D3B] shrink-0"
                />
                <span>
                  I confirm these details are correct. I agree to them{form.requirePhoto ? " and my photo" : ""} being used by
                  my college to make my ID card. They are stored securely and are only visible to the college&apos;s ID card
                  administrators.
                </span>
              </label>
              {errors.__consent && <p className="mt-2 text-xs text-[#A11F15]">{errors.__consent}</p>}
            </section>

            {formError && (Object.keys(errors).length === 0 || Object.values(errors).some(Boolean)) && (
              <div className="p-3 rounded-lg bg-[#FDECEA] border border-[#F9C0BA] text-xs text-[#A11F15] flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" /> {formError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-[#632D3B] text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              {submitting ? "Submitting…" : "Submit details"}
            </button>
            <p className="text-center text-[11px] text-[#776D6A] pb-6">Athryan QR Manager · Secure form</p>
          </form>
        )}
      </div>
    </div>
  );
}

function inputCls(invalid: boolean) {
  return `w-full text-sm rounded-lg border px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#632D3B] ${
    invalid ? "border-[#A11F15] bg-[#FDECEA]/30" : "border-[#E7DED4]"
  }`;
}

function Field({
  label,
  required,
  error,
  help,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div data-error={!!error}>
      <label className="block text-sm font-semibold mb-1.5">
        {label} {required && <span className="text-[#A11F15]">*</span>}
        {help && <span className="ml-1 text-xs font-normal text-[#776D6A]">({help})</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-[#A11F15]">{error}</p>}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  invalid,
}: {
  field: FormFieldDef;
  value: string;
  onChange: (v: string) => void;
  invalid: boolean;
}) {
  const cls = inputCls(invalid);
  switch (field.type) {
    case "textarea":
      return <textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} className={cls} maxLength={400} />;
    case "date":
      return (
        <input
          type="date"
          value={value}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        />
      );
    case "tel":
      return (
        <input type="tel" inputMode="numeric" autoComplete="tel" maxLength={14} value={value} onChange={(e) => onChange(e.target.value)} className={cls} placeholder="10-digit mobile number" />
      );
    case "aadhaar":
      return (
        <input
          type="text"
          inputMode="numeric"
          maxLength={14}
          value={value}
          onChange={(e) => {
            const d = e.target.value.replace(/\D/g, "").slice(0, 12);
            onChange(d.replace(/(\d{4})(?=\d)/g, "$1 "));
          }}
          className={cls}
          placeholder="XXXX XXXX XXXX"
        />
      );
    case "select":
      return (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
          <option value="">Select…</option>
          {(field.options || []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case "number":
      return <input type="text" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className={cls} />;
    default:
      return (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${cls} ${field.key === "register_no" || field.key === "name" ? "uppercase" : ""}`}
          autoComplete={field.key === "name" ? "name" : "off"}
          maxLength={120}
        />
      );
  }
}

export default function StudentFormPage() {
  // The page reads the URL, so it renders at request time inside Suspense (required with cacheComponents)
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F7F1E9]" />}>
      <StudentForm />
    </Suspense>
  );
}
