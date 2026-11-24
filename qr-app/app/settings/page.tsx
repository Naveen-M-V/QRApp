"use client";

import React, { useState, useEffect } from "react";
import {
  Settings,
  Building2,
  Sliders,
  Shield,
  Save,
  Clock,
  AlertTriangle,
  Check,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { AppSettings, PayloadFormat, BlankHandling } from "@/types";
import { DataService } from "@/lib/supabase/data-service";
import { EMPTY_SETTINGS } from "@/lib/constants";

export default function SettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<AppSettings>(EMPTY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const s = await DataService.getSettings();
      setSettings(s);
    } catch (err) {
      console.error(err);
      toast("Could not load application settings", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await DataService.saveSettings(settings);
      toast("Application settings updated successfully!");
    } catch (err: any) {
      toast("Failed to update settings", "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E7DED4]">
          <div>
            <h1 className="text-2xl font-bold text-[#632D3B] tracking-tight">
              Application & Retention Settings
            </h1>
            <p className="text-xs text-[#776D6A] mt-0.5">
              Manage institutional metadata, default QR formatting rules, and privacy retention policies
            </p>
          </div>

          <Button
            type="submit"
            form="settings-form"
            size="sm"
            isLoading={isSaving}
            icon={<Save className="w-4 h-4" />}
          >
            Save All Settings
          </Button>
        </div>

        <form id="settings-form" onSubmit={handleSave} className="space-y-6">
          {!settings.institutionName && !loading && (
            <div className="p-3 bg-[#FAF7F2] border border-[#E7DED4] rounded-lg text-xs text-[#776D6A]">
              No entries in database yet. Save your institution details and defaults below.
            </div>
          )}

          {/* Institutional Details */}
          <Card>
            <CardHeader
              title="Institutional Identity"
              subtitle="College name and code displayed across exports and print sheets"
            />
            <div className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-[#292326] block mb-1">
                  Institution Full Name
                </label>
                <input
                  type="text"
                  value={settings.institutionName}
                  onChange={(e) =>
                    setSettings({ ...settings, institutionName: e.target.value })
                  }
                  className="w-full border border-[#E7DED4] rounded-md px-3 py-2 bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-semibold text-[#292326] block mb-1">
                    Institution Code
                  </label>
                  <input
                    type="text"
                    value={settings.institutionCode}
                    onChange={(e) =>
                      setSettings({ ...settings, institutionCode: e.target.value })
                    }
                    className="w-full border border-[#E7DED4] rounded-md px-3 py-2 bg-white font-mono"
                  />
                </div>

                <div>
                  <label className="font-semibold text-[#292326] block mb-1">
                    Campus Address
                  </label>
                  <input
                    type="text"
                    value={settings.institutionAddress}
                    onChange={(e) =>
                      setSettings({ ...settings, institutionAddress: e.target.value })
                    }
                    className="w-full border border-[#E7DED4] rounded-md px-3 py-2 bg-white"
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* QR Payload Defaults */}
          <Card>
            <CardHeader
              title="Default QR Payload Formatting"
              subtitle="Default text delimiters and empty field representation"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
              <div>
                <label className="font-semibold text-[#292326] block mb-2">
                  Line Punctuation
                </label>
                <div className="space-y-2">
                  {[
                    { v: "colon", label: "Colon separator (e.g. Name: E. Vignesh)" },
                    { v: "dash", label: "Dash separator (e.g. Name - E. Vignesh)" },
                    { v: "value", label: "Value only (e.g. E. Vignesh)" },
                  ].map((opt) => (
                    <label key={opt.v} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="defaultFormat"
                        checked={settings.defaultFormat === opt.v}
                        onChange={() =>
                          setSettings({ ...settings, defaultFormat: opt.v as PayloadFormat })
                        }
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-semibold text-[#292326] block mb-2">
                  Empty Optional Fields
                </label>
                <div className="space-y-2">
                  {[
                    { v: "omit", label: "Omit line completely from QR code" },
                    { v: "show", label: "Show a placeholder dash (e.g. Blood Group: —)" },
                  ].map((opt) => (
                    <label key={opt.v} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="defaultBlank"
                        checked={settings.defaultBlank === opt.v}
                        onChange={() =>
                          setSettings({ ...settings, defaultBlank: opt.v as BlankHandling })
                        }
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Privacy & Retention Policies */}
          <Card>
            <CardHeader
              title="Data Retention & Privacy Controls"
              subtitle="Compliance with institutional storage limits and student privacy guidelines"
            />
            <div className="space-y-4 text-xs">
              <div className="p-3 bg-[#FAF7F2] rounded-lg border border-[#E7DED4] flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-[#C7A878] shrink-0 mt-0.5" />
                <p className="text-[#776D6A] leading-relaxed">
                  Student database records persist across logins. Temporary downloadable ZIP exports expire after the retention period to preserve server storage while keeping batch audit logs intact.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-semibold text-[#292326] block mb-1">
                    ZIP Export Retention Period (Days)
                  </label>
                  <select
                    value={settings.retentionDays}
                    onChange={(e) =>
                      setSettings({ ...settings, retentionDays: parseInt(e.target.value, 10) })
                    }
                    className="w-full border border-[#E7DED4] rounded-md px-3 py-2 bg-white"
                  >
                    <option value={15}>15 Days</option>
                    <option value={30}>30 Days (Recommended)</option>
                    <option value={60}>60 Days</option>
                    <option value={90}>90 Days</option>
                  </select>
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.autoDeleteExpired}
                      onChange={(e) =>
                        setSettings({ ...settings, autoDeleteExpired: e.target.checked })
                      }
                      className="w-4 h-4 rounded text-[#632D3B] focus:ring-[#632D3B]"
                    />
                    <span className="font-medium text-[#292326]">
                      Automatically purge expired export archives
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </Card>
        </form>
      </div>
    </AppLayout>
  );
}
