"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Copy, Download, FileSpreadsheet, ImageOff, QrCode, Search, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { DataService } from "@/lib/supabase/data-service";
import { CollectionForm, FormSubmission, isFormAccepting, latestPerStudent } from "@/lib/forms/schema";
import { FormsService, shareLink } from "@/lib/forms/admin-client";
import { photosZip, submissionsWorkbook, workbookBytes } from "@/lib/forms/export";
import { saveHandoff } from "@/lib/forms/handoff";

const PAGE_SIZE = 50;

function fileSafe(s: string) {
  return s.replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "_").slice(0, 60) || "form";
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function FormSubmissions() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const formId = params?.id || "";

  const [form, setForm] = useState<CollectionForm | null>(null);
  const [subs, setSubs] = useState<FormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dept, setDept] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [viewing, setViewing] = useState<FormSubmission | null>(null);
  const [busy, setBusy] = useState<"" | "zip" | "excel" | "generate" | "delete">("");
  const [zipProgress, setZipProgress] = useState("");
  const [confirmDeleteForm, setConfirmDeleteForm] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(async () => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([FormsService.get(formId), FormsService.submissions(formId)])
      .then(([f, s]) => {
        if (cancelled) return;
        setForm(f);
        setSubs(s);
        setError(f ? "" : "Form not found.");
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [formId, reloadKey]);

  const latest = useMemo(() => latestPerStudent(subs), [subs]);
  const resubmitted = useMemo(() => {
    const counts = new Map<string, number>();
    subs.forEach((s) => counts.set(s.registerNo, (counts.get(s.registerNo) || 0) + 1));
    return counts;
  }, [subs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return latest
      .filter((s) => !dept || s.department === dept)
      .filter((s) => !q || s.studentName.toLowerCase().includes(q) || s.registerNo.toLowerCase().includes(q))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [latest, dept, query]);

  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Signed photo links for the rows on screen
  useEffect(() => {
    const paths = pageRows.map((s) => s.photoPath).filter((p): p is string => !!p && !photoUrls[p]);
    if (paths.length === 0) return;
    FormsService.photoUrls(paths)
      .then((urls) => setPhotoUrls((prev) => ({ ...prev, ...urls })))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageRows.map((s) => s.id).join(",")]);

  const departmentCounts = useMemo(() => {
    const m = new Map<string, number>();
    latest.forEach((s) => m.set(s.department, (m.get(s.department) || 0) + 1));
    return m;
  }, [latest]);

  const missingPhotos = latest.filter((s) => !s.photoPath).length;

  const exportExcel = async () => {
    if (!form) return;
    setBusy("excel");
    try {
      const bytes = workbookBytes(submissionsWorkbook(form, subs));
      downloadBlob(new Blob([bytes]), `${fileSafe(form.title)}_submissions.xlsx`);
      DataService.createAuditLog({ eventType: "form_exported", resourceType: "collection_forms", resourceId: form.id, details: { students: latest.length } }).catch(() => undefined);
    } finally {
      setBusy("");
    }
  };

  const exportPhotos = async () => {
    if (!form) return;
    setBusy("zip");
    try {
      const { blob, missing } = await photosZip(subs, (p) => FormsService.downloadPhoto(p), (d, t) => setZipProgress(`${d}/${t}`));
      downloadBlob(blob, `${fileSafe(form.title)}_photos.zip`);
      if (missing.length) toast(`${missing.length} student(s) have no photo`, "info");
      DataService.createAuditLog({ eventType: "form_photos_exported", resourceType: "collection_forms", resourceId: form.id, details: { photos: latest.length - missing.length } }).catch(() => undefined);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy("");
      setZipProgress("");
    }
  };

  const generate = () => {
    if (!form || latest.length === 0) return;
    setBusy("generate");
    saveHandoff(`${fileSafe(form.title)}.xlsx`, workbookBytes(submissionsWorkbook(form, subs)));
    router.push("/generate");
  };

  const deleteStudent = async (s: FormSubmission) => {
    if (!window.confirm(`Delete ${s.studentName} (${s.registerNo}) and their photo? This cannot be undone.`)) return;
    setBusy("delete");
    try {
      await FormsService.removeStudent(formId, s.registerNo, subs);
      DataService.createAuditLog({ eventType: "form_submission_deleted", resourceType: "form_submissions", resourceId: formId, details: { registerNo: s.registerNo } }).catch(() => undefined);
      setViewing(null);
      await load();
      toast("Submission deleted");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy("");
    }
  };

  const deleteForm = async () => {
    setBusy("delete");
    try {
      await FormsService.remove(formId);
      DataService.createAuditLog({ eventType: "form_deleted", resourceType: "collection_forms", resourceId: formId, details: { title: form?.title, students: latest.length } }).catch(() => undefined);
      router.push("/forms");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
      setBusy("");
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <Link href="/forms" className="inline-flex items-center gap-1.5 text-xs text-[#776D6A] hover:text-[#632D3B]">
          <ArrowLeft className="w-3.5 h-3.5" /> All forms
        </Link>

        {loading && <p className="text-sm text-[#776D6A]">Loading…</p>}
        {error && <Card className="p-4 text-sm text-[#A11F15]">{error}</Card>}

        {form && (
          <>
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold text-[#632D3B] tracking-tight break-words">{form.title}</h1>
                  <Badge variant={isFormAccepting(form) ? "success" : "neutral"}>{isFormAccepting(form) ? "Open" : "Closed"}</Badge>
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(shareLink(form.slug)).then(() => toast("Link copied"))}
                  className="mt-1 inline-flex items-center gap-1.5 text-xs text-[#776D6A] hover:text-[#632D3B]"
                >
                  <Copy className="w-3.5 h-3.5" /> {shareLink(form.slug)}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" icon={<FileSpreadsheet className="w-4 h-4" />} onClick={exportExcel} isLoading={busy === "excel"} disabled={latest.length === 0}>
                  Excel
                </Button>
                <Button variant="secondary" icon={<Download className="w-4 h-4" />} onClick={exportPhotos} isLoading={busy === "zip"} disabled={latest.length === 0}>
                  {busy === "zip" && zipProgress ? `Photos ${zipProgress}` : "Photos ZIP"}
                </Button>
                <Button icon={<QrCode className="w-4 h-4" />} onClick={generate} isLoading={busy === "generate"} disabled={latest.length === 0}>
                  Generate QR codes
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Students" value={latest.length} />
              <Stat label="Departments" value={departmentCounts.size} />
              <Stat label="Resubmitted" value={Array.from(resubmitted.values()).filter((n) => n > 1).length} />
              <Stat label="Missing photo" value={form.requirePhoto ? missingPhotos : "—"} />
            </div>

            <Card className="p-0 overflow-hidden">
              <div className="flex flex-col sm:flex-row gap-2 p-3 border-b border-[#E7DED4] bg-[#FAF7F2]">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-[#776D6A] absolute left-2.5 top-2.5" />
                  <input
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPage(0);
                    }}
                    placeholder="Search name or register number"
                    className="w-full pl-8 pr-3 py-2 text-sm border border-[#E7DED4] rounded-md bg-white"
                  />
                </div>
                {departmentCounts.size > 1 && (
                  <select
                    value={dept}
                    onChange={(e) => {
                      setDept(e.target.value);
                      setPage(0);
                    }}
                    className="text-sm border border-[#E7DED4] rounded-md px-2 py-2 bg-white"
                  >
                    <option value="">All departments</option>
                    {Array.from(departmentCounts.entries()).map(([d, n]) => (
                      <option key={d} value={d}>
                        {d || "(none)"} ({n})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {filtered.length === 0 ? (
                <p className="p-8 text-center text-sm text-[#776D6A]">
                  {latest.length === 0 ? "No submissions yet. Share the link with the college." : "No matching students."}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wider text-[#776D6A] border-b border-[#E7DED4]">
                        <th className="py-2 px-3 w-14">Photo</th>
                        <th className="py-2 px-3">Name</th>
                        <th className="py-2 px-3">Register No</th>
                        {departmentCounts.size > 1 && <th className="py-2 px-3">Department</th>}
                        <th className="py-2 px-3">Submitted</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E7DED4]">
                      {pageRows.map((s) => (
                        <tr key={s.id} className="hover:bg-[#FAF7F2] cursor-pointer" onClick={() => setViewing(s)}>
                          <td className="py-2 px-3">
                            {s.photoPath && photoUrls[s.photoPath] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={photoUrls[s.photoPath]} alt="" className="w-9 h-[46px] object-cover rounded border border-[#E7DED4]" />
                            ) : (
                              <div className="w-9 h-[46px] rounded border border-dashed border-[#E7DED4] flex items-center justify-center">
                                <ImageOff className="w-3.5 h-3.5 text-[#C7A878]" />
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-3 font-medium">
                            {s.studentName}
                            {(resubmitted.get(s.registerNo) || 0) > 1 && (
                              <span className="ml-2 text-[10px] text-[#8A5300]">updated ×{resubmitted.get(s.registerNo)}</span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-mono text-xs">{s.registerNo}</td>
                          {departmentCounts.size > 1 && <td className="py-2 px-3 text-xs">{s.department}</td>}
                          <td className="py-2 px-3 text-xs text-[#776D6A]">
                            {new Date(s.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {filtered.length > PAGE_SIZE && (
                <div className="flex items-center justify-between p-3 border-t border-[#E7DED4] text-xs text-[#776D6A]">
                  <span>
                    {page * PAGE_SIZE + 1}–{Math.min(filtered.length, (page + 1) * PAGE_SIZE)} of {filtered.length}
                  </span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
                      Previous
                    </Button>
                    <Button size="sm" variant="secondary" disabled={(page + 1) * PAGE_SIZE >= filtered.length} onClick={() => setPage(page + 1)}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </Card>

            <div className="flex justify-end">
              <button onClick={() => setConfirmDeleteForm(true)} className="text-xs text-[#A11F15] hover:underline inline-flex items-center gap-1">
                <Trash2 className="w-3.5 h-3.5" /> Delete this form and all its submissions
              </button>
            </div>
          </>
        )}
      </div>

      <Modal
        isOpen={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing ? `${viewing.studentName} · ${viewing.registerNo}` : ""}
        maxWidth="lg"
        footer={
          viewing && (
            <div className="flex justify-between">
              <Button variant="danger" size="sm" icon={<Trash2 className="w-4 h-4" />} onClick={() => deleteStudent(viewing)} isLoading={busy === "delete"}>
                Delete
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setViewing(null)}>
                Close
              </Button>
            </div>
          )
        }
      >
        {viewing && form && (
          <div className="flex flex-col sm:flex-row gap-5 text-sm">
            {viewing.photoPath && photoUrls[viewing.photoPath] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrls[viewing.photoPath]} alt="" className="w-[140px] h-[180px] object-cover rounded-md border border-[#E7DED4] shrink-0" />
            )}
            <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-xs">
              {viewing.department && (
                <>
                  <dt className="text-[#776D6A]">Department</dt>
                  <dd>{viewing.department}</dd>
                </>
              )}
              {form.fields.map((f) => (
                <React.Fragment key={f.key}>
                  <dt className="text-[#776D6A]">{f.label}</dt>
                  <dd className="break-words whitespace-pre-line">{viewing.data[f.key] || "—"}</dd>
                </React.Fragment>
              ))}
              <dt className="text-[#776D6A]">Submitted</dt>
              <dd>{new Date(viewing.createdAt).toLocaleString("en-IN")}</dd>
            </dl>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={confirmDeleteForm}
        onClose={() => setConfirmDeleteForm(false)}
        title="Delete form?"
        maxWidth="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDeleteForm(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={deleteForm} isLoading={busy === "delete"}>
              Delete everything
            </Button>
          </div>
        }
      >
        <p className="text-sm">
          This permanently deletes the form, its link, all {latest.length} students&apos; details and their photos. Download the
          Excel and photos first if you need them.
        </p>
      </Modal>
    </AppLayout>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="p-4">
      <p className="text-[11px] uppercase tracking-wider font-semibold text-[#776D6A]">{label}</p>
      <p className="text-2xl font-bold text-[#292326] mt-1">{value}</p>
    </Card>
  );
}

export default function FormSubmissionsPage() {
  // The page reads the URL, so it renders at request time inside Suspense (required with cacheComponents)
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F7F1E9]" />}>
      <FormSubmissions />
    </Suspense>
  );
}
