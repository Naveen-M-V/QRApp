"use client";

import React, { useState, useRef } from "react";
import {
  ScanLine,
  Camera,
  Upload,
  Copy,
  Info,
  Type,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { parseScannedPayload, verifyAgainstDatabase, VerificationResult } from "@/lib/scanner/verifier";

export default function QRScannerPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"upload" | "camera" | "manual">("upload");
  const [scannedText, setScannedText] = useState<string>("");
  const [manualText, setManualText] = useState<string>("");
  const [verification, setVerification] = useState<VerificationResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const processScannedText = async (text: string) => {
    setScannedText(text);
    try {
      const parsed = parseScannedPayload(text);
      const result = await verifyAgainstDatabase(parsed);
      setVerification(result);
      toast("Decoded QR payload successfully");
    } catch {
      toast("Error parsing payload", "error");
    }
  };

  const handleFileUpload = async (file: File) => {
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const html5QrCode = new Html5Qrcode("qr-reader-hidden");
      const decoded = await html5QrCode.scanFile(file, true);
      processScannedText(decoded);
    } catch {
      toast("Could not detect a QR code in this image. Try another photo or enter text manually.", "warning");
    }
  };

  const handleCopyText = () => {
    if (!scannedText) return;
    navigator.clipboard
      .writeText(scannedText)
      .then(() => toast("Payload copied to clipboard"))
      .catch(() => toast("Could not copy automatically", "error"));
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Hidden div for html5-qrcode processing */}
        <div id="qr-reader-hidden" className="hidden" />

        {/* Page Header */}
        <div className="pb-2 border-b border-[#E7DED4]">
          <h1 className="text-2xl font-bold text-[#632D3B] tracking-tight">
            QR Scanner & Record Verification
          </h1>
          <p className="text-xs text-[#776D6A] mt-0.5">
            Offline plain-text QR reader, format validator, and institutional database comparison
          </p>
        </div>

        {/* Verification Status Legend Notice */}
        <div className="p-3.5 bg-[#FAF7F2] border border-[#C7A878]/40 rounded-lg text-xs text-[#292326] flex items-start gap-2.5">
          <Info className="w-4 h-4 text-[#C7A878] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-[#632D3B]">Verification Modes & Integrity Distinction</p>
            <p className="text-[#776D6A] leading-relaxed">
              <strong>Offline Readability:</strong> Decodes plain text directly without internet connection.
              <br />
              <strong>Database Comparison:</strong> Cross-checks the register number with stored records in the database.
              <br />
              <strong>Authenticity Notice:</strong> Because offline plain-text QR codes can be copied, scanning alone does not legally prove a physical card is original without a digital cryptographic signature.
            </p>
          </div>
        </div>

        {/* Scanner Inputs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Input Panel (Left) */}
          <Card className="space-y-4">
            <CardHeader
              title="QR Code Source"
              subtitle="Upload an image, scan with camera, or enter decoded payload"
            />

            <div className="flex border-b border-[#E7DED4] pb-2 gap-2">
              <button
                onClick={() => setActiveTab("upload")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 ${
                  activeTab === "upload"
                    ? "bg-[#632D3B] text-white"
                    : "text-[#776D6A] hover:bg-[#FAF7F2]"
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                Upload Image
              </button>
              <button
                onClick={() => setActiveTab("camera")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 ${
                  activeTab === "camera"
                    ? "bg-[#632D3B] text-white"
                    : "text-[#776D6A] hover:bg-[#FAF7F2]"
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                Camera
              </button>
              <button
                onClick={() => setActiveTab("manual")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 ${
                  activeTab === "manual"
                    ? "bg-[#632D3B] text-white"
                    : "text-[#776D6A] hover:bg-[#FAF7F2]"
                }`}
              >
                <Type className="w-3.5 h-3.5" />
                Text Input
              </button>
            </div>

            {activeTab === "upload" ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#E7DED4] hover:border-[#632D3B] rounded-lg p-8 text-center cursor-pointer transition-colors bg-[#FAF7F2]/40"
              >
                <Upload className="w-8 h-8 text-[#776D6A] mx-auto mb-2" />
                <p className="text-xs font-semibold text-[#292326]">
                  Click to choose an image of a student QR
                </p>
                <p className="text-[11px] text-[#776D6A] mt-1">PNG, JPG, or WebP</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileUpload(e.target.files[0]);
                    }
                  }}
                />
              </div>
            ) : activeTab === "camera" ? (
              <div className="p-6 bg-[#FAF7F2] rounded-lg text-center space-y-3 border border-[#E7DED4]">
                <Camera className="w-8 h-8 text-[#632D3B] mx-auto" />
                <p className="text-xs font-semibold text-[#292326]">Live Camera Feed</p>
                <p className="text-[11px] text-[#776D6A] max-w-xs mx-auto">
                  Requires browser camera access permission over HTTPS or localhost.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <textarea
                  rows={6}
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  placeholder="Paste or type raw QR payload text..."
                  className="w-full text-xs font-mono p-3 border border-[#E7DED4] rounded-md bg-white focus:ring-2 focus:ring-[#632D3B]"
                />
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!manualText.trim()}
                  onClick={() => processScannedText(manualText)}
                >
                  Verify Payload
                </Button>
              </div>
            )}
          </Card>

          {/* Results Panel (Right) */}
          <Card className="space-y-4">
            <CardHeader
              title="Decoded Result & Inspection"
              subtitle="Plain-text output and database validation status"
              action={
                scannedText && (
                  <Button variant="ghost" size="sm" onClick={handleCopyText} icon={<Copy className="w-3.5 h-3.5" />}>
                    Copy
                  </Button>
                )
              }
            />

            {!scannedText ? (
              <div className="py-12 text-center text-[#776D6A] text-xs">
                <ScanLine className="w-8 h-8 text-[#C7A878] mx-auto mb-2 opacity-50" />
                <p>No entries scanned yet. Upload an image or enter text to inspect details.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Status Badges */}
                <div className="flex flex-wrap gap-2">
                  {verification?.parsed.isStructured ? (
                    <Badge variant="success">Standard Text Format</Badge>
                  ) : (
                    <Badge variant="warning">Unstructured / URL Payload</Badge>
                  )}

                  {verification?.matchStatus === "exact_match" && (
                    <Badge variant="success">Verified with DB Record</Badge>
                  )}
                  {verification?.matchStatus === "field_mismatch" && (
                    <Badge variant="error">Database Discrepancy Found</Badge>
                  )}
                  {verification?.matchStatus === "not_found" && (
                    <Badge variant="warning">No entries in database</Badge>
                  )}
                </div>

                {/* Raw Decoded Text */}
                <div>
                  <label className="text-[11px] font-semibold text-[#776D6A] uppercase block mb-1">
                    Raw Plain Text Content:
                  </label>
                  <pre className="p-3 bg-[#FAF7F2] rounded-lg border border-[#E7DED4] text-xs font-mono text-[#292326] whitespace-pre-wrap leading-relaxed">
                    {scannedText}
                  </pre>
                </div>

                {/* Structured Fields Inspection */}
                {verification && Object.keys(verification.parsed.fields).length > 0 && (
                  <div>
                    <label className="text-[11px] font-semibold text-[#776D6A] uppercase block mb-1">
                      Parsed Student Attributes:
                    </label>
                    <div className="border border-[#E7DED4] rounded-lg overflow-hidden text-xs">
                      <table className="w-full text-left border-collapse">
                        <tbody className="divide-y divide-[#E7DED4]">
                          {Object.entries(verification.parsed.fields).map(([k, v]) => (
                            <tr key={k} className="hover:bg-[#FAF7F2]/50">
                              <td className="py-2 px-3 font-semibold text-[#632D3B] w-1/3 bg-[#FAF7F2]/60">
                                {k}
                              </td>
                              <td className="py-2 px-3 text-[#292326] font-mono">{v}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* If Not Found */}
                {verification?.matchStatus === "not_found" && (
                  <p className="text-xs text-[#8A5300]">
                    No entries in database matching register number &quot;{verification.parsed.detectedRegisterNo}&quot;.
                  </p>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
