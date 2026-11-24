"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Printer,
  FileDown,
  LayoutGrid,
  Sliders,
  Eye,
  CheckCircle2,
  RefreshCw,
  FolderArchive,
  ArrowRight,
  Barcode,
  QrCode,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { PrintSettings, StudentRecord, BatchSummary } from "@/types";
import { DEFAULT_PRINT_SETTINGS } from "@/lib/constants";
import { DataService } from "@/lib/supabase/data-service";
import { generatePrintablePdf } from "@/lib/printing/pdf-generator";
import { generateQRDataUrl } from "@/lib/qr/generator";
import { generateBarcodeDataUrl } from "@/lib/barcode/generator";

export default function BulkPrintStudioPage() {
  const { toast } = useToast();
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>("all");
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [settings, setSettings] = useState<PrintSettings>(DEFAULT_PRINT_SETTINGS);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [qrCache, setQrCache] = useState<Record<string, string>>({});
  const [barcodeCache, setBarcodeCache] = useState<Record<string, string>>({});
  const [previewPage, setPreviewPage] = useState(1);

  const filteredStudents = useMemo(() => {
    if (selectedBatchId === "all") {
      return students;
    }
    return students.filter((s) => s.batchId === selectedBatchId);
  }, [selectedBatchId, students]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const bList = await DataService.getBatches();
      setBatches(bList);
      const sList = await DataService.getStudents();
      // Only include valid/generated students
      const validOnly = sList.filter((s) => s.status === "gen" && s.qrPayload);
      setStudents(validOnly);
    } catch (err) {
      console.error(err);
      toast("Could not load batch records", "error");
    }
  };

  // Pre-generate QR and Barcode data URLs for first preview page
  useEffect(() => {
    const cacheCodes = async () => {
      const itemsPerPage = settings.columns * settings.rows;
      const start = (previewPage - 1) * itemsPerPage;
      const pageStudents = filteredStudents.slice(start, start + itemsPerPage);

      if (settings.codeType === "barcode") {
        const newBCache = { ...barcodeCache };
        let changed = false;
        for (const s of pageStudents) {
          if (!newBCache[s.registerNo] && s.registerNo) {
            try {
              newBCache[s.registerNo] = await generateBarcodeDataUrl(s.registerNo, {
                format: "CODE128",
                displayValue: true,
                fontSize: 11,
              });
              changed = true;
            } catch (e) {
              console.error(e);
            }
          }
        }
        if (changed) {
          setBarcodeCache(newBCache);
        }
      } else {
        const newCache = { ...qrCache };
        let changed = false;
        for (const s of pageStudents) {
          if (!newCache[s.registerNo] && s.qrPayload) {
            try {
              newCache[s.registerNo] = await generateQRDataUrl(s.qrPayload, {
                size: "300",
                ecc: "M",
                quiet: "2",
              });
              changed = true;
            } catch (e) {
              console.error(e);
            }
          }
        }
        if (changed) {
          setQrCache(newCache);
        }
      }
    };

    cacheCodes();
  }, [filteredStudents, previewPage, settings]);

  const itemsPerPage = settings.columns * settings.rows;
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / itemsPerPage));
  const currentStudentsOnPage = filteredStudents.slice(
    (previewPage - 1) * itemsPerPage,
    previewPage * itemsPerPage
  );

  const handleExportPdf = async () => {
    if (filteredStudents.length === 0) {
      toast("No student records available to export", "error");
      return;
    }

    setIsExportingPdf(true);
    try {
      const batchTitle =
        selectedBatchId === "all"
          ? "All Students - SVCAS"
          : batches.find((b) => b.id === selectedBatchId)?.name || "Student QR Codes";

      const pdfBlob = await generatePrintablePdf(filteredStudents, settings, batchTitle);
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${batchTitle.replace(/\s+/g, "_")}_Printable_A4.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("Downloaded print-ready PDF document");
    } catch (err: any) {
      console.error(err);
      toast(err.message || "Failed to generate print PDF", "error");
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleBrowserPrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E7DED4] no-print">
          <div>
            <h1 className="text-2xl font-bold text-[#632D3B] tracking-tight">
              Bulk Print Studio
            </h1>
            <p className="text-xs text-[#776D6A] mt-0.5">
              Configure A4 multi-page sheets for physical ID card laminators, print directly or download PDF
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleBrowserPrint}
              icon={<Printer className="w-4 h-4" />}
            >
              Print Sheet (Browser)
            </Button>

            <Button
              variant="primary"
              size="sm"
              isLoading={isExportingPdf}
              onClick={handleExportPdf}
              icon={<FileDown className="w-4 h-4" />}
            >
              Export Printable PDF
            </Button>
          </div>
        </div>

        {/* Studio Workspace Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 no-print">
          {/* Controls Sidebar (1 col) */}
          <div className="space-y-6">
            <Card>
              <CardHeader title="Cohort Selection" subtitle="Choose batch to print" />
              <div className="space-y-3">
                <select
                  value={selectedBatchId}
                  onChange={(e) => setSelectedBatchId(e.target.value)}
                  className="w-full text-xs border border-[#E7DED4] rounded-md px-3 py-2 bg-white"
                >
                  {students.length === 0 ? (
                    <option value="">No entries</option>
                  ) : (
                    <>
                      <option value="all">All Available Students ({students.length})</option>
                      {batches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.generated} QRs)
                        </option>
                      ))}
                    </>
                  )}
                </select>

                <div className="p-3 bg-[#FAF7F2] rounded-md border border-[#E7DED4] text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[#776D6A]">Total QRs:</span>
                    <span className="font-semibold text-[#292326]">{filteredStudents.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#776D6A]">Estimated Pages:</span>
                    <span className="font-semibold text-[#632D3B]">{totalPages}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#776D6A]">Codes per Page:</span>
                    <span className="font-semibold text-[#292326]">{itemsPerPage}</span>
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Print Code & Layout" subtitle="Arrangement and sizing on A4 sheet" />
              <div className="space-y-4 text-xs">
                {/* Code Type: QR Code vs Barcode */}
                <div>
                  <label className="font-semibold text-[#292326] block mb-1.5">Print Code Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, codeType: "qr" })}
                      className={`p-2 rounded-lg border flex items-center justify-center gap-2 font-medium transition-all ${
                        (settings.codeType || "qr") === "qr"
                          ? "bg-[#632D3B] text-white border-[#632D3B]"
                          : "bg-white text-[#292326] border-[#E7DED4] hover:bg-[#FAF7F2]"
                      }`}
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>QR Code</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, codeType: "barcode" })}
                      className={`p-2 rounded-lg border flex items-center justify-center gap-2 font-medium transition-all ${
                        settings.codeType === "barcode"
                          ? "bg-[#632D3B] text-white border-[#632D3B]"
                          : "bg-white text-[#292326] border-[#E7DED4] hover:bg-[#FAF7F2]"
                      }`}
                    >
                      <Barcode className="w-3.5 h-3.5" />
                      <span>Barcode (1D)</span>
                    </button>
                  </div>
                </div>

                {/* Sizing with Units: mm, cm, in */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-semibold text-[#292326]">Item Physical Size</label>
                    <div className="flex p-0.5 bg-[#FAF7F2] border border-[#E7DED4] rounded">
                      {[
                        { id: "mm", label: "mm" },
                        { id: "cm", label: "cm" },
                        { id: "in", label: "in" },
                      ].map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => setSettings({ ...settings, sizeUnit: u.id as any })}
                          className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${
                            (settings.sizeUnit || "mm") === u.id
                              ? "bg-[#632D3B] text-white"
                              : "text-[#776D6A]"
                          }`}
                        >
                          {u.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={settings.sizeUnit === "in" ? 0.8 : settings.sizeUnit === "cm" ? 2.0 : 20}
                      max={settings.sizeUnit === "in" ? 3.0 : settings.sizeUnit === "cm" ? 7.5 : 75}
                      step={settings.sizeUnit === "in" ? 0.05 : settings.sizeUnit === "cm" ? 0.1 : 1}
                      value={
                        settings.sizeUnit === "in"
                          ? Number(((settings.qrSizeMm || 45) / 25.4).toFixed(2))
                          : settings.sizeUnit === "cm"
                          ? Number(((settings.qrSizeMm || 45) / 10).toFixed(1))
                          : settings.qrSizeMm || 45
                      }
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        let mm = val;
                        if (settings.sizeUnit === "in") mm = Math.round(val * 25.4);
                        if (settings.sizeUnit === "cm") mm = Math.round(val * 10);
                        setSettings({ ...settings, qrSizeMm: mm, sizeValue: val });
                      }}
                      className="flex-1 accent-[#632D3B]"
                    />
                    <span className="font-mono text-[#632D3B] text-xs font-semibold min-w-16 text-right">
                      {settings.sizeUnit === "in"
                        ? `${((settings.qrSizeMm || 45) / 25.4).toFixed(2)} in`
                        : settings.sizeUnit === "cm"
                        ? `${((settings.qrSizeMm || 45) / 10).toFixed(1)} cm`
                        : `${settings.qrSizeMm || 45} mm`}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#776D6A] mt-0.5">
                    ({settings.qrSizeMm || 45} mm physical print dimension)
                  </p>
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <label className="font-semibold text-[#292326]">Columns across</label>
                    <span className="font-mono text-[#632D3B]">{settings.columns}</span>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={5}
                    value={settings.columns}
                    onChange={(e) => setSettings({ ...settings, columns: parseInt(e.target.value, 10) })}
                    className="w-full accent-[#632D3B]"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <label className="font-semibold text-[#292326]">Rows down</label>
                    <span className="font-mono text-[#632D3B]">{settings.rows}</span>
                  </div>
                  <input
                    type="range"
                    min={3}
                    max={8}
                    value={settings.rows}
                    onChange={(e) => setSettings({ ...settings, rows: parseInt(e.target.value, 10) })}
                    className="w-full accent-[#632D3B]"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <label className="font-semibold text-[#292326]">Page Margin (mm)</label>
                    <span className="font-mono text-[#632D3B]">{settings.marginMm} mm</span>
                  </div>
                  <input
                    type="range"
                    min={6}
                    max={20}
                    value={settings.marginMm}
                    onChange={(e) => setSettings({ ...settings, marginMm: parseInt(e.target.value, 10) })}
                    className="w-full accent-[#632D3B]"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <label className="font-semibold text-[#292326]">Code Spacing (mm)</label>
                    <span className="font-mono text-[#632D3B]">{settings.spacingMm} mm</span>
                  </div>
                  <input
                    type="range"
                    min={2}
                    max={12}
                    value={settings.spacingMm}
                    onChange={(e) => setSettings({ ...settings, spacingMm: parseInt(e.target.value, 10) })}
                    className="w-full accent-[#632D3B]"
                  />
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Labels & Styling" subtitle="Print typography" />
              <div className="space-y-3 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.showRegisterNo}
                    onChange={(e) => setSettings({ ...settings, showRegisterNo: e.target.checked })}
                    className="w-4 h-4 rounded text-[#632D3B] focus:ring-[#632D3B]"
                  />
                  <span>Show Register Number label</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.showStudentName}
                    onChange={(e) => setSettings({ ...settings, showStudentName: e.target.checked })}
                    className="w-4 h-4 rounded text-[#632D3B] focus:ring-[#632D3B]"
                  />
                  <span>Show Student Name label</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.showBorder}
                    onChange={(e) => setSettings({ ...settings, showBorder: e.target.checked })}
                    className="w-4 h-4 rounded text-[#632D3B] focus:ring-[#632D3B]"
                  />
                  <span>Draw subtle border around cells</span>
                </label>
              </div>
            </Card>
          </div>

          {/* Interactive Sheet Preview (3 cols) */}
          <div className="lg:col-span-3 space-y-4">
            <div className="flex items-center justify-between bg-white px-4 py-3 rounded-lg border border-[#E7DED4] shadow-xs">
              <span className="text-xs font-semibold text-[#292326]">
                Page {previewPage} of {totalPages} ({filteredStudents.length} codes)
              </span>

              <div className="flex items-center gap-2">
                <button
                  disabled={previewPage <= 1}
                  onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1 border rounded text-xs bg-white disabled:opacity-40 hover:bg-[#FAF7F2]"
                >
                  Previous Page
                </button>
                <button
                  disabled={previewPage >= totalPages}
                  onClick={() => setPreviewPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1 border rounded text-xs bg-white disabled:opacity-40 hover:bg-[#FAF7F2]"
                >
                  Next Page
                </button>
              </div>
            </div>

            {/* A4 Sheet Canvas Wrapper */}
            <div className="bg-[#524B4E]/20 p-6 rounded-xl flex items-center justify-center overflow-x-auto">
              {/* Simulated A4 Aspect Ratio Sheet (210 x 297mm) */}
              <div
                className="bg-white shadow-2xl rounded-sm border border-[#E7DED4] min-w-[595px] max-w-[650px] w-full aspect-[210/297] flex flex-col p-6 relative"
                style={{
                  padding: `${settings.marginMm * 1.5}px`,
                }}
              >
                {/* Header text on page */}
                <div className="text-[10px] text-[#776D6A] flex justify-between pb-2 border-b border-[#E7DED4]/60 mb-3">
                  <span>Student QR Print Sheet</span>
                  <span>Page {filteredStudents.length > 0 ? previewPage : 0} of {totalPages}</span>
                </div>

                {/* Grid or Empty State */}
                {filteredStudents.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-xs text-[#776D6A]">
                    <p className="font-semibold text-sm text-[#292326]">No entries</p>
                    <p className="mt-1">Generate a QR batch to preview printable sheets.</p>
                  </div>
                ) : (
                  <div
                    className="grid flex-1 gap-2.5"
                    style={{
                      gridTemplateColumns: `repeat(${settings.columns}, minmax(0, 1fr))`,
                      gridTemplateRows: `repeat(${settings.rows}, minmax(0, 1fr))`,
                      gap: `${settings.spacingMm * 1.2}px`,
                    }}
                  >
                    {currentStudentsOnPage.map((s, idx) => (
                      <div
                        key={s.registerNo + idx}
                        className={`flex flex-col items-center justify-center p-2 rounded text-center transition-all ${
                          settings.showBorder ? "border border-[#E7DED4]" : ""
                        }`}
                      >
                        {settings.codeType === "barcode" ? (
                          barcodeCache[s.registerNo] ? (
                            <img
                              src={barcodeCache[s.registerNo]}
                              alt={s.registerNo}
                              className="w-full max-h-12 object-contain mx-auto"
                            />
                          ) : (
                            <div className="w-full h-10 bg-[#FAF7F2] rounded border flex items-center justify-center text-[10px] text-[#776D6A]">
                              Barcode
                            </div>
                          )
                        ) : qrCache[s.registerNo] ? (
                          <img
                            src={qrCache[s.registerNo]}
                            alt={s.registerNo}
                            className="w-16 h-16 sm:w-20 sm:h-20 object-contain mx-auto"
                          />
                        ) : (
                          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-[#FAF7F2] rounded border flex items-center justify-center text-[10px] text-[#776D6A]">
                            QR
                          </div>
                        )}

                        <div className="mt-1 space-y-0.5 max-w-full">
                          {settings.showRegisterNo && (
                            <p className="text-[10px] font-bold font-mono text-[#292326] truncate">
                              {s.registerNo}
                            </p>
                          )}
                          {settings.showStudentName && (
                            <p className="text-[9px] text-[#776D6A] truncate max-w-[120px]">
                              {s.name}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Hidden Printable DOM for browser printing (window.print) */}
        <div className="hidden print-only">
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${settings.columns}, minmax(0, 1fr))`,
              gap: `${settings.spacingMm}mm`,
              margin: `${settings.marginMm}mm`,
            }}
          >
            {filteredStudents.map((s, idx) => (
              <div
                key={s.registerNo + idx}
                className={`flex flex-col items-center justify-center p-2 text-center ${
                  settings.showBorder ? "border border-black" : ""
                }`}
              >
                {settings.codeType === "barcode" ? (
                  barcodeCache[s.registerNo] && (
                    <img
                      src={barcodeCache[s.registerNo]}
                      alt={s.registerNo}
                      style={{ maxWidth: "100%", maxHeight: `${settings.qrSizeMm * 0.6}mm` }}
                    />
                  )
                ) : (
                  qrCache[s.registerNo] && (
                    <img
                      src={qrCache[s.registerNo]}
                      alt={s.registerNo}
                      style={{ width: `${settings.qrSizeMm}mm`, height: `${settings.qrSizeMm}mm` }}
                    />
                  )
                )}
                {settings.showRegisterNo && (
                  <p className="text-xs font-bold font-mono mt-1">{s.registerNo}</p>
                )}
                {settings.showStudentName && (
                  <p className="text-[10px] mt-0.5">{s.name}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
