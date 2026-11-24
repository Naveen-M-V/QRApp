"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  Search,
  Filter,
  Calendar,
  User,
  Activity,
  FileCheck2,
  Trash2,
  Sliders,
  LogIn,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { AuditLogEntry } from "@/types";
import { DataService } from "@/lib/supabase/data-service";

export default function AuditLogsPage() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const list = await DataService.getAuditLogs();
      setLogs(list);
    } catch (err) {
      console.error(err);
      toast("Could not load audit logs", "error");
    } finally {
      setLoading(false);
    }
  };

  const getEventBadge = (type: string) => {
    switch (type) {
      case "batch_completed":
        return <Badge variant="success">Batch Completed</Badge>;
      case "batch_deleted":
        return <Badge variant="error">Batch Deleted</Badge>;
      case "export_zip":
      case "export_pdf":
        return <Badge variant="info">Export Generated</Badge>;
      case "field_config_updated":
      case "template_updated":
        return <Badge variant="burgundy">Config Changed</Badge>;
      case "login":
        return <Badge variant="neutral">Admin Login</Badge>;
      default:
        return <Badge variant="neutral">{type}</Badge>;
    }
  };

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      (log.eventType && log.eventType.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (log.userEmail && log.userEmail.toLowerCase().includes(searchQuery.toLowerCase())) ||
      JSON.stringify(log.details || {}).toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType =
      eventTypeFilter === "all" || log.eventType === eventTypeFilter;

    return matchesSearch && matchesType;
  });

  return (
    <AppLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="pb-2 border-b border-[#E7DED4]">
          <h1 className="text-2xl font-bold text-[#632D3B] tracking-tight">
            Authorised Audit Logs
          </h1>
          <p className="text-xs text-[#776D6A] mt-0.5">
            Immutable tracking of administrative operations, batch generations, exports, and security events
          </p>
        </div>

        {/* Filter Bar */}
        <Card className="p-4 bg-white">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-[#776D6A] absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Search event details, user..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs border border-[#E7DED4] rounded-md pl-9 pr-3 py-2 bg-[#FAF7F2]/40 focus:ring-2 focus:ring-[#632D3B] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
              {[
                { id: "all", label: "All Events" },
                { id: "batch_completed", label: "Batches" },
                { id: "export_zip", label: "Exports" },
                { id: "field_config_updated", label: "Field Configs" },
                { id: "login", label: "Logins" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setEventTypeFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    eventTypeFilter === tab.id
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

        {/* Audit Log Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto -mx-5 -my-5">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#FAF7F2] border-b border-[#E7DED4] text-[#776D6A] uppercase tracking-wider">
                  <th className="py-3 px-4 font-semibold">Timestamp</th>
                  <th className="py-3 px-3 font-semibold">Event Type</th>
                  <th className="py-3 px-3 font-semibold">Administrator</th>
                  <th className="py-3 px-4 font-semibold">Event Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7DED4]">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-[#776D6A]">
                      Loading audit logs...
                    </td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-[#776D6A]">
                      No entries
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-[#FAF7F2]/40 transition-colors">
                      <td className="py-3 px-4 text-[#776D6A] font-mono whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="py-3 px-3">{getEventBadge(log.eventType)}</td>
                      <td className="py-3 px-3 font-medium text-[#292326]">
                        {log.userEmail || "System Admin"}
                      </td>
                      <td className="py-3 px-4 text-[#776D6A] font-mono text-[11px] max-w-md truncate">
                        {JSON.stringify(log.details || {})}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
