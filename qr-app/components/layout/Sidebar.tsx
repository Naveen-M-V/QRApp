"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  QrCode,
  FolderArchive,
  Sliders,
  FileSpreadsheet,
  Printer,
  ScanLine,
  BarChart3,
  ShieldCheck,
  Settings,
  ClipboardList,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" /> },
  { href: "/generate", label: "Generate QR Codes", icon: <QrCode className="w-4 h-4" /> },
  { href: "/forms", label: "Collection Forms", icon: <ClipboardList className="w-4 h-4" /> },
  { href: "/batches", label: "Batch History", icon: <FolderArchive className="w-4 h-4" /> },
  { href: "/fields", label: "QR Field Manager", icon: <Sliders className="w-4 h-4" /> },
  { href: "/templates", label: "Templates", icon: <FileSpreadsheet className="w-4 h-4" /> },
  { href: "/print", label: "Bulk Print Studio", icon: <Printer className="w-4 h-4" /> },
  { href: "/scanner", label: "QR Scanner", icon: <ScanLine className="w-4 h-4" /> },
  { href: "/analytics", label: "Analytics", icon: <BarChart3 className="w-4 h-4" /> },
  { href: "/audit-logs", label: "Audit Logs", icon: <ShieldCheck className="w-4 h-4" /> },
  { href: "/settings", label: "Settings", icon: <Settings className="w-4 h-4" /> },
];

function SidebarNav({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
      <div className="px-3 py-2 text-[11px] font-semibold text-[#776D6A] uppercase tracking-wider">
        Operations
      </div>
      {NAV_ITEMS.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}
            className={`flex items-center justify-between px-3.5 py-2.5 rounded-md text-sm font-medium transition-colors ${
              isActive
                ? "bg-[#632D3B] text-white shadow-xs"
                : "text-[#292326] hover:bg-[#EFE6D9] hover:text-[#632D3B]"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className={isActive ? "text-[#C7A878]" : "text-[#776D6A]"}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </div>
            {item.badge && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                  isActive
                    ? "bg-[#4E232E] text-white"
                    : "bg-[#EFE6D9] text-[#632D3B]"
                }`}
              >
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar({
  className = "",
  onClose,
}: {
  className?: string;
  onClose?: () => void;
}) {
  return (
    <aside
      className={`flex flex-col h-full bg-[#FAF7F2] border-r border-[#E7DED4] w-64 ${className}`}
    >
      {/* Brand Header */}
      <div className="p-5 border-b border-[#E7DED4] flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#632D3B] flex items-center justify-center text-[#F7F1E9] font-bold text-lg shadow-xs">
          A
        </div>
        <div>
          <h1 className="font-bold text-[#632D3B] text-base leading-tight tracking-tight">
            Athryan QR Manager
          </h1>
          <p className="text-[11px] font-medium text-[#776D6A] tracking-wider uppercase">
            Athryan Tech Solution
          </p>
        </div>
      </div>

      {/* Nav List wrapped in Suspense */}
      <Suspense fallback={<div className="flex-1 p-3" />}>
        <SidebarNav onClose={onClose} />
      </Suspense>

      {/* Footer Info */}
      <div className="p-4 border-t border-[#E7DED4] bg-white/50 text-xs text-[#776D6A]">
        <div className="flex items-center justify-between">
          <span className="font-medium text-[#292326]">v1.0.0 Production</span>
          <span className="flex items-center gap-1.5 text-[#0F6B50]">
            <span className="w-2 h-2 rounded-full bg-[#0F6B50]" />
            Offline Ready
          </span>
        </div>
      </div>
    </aside>
  );
}
