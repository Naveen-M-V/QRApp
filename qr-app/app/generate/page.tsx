"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileSpreadsheet,
  Check,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Settings2,
  Sliders,
  Eye,
  Download,
  Printer,
  Sparkles,
  RefreshCw,
  X,
  FileCheck2,
  Barcode,
  QrCode,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import {
  FieldConfig,
  PayloadFormat,
  BlankHandling,
  DuplicateRule,
  QRAppearanceSettings,
  StudentRecord,
  RowValidationIssue,
} from "@/types";
import { DataService } from "@/lib/supabase/data-service";
import { parseSpreadsheetBuffer, ParsedSpreadsheet, SheetSummary } from "@/lib/spreadsheet/parser";
import { validateStudentRows, ValidationSummary } from "@/lib/spreadsheet/validator";
import {
  generateQRImageDataUrl,
  barcodeSettingsFromAppearance,
  buildStudentFileName,
  extensionForFormat,
  SHEET_NAME_PART,
} from "@/lib/qr/generator";
import { createBatchZipArchive, generateProcessingReportCsv } from "@/lib/qr/zip-export";
import { calculateDimensions, SIZE_PRESETS, convertToPixels, SizeUnit } from "@/lib/qr/dimensions";
import { generateBarcodeDataUrl } from "@/lib/barcode/generator";
import { buildKeyToColumns, getFieldValue } from "@/lib/spreadsheet/validator";
import { takeHandoff } from "@/lib/forms/handoff";
import { DEFAULT_FIELDS } from "@/lib/constants";

const STEP_TITLES = [
  "Upload Spreadsheet",
  "Match Columns",
  "Configure QR Payload",
  "QR Appearance",
  "Review & Generate",
];

