"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  QrCode,
  FolderArchive,
  AlertTriangle,
  Plus,
  ArrowRight,
  Download,
  Calendar,
  Building,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { DataService } from "@/lib/supabase/data-service";
import { BatchSummary } from "@/types";
import { useToast } from "@/components/ui/Toast";

export default function DashboardPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{
    totalBatches: number;
    totalStudents: number;
    totalGenerated: number;
    totalFailed: number;
    totalSkipped: number;
    successRate: number;
    departmentDistribution: Record<string, number>;
    courseDistribution: Record<string, number>;
    recentBatches: BatchSummary[];
  } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await DataService.getAnalyticsData();
      setStats(data);
    } catch (err) {
      console.error(err);
      toast("Could not load dashboard metrics", "error");
    } finally {
      setLoading(false);
    }
  };

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
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E7DED4]">
          <div>
            <h1 className="text-2xl font-bold text-[#632D3B] tracking-tight">
              Institutional Dashboard
            </h1>
            <p className="text-xs text-[#776D6A] mt-0.5">
              Overview of student QR generation, processing accuracy, and batch history
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/batches">
              <Button variant="secondary" size="sm">
                View All Batches
              </Button>
            </Link>
            <Link href="/generate">
              <Button size="sm" icon={<Plus className="w-4 h-4" />}>
                Generate New QR Batch
              </Button>
            </Link>
          </div>
        </div>

        {/* 4 Primary Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="flex items-center gap-4 bg-white">
            <div className="w-12 h-12 rounded-lg bg-[#E6F4EE] flex items-center justify-center text-[#0F6B50] shrink-0">
              <QrCode className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-[#776D6A] uppercase tracking-wider">
                Total QRs Generated
              </p>
              <p className="text-2xl font-bold text-[#292326] mt-0.5">
                {loading ? "..." : (stats?.totalGenerated || 0).toLocaleString("en-IN")}
              </p>
              <p className="text-[11px] text-[#0F6B50] font-medium mt-0.5 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {stats?.successRate || 100}% generation rate
              </p>
            </div>
          </Card>

          <Card className="flex items-center gap-4 bg-white">
            <div className="w-12 h-12 rounded-lg bg-[#F4ECEF] flex items-center justify-center text-[#632D3B] shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-[#776D6A] uppercase tracking-wider">
                Total Students Processed
              </p>
              <p className="text-2xl font-bold text-[#292326] mt-0.5">
                {loading ? "..." : (stats?.totalStudents || 0).toLocaleString("en-IN")}
              </p>
              <p className="text-[11px] text-[#776D6A] mt-0.5">
                Across all academic cohorts
              </p>
            </div>
          </Card>

          <Card className="flex items-center gap-4 bg-white">
            <div className="w-12 h-12 rounded-lg bg-[#EAF0FD] flex items-center justify-center text-[#1D47B8] shrink-0">
              <FolderArchive className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-[#776D6A] uppercase tracking-wider">
                Total Generation Batches
              </p>
              <p className="text-2xl font-bold text-[#292326] mt-0.5">
                {loading ? "..." : stats?.totalBatches || 0}
              </p>
              <p className="text-[11px] text-[#776D6A] mt-0.5">
                Institutional uploads
              </p>
            </div>
          </Card>

          <Card className="flex items-center gap-4 bg-white">
            <div className="w-12 h-12 rounded-lg bg-[#FFF2DB] flex items-center justify-center text-[#8A5300] shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-[#776D6A] uppercase tracking-wider">
                Duplicates & Issues
              </p>
              <p className="text-2xl font-bold text-[#292326] mt-0.5">
                {loading ? "..." : (stats?.totalSkipped || 0) + (stats?.totalFailed || 0)}
              </p>
              <p className="text-[11px] text-[#8A5300] font-medium mt-0.5">
                {stats?.totalSkipped || 0} skipped · {stats?.totalFailed || 0} errors
              </p>
            </div>
          </Card>
        </div>

        {/* Recent Batches Table & Academic Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Batches Table (2 cols) */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader
                title="Recent Batches"
                subtitle="Recent student spreadsheet uploads and QR generation runs"
                action={
                  <Link href="/batches">
                    <Button variant="ghost" size="sm" icon={<ArrowRight className="w-3.5 h-3.5" />}>
                      View all
                    </Button>
                  </Link>
                }
              />

              <div className="overflow-x-auto -mx-5 -mb-5">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#FAF7F2] border-y border-[#E7DED4] text-[#776D6A] uppercase tracking-wider">
                      <th className="py-2.5 px-4 font-semibold">Batch Name & File</th>
                      <th className="py-2.5 px-3 font-semibold">Date</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Total</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Valid</th>
                      <th className="py-2.5 px-3 font-semibold">Status</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E7DED4]">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-[#776D6A]">
                          Loading batches...
                        </td>
                      </tr>
                    ) : (stats?.recentBatches || []).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-[#776D6A]">
                          No entries
                        </td>
                      </tr>
                    ) : (
                      stats?.recentBatches.map((b) => (
                        <tr key={b.id} className="hover:bg-[#FAF7F2]/60 transition-colors">
                          <td className="py-3 px-4">
                            <p className="font-semibold text-[#292326]">{b.name}</p>
                            <p className="text-[11px] text-[#776D6A] font-mono">{b.file}</p>
                          </td>
                          <td className="py-3 px-3 text-[#776D6A] whitespace-nowrap">{b.date}</td>
                          <td className="py-3 px-3 text-right font-medium text-[#292326]">
                            {b.total}
                          </td>
                          <td className="py-3 px-3 text-right font-medium text-[#0F6B50]">
                            {b.generated}
                          </td>
                          <td className="py-3 px-3">{getStatusBadge(b.status)}</td>
                          <td className="py-3 px-4 text-right">
                            <Link href={`/batches/${b.id}`}>
                              <Button variant="outline" size="sm">
                                Details
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Department Breakdown & Quick Links (1 col) */}
          <div className="space-y-6">
            <Card>
              <CardHeader
                title="Department Distribution"
                subtitle="Students categorized by academic department"
              />
              <div className="space-y-3">
                {loading ? (
                  <p className="text-xs text-[#776D6A]">Loading distributions...</p>
                ) : Object.keys(stats?.departmentDistribution || {}).length === 0 ? (
                  <p className="text-xs text-[#776D6A] py-6 text-center">No entries</p>
                ) : (
                  Object.entries(stats?.departmentDistribution || {}).map(([dept, count]) => {
                    const total = stats?.totalStudents || 1;
                    const pct = Math.min(100, Math.round((count / total) * 100));
                    return (
                      <div key={dept} className="space-y-1">
                        <div className="flex justify-between text-xs font-medium">
                          <span className="text-[#292326] truncate max-w-[160px]">{dept}</span>
                          <span className="text-[#776D6A] font-mono">{count} ({pct}%)</span>
                        </div>
                        <div className="w-full h-2 bg-[#FAF7F2] rounded-full overflow-hidden border border-[#E7DED4]">
                          <div
                            className="h-full bg-[#632D3B] rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>

            <Card className="bg-[#FAF7F2] border-[#C7A878]/30">
              <h4 className="text-xs font-semibold text-[#632D3B] uppercase tracking-wider mb-2">
                Bulk Print Studio Ready
              </h4>
              <p className="text-xs text-[#776D6A] leading-relaxed">
                Generate high-resolution A4 multi-page printable sheets formatted for standard ID card laminators and badge printers.
              </p>
              <div className="mt-4">
                <Link href="/print">
                  <Button variant="primary" size="sm" className="w-full">
                    Open Print Studio
                  </Button>
                </Link>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
