"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  FolderArchive,
  Search,
  Download,
  FileSpreadsheet,
  Trash2,
  RefreshCw,
  Plus,
  Eye,
  AlertTriangle,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { BatchSummary } from "@/types";
import { DataService } from "@/lib/supabase/data-service";

export default function BatchesPage() {
  const { toast } = useToast();
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleteModalBatch, setDeleteModalBatch] = useState<BatchSummary | null>(null);

  useEffect(() => {
    loadBatches();
  }, []);

  const loadBatches = async () => {
    setLoading(true);
    try {
      const list = await DataService.getBatches();
      setBatches(list);
    } catch (err) {
      console.error(err);
      toast("Could not load batches", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModalBatch) return;
    try {
      await DataService.deleteBatch(deleteModalBatch.id);
      toast(`Deleted batch "${deleteModalBatch.name}"`);
      setDeleteModalBatch(null);
      loadBatches();
    } catch (err: any) {
      toast("Failed to delete batch", "error");
    }
  };

  const filteredBatches = batches.filter((b) => {
    const matchesSearch =
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.file.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || b.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: BatchSummary["status"]) => {
    switch (status) {
      case "done":
        return <Badge variant="success">Completed</Badge>;
      case "errors":
        return <Badge variant="warning">Completed with Errors</Badge>;
      case "processing":
        return <Badge variant="info">Processing</Badge>;
      case "failed":
        return <Badge variant="error">Failed</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E7DED4]">
          <div>
            <h1 className="text-2xl font-bold text-[#632D3B] tracking-tight">
              Batch History & Archives
            </h1>
            <p className="text-xs text-[#776D6A] mt-0.5">
              Historical student QR generation runs, processing audits, and selective recovery
            </p>
          </div>

          <Link href="/generate">
            <Button size="sm" icon={<Plus className="w-4 h-4" />}>
              New QR Batch
            </Button>
          </Link>
        </div>

        {/* Filter Bar */}
        <Card className="p-4 bg-white">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-[#776D6A] absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Search batch or file name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs border border-[#E7DED4] rounded-md pl-9 pr-3 py-2 bg-[#FAF7F2]/40 focus:ring-2 focus:ring-[#632D3B] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
              {[
                { id: "all", label: "All" },
                { id: "done", label: "Completed" },
                { id: "errors", label: "With Errors" },
                { id: "processing", label: "Processing" },
                { id: "failed", label: "Failed" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    statusFilter === tab.id
                      ? "bg-[#632D3B] text-white shadow-2xs"
                      : "text-[#776D6A] hover:bg-[#FAF7F2]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Batches Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto -mx-5 -my-5">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#FAF7F2] border-b border-[#E7DED4] text-[#776D6A] uppercase tracking-wider">
                  <th className="py-3 px-4 font-semibold">Batch Name & Source</th>
                  <th className="py-3 px-3 font-semibold">Date Created</th>
                  <th className="py-3 px-3 font-semibold text-right">Total Rows</th>
                  <th className="py-3 px-3 font-semibold text-right">Generated</th>
                  <th className="py-3 px-3 font-semibold text-right">Skipped / Errors</th>
                  <th className="py-3 px-3 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7DED4]">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-[#776D6A]">
                      Loading batch history...
                    </td>
                  </tr>
                ) : filteredBatches.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-[#776D6A]">
                      No entries
                    </td>
                  </tr>
                ) : (
                  filteredBatches.map((b) => (
                    <tr key={b.id} className="hover:bg-[#FAF7F2]/50 transition-colors">
                      <td className="py-3.5 px-4">
                        <Link
                          href={`/batches/${b.id}`}
                          className="font-semibold text-[#292326] hover:text-[#632D3B] transition-colors"
                        >
                          {b.name}
                        </Link>
                        <p className="text-[11px] text-[#776D6A] font-mono mt-0.5">{b.file}</p>
                      </td>
                      <td className="py-3.5 px-3 text-[#776D6A] whitespace-nowrap">{b.date}</td>
                      <td className="py-3.5 px-3 text-right font-medium text-[#292326]">
                        {b.total.toLocaleString("en-IN")}
                      </td>
                      <td className="py-3.5 px-3 text-right font-semibold text-[#0F6B50]">
                        {b.generated.toLocaleString("en-IN")}
                      </td>
                      <td className="py-3.5 px-3 text-right text-[#8A5300] font-mono">
                        {b.skipped + b.failed > 0 ? `${b.skipped + b.failed}` : "—"}
                      </td>
                      <td className="py-3.5 px-3">{getStatusBadge(b.status)}</td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link href={`/batches/${b.id}`}>
                            <Button variant="outline" size="sm" icon={<Eye className="w-3.5 h-3.5" />}>
                              Report
                            </Button>
                          </Link>
                          <button
                            onClick={() => setDeleteModalBatch(b)}
                            className="p-1.5 rounded text-[#776D6A] hover:text-[#A11F15] hover:bg-[#FDECEA] transition-colors"
                            title="Delete Batch & Records"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={!!deleteModalBatch}
          onClose={() => setDeleteModalBatch(null)}
          title="Confirm Batch Deletion"
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={() => setDeleteModalBatch(null)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={handleDeleteConfirm}>
                Delete Batch & Associated Records
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-xs text-[#292326]">
            <p>
              Are you sure you want to delete batch{" "}
              <strong>&quot;{deleteModalBatch?.name}&quot;</strong>?
            </p>
            <p className="text-[#776D6A]">
              This will remove all {deleteModalBatch?.generated} student records and processing audit logs associated with this batch. Unrelated batches will remain safe.
            </p>
          </div>
        </Modal>
      </div>
    </AppLayout>
  );
}