export default function GeneratePage() {
  const router = useRouter();
  const { toast } = useToast();

  const [currentStep, setCurrentStep] = useState(1);
  const [maxReachedStep, setMaxReachedStep] = useState(1);

  // Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>("");
  const [fileSize, setFileSize] = useState<number>(0);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [sheets, setSheets] = useState<SheetSummary[]>([]);
  const [uploadError, setUploadError] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [isReadingFile, setIsReadingFile] = useState(false);

  // Mapping & Fields State
  const [fields, setFields] = useState<FieldConfig[]>(DEFAULT_FIELDS);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [duplicateRule, setDuplicateRule] = useState<DuplicateRule>("keep");
  const [format, setFormat] = useState<PayloadFormat>("colon");
  const [blankHandling, setBlankHandling] = useState<BlankHandling>("omit");

  // Appearance State
  const [appearance, setAppearance] = useState<QRAppearanceSettings>({
    codeType: "qr",
    barcodeFormat: "CODE128",
    barcodeField: "register_no",
    includeBarcodeText: true,
    sizeUnit: "px",
    sizeValue: 600,
    dpi: 300,
    size: "600",
    format: "PNG",
    ecc: "M",
    quiet: "4",
    naming: "serial",
    transparentBackground: true,
  });

  const [sizeInputText, setSizeInputText] = useState<string>("600");

  // Validation & Output computed via useMemo
  const validation = useMemo(() => {
    if (rawRows.length > 0 && fields.length > 0) {
      return validateStudentRows(
        rawRows,
        fields,
        columnMapping,
        duplicateRule,
        format,
        blankHandling
      );
    }
    return null;
  }, [rawRows, fields, columnMapping, duplicateRule, format, blankHandling]);

  const [previewRowIndex, setPreviewRowIndex] = useState<number>(0);
  const [previewQrDataUrl, setPreviewQrDataUrl] = useState<string>("");
  const [previewBarcodeDataUrl, setPreviewBarcodeDataUrl] = useState<string>("");

  // Processing & Batch Execution State
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [generatedZipBlob, setGeneratedZipBlob] = useState<Blob | null>(null);
  const [createdBatchId, setCreatedBatchId] = useState<string>("");

  useEffect(() => {
    loadInitialConfigs().then((loadedFields) => {
      // Data sent here from a Collection Form ("Generate QR codes")
      const handoff = takeHandoff();
      if (handoff) handleFileProcess(handoff, loadedFields);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadInitialConfigs = async (): Promise<FieldConfig[]> => {
    let loaded: FieldConfig[] = DEFAULT_FIELDS;
    try {
      const fieldList = await DataService.getFieldConfigs();
      loaded = fieldList && fieldList.length > 0 ? fieldList : DEFAULT_FIELDS;
      setFields(loaded);
      const settings = await DataService.getSettings();
      setFormat(settings.defaultFormat || "colon");
      setBlankHandling(settings.defaultBlank || "omit");
      if (settings.qrDefaults) {
        setAppearance((prev) => ({
          ...prev,
          ...settings.qrDefaults,
          naming: settings.qrDefaults.naming || "serial",
          transparentBackground: settings.qrDefaults.transparentBackground !== false,
        }));
        setSizeInputText(String(settings.qrDefaults.sizeValue || (settings.qrDefaults.sizeUnit === "px" ? 600 : settings.qrDefaults.sizeUnit === "in" ? 1.0 : 2.5)));
      }
    } catch (err) {
      console.error(err);
      setFields(DEFAULT_FIELDS);
    }
    return loaded;
  };

  // Update live sample QR and Barcode preview
  useEffect(() => {
    const updatePreview = async () => {
      if (!validation || validation.validStudents.length === 0) {
        setPreviewQrDataUrl("");
        setPreviewBarcodeDataUrl("");
        return;
      }
      const activeIdx = Math.min(previewRowIndex, validation.validStudents.length - 1);
      const student = validation.validStudents[activeIdx];
      if (student) {
        if (student.qrPayload) {
          try {
            const url = await generateQRImageDataUrl(student.qrPayload, appearance);
            setPreviewQrDataUrl(url);
          } catch {
            setPreviewQrDataUrl("");
          }
        }
        const field = appearance.barcodeField || "register_no";
        const fieldValue =
          field === "register_no"
            ? student.registerNo
            : getFieldValue(student.studentData as Record<string, unknown>, field, buildKeyToColumns(columnMapping));
        const opts = barcodeSettingsFromAppearance(appearance);
        let bUrl = "";
        for (const value of [fieldValue, student.registerNo]) {
          if (!value) continue;
          try {
            bUrl = await generateBarcodeDataUrl(value, opts);
            break;
          } catch {
            // value can't be encoded (e.g. Tamil text) — export falls back to the register number too
          }
        }
        setPreviewBarcodeDataUrl(bUrl);
      }
    };
    updatePreview();
  }, [validation, previewRowIndex, appearance, columnMapping]);

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  // Handle spreadsheet file upload
  const handleFileProcess = async (file: File, baseFields: FieldConfig[] = fields) => {
    setUploadError("");
    const validExtensions = /\.(xlsx|xls|csv)$/i;
    if (!validExtensions.test(file.name)) {
      setUploadError(
        `"${file.name}" is not a supported file type. Only Excel (.xlsx, .xls) and CSV (.csv) files are permitted.`
      );
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setUploadError("The file exceeds the 10 MB limit. Please split large class lists.");
      return;
    }

    setIsReadingFile(true);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseSpreadsheetBuffer(buffer, file.name, file.size);

      // Ensure all columns from spreadsheet are in fields so everything is imported by default
      const currentFieldsMap = new Map(baseFields.map((f) => [f.key, f]));
      const updatedFields = [...baseFields];

      for (const header of parsed.headers) {
        const mappedKey = parsed.suggestedMapping[header];
        if (!mappedKey) continue;

        if (!currentFieldsMap.has(mappedKey)) {
          // Check if it's in DEFAULT_FIELDS first
          const defaultField = DEFAULT_FIELDS.find((d) => d.key === mappedKey);
          if (defaultField) {
            updatedFields.push(defaultField);
            currentFieldsMap.set(mappedKey, defaultField);
          } else {
            // Create a dynamic field config for the column
            const dynamicField: FieldConfig = {
              key: mappedKey,
              label: header,
              qrLabel: header,
              type: "Text",
              required: false,
              active: true,
              inQr: true,
              col: header,
              custom: true,
              help: `Imported from Excel column: ${header}`,
            };
            updatedFields.push(dynamicField);
            currentFieldsMap.set(mappedKey, dynamicField);
          }
        }
      }

      // Follow the spreadsheet: fields that have a column come first, in the order their
      // columns appear in the file; fields the file doesn't have go to the end.
      const columnRank = new Map<string, number>();
      parsed.headers.forEach((header, i) => {
        const key = parsed.suggestedMapping[header];
        if (key && !columnRank.has(key)) columnRank.set(key, i);
      });
      const orderedFields = updatedFields
        .map((f, i) => ({ f, i }))
        .sort((a, b) => {
          const ra = columnRank.get(a.f.key) ?? Number.MAX_SAFE_INTEGER;
          const rb = columnRank.get(b.f.key) ?? Number.MAX_SAFE_INTEGER;
          return ra - rb || a.i - b.i;
        })
        .map(({ f }) => f);

      setFields(orderedFields);
      setFileName(parsed.fileName);
      setFileSize(parsed.fileSize);
      setRawHeaders(parsed.headers);
      setRawRows(parsed.rows);
      setColumnMapping(parsed.suggestedMapping);
      setSheets(parsed.sheets || []);

      setMaxReachedStep(Math.max(maxReachedStep, 2));
      setCurrentStep(2);
      toast(
        parsed.sheets && parsed.sheets.length > 1
          ? `Loaded ${parsed.totalRows} rows across ${parsed.sheets.length} sheets (${parsed.sheets.map((s) => s.name).join(", ")})`
          : `Loaded ${parsed.totalRows} rows from "${file.name}"`
      );
    } catch (err: any) {
      setUploadError(err.message || "Failed to process the spreadsheet file.");
    } finally {
      setIsReadingFile(false);
    }
  };

  // Blank data-collection template built from the current field configuration
  const handleDownloadTemplate = async () => {
    try {
      const [{ buildTemplateWorkbook }, XLSX] = await Promise.all([
        import("@/lib/spreadsheet/template"),
        import("xlsx"),
      ]);
      const settings = await DataService.getSettings().catch(() => null);
      const wb = buildTemplateWorkbook(fields, settings?.institutionName || "");
      XLSX.writeFile(wb, "QR_Data_Collection_Template.xlsx");
    } catch (err) {
      console.error(err);
      toast("Could not create the template", "error");
    }
  };

  // Field Reordering Helpers
  // Moves a field up/down past the next field that is actually in this file
  const moveField = (key: string, direction: -1 | 1) => {
    const mappedKeys = new Set(Object.values(columnMapping).filter(Boolean));
    const visible = fields.filter((f) => f.active && mappedKeys.has(f.key));
    const vIdx = visible.findIndex((f) => f.key === key);
    const neighbour = visible[vIdx + direction];
    if (vIdx < 0 || !neighbour) return;
    const list = [...fields];
    const a = list.findIndex((f) => f.key === key);
    const b = list.findIndex((f) => f.key === neighbour.key);
    [list[a], list[b]] = [list[b], list[a]];
    setFields(list);
  };

  const toggleFieldInQr = (key: string) => {
    setFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, inQr: !f.inQr } : f))
    );
  };

  const updateFieldQrLabel = (key: string, newLabel: string) => {
    setFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, qrLabel: newLabel } : f))
    );
  };

  // Validation Checks for Stepper
  const requiredMissing = fields
    .filter((f) => f.active && f.required)
    .filter((f) => !Object.values(columnMapping).includes(f.key));

  // Sheets may use different headers for the same field, so several columns can map to
  // one field. Only a clash INSIDE one sheet is ambiguous.
  const sheetHeaderList: { name: string; headers: string[] }[] =
    sheets.length > 0 ? sheets : [{ name: "Sheet1", headers: rawHeaders }];

  const duplicateMappings = sheetHeaderList.flatMap((sh) => {
    const keys = sh.headers.map((h) => columnMapping[h]).filter(Boolean);
    return keys
      .filter((key, idx, arr) => arr.indexOf(key) === idx && arr.lastIndexOf(key) !== idx)
      .map((key) => ({ sheet: sh.name, key }));
  });
  const duplicateMappedKeys = Array.from(new Set(duplicateMappings.map((d) => d.key)));

  // Required fields that a particular sheet has no column for (its rows would all be skipped)
  const sheetRequiredGaps =
    requiredMissing.length > 0
      ? []
      : sheetHeaderList
          .map((sh) => ({
            sheet: sh.name,
            missing: fields
              .filter((f) => f.active && f.required)
              .filter((f) => !sh.headers.some((h) => columnMapping[h] === f.key))
              .map((f) => f.label),
          }))
          .filter((g) => g.missing.length > 0);

  const sheetsByHeader: Record<string, string[]> = {};
  for (const sh of sheetHeaderList) {
    for (const h of sh.headers) (sheetsByHeader[h] ||= []).push(sh.name);
  }

  const canProceedFromStep2 =
    rawRows.length > 0 &&
    requiredMissing.length === 0 &&
    duplicateMappedKeys.length === 0;

  // Execute Generation
  const handleExecuteGeneration = async () => {
    if (!validation || validation.validStudents.length === 0) {
      toast("No valid records to generate", "error");
      return;
    }

    setIsProcessing(true);
    setProgressPercent(0);
    setProcessedCount(0);

    try {
      // 1. Create ZIP archive
      const zipBlob = await createBatchZipArchive(
        fileName.replace(/\.(xlsx|xls|csv)$/i, ""),
        validation.validStudents,
        validation.skippedStudents,
        validation.issues,
        rawRows.length,
        appearance,
        (pct, current) => {
          setProgressPercent(pct);
          setProcessedCount(current);
        },
        { columnMapping }
      );

      setGeneratedZipBlob(zipBlob);

      // 2. Persist batch in database
      const batchName = fileName
        .replace(/\.(xlsx|xls|csv)$/i, "")
        .replace(/_/g, " ");

      const savedBatch = await DataService.createBatch(
        {
          name: batchName,
          file: fileName,
          fileSize,
          total: rawRows.length,
          generated: validation.validStudents.length,
          skipped: validation.duplicateCount,
          failed: validation.invalidCount,
          status: validation.invalidCount > 0 || validation.duplicateCount > 0 ? "errors" : "done",
          templateSnapshot: {
            fields,
            format,
            blank: blankHandling,
            appearance,
          },
          columnMapping,
        },
        validation.validStudents,
        validation.issues
      );

      setCreatedBatchId(savedBatch.id);
      setIsCompleted(true);
      const codeTypeName = appearance.codeType === "barcode" ? "barcodes" : appearance.codeType === "both" ? "codes (QR + Barcode)" : "QR codes";
      toast(`Successfully generated ${validation.validStudents.length} ${codeTypeName}!`);
    } catch (err: any) {
      console.error(err);
      toast(err.message || "An error occurred during code generation", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadZip = () => {
    if (!generatedZipBlob) return;
    const url = URL.createObjectURL(generatedZipBlob);
    const a = document.createElement("a");
    a.href = url;
    const codeTypeSuffix = appearance.codeType === "barcode" ? "Barcodes" : appearance.codeType === "both" ? "Codes" : "QR";
    a.download = `${fileName.replace(/\.(xlsx|xls|csv)$/i, "")}_${codeTypeSuffix}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Downloaded code archive ZIP");
  };

  const handleDownloadReport = () => {
    if (!validation) return;
    const csvContent = generateProcessingReportCsv(
      fileName,
      rawRows.length,
      validation.validStudents,
      validation.skippedStudents,
      validation.issues
    );
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName.replace(/\.(xlsx|xls|csv)$/i, "")}_report.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Downloaded CSV processing report");
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Stepper Header */}
        <div className="bg-white border border-[#E7DED4] rounded-xl p-3 sm:p-4 shadow-xs">
          {/* Mobile Stepper View (< md) */}
          <div className="md:hidden space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#632D3B]">
                Step {currentStep} of {STEP_TITLES.length}: {STEP_TITLES[currentStep - 1]}
              </span>
              <span className="text-[#776D6A]">
                {Math.round((currentStep / STEP_TITLES.length) * 100)}%
              </span>
            </div>
            <div className="w-full bg-[#E7DED4] rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-[#632D3B] h-full transition-all duration-300"
                style={{ width: `${(currentStep / STEP_TITLES.length) * 100}%` }}
              />
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pt-1">
              {STEP_TITLES.map((title, i) => {
                const stepNum = i + 1;
                const isCurrent = currentStep === stepNum;
                const isCompleted = currentStep > stepNum;
                const isAccessible = stepNum <= maxReachedStep;

                return (
                  <button
                    key={stepNum}
                    disabled={!isAccessible || isProcessing}
                    onClick={() => setCurrentStep(stepNum)}
                    className={`flex-1 min-w-[32px] py-1 text-center rounded text-[11px] font-semibold transition-colors ${
                      isCurrent
                        ? "bg-[#632D3B] text-white"
                        : isCompleted
                        ? "bg-[#0F6B50]/15 text-[#0F6B50]"
                        : isAccessible
                        ? "bg-[#FAF7F2] text-[#292326]"
                        : "bg-[#FAF7F2]/50 text-[#776D6A]/40 cursor-not-allowed"
                    }`}
                  >
                    {isCompleted ? "✓" : stepNum}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Desktop Stepper View (>= md) */}
          <div className="hidden md:flex items-center justify-between gap-2">
            {STEP_TITLES.map((title, i) => {
              const stepNum = i + 1;
              const isCurrent = currentStep === stepNum;
              const isCompleted = currentStep > stepNum;
              const isAccessible = stepNum <= maxReachedStep;

              return (
                <button
                  key={stepNum}
                  disabled={!isAccessible || isProcessing}
                  onClick={() => setCurrentStep(stepNum)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    isCurrent
                      ? "bg-[#632D3B] text-white shadow-xs"
                      : isCompleted
                      ? "text-[#0F6B50] hover:bg-[#E6F4EE]"
                      : isAccessible
                      ? "text-[#292326] hover:bg-[#FAF7F2]"
                      : "text-[#776D6A]/50 cursor-not-allowed"
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                      isCurrent
                        ? "bg-[#C7A878] text-[#292326]"
                        : isCompleted
                        ? "bg-[#0F6B50] text-white"
                        : "bg-[#E7DED4] text-[#776D6A]"
                    }`}
                  >
                    {isCompleted ? <Check className="w-3 h-3" /> : stepNum}
                  </span>
                  <span>{title}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* STEP 1: UPLOAD SPREADSHEET */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <Card
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative overflow-hidden text-center py-12 px-6 border-dashed border-2 transition-all select-none ${
                isDragging
                  ? "border-[#632D3B] bg-[#F4ECEF] ring-2 ring-[#632D3B]/20 scale-[1.005]"
                  : "border-[#C7A878]/70 hover:border-[#632D3B] bg-[#FAF7F2]/60 hover:bg-[#FAF7F2]"
              }`}
            >
              {/* Full-coverage native invisible file input: guarantees 100% native touch & click handling on every mobile & desktop browser */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/plain"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                title="Upload student or staff spreadsheet"
                onClick={(e) => {
                  (e.target as HTMLInputElement).value = "";
                }}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileProcess(e.target.files[0]);
                  }
                }}
              />

              <div className="relative z-0 pointer-events-none">
                <div className="w-16 h-16 rounded-2xl bg-[#632D3B] text-white flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <Upload className="w-8 h-8 text-[#C7A878]" />
                </div>
                <h2 className="text-lg font-bold text-[#632D3B]">
                  Upload Student / Staff Spreadsheet
                </h2>
                <p className="text-xs text-[#776D6A] mt-1.5 max-w-md mx-auto leading-relaxed">
                  Drag and drop your institutional class list (.xlsx, .xls, or .csv) or tap anywhere here to browse files.
                  Identifiers and leading zeros will be strictly preserved.
                </p>

                <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    isLoading={isReadingFile}
                    icon={<FileSpreadsheet className="w-4 h-4" />}
                  >
                    {isReadingFile ? "Reading Spreadsheet..." : "Choose Excel / CSV File"}
                  </Button>
                </div>
              </div>

              {uploadError && (
                <div
                  className="relative z-20 mt-6 max-w-lg mx-auto p-3.5 bg-[#FDECEA] border border-[#F9C0BA] rounded-lg flex items-start gap-2.5 text-xs text-[#A11F15] text-left"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">File Upload Error</p>
                    <p className="mt-0.5">{uploadError}</p>
                  </div>
                </div>
              )}
            </Card>

            {/* Data collection template */}
            <Card className="p-4 bg-white">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <h4 className="font-semibold text-[#292326]">Need to collect the data first?</h4>
                  <p className="text-[#776D6A] mt-0.5 leading-relaxed">
                    Download a blank Excel template with the right column headings ({fields.filter((f) => f.active).length}{" "}
                    fields, from your QR Field Manager). Share it with departments, and when it comes back filled in, every
                    column is matched automatically.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  icon={<FileSpreadsheet className="w-4 h-4" />}
                  onClick={handleDownloadTemplate}
                >
                  Download Excel Template
                </Button>
              </div>
            </Card>

            {/* Upload Guidance */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-[#776D6A]">
              <Card className="p-4 bg-white">
                <h4 className="font-semibold text-[#292326] mb-1">Leading Zero Retention</h4>
                <p>Register numbers such as <code className="bg-[#FAF7F2] px-1 py-0.5 rounded text-[#632D3B]">023010154864501</code> are strictly preserved as text and never truncated to numbers.</p>
              </Card>
              <Card className="p-4 bg-white">
                <h4 className="font-semibold text-[#292326] mb-1">Unicode & Tamil Script</h4>
                <p>Preserves native Tamil characters, accented names, and institutional punctuation without encoding errors.</p>
              </Card>
              <Card className="p-4 bg-white">
                <h4 className="font-semibold text-[#292326] mb-1">Data Privacy</h4>
                <p>No photos or URLs encoded in QR payload. Date of Birth is excluded from the QR payload by default.</p>
              </Card>
            </div>
          </div>
        )}

        {/* STEP 2: MATCH COLUMNS */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <Card>
              <CardHeader
                title="Match Spreadsheet Columns"
                subtitle={`Source file: ${fileName} (${rawRows.length} rows detected${sheets.length > 1 ? ` across ${sheets.length} sheets` : ""})`}
                action={
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#776D6A]">Duplicate rule:</span>
                    <select
                      value={duplicateRule}
                      onChange={(e) => setDuplicateRule(e.target.value as DuplicateRule)}
                      className="text-xs border border-[#E7DED4] rounded-md px-2 py-1 bg-white"
                    >
                      <option value="keep">Keep 1st occurrence (flag duplicates)</option>
                      <option value="skip">Skip all duplicate rows</option>
                    </select>
                  </div>
                }
              />

              {sheets.length > 1 && (
                <div className="mb-4 p-3 bg-[#FAF7F2] border border-[#E7DED4] rounded-lg">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-semibold text-[#632D3B]">
                      Multi-Sheet Workbook ({sheets.length} sheets detected):
                    </span>
                    <span className="text-[#776D6A]">
                      Exported ZIP will automatically separate QR codes into individual folders by sheet name
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {sheets.map((s) => (
                      <Badge key={s.name} variant="burgundy" size="sm">
                        📁 {s.name} ({s.rowCount} rows)
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Validation Warnings */}
              {fields.length === 0 && (
                <div className="mb-4 p-3 bg-[#FFF2DB] border border-[#FFE0A3] rounded-md flex items-center gap-2 text-xs text-[#8A5300]">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    No entries in database for QR fields. Please add field configurations in QR Field Manager first.
                  </span>
                </div>
              )}

              {requiredMissing.length > 0 && (
                <div className="mb-4 p-3 bg-[#FDECEA] border border-[#F9C0BA] rounded-md flex items-center gap-2 text-xs text-[#A11F15]">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    Missing required fields: <strong>{requiredMissing.map((f) => f.label).join(", ")}</strong>. Please map spreadsheet columns to these fields.
                  </span>
                </div>
              )}

              {duplicateMappings.length > 0 && (
                <div className="mb-4 p-3 bg-[#FFF2DB] border border-[#FFE0A3] rounded-md flex items-center gap-2 text-xs text-[#8A5300]">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    Two columns on the same sheet are mapped to one field:{" "}
                    <strong>
                      {duplicateMappings
                        .map((d) => `${fields.find((f) => f.key === d.key)?.label || d.key} (sheet "${d.sheet}")`)
                        .join(", ")}
                    </strong>
                    . Within a sheet each field can come from only one column. (Different sheets may map different columns to the same field.)
                  </span>
                </div>
              )}

              {sheetRequiredGaps.length > 0 && (
                <div className="mb-4 p-3 bg-[#FFF2DB] border border-[#FFE0A3] rounded-md flex items-start gap-2 text-xs text-[#8A5300]">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    {sheetRequiredGaps.map((g) => (
                      <span key={g.sheet} className="block">
                        Sheet <strong>&quot;{g.sheet}&quot;</strong> has no column mapped to{" "}
                        <strong>{g.missing.join(", ")}</strong> — all its rows will be skipped. Map one of its columns below.
                      </span>
                    ))}
                  </span>
                </div>
              )}

              <div className="mb-4 p-3 bg-[#FAF7F2] border border-[#C7A878]/60 rounded-md flex items-center gap-2 text-xs text-[#292326]">
                <FileCheck2 className="w-4 h-4 text-[#632D3B] shrink-0" />
                <span>
                  <strong>All columns from your spreadsheet are mapped and imported by default.</strong> Ensure the <strong>Register / ID Number</strong> and <strong>Name</strong> columns are matched on every sheet — if sheets use different headings (e.g. &quot;Reg No&quot; and &quot;Register Number&quot;), map each of them to the same field. To exclude any column from import/QR, choose <em>(Do not import)</em> from its dropdown.
                </span>
              </div>

              {/* Column Mapping Table */}
              <div className="overflow-x-auto -mx-5 -mb-5">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#FAF7F2] border-y border-[#E7DED4] text-[#776D6A] uppercase tracking-wider">
                      <th className="py-2.5 px-4 font-semibold">Spreadsheet Column Header</th>
                      {sheets.length > 1 && <th className="py-2.5 px-3 font-semibold">Sheets</th>}
                      <th className="py-2.5 px-3 font-semibold">Sample Value</th>
                      <th className="py-2.5 px-3 font-semibold">Mapped Field</th>
                      <th className="py-2.5 px-4 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E7DED4]">
                    {rawHeaders.map((header) => {
                      // First row that actually has this column (it may only exist on a later sheet)
                      const sampleRow = rawRows.find((r) => header in r && String(r[header] ?? "").trim() !== "");
                      const sampleVal = sampleRow ? sampleRow[header] : "";
                      const mappedKey = columnMapping[header] || "";
                      const fieldObj = fields.find((f) => f.key === mappedKey);

                      return (
                        <tr key={header} className="hover:bg-[#FAF7F2]/40 transition-colors">
                          <td className="py-3 px-4 font-semibold text-[#292326]">{header}</td>
                          {sheets.length > 1 && (
                            <td className="py-3 px-3 text-[11px] text-[#776D6A] max-w-[180px]">
                              {(sheetsByHeader[header] || []).length === sheets.length ? (
                                <span>All {sheets.length} sheets</span>
                              ) : (
                                (sheetsByHeader[header] || []).join(", ")
                              )}
                            </td>
                          )}
                          <td className="py-3 px-3 text-[#776D6A] font-mono max-w-[200px] truncate">
                            {sampleVal || <span className="italic text-[#776D6A]/60">empty</span>}
                          </td>
                          <td className="py-3 px-3">
                            <select
                              value={mappedKey}
                              onChange={(e) =>
                                setColumnMapping({
                                  ...columnMapping,
                                  [header]: e.target.value,
                                })
                              }
                              className={`text-xs border rounded-md px-2.5 py-1.5 bg-white w-full max-w-xs focus:ring-2 focus:ring-[#632D3B] ${
                                duplicateMappings.some(
                                  (d) => d.key === mappedKey && (sheetsByHeader[header] || []).includes(d.sheet)
                                )
                                  ? "border-[#A11F15] bg-[#FDECEA]/30"
                                  : "border-[#E7DED4]"
                              }`}
                            >
                              <option value="">(Do not import)</option>
                              {fields
                                .filter((f) => f.active)
                                .map((f) => (
                                  <option key={f.key} value={f.key}>
                                    {f.label} {f.required ? " * (Required)" : ""}
                                  </option>
                                ))}
                            </select>
                          </td>
                          <td className="py-3 px-4">
                            {mappedKey ? (
                              fieldObj?.required ? (
                                <Badge variant="burgundy">Required</Badge>
                              ) : (
                                <Badge variant="neutral">Mapped</Badge>
                              )
                            ) : (
                              <Badge variant="neutral" className="opacity-50">Ignored</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Stepper Navigation */}
            <div className="flex items-center justify-between pt-4">
              <Button variant="secondary" onClick={() => setCurrentStep(1)} icon={<ArrowLeft className="w-4 h-4" />}>
                Back to Upload
              </Button>
              <Button
                variant="primary"
                disabled={!canProceedFromStep2}
                onClick={() => {
                  setMaxReachedStep(Math.max(maxReachedStep, 3));
                  setCurrentStep(3);
                }}
                icon={<ArrowRight className="w-4 h-4" />}
              >
                Continue to QR Content
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: CONFIGURE QR PAYLOAD */}
        {currentStep === 3 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Field Order & Customization (2 cols) */}
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader
                  title="Field Inclusion & Order in QR Payload"
                  subtitle="Drag or move fields up/down. The order here matches the encoded plain text exactly."
                />

                {(() => {
                  const mappedKeys = new Set(Object.values(columnMapping).filter(Boolean));
                  const inFile = fields.filter((f) => f.active && mappedKeys.has(f.key));
                  const notInFile = fields.filter((f) => f.active && !mappedKeys.has(f.key));
                  const columnsFor = (key: string) =>
                    Object.entries(columnMapping)
                      .filter(([, k]) => k === key)
                      .map(([col]) => col);

                  return (
                    <>
                      <div className="space-y-2.5">
                        {inFile.map((field, idx) => (
                          <div
                            key={field.key}
                            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg border transition-all ${
                              field.inQr
                                ? "bg-white border-[#E7DED4] shadow-2xs"
                                : "bg-[#FAF7F2] border-[#E7DED4]/60 opacity-60"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <input
                                type="checkbox"
                                checked={field.inQr}
                                onChange={() => toggleFieldInQr(field.key)}
                                className="w-4 h-4 rounded text-[#632D3B] focus:ring-[#632D3B] shrink-0"
                                title={field.inQr ? "Included in QR" : "Not included in QR"}
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-xs text-[#292326]">{field.label}</span>
                                  {field.required && <Badge variant="burgundy" size="sm">Required</Badge>}
                                </div>
                                <p className="text-[11px] text-[#776D6A] truncate">
                                  From Excel column: <span className="font-mono">{columnsFor(field.key).join(" / ")}</span>
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 self-end sm:self-auto">
                              <label className="flex items-center gap-1.5 text-[11px] text-[#776D6A]">
                                Label in QR
                                <input
                                  type="text"
                                  value={field.qrLabel}
                                  disabled={!field.inQr}
                                  onChange={(e) => updateFieldQrLabel(field.key, e.target.value)}
                                  className="text-xs text-[#292326] border border-[#E7DED4] rounded px-2 py-1 bg-white w-32 focus:ring-1 focus:ring-[#632D3B]"
                                  title="Rename how this line is labelled inside the QR code"
                                />
                              </label>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() => moveField(field.key, -1)}
                                  className="p-1 rounded text-[#776D6A] hover:bg-[#FAF7F2] disabled:opacity-20"
                                  title="Move Up"
                                >
                                  ▲
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === inFile.length - 1}
                                  onClick={() => moveField(field.key, 1)}
                                  className="p-1 rounded text-[#776D6A] hover:bg-[#FAF7F2] disabled:opacity-20"
                                  title="Move Down"
                                >
                                  ▼
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {notInFile.length > 0 && (
                        <details className="mt-4 text-xs text-[#776D6A]">
                          <summary className="cursor-pointer select-none">
                            {notInFile.length} other field{notInFile.length > 1 ? "s" : ""} not in this file (
                            {notInFile.map((f) => f.label).join(", ")})
                          </summary>
                          <p className="mt-2 leading-relaxed">
                            These aren&apos;t written into the QR. If your file does have one of them under a different
                            heading, go back to <strong>Match Columns</strong> and pick it in that column&apos;s dropdown.
                          </p>
                        </details>
                      )}
                    </>
                  );
                })()}
              </Card>

              {/* Formatting Styles */}
              <Card>
                <CardHeader title="Plain-Text Formatting Syntax" subtitle="Controls punctuation and blank value handling" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="font-semibold text-[#292326] block mb-2">Line Format</label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="format"
                          checked={format === "colon"}
                          onChange={() => setFormat("colon")}
                        />
                        <span>Label: Value (e.g. <code className="text-[#632D3B]">Name: E. Vignesh</code>)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="format"
                          checked={format === "dash"}
                          onChange={() => setFormat("dash")}
                        />
                        <span>Label - Value (e.g. <code className="text-[#632D3B]">Name - E. Vignesh</code>)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="format"
                          checked={format === "value"}
                          onChange={() => setFormat("value")}
                        />
                        <span>Value only (e.g. <code className="text-[#632D3B]">E. Vignesh</code>)</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-[#292326] block mb-2">Blank Optional Fields</label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="blank"
                          checked={blankHandling === "omit"}
                          onChange={() => setBlankHandling("omit")}
                        />
                        <span>Leave the line out (Omit)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="blank"
                          checked={blankHandling === "show"}
                          onChange={() => setBlankHandling("show")}
                        />
                        <span>Show a dash (e.g. <code className="text-[#632D3B]">Blood Group: —</code>)</span>
                      </label>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Live QR Preview (1 col) */}
            <div className="space-y-6">
              <Card className="text-center p-6 bg-white sticky top-24">
                <CardHeader title="Exact QR Payload Preview" subtitle="Simulated offline text scan" />

                {previewQrDataUrl ? (
                  <div className="space-y-4">
                    <div className="inline-block p-3 bg-white border border-[#E7DED4] rounded-xl shadow-xs">
                      <img
                        src={previewQrDataUrl}
                        alt="QR Code Preview"
                        className="w-48 h-48 mx-auto object-contain"
                      />
                    </div>

                    <div className="text-left bg-[#FAF7F2] p-3 rounded-lg border border-[#E7DED4] text-xs font-mono whitespace-pre-wrap text-[#292326]">
                      {validation?.validStudents[previewRowIndex]?.qrPayload || "(Empty payload)"}
                    </div>

                    {validation && validation.validStudents.length > 1 && (
                      <div className="flex items-center justify-between text-xs text-[#776D6A]">
                        <span>Sample record {previewRowIndex + 1} of {validation.validStudents.length}</span>
                        <div className="flex gap-1">
                          <button
                            disabled={previewRowIndex === 0}
                            onClick={() => setPreviewRowIndex((p) => Math.max(0, p - 1))}
                            className="px-2 py-0.5 border rounded bg-white disabled:opacity-30"
                          >
                            Prev
                          </button>
                          <button
                            disabled={previewRowIndex >= validation.validStudents.length - 1}
                            onClick={() => setPreviewRowIndex((p) => Math.min(validation.validStudents.length - 1, p + 1))}
                            className="px-2 py-0.5 border rounded bg-white disabled:opacity-30"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-[#776D6A] py-8">Select at least one mapped field</p>
                )}
              </Card>
            </div>

            {/* Stepper Navigation */}
            <div className="lg:col-span-3 flex items-center justify-between pt-4">
              <Button variant="secondary" onClick={() => setCurrentStep(2)} icon={<ArrowLeft className="w-4 h-4" />}>
                Back to Column Mapping
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setMaxReachedStep(Math.max(maxReachedStep, 4));
                  setCurrentStep(4);
                }}
                icon={<ArrowRight className="w-4 h-4" />}
              >
                Continue to Appearance
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4: APPEARANCE */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <Card>
              <CardHeader
                title="Code Type, Dimensions & Output Settings"
                subtitle="Select QR code or Barcode format, configure physical print units (inches, cm, pixels), and set export options"
              />

              {/* 1. Code Type Selector */}
              <div className="p-4 bg-[#FAF7F2] rounded-xl border border-[#E7DED4] mb-6">
                <label className="font-semibold text-xs text-[#292326] block mb-1">
                  Generated Code Format
                </label>
                <p className="text-[11px] text-[#776D6A] mb-3">
                  Choose between 2D high-capacity QR codes or standard 1D linear barcodes
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      id: "qr",
                      label: "QR Code (2D)",
                      desc: "Full offline plain-text record",
                      icon: <QrCode className="w-4 h-4 text-[#632D3B]" />,
                    },
                    {
                      id: "barcode",
                      label: "Barcode (1D - Code 128)",
                      desc: "Register number (or another field) for optical readers",
                      icon: <Barcode className="w-4 h-4 text-[#632D3B]" />,
                    },
                    {
                      id: "both",
                      label: "Dual (QR + Barcode)",
                      desc: "Generates both QR and Barcode in export ZIP",
                      icon: <Sparkles className="w-4 h-4 text-[#632D3B]" />,
                    },
                  ].map((ct) => (
                    <button
                      key={ct.id}
                      type="button"
                      onClick={() => setAppearance({ ...appearance, codeType: ct.id as any })}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        (appearance.codeType || "qr") === ct.id
                          ? "bg-white border-[#632D3B] ring-2 ring-[#632D3B]/20 shadow-xs"
                          : "bg-white/80 border-[#E7DED4] hover:bg-white text-[#776D6A]"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {ct.icon}
                        <span className="font-semibold text-xs text-[#292326]">{ct.label}</span>
                      </div>
                      <p className="text-[10px] text-[#776D6A] leading-tight">{ct.desc}</p>
                    </button>
                  ))}
                </div>

                {/* Sub-options when Barcode or Both is active */}
                {(appearance.codeType === "barcode" || appearance.codeType === "both") && (
                  <div className="mt-4 pt-4 border-t border-[#E7DED4] grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div>
                      <label className="font-semibold text-[#292326] block mb-1">
                        Barcode Value (Field)
                      </label>
                      <select
                        value={appearance.barcodeField || "register_no"}
                        onChange={(e) => setAppearance({ ...appearance, barcodeField: e.target.value })}
                        className="w-full text-xs border border-[#E7DED4] rounded-md px-2.5 py-2 bg-white focus:ring-2 focus:ring-[#632D3B]"
                      >
                        {fields
                          .filter((f) => f.active && (f.key === "register_no" || Object.values(columnMapping).includes(f.key)))
                          .map((f) => (
                            <option key={f.key} value={f.key}>
                              {f.label}
                            </option>
                          ))}
                      </select>
                      <p className="text-[10px] text-[#776D6A] mt-1 leading-tight">
                        Barcodes hold English letters, digits and symbols only. If a value can&apos;t be encoded, the register number is used and it&apos;s listed in the ZIP&apos;s barcode warnings file.
                      </p>
                    </div>

                    <div>
                      <label className="font-semibold text-[#292326] block mb-1">
                        Barcode Standard
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: "CODE128", label: "Code 128 (Universal)" },
                          { id: "CODE39", label: "Code 39" },
                        ].map((bf) => (
                          <button
                            key={bf.id}
                            type="button"
                            onClick={() => setAppearance({ ...appearance, barcodeFormat: bf.id as any })}
                            className={`p-2 rounded border font-medium ${
                              (appearance.barcodeFormat || "CODE128") === bf.id
                                ? "bg-[#632D3B] text-white border-[#632D3B]"
                                : "bg-white text-[#292326] border-[#E7DED4] hover:bg-[#FAF7F2]"
                            }`}
                          >
                            {bf.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="font-semibold text-[#292326] block mb-1">
                        Human-Readable Text Label
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { val: true, label: "Show Value" },
                          { val: false, label: "Hide Text (Bars Only)" },
                        ].map((opt) => (
                          <button
                            key={String(opt.val)}
                            type="button"
                            onClick={() => setAppearance({ ...appearance, includeBarcodeText: opt.val })}
                            className={`p-2 rounded border font-medium ${
                              (appearance.includeBarcodeText !== false) === opt.val
                                ? "bg-[#632D3B] text-white border-[#632D3B]"
                                : "bg-white text-[#292326] border-[#E7DED4] hover:bg-[#FAF7F2]"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Sizing with Units: Pixels, Inches, Centimeters */}
              <div className="p-4 bg-white rounded-xl border border-[#E7DED4] mb-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="font-semibold text-xs text-[#292326] block">
                      Target Size & Physical Measurement Unit
                    </label>
                    <p className="text-[11px] text-[#776D6A]">
                      Select preferred unit of measurement for ID card, sticker, or sheet layout
                    </p>
                  </div>

                  {/* Unit Tabs */}
                  <div className="flex p-0.5 bg-[#FAF7F2] border border-[#E7DED4] rounded-lg">
                    {[
                      { id: "px", label: "Pixels (px)" },
                      { id: "in", label: "Inches (in)" },
                      { id: "cm", label: "Centimeters (cm)" },
                    ].map((u) => {
                      const isActive = (appearance.sizeUnit || "px") === u.id;
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            const newUnit = u.id as SizeUnit;
                            const defaultVals: Record<SizeUnit, number> = { px: 600, in: 1.0, cm: 2.5 };
                            const newSizeVal = defaultVals[newUnit];
                            const px = convertToPixels(newSizeVal, newUnit, appearance.dpi || 300);
                            setSizeInputText(String(newSizeVal));
                            setAppearance({
                              ...appearance,
                              sizeUnit: newUnit,
                              sizeValue: newSizeVal,
                              size: String(px),
                            });
                          }}
                          className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                            isActive
                              ? "bg-[#632D3B] text-white shadow-xs"
                              : "text-[#776D6A] hover:text-[#292326]"
                          }`}
                        >
                          {u.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Sizing Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                  <div className="sm:col-span-4">
                    <label className="text-[11px] font-semibold text-[#776D6A] block mb-1">
                      Custom Size Input
                    </label>
                    <div className="flex items-center">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={sizeInputText}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "" || /^\d*\.?\d*$/.test(raw)) {
                            setSizeInputText(raw);
                            const num = parseFloat(raw);
                            if (!isNaN(num) && num > 0) {
                              const px = convertToPixels(num, appearance.sizeUnit || "px", appearance.dpi || 300);
                              setAppearance((prev) => ({
                                ...prev,
                                sizeValue: num,
                                size: String(px),
                              }));
                            }
                          }
                        }}
                        onBlur={() => {
                          const num = parseFloat(sizeInputText);
                          if (isNaN(num) || num <= 0) {
                            const fallback = appearance.sizeUnit === "px" ? 600 : appearance.sizeUnit === "in" ? 1.0 : 2.5;
                            setSizeInputText(String(fallback));
                            const px = convertToPixels(fallback, appearance.sizeUnit || "px", appearance.dpi || 300);
                            setAppearance((prev) => ({
                              ...prev,
                              sizeValue: fallback,
                              size: String(px),
                            }));
                          }
                        }}
                        className="w-full text-xs border border-[#E7DED4] rounded-l-md px-3 py-2 bg-white focus:ring-1 focus:ring-[#632D3B]"
                        placeholder="e.g. 1.0"
                      />
                      <span className="bg-[#FAF7F2] border border-l-0 border-[#E7DED4] rounded-r-md px-3 py-2 text-xs font-semibold text-[#776D6A]">
                        {appearance.sizeUnit || "px"}
                      </span>
                    </div>
                  </div>

                  {/* Preset Pills */}
                  <div className="sm:col-span-8">
                    <label className="text-[11px] font-semibold text-[#776D6A] block mb-1">
                      Quick Presets for {appearance.sizeUnit === "in" ? "Inches" : appearance.sizeUnit === "cm" ? "Centimeters" : "Pixels"}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {SIZE_PRESETS[appearance.sizeUnit || "px"].map((p) => {
                        const isSelected = appearance.sizeValue === p.value;
                        return (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() => {
                              setSizeInputText(String(p.value));
                              const px = convertToPixels(p.value, appearance.sizeUnit || "px", appearance.dpi || 300);
                              setAppearance({
                                ...appearance,
                                sizeValue: p.value,
                                size: String(px),
                              });
                            }}
                            className={`px-2.5 py-1.5 rounded-md border text-xs font-medium transition-all ${
                              isSelected
                                ? "bg-[#632D3B] text-white border-[#632D3B]"
                                : "bg-white text-[#292326] border-[#E7DED4] hover:bg-[#FAF7F2]"
                            }`}
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Live Dimension Calculation Breakdown */}
                {(() => {
                  const dims = calculateDimensions(
                    appearance.sizeValue || (appearance.sizeUnit === "px" ? 600 : appearance.sizeUnit === "in" ? 2.0 : 5.0),
                    appearance.sizeUnit || "px",
                    appearance.dpi || 300
                  );
                  return (
                    <div className="p-3 bg-[#FAF7F2] rounded-lg border border-[#E7DED4] text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#632D3B]">Calculated Print Dimensions:</span>
                        <span className="text-[#292326] font-medium">
                          {dims.inches} in × {dims.inches} in ({dims.cm} cm · {dims.mm} mm)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[#776D6A]">Digital Output:</span>
                        <span className="font-mono font-semibold text-[#292326]">
                          {appearance.codeType === "barcode"
                            ? `${dims.pixels} px wide`
                            : appearance.codeType === "both"
                              ? `QR ${dims.pixels} × ${dims.pixels} px · Barcode ${dims.pixels} px wide`
                              : `${dims.pixels} × ${dims.pixels} px`}{" "}
                          @ {dims.dpi} DPI
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* 3. Output Specs (Format, Transparency, ECC, Naming) */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                <div>
                  <label className="font-semibold text-[#292326] block mb-1">File Format</label>
                  <p className="text-[11px] text-[#776D6A] mb-2">PNG, JPEG or scalable vector SVG</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { v: "PNG", label: "PNG" },
                      { v: "JPEG", label: "JPEG" },
                      { v: "SVG", label: "SVG" },
                    ].map((opt) => (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => setAppearance({ ...appearance, format: opt.v as any })}
                        className={`p-2 rounded-lg border text-center font-medium ${
                          appearance.format === opt.v
                            ? "bg-[#632D3B] text-white border-[#632D3B]"
                            : "bg-white text-[#292326] border-[#E7DED4] hover:bg-[#FAF7F2]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-[#292326] block mb-1">Background</label>
                  <p className="text-[11px] text-[#776D6A] mb-2">
                    {appearance.format === "JPEG"
                      ? "JPEG has no transparency — always white"
                      : "Transparent alpha or opaque solid (QR and barcode)"}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={appearance.format === "JPEG"}
                      onClick={() => setAppearance({ ...appearance, transparentBackground: true })}
                      className={`p-2 rounded-lg border text-center font-medium disabled:opacity-40 ${
                        appearance.format !== "JPEG" && appearance.transparentBackground !== false
                          ? "bg-[#632D3B] text-white border-[#632D3B]"
                          : "bg-white text-[#292326] border-[#E7DED4] hover:bg-[#FAF7F2]"
                      }`}
                    >
                      Transparent
                    </button>
                    <button
                      type="button"
                      onClick={() => setAppearance({ ...appearance, transparentBackground: false })}
                      className={`p-2 rounded-lg border text-center font-medium ${
                        appearance.format === "JPEG" || appearance.transparentBackground === false
                          ? "bg-[#632D3B] text-white border-[#632D3B]"
                          : "bg-white text-[#292326] border-[#E7DED4] hover:bg-[#FAF7F2]"
                      }`}
                    >
                      White
                    </button>
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-[#292326] block mb-1">Error Correction (QR)</label>
                  <p className="text-[11px] text-[#776D6A] mb-2">Scratch tolerance on printed card</p>
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { v: "L", label: "L (7%)" },
                      { v: "M", label: "M (15%)" },
                      { v: "Q", label: "Q (25%)" },
                      { v: "H", label: "H (30%)" },
                    ].map((opt) => (
                      <button
                        key={opt.v}
                        type="button"
                        disabled={appearance.codeType === "barcode"}
                        onClick={() => setAppearance({ ...appearance, ecc: opt.v as any })}
                        className={`p-1.5 rounded-lg border text-center font-medium disabled:opacity-40 ${
                          appearance.ecc === opt.v
                            ? "bg-[#632D3B] text-white border-[#632D3B]"
                            : "bg-white text-[#292326] border-[#E7DED4] hover:bg-[#FAF7F2]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-[#292326] block mb-1">ZIP File Naming</label>
                  <p className="text-[11px] text-[#776D6A] mb-2">Filename in exported ZIP archive</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { v: "serial", label: "Serial No (1, 2, 3...)" },
                      { v: "reg", label: "Register No" },
                      { v: "regname", label: "Reg No + Name" },
                      { v: "serial_reg", label: "S.No + Reg No" },
                      { v: "custom", label: "Custom (choose fields)…" },
                    ].map((opt) => (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() =>
                          setAppearance({
                            ...appearance,
                            naming: opt.v as QRAppearanceSettings["naming"],
                            ...(opt.v === "custom" && !(appearance.namingFields || []).some(Boolean)
                              ? { namingFields: ["register_no", "course", ""], namingSeparator: "_" as const }
                              : {}),
                          })
                        }
                        className={`p-1.5 rounded-lg border text-center text-[11px] font-medium ${
                          opt.v === "custom" ? "col-span-2 " : ""
                        }${
                          appearance.naming === opt.v
                            ? "bg-[#632D3B] text-white border-[#632D3B]"
                            : "bg-white text-[#292326] border-[#E7DED4] hover:bg-[#FAF7F2]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Custom file naming builder */}
              {appearance.naming === "custom" && (() => {
                const parts = [...(appearance.namingFields || []), "", "", ""].slice(0, 3);
                const setPart = (idx: number, key: string) => {
                  const next = [...parts];
                  next[idx] = key;
                  setAppearance({ ...appearance, namingFields: next });
                };
                const partOptions = [
                  { key: SHEET_NAME_PART, label: sheets.length > 1 ? "Sheet name (department / section)" : "Sheet name" },
                  ...fields
                    .filter(
                      (f) =>
                        f.active &&
                        (["register_no", "name", "serial_no"].includes(f.key) ||
                          Object.values(columnMapping).includes(f.key))
                    )
                    .map((f) => ({ key: f.key, label: f.label })),
                ];
                const presets = [
                  { label: "Reg No + Course", parts: ["register_no", "course", ""] },
                  { label: "Reg No + Department", parts: ["register_no", "department", ""] },
                  { label: "Reg No + Sheet", parts: ["register_no", SHEET_NAME_PART, ""] },
                  { label: "Sheet + S.No + Name", parts: [SHEET_NAME_PART, "serial_no", "name"] },
                  { label: "Course + Reg No + Name", parts: ["course", "register_no", "name"] },
                ].filter((p) => p.parts.every((k) => !k || partOptions.some((o) => o.key === k)));
                const sample =
                  validation && validation.validStudents.length > 0
                    ? validation.validStudents[Math.min(previewRowIndex, validation.validStudents.length - 1)]
                    : null;
                const ext = extensionForFormat(appearance.format);
                const suffix = appearance.codeType === "both" ? "qr" : undefined;
                const example = sample
                  ? buildStudentFileName(sample, appearance, ext, suffix, buildKeyToColumns(columnMapping), "1")
                  : "";
                return (
                  <div className="mt-4 p-4 bg-[#FAF7F2] rounded-xl border border-[#E7DED4] text-xs space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-[#292326]">Custom File Name</p>
                        <p className="text-[11px] text-[#776D6A]">
                          Pick up to 3 parts in order. Empty values are skipped; if all are empty the register number is used.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[#776D6A]">Join with</span>
                        {(["_", "-"] as const).map((sep) => (
                          <button
                            key={sep}
                            type="button"
                            onClick={() => setAppearance({ ...appearance, namingSeparator: sep })}
                            className={`w-9 py-1 rounded-md border font-mono font-semibold ${
                              (appearance.namingSeparator || "_") === sep
                                ? "bg-[#632D3B] text-white border-[#632D3B]"
                                : "bg-white text-[#292326] border-[#E7DED4] hover:bg-[#FAF7F2]"
                            }`}
                          >
                            {sep}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {presets.map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => setAppearance({ ...appearance, namingFields: p.parts })}
                          className="px-2.5 py-1 rounded-full border border-[#E7DED4] bg-white text-[11px] font-medium text-[#292326] hover:border-[#632D3B]"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {parts.map((key, idx) => (
                        <div key={idx}>
                          <label className="text-[11px] font-semibold text-[#776D6A] block mb-1">Part {idx + 1}</label>
                          <select
                            value={key}
                            onChange={(e) => setPart(idx, e.target.value)}
                            className="w-full text-xs border border-[#E7DED4] rounded-md px-2.5 py-2 bg-white focus:ring-2 focus:ring-[#632D3B]"
                          >
                            <option value="">(none)</option>
                            {partOptions.map((o) => (
                              <option key={o.key} value={o.key}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>

                    {example && (
                      <p className="text-[11px] text-[#776D6A]">
                        Example:{" "}
                        <span className="font-mono font-semibold text-[#292326] break-all">
                          {sample?.sheetName && sheets.length > 1 ? `${sample.sheetName}/` : ""}
                          {example}
                        </span>
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Live Preview Inside Step 4 */}
              <div className="mt-6 pt-6 border-t border-[#E7DED4]">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold text-[#632D3B] uppercase tracking-wider">
                    Live Visual Preview
                  </h4>
                  {appearance.transparentBackground !== false && appearance.format !== "JPEG" && (
                    <span className="text-[11px] font-medium text-[#0F6B50] flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#0F6B50]"></span>
                      Transparent PNG Alpha active (overlaid on checkered canvas)
                    </span>
                  )}
                </div>
                <div className="p-6 bg-[#FAF7F2] rounded-xl border border-[#E7DED4] flex flex-col sm:flex-row items-center justify-center gap-6">
                  {(appearance.codeType === "qr" || appearance.codeType === "both" || !appearance.codeType) && (
                    <div className="text-center space-y-2">
                      <div
                        className={`p-3 rounded-xl border border-[#E7DED4] shadow-xs inline-block ${
                          appearance.transparentBackground !== false && appearance.format !== "JPEG"
                            ? "bg-[linear-gradient(45deg,#EFE6D9_25%,transparent_25%),linear-gradient(-45deg,#EFE6D9_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#EFE6D9_75%),linear-gradient(-45deg,transparent_75%,#EFE6D9_75%)] bg-[size:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px] bg-white"
                            : "bg-white"
                        }`}
                      >
                        {previewQrDataUrl ? (
                          <img
                            src={previewQrDataUrl}
                            alt="QR Preview"
                            className="w-36 h-36 object-contain mx-auto"
                          />
                        ) : (
                          <div className="w-36 h-36 flex items-center justify-center text-xs text-[#776D6A]">
                            QR Preview
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] font-semibold text-[#292326]">
                        {appearance.format === "JPEG"
                          ? "JPEG QR (white background)"
                          : appearance.transparentBackground !== false
                            ? "Transparent 2D Plain-Text QR"
                            : "Opaque White 2D Plain-Text QR"}
                      </p>
                    </div>
                  )}

                  {(appearance.codeType === "barcode" || appearance.codeType === "both") && (
                    <div className="text-center space-y-2">
                      <div
                        className={`p-3 border border-[#E7DED4] rounded-xl shadow-xs inline-block ${
                          appearance.transparentBackground !== false && appearance.format !== "JPEG"
                            ? "bg-[linear-gradient(45deg,#EFE6D9_25%,transparent_25%),linear-gradient(-45deg,#EFE6D9_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#EFE6D9_75%),linear-gradient(-45deg,transparent_75%,#EFE6D9_75%)] bg-[size:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px] bg-white"
                            : "bg-white"
                        }`}
                      >
                        {previewBarcodeDataUrl ? (
                          <img
                            src={previewBarcodeDataUrl}
                            alt="Barcode Preview"
                            className="max-h-36 max-w-[240px] object-contain mx-auto"
                          />
                        ) : (
                          <div className="w-48 h-24 flex items-center justify-center text-xs text-[#776D6A]">
                            Barcode Preview
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] font-semibold text-[#292326]">
                        1D Barcode ({appearance.barcodeFormat || "CODE128"})
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {/* Stepper Navigation */}
            <div className="flex items-center justify-between pt-4">
              <Button variant="secondary" onClick={() => setCurrentStep(3)} icon={<ArrowLeft className="w-4 h-4" />}>
                Back to QR Content
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setMaxReachedStep(Math.max(maxReachedStep, 5));
                  setCurrentStep(5);
                }}
                icon={<ArrowRight className="w-4 h-4" />}
              >
                Continue to Review
              </Button>
            </div>
          </div>
        )}

        {/* STEP 5: REVIEW & EXECUTE GENERATION */}
        {currentStep === 5 && (
          <div className="space-y-6">
            {!isCompleted ? (
              <>
                <Card>
                  <CardHeader
                    title="Import & Generation Summary"
                    subtitle="Review record verification and reconciliation before generating QR files"
                  />

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-[#FAF7F2] rounded-lg border border-[#E7DED4] mb-6">
                    <div>
                      <p className="text-[11px] text-[#776D6A] uppercase font-semibold">Total Input Rows</p>
                      <p className="text-xl font-bold text-[#292326]">{rawRows.length}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-[#776D6A] uppercase font-semibold">Valid Records</p>
                      <p className="text-xl font-bold text-[#0F6B50]">{validation?.validCount || 0}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-[#776D6A] uppercase font-semibold">Duplicates</p>
                      <p className="text-xl font-bold text-[#8A5300]">{validation?.duplicateCount || 0}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-[#776D6A] uppercase font-semibold">Invalid / Incomplete</p>
                      <p className="text-xl font-bold text-[#A11F15]">{validation?.invalidCount || 0}</p>
                    </div>
                  </div>

                  {sheets.length > 1 && (
                    <div className="mb-6 p-4 bg-[#FAF7F2] border border-[#C7A878]/60 rounded-xl space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#632D3B]">
                          Folder Organization in ZIP Archive ({sheets.length} Sheets):
                        </span>
                        <span className="text-[#0F6B50] font-medium">
                          ✓ Separated by Sheet Name
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                        {sheets.map((s) => (
                          <div key={s.name} className="p-2 bg-white rounded border border-[#E7DED4]">
                            <p className="font-semibold text-[#292326] truncate">📁 {s.name}</p>
                            <p className="text-[#776D6A] text-[11px]">{s.rowCount} QR codes</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Issues & Skipped List */}
                  {validation && validation.issues.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-semibold text-[#632D3B] uppercase tracking-wider">
                        Skipped & Flagged Records ({validation.issues.length})
                      </h4>
                      <div className="overflow-x-auto border border-[#E7DED4] rounded-lg">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-[#FAF7F2] border-b border-[#E7DED4] text-[#776D6A]">
                              <th className="py-2 px-3 font-semibold">Row</th>
                              <th className="py-2 px-3 font-semibold">Register No</th>
                              <th className="py-2 px-3 font-semibold">Name</th>
                              <th className="py-2 px-3 font-semibold">Status</th>
                              <th className="py-2 px-3 font-semibold">Reason</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E7DED4]">
                            {validation.issues.map((issue, idx) => (
                              <tr key={idx} className="hover:bg-[#FAF7F2]/50">
                                <td className="py-2 px-3 font-mono font-medium">{issue.rowNumber}</td>
                                <td className="py-2 px-3 font-mono text-[#292326]">{issue.registerNo || "—"}</td>
                                <td className="py-2 px-3">{issue.studentName || <span className="italic text-[#776D6A]">(empty)</span>}</td>
                                <td className="py-2 px-3">
                                  {issue.status === "duplicate" ? (
                                    <Badge variant="warning">Duplicate</Badge>
                                  ) : (
                                    <Badge variant="error">Invalid</Badge>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-[#A11F15]">{issue.errorReason}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Processing Progress */}
                  {isProcessing && (
                    <div className="mt-6 p-4 bg-[#EAF0FD] border border-[#C4D7FA] rounded-lg space-y-2">
                      <div className="flex justify-between text-xs font-semibold text-[#1D47B8]">
                        <span>Generating offline QR PNGs...</span>
                        <span>{processedCount} of {validation?.validCount} ({progressPercent}%)</span>
                      </div>
                      <div className="w-full h-3 bg-white rounded-full overflow-hidden border border-[#C4D7FA]">
                        <div
                          className="h-full bg-[#1D47B8] rounded-full transition-all duration-100"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>
                  )}
                </Card>

                {/* Actions */}
                <div className="flex items-center justify-between pt-4">
                  <Button
                    variant="secondary"
                    disabled={isProcessing}
                    onClick={() => setCurrentStep(4)}
                    icon={<ArrowLeft className="w-4 h-4" />}
                  >
                    Back to Appearance
                  </Button>
                  <Button
                    variant="primary"
                    size="lg"
                    isLoading={isProcessing}
                    onClick={handleExecuteGeneration}
                    icon={<FileCheck2 className="w-5 h-5 text-[#C7A878]" />}
                  >
                    Generate {validation?.validCount || 0} QR Codes
                  </Button>
                </div>
              </>
            ) : (
              /* COMPLETED SUCCESS SCREEN */
              <Card className="text-center py-10 px-6">
                <div className="w-16 h-16 rounded-full bg-[#E6F4EE] text-[#0F6B50] flex items-center justify-center mx-auto mb-4 border border-[#B6E5D4]">
                  <Check className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-[#632D3B]">
                  Batch Generated Successfully!
                </h2>
                <p className="text-xs text-[#776D6A] mt-1 max-w-md mx-auto">
                  {validation?.validCount} plain-text QR codes have been encoded and saved to the database.
                </p>

                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={handleDownloadZip}
                    icon={<Download className="w-5 h-5" />}
                  >
                    Download QR ZIP Archive
                  </Button>

                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={handleDownloadReport}
                    icon={<FileSpreadsheet className="w-5 h-5" />}
                  >
                    Download Audit Report (.csv)
                  </Button>

                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => router.push("/print")}
                    icon={<Printer className="w-5 h-5" />}
                  >
                    Open in Bulk Print Studio
                  </Button>
                </div>

                <div className="mt-8 pt-6 border-t border-[#E7DED4] flex items-center justify-center gap-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsCompleted(false);
                      setCurrentStep(1);
                      setMaxReachedStep(1);
                    }}
                  >
                    Start Another Batch
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push(`/batches/${createdBatchId}`)}
                  >
                    View Batch Report
                  </Button>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
