"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList, Copy, ExternalLink, Lock, Plus, Send, Unlock, Users } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { DataService } from "@/lib/supabase/data-service";
import { DEFAULT_FIELDS } from "@/lib/constants";
import { FieldConfig } from "@/types";
import { CollectionForm, FormFieldDef, formFieldsFromConfig, isFormAccepting } from "@/lib/forms/schema";
import { FormsService, shareLink } from "@/lib/forms/admin-client";

type FormRow = CollectionForm & { submissionCount: number };

/** Fields ticked by default on a new form (Aadhaar deliberately off — collect it only if the card needs it) */
const DEFAULT_ON = new Set(["name", "register_no", "course", "blood_group", "dob", "father_name", "address", "mobile"]);

export default function FormsPage() {
  const { toast } = useToast();
  const [forms, setForms] = useState<FormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [created, setCreated] = useState<CollectionForm | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    FormsService.list()
      .then((rows) => {
        if (cancelled) return;
        setForms(rows);
        setLoadError("");
      })
      .catch((e) => !cancelled && setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const copy = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(shareLink(slug));
      toast("Link copied");
    } catch {
      toast(shareLink(slug), "info");
    }
  };

  const whatsapp = (f: CollectionForm) => {
    const text = `${f.title}\nPlease fill in your ID card details and photo here: ${shareLink(f.slug)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };

  const toggleOpen = async (f: FormRow) => {
    try {
      await FormsService.update(f.id, { isOpen: !f.isOpen });
      toast(f.isOpen ? "Form closed — the link no longer accepts submissions" : "Form reopened");
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#632D3B] tracking-tight">Data Collection Forms</h1>
            <p className="text-sm text-[#776D6A] mt-1">
              Create a form, send the link to a college, and each student fills in their own details and photo.
            </p>
          </div>
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
            New Form
          </Button>
        </div>

        {loadError && (
          <Card className="p-4 text-sm text-[#A11F15] bg-[#FDECEA] border-[#F9C0BA]">
            {loadError}
            <p className="text-xs text-[#776D6A] mt-1">
              If you haven&apos;t yet, run <code>supabase/master_schema.sql</code> in your Supabase SQL editor.
            </p>
          </Card>
        )}

        {!loading && !loadError && forms.length === 0 && (
          <Card className="p-10 text-center">
            <ClipboardList className="w-10 h-10 text-[#C7A878] mx-auto mb-3" />
            <p className="font-semibold text-[#292326]">No forms yet</p>
            <p className="text-sm text-[#776D6A] mt-1">Create your first form to start collecting student details.</p>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {forms.map((f) => {
            const accepting = isFormAccepting(f);
            return (
              <Card key={f.id} className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/forms/${f.id}`} className="font-semibold text-[#292326] hover:text-[#632D3B] break-words">
                      {f.title}
                    </Link>
                    <p className="text-xs text-[#776D6A] mt-0.5">
                      {f.departments.length ? `${f.departments.length} departments · ` : ""}
                      {f.fields.length} fields{f.requirePhoto ? " + photo" : ""}
                      {f.closesAt ? ` · closes ${new Date(f.closesAt).toLocaleDateString("en-IN")}` : ""}
                    </p>
                  </div>
                  <Badge variant={accepting ? "success" : "neutral"}>{accepting ? "Open" : "Closed"}</Badge>
                </div>

                <div className="flex items-center gap-2 p-2 rounded-lg bg-[#FAF7F2] border border-[#E7DED4]">
                  <code className="text-[11px] text-[#292326] truncate flex-1">{shareLink(f.slug)}</code>
                  <button onClick={() => copy(f.slug)} className="p-1.5 rounded hover:bg-white" title="Copy link">
                    <Copy className="w-3.5 h-3.5 text-[#632D3B]" />
                  </button>
                  <a href={`/f/${f.slug}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-white" title="Open form">
                    <ExternalLink className="w-3.5 h-3.5 text-[#632D3B]" />
                  </a>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/forms/${f.id}`} className="flex items-center gap-1.5 text-sm font-semibold text-[#632D3B]">
                    <Users className="w-4 h-4" /> {f.submissionCount} submission{f.submissionCount === 1 ? "" : "s"}
                  </Link>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" icon={<Send className="w-3.5 h-3.5" />} onClick={() => whatsapp(f)}>
                      WhatsApp
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      icon={f.isOpen ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      onClick={() => toggleOpen(f)}
                    >
                      {f.isOpen ? "Close" : "Reopen"}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <CreateFormModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(f) => {
          setShowCreate(false);
          setCreated(f);
          reload();
        }}
      />

      <Modal
        isOpen={!!created}
        onClose={() => setCreated(null)}
        title="Form created"
        maxWidth="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => created && whatsapp(created)} icon={<Send className="w-4 h-4" />}>
              Share on WhatsApp
            </Button>
            <Button onClick={() => created && copy(created.slug)} icon={<Copy className="w-4 h-4" />}>
              Copy link
            </Button>
          </div>
        }
      >
        {created && (
          <div className="space-y-3 text-sm">
            <p>Send this link to the college. Each student opens it on their phone and fills in their own details and photo.</p>
            <code className="block p-3 rounded-lg bg-[#FAF7F2] border border-[#E7DED4] break-all text-xs">{shareLink(created.slug)}</code>
            <p className="text-xs text-[#776D6A]">
              Anyone with the link can submit, so share it only with the college. You can close the form at any time.
            </p>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}

function CreateFormModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (f: CollectionForm) => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [departmentsText, setDepartmentsText] = useState("");
  const [requirePhoto, setRequirePhoto] = useState(true);
  const [closesAt, setClosesAt] = useState("");
  const [available, setAvailable] = useState<FormFieldDef[]>([]);
  const [selected, setSelected] = useState<Record<string, { on: boolean; required: boolean }>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    DataService.getFieldConfigs()
      .catch(() => [] as FieldConfig[])
      .then((configured) => {
        // Fields from the QR Field Manager, plus the standard ones it may not list yet
        const byKey = new Map<string, FieldConfig>();
        [...configured, ...DEFAULT_FIELDS].forEach((f) => {
          if (!byKey.has(f.key)) byKey.set(f.key, f);
        });
        const defs = formFieldsFromConfig(Array.from(byKey.values()));
        setAvailable(defs);
        setSelected(
          Object.fromEntries(
            defs.map((d) => [d.key, { on: DEFAULT_ON.has(d.key) || d.required, required: d.required || ["name", "register_no"].includes(d.key) }])
          )
        );
      });
  }, [isOpen]);

  const departments = useMemo(
    () =>
      Array.from(
        new Set(
          departmentsText
            .split(/\n|,/)
            .map((d) => d.trim())
            .filter(Boolean)
        )
      ),
    [departmentsText]
  );

  const locked = (key: string) => key === "name" || key === "register_no";

  const create = async () => {
    if (!title.trim()) {
      toast("Give the form a title (e.g. the college name)", "error");
      return;
    }
    const fields = available
      .filter((f) => selected[f.key]?.on)
      .map((f) => ({ ...f, required: !!selected[f.key]?.required }));
    setSaving(true);
    try {
      const form = await FormsService.create({
        title: title.trim(),
        description: description.trim(),
        departments,
        fields,
        requirePhoto,
        isOpen: true,
        closesAt: closesAt ? new Date(`${closesAt}T23:59:59`).toISOString() : null,
      });
      DataService.createAuditLog({
        eventType: "form_created",
        resourceType: "collection_forms",
        resourceId: form.id,
        details: { title: form.title, fields: fields.length, departments: departments.length },
      }).catch(() => undefined);
      setTitle("");
      setDescription("");
      setDepartmentsText("");
      setClosesAt("");
      onCreated(form);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full text-sm border border-[#E7DED4] rounded-md px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#632D3B]";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="New data collection form"
      maxWidth="2xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={create} isLoading={saving}>
            Create form &amp; get link
          </Button>
        </div>
      }
    >
      <div className="space-y-5 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="font-semibold text-xs block mb-1">Form title *</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="SVCAS Chennai — ID Card Details 2026" />
          </label>
          <label className="block">
            <span className="font-semibold text-xs block mb-1">Closing date (optional)</span>
            <input type="date" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className={inputCls} />
          </label>
        </div>

        <label className="block">
          <span className="font-semibold text-xs block mb-1">Instructions for students (optional)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className={inputCls}
            placeholder="Fill in exactly as in your college records. Last date: 20 November."
          />
        </label>

        <label className="block">
          <span className="font-semibold text-xs block mb-1">Departments / classes (one per line)</span>
          <textarea
            value={departmentsText}
            onChange={(e) => setDepartmentsText(e.target.value)}
            rows={4}
            className={`${inputCls} font-mono text-xs`}
            placeholder={"BBA\nBA English 'A'\nB.Com Accounting & Finance"}
          />
          <span className="text-[11px] text-[#776D6A]">
            Students pick one from a list. Each becomes its own sheet in the Excel and its own folder of QR codes and photos.
            Leave empty to skip.
          </span>
        </label>

        <div>
          <p className="font-semibold text-xs mb-2">Details to collect</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {available.map((f) => {
              const s = selected[f.key] || { on: false, required: false };
              return (
                <div
                  key={f.key}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border ${
                    s.on ? "border-[#632D3B]/40 bg-white" : "border-[#E7DED4] bg-[#FAF7F2]"
                  }`}
                >
                  <label className="flex items-center gap-2 text-xs cursor-pointer min-w-0">
                    <input
                      type="checkbox"
                      checked={s.on}
                      disabled={locked(f.key)}
                      onChange={(e) => setSelected((p) => ({ ...p, [f.key]: { ...s, on: e.target.checked } }))}
                      className="accent-[#632D3B]"
                    />
                    <span className="truncate">{f.label}</span>
                    {f.key === "aadhar" && <span className="text-[10px] text-[#8A5300]">(sensitive)</span>}
                  </label>
                  {s.on && (
                    <label className="flex items-center gap-1 text-[11px] text-[#776D6A] shrink-0">
                      <input
                        type="checkbox"
                        checked={s.required}
                        disabled={locked(f.key)}
                        onChange={(e) => setSelected((p) => ({ ...p, [f.key]: { ...s, required: e.target.checked } }))}
                        className="accent-[#632D3B]"
                      />
                      Required
                    </label>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-[#776D6A] mt-2">
            Only collect what the ID card needs. Aadhaar numbers are sensitive — leave them off unless they must be printed.
          </p>
        </div>

        <label className="flex items-center gap-2 text-xs font-semibold">
          <input type="checkbox" checked={requirePhoto} onChange={(e) => setRequirePhoto(e.target.checked)} className="accent-[#632D3B]" />
          Ask for a passport photo (cropped to 3.5 × 4.5 cm)
        </label>
      </div>
    </Modal>
  );
}
