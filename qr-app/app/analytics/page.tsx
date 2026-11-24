"use client";

import React, { useState, useEffect } from "react";
import {
  BarChart3,
  Download,
  Calendar,
  Building,
  GraduationCap,
  TrendingUp,
  AlertCircle,
  FileSpreadsheet,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { DataService } from "@/lib/supabase/data-service";

export default function AnalyticsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    totalBatches: number;
    totalStudents: number;
    totalGenerated: number;
    totalFailed: number;
    totalSkipped: number;
    successRate: number;
    departmentDistribution: Record<string, number>;
    courseDistribution: Record<string, number>;
  } | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const res = await DataService.getAnalyticsData();
      setData(res);
    } catch (err) {
      console.error(err);
      toast("Could not load analytics metrics", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = () => {
    if (!data) return;
    const lines = [
      `Metric,Value`,
      `Total Generation Batches,${data.totalBatches}`,
      `Total Students Processed,${data.totalStudents}`,
      `Total QR Codes Generated,${data.totalGenerated}`,
      `Overall Generation Success Rate,${data.successRate}%`,
      `Total Duplicates Skipped,${data.totalSkipped}`,
      `Total Row Errors,${data.totalFailed}`,
      ``,
      `Department,Students`,
      ...Object.entries(data.departmentDistribution).map(([d, c]) => `"${d}",${c}`),
      ``,
      `Course,Students`,
      ...Object.entries(data.courseDistribution).map(([co, c]) => `"${co}",${c}`),
    ];

    const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Athryan_QR_Analytics_Summary.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Downloaded analytics summary (.csv)");
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E7DED4]">
          <div>
            <h1 className="text-2xl font-bold text-[#632D3B] tracking-tight">
              Institutional Reports & Analytics
            </h1>
            <p className="text-xs text-[#776D6A] mt-0.5">
              Aggregated generation metrics, cohort breakdowns, and processing quality assurance
            </p>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportCsv}
            icon={<FileSpreadsheet className="w-4 h-4" />}
          >
            Export Metrics CSV
          </Button>
        </div>

        {/* 3 Overview Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#E6F4EE] text-[#0F6B50] flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-[#776D6A] uppercase">Generation Success</p>
                <p className="text-2xl font-bold text-[#292326] mt-0.5">
                  {loading ? "..." : `${data?.successRate}%`}
                </p>
              </div>
            </div>
            <p className="text-xs text-[#776D6A] mt-3 pt-3 border-t border-[#E7DED4]">
              {data?.totalGenerated} valid codes from {data?.totalStudents} total rows
            </p>
          </Card>

          <Card className="bg-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#FAF7F2] text-[#632D3B] flex items-center justify-center border border-[#E7DED4]">
                <Building className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-[#776D6A] uppercase">Active Departments</p>
                <p className="text-2xl font-bold text-[#292326] mt-0.5">
                  {loading ? "..." : Object.keys(data?.departmentDistribution || {}).length}
                </p>
              </div>
            </div>
            <p className="text-xs text-[#776D6A] mt-3 pt-3 border-t border-[#E7DED4]">
              Across Arts, Science, and Commerce faculties
            </p>
          </Card>

          <Card className="bg-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#FFF2DB] text-[#8A5300] flex items-center justify-center">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-[#776D6A] uppercase">Data Quality Exceptions</p>
                <p className="text-2xl font-bold text-[#292326] mt-0.5">
                  {loading ? "..." : (data?.totalSkipped || 0) + (data?.totalFailed || 0)}
                </p>
              </div>
            </div>
            <p className="text-xs text-[#776D6A] mt-3 pt-3 border-t border-[#E7DED4]">
              {data?.totalSkipped} duplicate identifiers · {data?.totalFailed} missing required fields
            </p>
          </Card>
        </div>

        {/* Charts & Distributions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader
              title="Department Breakdown"
              subtitle="Student volume distributed across college departments"
            />
            <div className="space-y-4">
              {Object.keys(data?.departmentDistribution || {}).length === 0 ? (
                <p className="text-xs text-[#776D6A] py-6 text-center">No entries</p>
              ) : (
                Object.entries(data?.departmentDistribution || {}).map(([dept, count]) => {
                  const total = data?.totalStudents || 1;
                  const pct = Math.min(100, Math.round((count / total) * 100));
                  return (
                    <div key={dept} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-[#292326]">{dept}</span>
                        <span className="text-[#776D6A] font-mono">{count} ({pct}%)</span>
                      </div>
                      <div className="w-full h-3 bg-[#FAF7F2] rounded-full overflow-hidden border border-[#E7DED4]">
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

          <Card>
            <CardHeader
              title="Course Distribution"
              subtitle="Enrolled degree programmes"
            />
            <div className="space-y-4">
              {Object.keys(data?.courseDistribution || {}).length === 0 ? (
                <p className="text-xs text-[#776D6A] py-6 text-center">No entries</p>
              ) : (
                Object.entries(data?.courseDistribution || {}).map(([course, count]) => {
                  const total = data?.totalStudents || 1;
                  const pct = Math.min(100, Math.round((count / total) * 100));
                  return (
                    <div key={course} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-[#292326]">{course}</span>
                        <span className="text-[#776D6A] font-mono">{count} ({pct}%)</span>
                      </div>
                      <div className="w-full h-3 bg-[#FAF7F2] rounded-full overflow-hidden border border-[#E7DED4]">
                        <div
                          className="h-full bg-[#C7A878] rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
