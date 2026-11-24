"use client";

import React, { useState, useEffect } from "react";
import {
  FileSpreadsheet,
  Plus,
  Copy,
  Check,
  Edit2,
  Trash2,
  Sliders,
  Printer,
  Sparkles,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { TemplateConfig } from "@/types";
import { DataService } from "@/lib/supabase/data-service";
import { DEFAULT_FIELDS, DEFAULT_PRINT_SETTINGS, DEFAULT_APPEARANCE } from "@/lib/constants";

export default function TemplatesPage() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<TemplateConfig[]>([]);
  const [loading, setLoading] = useState(true);

  // New Template Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDesc, setNewTemplateDesc] = useState("");

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const list = await DataService.getTemplates();
      setTemplates(list);
    } catch (err) {
      console.error(err);
      toast("Could not load templates", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim()) {
      toast("Please enter a template name", "warning");
      return;
    }

    const newTemplate: TemplateConfig = {
      id: "tmpl_" + Date.now(),
      templateName: newTemplateName.trim(),
      description: newTemplateDesc.trim() || "Institutional QR & Print Template",
      fieldConfiguration: DEFAULT_FIELDS,
      printConfiguration: DEFAULT_PRINT_SETTINGS,
      qrAppearance: DEFAULT_APPEARANCE,
      isDefault: false,
      version: 1,
      updatedAt: new Date().toISOString(),
    };

    await DataService.saveTemplate(newTemplate);
    setTemplates([newTemplate, ...templates]);
    setIsModalOpen(false);
    setNewTemplateName("");
    setNewTemplateDesc("");
    toast(`Created template "${newTemplate.templateName}"`);
  };

  const handleDuplicate = async (tmpl: TemplateConfig) => {
    const copy: TemplateConfig = {
      ...tmpl,
      id: "tmpl_" + Date.now(),
      templateName: `${tmpl.templateName} (Copy)`,
      isDefault: false,
      version: 1,
      updatedAt: new Date().toISOString(),
    };
    await DataService.saveTemplate(copy);
    setTemplates([copy, ...templates]);
    toast(`Duplicated template "${tmpl.templateName}"`);
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E7DED4]">
          <div>
            <h1 className="text-2xl font-bold text-[#632D3B] tracking-tight">
              QR & Print Templates
            </h1>
            <p className="text-xs text-[#776D6A] mt-0.5">
              Preserve institutional field orders, print layout geometries, and error correction levels for recurring cohorts
            </p>
          </div>

          <Button size="sm" onClick={() => setIsModalOpen(true)} icon={<Plus className="w-4 h-4" />}>
            Create Template
          </Button>
        </div>

        {/* Templates Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {templates.length === 0 ? (
            <div className="col-span-1 md:col-span-2 text-center py-12 text-[#776D6A] text-xs">
              No entries
            </div>
          ) : (
            templates.map((t) => (
            <Card key={t.id} className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm text-[#292326]">{t.templateName}</h3>
                    {t.isDefault && <Badge variant="burgundy" size="sm">Default</Badge>}
                  </div>
                  <p className="text-xs text-[#776D6A] mt-1">{t.description}</p>
                </div>
                <Badge variant="neutral" size="sm">v{t.version}</Badge>
              </div>

              {/* Specs */}
              <div className="p-3 bg-[#FAF7F2] rounded-lg border border-[#E7DED4] text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[#776D6A]">Encoded Fields:</span>
                  <span className="font-medium text-[#292326]">
                    {t.fieldConfiguration.filter((f) => f.inQr).length} active fields
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#776D6A]">Print Sheet Grid:</span>
                  <span className="font-medium text-[#292326]">
                    {t.printConfiguration.columns} cols × {t.printConfiguration.rows} rows (A4)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#776D6A]">QR Resolution:</span>
                  <span className="font-medium text-[#292326]">
                    {t.qrAppearance.size}px ({t.qrAppearance.format}) · ECC {t.qrAppearance.ecc}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E7DED4]">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDuplicate(t)}
                  icon={<Copy className="w-3.5 h-3.5" />}
                >
                  Duplicate
                </Button>
              </div>
            </Card>
          )))}
        </div>

        {/* Create Modal */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Create New Institutional Template"
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleCreateTemplate}>
                Save Template
              </Button>
            </>
          }
        >
          <div className="space-y-4 text-xs">
            <div>
              <label className="font-semibold text-[#292326] block mb-1">
                Template Name <span className="text-[#A11F15]">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Science Department Annual ID Template"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                className="w-full border border-[#E7DED4] rounded-md px-3 py-2 bg-white"
              />
            </div>

            <div>
              <label className="font-semibold text-[#292326] block mb-1">
                Description
              </label>
              <textarea
                rows={2}
                placeholder="Describe intended courses or departments"
                value={newTemplateDesc}
                onChange={(e) => setNewTemplateDesc(e.target.value)}
                className="w-full border border-[#E7DED4] rounded-md px-3 py-2 bg-white"
              />
            </div>
          </div>
        </Modal>
      </div>
    </AppLayout>
  );
}
