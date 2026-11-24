"use client";

import React, { useState, useEffect, use, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  Printer,
  QrCode,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Eye,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { BatchSummary, StudentRecord } from "@/types";
import { DataService } from "@/lib/supabase/data-service";
import { generateQRDataUrl } from "@/lib/qr/generator";
import { createBatchZipArchive, generateProcessingReportCsv } from "@/lib/qr/zip-export";
import { DEFAULT_APPEARANCE } from "@/lib/constants";

function BatchDetailsInner({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const batchId = resolvedParams.id;
  const router = useRouter();
  const { toast } = useToast();

  const [batch, setBatch] = useState<BatchSummary | null>(null);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusTab, setStatusTab] = useState<"all" | "gen" | "dup" | "skip">("all");
  const [selectedStudentModal, setSelectedStudentModal] = useState<StudentRecord | null>(null);
  const [modalQrUrl, setModalQrUrl] = useState<string>("");
  const [isExportingZip, setIsExportingZip] = useState(false);

  useEffect(() => {
    loadBatchData();
  }, [batchId]);

  const loadBatchData = async () => {
    setLoading(true);
    try {
      const b = await DataService.getBatchById(batchId);
      setBatch(b);
      const s = await DataService.getStudents({ batchId });
      setStudents(s);
    } catch (err) {
      console.error(err);
      toast("Could not load batch data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const updateModalQr = async () => {
      if (selectedStudentModal && selectedStudentModal.qrPayload) {
        try {
          const url = await generateQRDataUrl(selectedStudentModal.qrPayload, {
            size: "300",
            ecc: "M",
          });
          setModalQrUrl(url);
        } catch {
          setModalQrUrl("");
        }
      } else {
        setModalQrUrl("");
      }
    };
    updateModalQr();
  }, [selectedStudentModal]);

  const handleDownloadSingleQr = async (student: StudentRecord) => {
    if (!student.qrPayload) return;
    try {
      const url = await generateQRDataUrl(student.qrPayload, { size: "600" });
      const a = document.createElement("a");
      a.href = url;
      a.download = `${student.registerNo || "student"}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast(`Downloaded QR for ${student.name}`);
    } catch {
      toast("Error downloading QR", "error");
    }
  };

  const handleDownloadBatchZip = async () => {
    if (!batch) return;
    setIsExportingZip(true);
    try {
      const validStudents = students.filter((s) => s.status === "gen" && s.qrPayload);
      const skippedStudents = students.filter((s) => s.status !== "gen");

      const zipBlob = await createBatchZipArchive(
        batch.name,
        validStudents,
        skippedStudents,
        [],
        batch.total,
        batch.templateSnapshot?.appearance || DEFAULT_APPEARANCE
      );

      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${batch.name.replace(/\s+/g, "_")}_QR.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("Downloaded QR ZIP archive");
    } catch (err: any) {
      toast("Error creating ZIP", "error");
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleDownloadReportCsv = () => {
    if (!batch) return;
    const validStudents = students.filter((s) => s.status === "gen");
    const skippedStudents = students.filter((s) => s.status !== "gen");

    const csvContent = generateProcessingReportCsv(
      batch.name,
      batch.total,
      validStudents,
      skippedStudents,
      []
    );

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${batch.name.replace(/\s+/g, "_")}_report.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Downloaded processing report (.csv)");
  };

  const filteredStudents = students.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.registerNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.course && s.course.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus =
      statusTab === "all" || s.status === statusTab;

    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <AppLayout>
        <div className="py-20 text-center text-[#776D6A]">
          Loading batch report...
        </div>
      </AppLayout>
    );
  }

  if (!batch) {
    return (
      <AppLayout>
        <div className="text-center py-16 space-y-3">
          <p className="text-lg font-semibold text-[#292326]">No entries</p>
          <Link href="/batches">
            <Button variant="primary">Return to Batch History</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-6xl mx-auto">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-[#776D6A]">
          <Link href="/batches" className="hover:text-[#632D3B] flex items-center gap-1 font-medium">
            <ArrowLeft className="w-3.5 h-3.5" />
            Batch History
          </Link>
          <span>/</span>
          <span className="text-[#292326] font-semibold">{batch.name}</span>
        </div>

        {/* Batch Overview Banner */}
        <Card className="bg-white">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#E7DED4]">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-[#632D3B]">{batch.name}</h1>
                <Badge variant={batch.status === "done" ? "success" : "warning"}>
                  {batch.status === "done" ? "Completed" : "Completed with Errors"}
                </Badge>
              </div>
              <p className="text-xs text-[#776D6A] font-mono mt-1">
                Source File: {batch.file} · Created: {batch.date}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                isLoading={isExportingZip}
                onClick={handleDownloadBatchZip}
                icon={<Download className="w-4 h-4" />}
              >
                Download QR ZIP
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={handleDownloadReportCsv}
                icon={<FileSpreadsheet className="w-4 h-4" />}
              >
                Processing Report (.csv)
              </Button>

              <Link href="/print">
                <Button variant="outline" size="sm" icon={<Printer className="w-4 h-4" />}>
                  Print Studio
                </Button>
              </Link>
            </div>
          </div>

          {/* Audit Metrics Grid & Verification Equation */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-[#FAF7F2] rounded-lg border border-[#E7DED4]">
            <div>
              <p className="text-[11px] text-[#776D6A] uppercase font-semibold">Total Input Rows</p>
              <p className="text-lg font-bold text-[#292326]">{batch.total}</p>
            </div>
            <div>
              <p className="text-[11px] text-[#776D6A] uppercase font-semibold">Generated QRs</p>
              <p className="text-lg font-bold text-[#0F6B50]">{batch.generated}</p>
            </div>
            <div>
              <p className="text-[11px] text-[#776D6A] uppercase font-semibold">Skipped Duplicates</p>
              <p className="text-lg font-bold text-[#8A5300]">{batch.skipped}</p>
            </div>
            <div>
              <p className="text-[11px] text-[#776D6A] uppercase font-semibold">Errors / Incomplete</p>
              <p className="text-lg font-bold text-[#A11F15]">{batch.failed}</p>
            </div>
          </div>

          <p className="mt-2 text-[11px] text-[#776D6A] italic">
            Verification Equation: {batch.total} Input Rows = {batch.generated} Generated + {batch.skipped} Skipped + {batch.failed} Errors
          </p>
        </Card>

        {/* Student Records List */}
        <Card className="space-y-4">
          <CardHeader
            title="Batch Student Records"
            subtitle="Row-level inspection of encoded student details and QR payloads"
            action={
              <div className="flex items-center gap-2">
                <div className="relative w-48 sm:w-64">
                  <Search className="w-3.5 h-3.5 text-[#776D6A] absolute left-2.5 top-2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search name or reg no..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full text-xs border border-[#E7DED4] rounded pl-8 pr-2.5 py-1.5 bg-[#FAF7F2]/50"
                  />
                </div>
              </div>
            }
          />

          {/* Table */}
          <div className="overflow-x-auto -mx-5 -mb-5">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#FAF7F2] border-y border-[#E7DED4] text-[#776D6A] uppercase tracking-wider">
                  <th className="py-2.5 px-4 font-semibold">Register Number</th>
                  <th className="py-2.5 px-3 font-semibold">Student Name</th>
                  <th className="py-2.5 px-3 font-semibold">Course / Department</th>
                  <th className="py-2.5 px-3 font-semibold">Status</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7DED4]">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[#776D6A]">
                      No entries
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((s, idx) => (
                    <tr key={idx} className="hover:bg-[#FAF7F2]/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-[#292326]">
                        {s.registerNo}
                      </td>
                      <td className="py-3 px-3 font-medium text-[#292326]">{s.name}</td>
                      <td className="py-3 px-3 text-[#776D6A]">
                        {s.course || "—"} {s.department ? `· ${s.department}` : ""}
                      </td>
                      <td className="py-3 px-3">
                        {s.status === "gen" ? (
                          <Badge variant="success">Generated</Badge>
                        ) : s.status === "dup" ? (
                          <Badge variant="warning">Duplicate</Badge>
                        ) : (
                          <Badge variant="error">Skipped</Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {s.qrPayload && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedStudentModal(s)}
                                icon={<Eye className="w-3.5 h-3.5" />}
                              >
                                View QR
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDownloadSingleQr(s)}
                                icon={<Download className="w-3.5 h-3.5" />}
                              >
                                PNG
                              </Button>
                            </>
                          )}
                          {s.errorReason && (
                            <span className="text-[11px] text-[#A11F15] italic">
                              {s.errorReason}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Student QR Modal */}
        <Modal
          isOpen={!!selectedStudentModal}
          onClose={() => setSelectedStudentModal(null)}
          title={`Student QR: ${selectedStudentModal?.name}`}
          footer={
            <Button
              variant="primary"
              size="sm"
              onClick={() => selectedStudentModal && handleDownloadSingleQr(selectedStudentModal)}
              icon={<Download className="w-4 h-4" />}
            >
              Download PNG
            </Button>
          }
        >
          {selectedStudentModal && (
            <div className="space-y-4 text-center">
              {modalQrUrl && (
                <div className="p-3 bg-white border border-[#E7DED4] rounded-xl inline-block shadow-2xs">
                  <img
                    src={modalQrUrl}
                    alt={selectedStudentModal.name}
                    className="w-48 h-48 mx-auto object-contain"
                  />
                </div>
              )}

              <div className="text-left bg-[#FAF7F2] p-3 rounded-lg border border-[#E7DED4]">
                <p className="text-[11px] font-semibold text-[#776D6A] uppercase mb-1">
                  Encoded Plain-Text Payload:
                </p>
                <pre className="text-xs font-mono text-[#292326] whitespace-pre-wrap">
                  {selectedStudentModal.qrPayload}
                </pre>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </AppLayout>
  );
}

export default function BatchDetailsPage(props: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F7F1E9] flex items-center justify-center text-[#776D6A]">
          Loading batch details...
        </div>
      }
    >
      <BatchDetailsInner {...props} />
    </Suspense>
  );
}
