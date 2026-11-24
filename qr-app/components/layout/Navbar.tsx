"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, LogOut, Plus, Shield, Building2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DataService } from "@/lib/supabase/data-service";
import { createClient } from "@/lib/supabase/client";

interface NavbarProps {
  onToggleSidebar: () => void;
  adminName?: string;
  adminEmail?: string;
  institutionName?: string;
}

export function Navbar({
  onToggleSidebar,
  adminName,
  adminEmail,
  institutionName,
}: NavbarProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [instName, setInstName] = useState(institutionName || "");
  const [displayName, setDisplayName] = useState(() => {
    if (adminName) return adminName;
    if (typeof window !== "undefined") {
      try {
        const rawUser = localStorage.getItem("athryan_auth_user");
        if (rawUser) {
          const u = JSON.parse(rawUser);
          if (u.name) return u.name;
        }
      } catch {
        // ignore
      }
    }
    return "Administrator";
  });
  const [emailText, setEmailText] = useState(() => {
    if (adminEmail) return adminEmail;
    if (typeof window !== "undefined") {
      try {
        const rawUser = localStorage.getItem("athryan_auth_user");
        if (rawUser) {
          const u = JSON.parse(rawUser);
          if (u.email) return u.email;
        }
      } catch {
        // ignore
      }
    }
    return "";
  });

  useEffect(() => {
    // Access is checked on the server (proxy.ts); this only loads display details.
    DataService.getSettings().then((s) => {
      if (s?.institutionName) {
        setInstName(s.institutionName);
      }
      if (s?.adminName) {
        setDisplayName(s.adminName);
      }
      if (s?.adminEmail) {
        setEmailText(s.adminEmail);
      }
    });
  }, [router]);

  const handleSignOut = async () => {
    try {
      await createClient()?.auth.signOut();
      localStorage.removeItem("athryan_auth_user");
    } catch {
      // ignore
    } finally {
      router.push("/login");
      router.refresh();
    }
  };

  return (
    <header className="h-16 bg-white border-b border-[#E7DED4] px-4 md:px-6 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
      {/* Left side: Hamburger (mobile) + Institution breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 rounded-md text-[#776D6A] hover:bg-[#FAF7F2] hover:text-[#292326] transition-colors"
          aria-label="Toggle navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-[#C7A878] hidden sm:block shrink-0" />
          <span className="text-sm font-semibold text-[#292326] truncate max-w-[200px] sm:max-w-xs md:max-w-md">
            {instName || "No institution configured"}
          </span>
          <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[#F4ECEF] text-[#632D3B]">
            Administrator Portal
          </span>
        </div>
      </div>

      {/* Right side: Quick Action + User menu */}
      <div className="flex items-center gap-3">
        <Link href="/generate">
          <Button size="sm" icon={<Plus className="w-4 h-4" />}>
            <span className="hidden sm:inline">New QR Batch</span>
            <span className="sm:hidden">New</span>
          </Button>
        </Link>

        {/* User Profile dropdown */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-[#FAF7F2] transition-colors focus:outline-none focus:ring-2 focus:ring-[#632D3B]"
            aria-expanded={menuOpen}
          >
            <div className="w-8 h-8 rounded-full bg-[#632D3B] text-[#F7F1E9] flex items-center justify-center font-semibold text-xs border border-[#C7A878]">
              {displayName.slice(0, 2).toUpperCase()}
            </div>
            <div className="hidden md:block text-left">
              <p className="text-xs font-semibold text-[#292326] leading-tight">{displayName}</p>
              <p className="text-[10px] text-[#776D6A] leading-tight">College Admin</p>
            </div>
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-[#E7DED4] py-1.5 z-50">
                <div className="px-4 py-2 border-b border-[#E7DED4]">
                  <p className="text-xs font-semibold text-[#292326]">{displayName}</p>
                  <p className="text-[11px] text-[#776D6A] truncate">{emailText || "No email"}</p>
                </div>

                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-xs text-[#292326] hover:bg-[#FAF7F2] transition-colors"
                >
                  <Shield className="w-4 h-4 text-[#776D6A]" />
                  <span>Account & Retention Settings</span>
                </Link>

                <div className="border-t border-[#E7DED4] my-1" />

                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-[#A11F15] hover:bg-[#FDECEA] transition-colors text-left"
                >
                  <LogOut className="w-4 h-4 text-[#A11F15]" />
                  <span>Sign Out</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
