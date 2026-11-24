"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail, ShieldAlert, ArrowRight, Building2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  // Form fields start empty - user must manually enter credentials
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage("");

    try {
      const supabase = createClient();
      if (!supabase) {
        setErrorMessage(
          "Sign-in is not set up: add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your hosting settings."
        );
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error || !data.user) {
        setErrorMessage("Invalid administrator credentials. Access denied.");
        return;
      }

      // Only accounts with an active admin profile may use the portal
      const { data: profile } = await supabase
        .from("admin_profiles")
        .select("display_name, role, is_active")
        .eq("id", data.user.id)
        .maybeSingle();

      if (!profile || !profile.is_active || !["super_admin", "admin"].includes(profile.role)) {
        await supabase.auth.signOut();
        setErrorMessage("This account is not an administrator. Ask your super admin to grant access.");
        return;
      }

      // Display details only (access is enforced by the session and database rules)
      try {
        localStorage.setItem(
          "athryan_auth_user",
          JSON.stringify({
            email: data.user.email,
            name: profile.display_name || data.user.email?.split("@")[0] || "Administrator",
            role: profile.role,
          })
        );
      } catch {
        // storage unavailable — fine
      }

      const next = new URLSearchParams(window.location.search).get("next");
      router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "An unexpected error occurred during sign-in.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F1E9] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Brand Crest */}
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#632D3B] text-[#F7F1E9] text-2xl font-bold shadow-md mb-4 border border-[#C7A878]">
          A
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-[#632D3B]">
          Athryan QR Manager
        </h2>
        <p className="mt-1 text-xs uppercase tracking-widest font-semibold text-[#776D6A]">
          Shrivari Associates · Athryan Tech Solution
        </p>
        <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-[#776D6A]">
          <Building2 className="w-3.5 h-3.5 text-[#C7A878]" />
          <span>Institutional Administrator Portal</span>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 sm:px-10 shadow-lg rounded-xl border border-[#E7DED4]">
          <form className="space-y-5" onSubmit={handleLogin} autoComplete="off">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold text-[#292326] uppercase tracking-wider"
              >
                Administrator Email
              </label>
              <div className="mt-1.5 relative rounded-md shadow-2xs">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#776D6A]">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-9 pr-3 py-2 text-sm border border-[#E7DED4] rounded-md focus:outline-none focus:ring-2 focus:ring-[#632D3B] focus:border-transparent bg-[#FAF7F2]/40"
                  placeholder="admin@institution.edu"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-[#292326] uppercase tracking-wider"
              >
                Password
              </label>
              <div className="mt-1.5 relative rounded-md shadow-2xs">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#776D6A]">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-9 pr-10 py-2 text-sm border border-[#E7DED4] rounded-md focus:outline-none focus:ring-2 focus:ring-[#632D3B] focus:border-transparent bg-[#FAF7F2]/40 font-mono"
                  placeholder="Enter administrator password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#776D6A] hover:text-[#292326]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {errorMessage && (
              <div className="p-3 bg-[#FDECEA] border border-[#F9C0BA] rounded-md flex items-start gap-2.5 text-xs text-[#A11F15]">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              isLoading={isLoading}
              icon={<ArrowRight className="w-4 h-4" />}
            >
              Sign In to Portal
            </Button>
          </form>

          <div className="mt-6 pt-5 border-t border-[#E7DED4] text-center text-xs text-[#776D6A]">
            <p>Protected administrative system. Unauthorized access is strictly logged and audited.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
