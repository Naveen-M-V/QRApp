"use client";

import React, { useState, useEffect } from "react";
import {
  Sliders,
  Plus,
  Trash2,
  Edit2,
  Check,
  AlertCircle,
  Eye,
  ArrowUp,
  ArrowDown,
  Shield,
  HelpCircle,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { FieldConfig, FieldType } from "@/types";
import { DataService } from "@/lib/supabase/data-service";
import { DEFAULT_FIELDS } from "@/lib/constants";

export default function FieldManagerPage() {
  const { toast } = useToast();
  const [fields, setFields] = useState<FieldConfig[]>([]);
  const [loading, setLoading] = useState(true);

  // Drawer / Modal for Add / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingField, setEditingField] = useState<Partial<FieldConfig>>({
    label: "",
    qrLabel: "",
    key: "",
    type: "Text",
    required: false,
    active: true,
    inQr: true,
    col: "",
    help: "",
  });
  const [modalError, setModalError] = useState("");

  // Delete confirmation modal
  const [deleteFieldModal, setDeleteFieldModal] = useState<FieldConfig | null>(null);

  useEffect(() => {
    loadFields();
  }, []);

  const loadFields = async () => {
    setLoading(true);
    try {
      const list = await DataService.getFieldConfigs();
      setFields(list);
    } catch (err) {
      console.error(err);
      toast("Could not load field configs", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddModal = () => {
    setModalMode("add");
    setEditingField({
      label: "",
      qrLabel: "",
      key: "",
      type: "Text",
      required: false,
      active: true,
      inQr: true,
      col: "",
      help: "",
      custom: true,
    });
    setModalError("");
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (f: FieldConfig) => {
    setModalMode("edit");
    setEditingField({ ...f });
    setModalError("");
    setIsModalOpen(true);
  };

  const handleSaveField = async () => {
    setModalError("");

    if (!editingField.label?.trim()) {
      setModalError("Please enter a field display label.");
      return;
    }

    if (!editingField.key?.trim()) {
      setModalError("Please enter a unique internal field key.");
      return;
    }

    const cleanKey = editingField.key.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");

    if (modalMode === "add") {
      if (fields.some((f) => f.key === cleanKey)) {
        setModalError(`A field with key "${cleanKey}" already exists.`);
        return;
      }

      const newField: FieldConfig = {
        label: editingField.label.trim(),
        qrLabel: editingField.qrLabel?.trim() || editingField.label.trim(),
        key: cleanKey,
        type: (editingField.type as FieldType) || "Text",
        required: !!editingField.required,
        active: editingField.active !== false,
        inQr: editingField.inQr !== false,
        col: editingField.col?.trim() || editingField.label.trim(),
        help: editingField.help?.trim() || "",
        custom: true,
      };

      const updated = [...fields, newField];
      setFields(updated);
      await DataService.saveFieldConfigs(updated);
      toast(`Added custom field "${newField.label}"`);
    } else {
      // Edit mode
      const updated = fields.map((f) =>
        f.key === editingField.key
          ? ({
              ...f,
              ...editingField,
              label: editingField.label!.trim(),
              qrLabel: editingField.qrLabel?.trim() || editingField.label!.trim(),
            } as FieldConfig)
          : f
      );
      setFields(updated);
      await DataService.saveFieldConfigs(updated);
      toast(`Saved changes to "${editingField.label}"`);
    }

    setIsModalOpen(false);
  };

  const handleDeleteFieldConfirm = async () => {
    if (!deleteFieldModal) return;
    const updated = fields.filter((f) => f.key !== deleteFieldModal.key);
    setFields(updated);
    await DataService.saveFieldConfigs(updated);
    toast(`Removed field "${deleteFieldModal.label}"`);
    setDeleteFieldModal(null);
  };

  const moveField = async (key: string, direction: -1 | 1) => {
    const list = [...fields];
    const idx = list.findIndex((f) => f.key === key);
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    const [moved] = list.splice(idx, 1);
    list.splice(targetIdx, 0, moved);
    setFields(list);
    await DataService.saveFieldConfigs(list);
  };

  const toggleFieldProperty = async (
    key: string,
    property: "required" | "active" | "inQr"
  ) => {
    const updated = fields.map((f) => {
      if (f.key === key) {
        if (f.system && property === "required") return f; // Cannot make system fields optional
        return { ...f, [property]: !f[property] };
      }
      return f;
    });
    setFields(updated);
    await DataService.saveFieldConfigs(updated);
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E7DED4]">
          <div>
            <h1 className="text-2xl font-bold text-[#632D3B] tracking-tight">
              QR Field Manager
            </h1>
            <p className="text-xs text-[#776D6A] mt-0.5">
              Configure student attributes, encoding order, and custom data fields without database migrations
            </p>
          </div>

          <Button size="sm" onClick={handleOpenAddModal} icon={<Plus className="w-4 h-4" />}>
            Add Custom Field
          </Button>
        </div>

        {/* Informational Banner */}
        <div className="p-3 bg-[#FAF7F2] border border-[#C7A878]/40 rounded-lg text-xs text-[#292326] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#C7A878] shrink-0" />
            <span>
              Configured fields dictate the exact text lines and sequence encoded inside the generated student QR codes.
            </span>
          </div>
          <span className="text-[11px] text-[#776D6A] font-medium hidden sm:inline">
            Active: {fields.filter((f) => f.active).length} fields
          </span>
        </div>

        {/* Fields Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto -mx-5 -my-5">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#FAF7F2] border-b border-[#E7DED4] text-[#776D6A] uppercase tracking-wider">
                  <th className="py-3 px-4 font-semibold">Order</th>
                  <th className="py-3 px-3 font-semibold">Field Name & Key</th>
                  <th className="py-3 px-3 font-semibold">QR Label</th>
                  <th className="py-3 px-3 font-semibold text-center">In QR?</th>
                  <th className="py-3 px-3 font-semibold text-center">Required?</th>
                  <th className="py-3 px-3 font-semibold text-center">Active?</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7DED4]">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-[#776D6A]">
                      Loading field configurations...
                    </td>
                  </tr>
                ) : fields.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-[#776D6A]">
                      <p>No entries</p>
                      <button
                        onClick={async () => {
                          try {
                            await DataService.saveFieldConfigs(DEFAULT_FIELDS);
                            setFields(DEFAULT_FIELDS);
                            toast("Standard fields initialized successfully");
                          } catch (err: any) {
                            toast(err.message || "Failed to initialize standard fields", "error");
                          }
                        }}
                        className="mt-2 text-xs font-medium text-[#632D3B] hover:underline"
                      >
                        + Initialize standard student fields (Name, Register No, Course, Department...)
                      </button>
                    </td>
                  </tr>
                ) : (
                  fields.map((f, idx) => (
                    <tr key={f.key} className="hover:bg-[#FAF7F2]/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          <button
                            disabled={idx === 0}
                            onClick={() => moveField(f.key, -1)}
                            className="p-1 rounded text-[#776D6A] hover:bg-[#FAF7F2] disabled:opacity-20"
                            title="Move Up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            disabled={idx === fields.length - 1}
                            onClick={() => moveField(f.key, 1)}
                            className="p-1 rounded text-[#776D6A] hover:bg-[#FAF7F2] disabled:opacity-20"
                            title="Move Down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#292326]">{f.label}</span>
                          {f.system && <Badge variant="burgundy" size="sm">System</Badge>}
                          {f.custom && <Badge variant="neutral" size="sm">Custom</Badge>}
                        </div>
                        <p className="text-[11px] text-[#776D6A] font-mono mt-0.5">{f.key}</p>
                      </td>
                      <td className="py-3 px-3 font-mono text-[#632D3B]">{f.qrLabel}</td>
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={f.inQr}
                          onChange={() => toggleFieldProperty(f.key, "inQr")}
                          className="w-4 h-4 rounded text-[#632D3B] focus:ring-[#632D3B]"
                        />
                      </td>
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={f.required}
                          disabled={f.system}
                          onChange={() => toggleFieldProperty(f.key, "required")}
                          className="w-4 h-4 rounded text-[#632D3B] focus:ring-[#632D3B] disabled:opacity-50"
                        />
                      </td>
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={f.active}
                          onChange={() => toggleFieldProperty(f.key, "active")}
                          className="w-4 h-4 rounded text-[#632D3B] focus:ring-[#632D3B]"
                        />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEditModal(f)}
                            className="p-1.5 rounded text-[#776D6A] hover:text-[#632D3B] hover:bg-[#FAF7F2] transition-colors"
                            title="Edit Field"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {f.custom && (
                            <button
                              onClick={() => setDeleteFieldModal(f)}
                              className="p-1.5 rounded text-[#776D6A] hover:text-[#A11F15] hover:bg-[#FDECEA] transition-colors"
                              title="Delete Field"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Add / Edit Field Modal */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={modalMode === "add" ? "Add Custom Student Field" : `Edit Field: ${editingField.label}`}
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleSaveField}>
                {modalMode === "add" ? "Create Field" : "Save Changes"}
              </Button>
            </>
          }
        >
          <div className="space-y-4 text-xs">
            <div>
              <label className="font-semibold text-[#292326] block mb-1">
                Display Label <span className="text-[#A11F15]">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Hostel Block, Section, Valid Until"
                value={editingField.label || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  const autoKey = val.toLowerCase().replace(/[^a-z0-9_]/g, "_");
                  setEditingField({
                    ...editingField,
                    label: val,
                    qrLabel: editingField.qrLabel || val,
                    key: modalMode === "add" ? autoKey : editingField.key,
                  });
                }}
                className="w-full border border-[#E7DED4] rounded-md px-3 py-2 bg-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-[#292326] block mb-1">
                  Unique Key <span className="text-[#A11F15]">*</span>
                </label>
                <input
                  type="text"
                  disabled={modalMode === "edit"}
                  placeholder="e.g. hostel_block"
                  value={editingField.key || ""}
                  onChange={(e) => setEditingField({ ...editingField, key: e.target.value })}
                  className="w-full border border-[#E7DED4] rounded-md px-3 py-2 bg-white font-mono disabled:bg-[#FAF7F2]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#292326] block mb-1">
                  QR Payload Label
                </label>
                <input
                  type="text"
                  placeholder="e.g. Hostel"
                  value={editingField.qrLabel || ""}
                  onChange={(e) => setEditingField({ ...editingField, qrLabel: e.target.value })}
                  className="w-full border border-[#E7DED4] rounded-md px-3 py-2 bg-white"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold text-[#292326] block mb-1">
                Source Spreadsheet Column Alias
              </label>
              <input
                type="text"
                placeholder="Default column header name to match during upload"
                value={editingField.col || ""}
                onChange={(e) => setEditingField({ ...editingField, col: e.target.value })}
                className="w-full border border-[#E7DED4] rounded-md px-3 py-2 bg-white"
              />
            </div>

            <div className="flex gap-4 pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingField.inQr}
                  onChange={(e) => setEditingField({ ...editingField, inQr: e.target.checked })}
                />
                <span>Include in QR Code</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingField.required}
                  onChange={(e) => setEditingField({ ...editingField, required: e.target.checked })}
                />
                <span>Mandatory (Required)</span>
              </label>
            </div>

            {modalError && (
              <p className="text-[#A11F15] font-medium text-xs">{modalError}</p>
            )}
          </div>
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={!!deleteFieldModal}
          onClose={() => setDeleteFieldModal(null)}
          title="Remove Custom Field"
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={() => setDeleteFieldModal(null)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={handleDeleteFieldConfirm}>
                Delete Field
              </Button>
            </>
          }
        >
          <p className="text-xs text-[#292326]">
            Are you sure you want to remove custom field{" "}
            <strong>&quot;{deleteFieldModal?.label}&quot;</strong>?
            Historical batches will retain their existing configurations.
          </p>
        </Modal>
      </div>
    </AppLayout>
  );
}
