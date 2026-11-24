import {
  AppSettings,
  BatchSummary,
  FieldConfig,
  StudentRecord,
  TemplateConfig,
  AuditLogEntry,
  RowValidationIssue,
} from "@/types";
import { EMPTY_SETTINGS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";

// Storage helper for offline/local storage when remote Supabase credentials are not set
const memoryStorage = new Map<string, string>();

function getStorage<T>(key: string, defaultValue: T): T {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = localStorage.getItem(`athryan_${key}`);
      return raw ? JSON.parse(raw) : defaultValue;
    }
    const mem = memoryStorage.get(`athryan_${key}`);
    return mem ? JSON.parse(mem) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setStorage<T>(key: string, value: T): void {
  try {
    const serialized = JSON.stringify(value);
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.setItem(`athryan_${key}`, serialized);
    } else {
      memoryStorage.set(`athryan_${key}`, serialized);
    }
  } catch (err) {
    console.error("Storage write error", err);
  }
}

// Purge any legacy mock/seed items if previously stored in localStorage
if (typeof window !== "undefined") {
  try {
    const initialized = localStorage.getItem("athryan_clean_db_initialized");
    if (!initialized) {
      localStorage.removeItem("athryan_batches");
      localStorage.removeItem("athryan_students");
      localStorage.removeItem("athryan_audit_logs");
      localStorage.removeItem("athryan_templates");
      localStorage.setItem("athryan_clean_db_initialized", "true");
    }
  } catch {
    // ignore
  }
}

export const DataService = {
  // --- BATCHES ---
  async getBatches(): Promise<BatchSummary[]> {
    const supabase = createClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("qr_batches")
          .select("*")
          .order("created_at", { ascending: false });

        if (!error && data) {
          return data.map((b: any) => ({
            id: b.id,
            name: b.batch_name,
            file: b.file_name,
            fileSize: b.file_size,
            date: new Date(b.created_at).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            }) + `, ${new Date(b.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}`,
            total: b.total_rows,
            generated: b.generated_count,
            skipped: b.skipped_count,
            failed: b.error_count,
            status: b.status === "completed" ? "done" : b.status,
            expiresAt: b.expires_at,
            createdAt: b.created_at,
            templateSnapshot: b.template_snapshot,
            columnMapping: b.column_mapping,
          }));
        }
      } catch (err) {
        console.warn("Supabase getBatches fallback to local storage:", err);
      }
    }

    // Default is strictly empty: no hardcoded entries!
    return getStorage<BatchSummary[]>("batches", []);
  },

  async getBatchById(id: string): Promise<BatchSummary | null> {
    const supabase = createClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("qr_batches")
          .select("*")
          .eq("id", id)
          .maybeSingle();

        if (!error && data) {
          return {
            id: data.id,
            name: data.batch_name,
            file: data.file_name,
            fileSize: data.file_size,
            date: new Date(data.created_at).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            }),
            total: data.total_rows,
            generated: data.generated_count,
            skipped: data.skipped_count,
            failed: data.error_count,
            status: data.status === "completed" ? "done" : data.status,
            expiresAt: data.expires_at,
            createdAt: data.created_at,
            templateSnapshot: data.template_snapshot,
            columnMapping: data.column_mapping,
          };
        }
      } catch (err) {
        console.warn("Supabase getBatchById error:", err);
      }
    }

    const batches = await this.getBatches();
    return batches.find((b) => b.id === id) || null;
  },

  async createBatch(
    batch: Omit<BatchSummary, "id" | "date">,
    students: StudentRecord[],
    _issues: RowValidationIssue[] = []
  ): Promise<BatchSummary> {
    const supabase = createClient();
    const now = new Date();
    const dateStr =
      now.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }) +
      `, ${now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}`;

    let newBatchId = "b_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);

    if (supabase) {
      try {
        // Insert into Supabase
        const { data, error } = await supabase
          .from("qr_batches")
          .insert({
            batch_name: batch.name,
            file_name: batch.file,
            file_size: batch.fileSize || 0,
            status: batch.status === "done" ? "completed" : batch.status,
            total_rows: batch.total,
            generated_count: batch.generated,
            skipped_count: batch.skipped,
            error_count: batch.failed,
            template_snapshot: batch.templateSnapshot || {},
            column_mapping: batch.columnMapping || {},
            expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          })
          .select()
          .single();

        if (!error && data) {
          newBatchId = data.id;

          // Insert students into qr_students
          if (students.length > 0) {
            const studentPayloads = students.map((s) => ({
              batch_id: newBatchId,
              sheet_name: s.sheetName || null,
              serial_no: s.serialNo || null,
              register_no: s.registerNo,
              student_name: s.name,
              course: s.course || null,
              department: s.department || null,
              academic_year: s.academicYear || null,
              student_data: s.studentData || {},
              qr_payload: s.qrPayload,
              version: s.version || 1,
            }));

            await supabase.from("qr_students").insert(studentPayloads);
          }
        }
      } catch (err) {
        console.warn("Supabase insert batch fallback to local storage:", err);
      }
    }

    const newBatch: BatchSummary = {
      ...batch,
      id: newBatchId,
      date: dateStr,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };

    // Store in local storage for offline continuity
    const batches = getStorage<BatchSummary[]>("batches", []);
    setStorage("batches", [newBatch, ...batches]);

    const currentStudents = getStorage<StudentRecord[]>("students", []);
    const studentsWithBatch = students.map((s, idx) => ({
      ...s,
      id: s.id || `s_${newBatchId}_${idx}`,
      batchId: newBatchId,
    }));
    setStorage("students", [...studentsWithBatch, ...currentStudents]);

    await this.createAuditLog({
      eventType: "batch_completed",
      resourceType: "qr_batches",
      resourceId: newBatchId,
      details: {
        batchName: batch.name,
        total: batch.total,
        generated: batch.generated,
        skipped: batch.skipped,
        failed: batch.failed,
      },
    });

    return newBatch;
  },

  async deleteBatch(batchId: string): Promise<void> {
    const supabase = createClient();
    if (supabase) {
      try {
        await supabase.from("qr_batches").delete().eq("id", batchId);
      } catch (err) {
        console.warn("Supabase delete batch error:", err);
      }
    }

    const batches = getStorage<BatchSummary[]>("batches", []);
    setStorage("batches", batches.filter((b) => b.id !== batchId));

    const students = getStorage<StudentRecord[]>("students", []);
    setStorage("students", students.filter((s) => s.batchId !== batchId));

    await this.createAuditLog({
      eventType: "batch_deleted",
      resourceType: "qr_batches",
      resourceId: batchId,
      details: { deletedAt: new Date().toISOString() },
    });
  },

  // --- STUDENTS ---
  async getStudents(filters?: {
    batchId?: string;
    course?: string;
    department?: string;
    query?: string;
    status?: string;
  }): Promise<StudentRecord[]> {
    const supabase = createClient();
    if (supabase) {
      try {
        let query = supabase.from("qr_students").select("*");
        if (filters?.batchId) {
          query = query.eq("batch_id", filters.batchId);
        }
        if (filters?.course) {
          query = query.eq("course", filters.course);
        }
        if (filters?.department) {
          query = query.eq("department", filters.department);
        }

        const { data, error } = await query;
        if (!error && data) {
          return data.map((s: any) => ({
            id: s.id,
            batchId: s.batch_id,
            sheetName: s.sheet_name,
            serialNo: s.serial_no,
            registerNo: s.register_no,
            name: s.student_name,
            course: s.course,
            department: s.department,
            academicYear: s.academic_year,
            studentData: s.student_data,
            qrPayload: s.qr_payload,
            status: "gen",
            version: s.version,
            createdAt: s.created_at,
          }));
        }
      } catch (err) {
        console.warn("Supabase getStudents fallback to local storage:", err);
      }
    }

    // Default is strictly empty: no hardcoded entries!
    let list = getStorage<StudentRecord[]>("students", []);

    if (filters) {
      if (filters.batchId) {
        list = list.filter((s) => s.batchId === filters.batchId);
      }
      if (filters.course) {
        list = list.filter((s) => s.course === filters.course);
      }
      if (filters.department) {
        list = list.filter((s) => s.department === filters.department);
      }
      if (filters.status) {
        list = list.filter((s) => s.status === filters.status);
      }
      if (filters.query) {
        const q = filters.query.toLowerCase().trim();
        list = list.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.registerNo.toLowerCase().includes(q)
        );
      }
    }

    return list;
  },

  async getStudentByRegisterNo(registerNo: string): Promise<StudentRecord | null> {
    const supabase = createClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("qr_students")
          .select("*")
          .eq("register_no", registerNo.trim())
          .maybeSingle();

        if (!error && data) {
          return {
            id: data.id,
            batchId: data.batch_id,
            sheetName: data.sheet_name,
            serialNo: data.serial_no,
            registerNo: data.register_no,
            name: data.student_name,
            course: data.course,
            department: data.department,
            academicYear: data.academic_year,
            studentData: data.student_data,
            qrPayload: data.qr_payload,
            status: "gen",
            version: data.version,
          };
        }
      } catch (err) {
        console.warn("Supabase getStudentByRegisterNo error:", err);
      }
    }

    const students = await this.getStudents();
    return students.find((s) => s.registerNo.trim() === registerNo.trim()) || null;
  },

  // --- FIELD CONFIGS ---
  async getFieldConfigs(): Promise<FieldConfig[]> {
    const supabase = createClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("qr_field_configs")
          .select("*")
          .order("sort_order", { ascending: true });

        if (!error && data && data.length > 0) {
          return data.map((f: any) => ({
            key: f.field_key,
            label: f.label,
            qrLabel: f.qr_label,
            type: f.data_type,
            required: f.is_required,
            active: f.is_active,
            inQr: f.in_qr,
            col: f.source_column,
            custom: f.is_custom,
            help: f.help_text,
            sortOrder: f.sort_order,
          }));
        }
      } catch (err) {
        console.warn("Supabase getFieldConfigs fallback to local storage:", err);
      }
    }

    // Return stored field configs, or empty array if DB is empty
    return getStorage<FieldConfig[]>("fields", []);
  },

  async saveFieldConfigs(fields: FieldConfig[]): Promise<void> {
    const supabase = createClient();
    if (supabase) {
      try {
        const upsertPayload = fields.map((f, i) => ({
          field_key: f.key,
          label: f.label,
          qr_label: f.qrLabel,
          data_type: f.type,
          is_required: f.required,
          is_active: f.active,
          in_qr: f.inQr,
          source_column: f.col,
          is_custom: !!f.custom,
          help_text: f.help,
          sort_order: i + 1,
        }));

        await supabase.from("qr_field_configs").upsert(upsertPayload, { onConflict: "field_key" });
      } catch (err) {
        console.warn("Supabase saveFieldConfigs error:", err);
      }
    }

    setStorage("fields", fields);
    await this.createAuditLog({
      eventType: "field_config_updated",
      resourceType: "qr_field_configs",
      details: { fieldCount: fields.length },
    });
  },

  // --- TEMPLATES ---
  async getTemplates(): Promise<TemplateConfig[]> {
    const supabase = createClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("qr_templates")
          .select("*")
          .order("created_at", { ascending: false });

        if (!error && data && data.length > 0) {
          return data.map((t: any) => ({
            id: t.id,
            templateName: t.template_name,
            description: t.description,
            fieldConfiguration: t.field_configuration,
            printConfiguration: t.print_configuration,
            qrAppearance: t.qr_appearance,
            isDefault: t.is_default,
            version: t.version,
            updatedAt: t.updated_at,
          }));
        }
      } catch (err) {
        console.warn("Supabase getTemplates error:", err);
      }
    }

    // Returns empty array if DB has no templates
    return getStorage<TemplateConfig[]>("templates", []);
  },

  async saveTemplate(template: TemplateConfig): Promise<void> {
    const supabase = createClient();
    if (supabase) {
      try {
        await supabase.from("qr_templates").upsert({
          id: template.id.startsWith("tmpl_") ? undefined : template.id,
          template_name: template.templateName,
          description: template.description,
          field_configuration: template.fieldConfiguration,
          print_configuration: template.printConfiguration,
          qr_appearance: template.qrAppearance,
          is_default: template.isDefault,
          version: template.version,
        });
      } catch (err) {
        console.warn("Supabase saveTemplate error:", err);
      }
    }

    const list = getStorage<TemplateConfig[]>("templates", []);
    const exists = list.some((t) => t.id === template.id);
    const updated = exists
      ? list.map((t) => (t.id === template.id ? template : t))
      : [template, ...list];
    setStorage("templates", updated);

    await this.createAuditLog({
      eventType: "template_updated",
      resourceType: "qr_templates",
      resourceId: template.id,
      details: { templateName: template.templateName },
    });
  },

  // --- AUDIT LOGS ---
  async getAuditLogs(): Promise<AuditLogEntry[]> {
    const supabase = createClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("audit_logs")
          .select("*")
          .order("created_at", { ascending: false });

        if (!error && data) {
          return data.map((l: any) => ({
            id: l.id,
            userId: l.user_id,
            userEmail: l.user_email,
            eventType: l.event_type,
            resourceType: l.resource_type,
            resourceId: l.resource_id,
            details: l.details,
            ipAddress: l.ip_address,
            createdAt: l.created_at,
          }));
        }
      } catch (err) {
        console.warn("Supabase getAuditLogs error:", err);
      }
    }

    // Default is strictly empty: no hardcoded entries!
    return getStorage<AuditLogEntry[]>("audit_logs", []);
  },

  async createAuditLog(
    entry: Omit<AuditLogEntry, "id" | "createdAt" | "userEmail">
  ): Promise<AuditLogEntry> {
    const supabase = createClient();
    const now = new Date().toISOString();

    if (supabase) {
      try {
        await supabase.from("audit_logs").insert({
          event_type: entry.eventType,
          resource_type: entry.resourceType || null,
          resource_id: entry.resourceId || null,
          details: entry.details || {},
        });
      } catch (err) {
        console.warn("Supabase audit log insert error:", err);
      }
    }

    const logs = getStorage<AuditLogEntry[]>("audit_logs", []);
    const newEntry: AuditLogEntry = {
      ...entry,
      id: "a_" + Date.now(),
      userEmail: "admin@institution.edu",
      createdAt: now,
    };
    setStorage("audit_logs", [newEntry, ...logs]);
    return newEntry;
  },

  async logAudit(entry: {
    userId?: string;
    action?: string;
    eventType?: string;
    resourceType?: string;
    resourceId?: string;
    details?: Record<string, any>;
  }): Promise<AuditLogEntry> {
    return this.createAuditLog({
      eventType: entry.eventType || entry.action || "audit_event",
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      userId: entry.userId,
      details: entry.details,
    });
  },

  // --- SETTINGS ---
  async getSettings(): Promise<AppSettings> {
    const supabase = createClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("app_settings")
          .select("*")
          .limit(1)
          .maybeSingle();

        if (!error && data) {
          return {
            institutionName: data.institution_name || "",
            institutionCode: data.institution_code || "",
            institutionAddress: data.institution_address || "",
            defaultFormat: data.default_format || "colon",
            defaultBlank: data.default_blank || "omit",
            qrDefaults: data.qr_defaults || { size: "600", format: "PNG", ecc: "M", quiet: "4", naming: "reg" },
            retentionDays: data.retention_days || 30,
            autoDeleteExpired: data.auto_delete_expired || false,
            adminName: "",
            adminEmail: "",
          };
        }
      } catch (err) {
        console.warn("Supabase getSettings error:", err);
      }
    }

    // Default to empty settings if not set in DB
    return getStorage<AppSettings>("settings", EMPTY_SETTINGS);
  },

  async saveSettings(settings: AppSettings): Promise<void> {
    const supabase = createClient();
    if (supabase) {
      try {
        await supabase.from("app_settings").upsert({
          institution_name: settings.institutionName,
          institution_code: settings.institutionCode,
          institution_address: settings.institutionAddress,
          default_format: settings.defaultFormat,
          default_blank: settings.defaultBlank,
          qr_defaults: settings.qrDefaults,
          retention_days: settings.retentionDays,
          auto_delete_expired: settings.autoDeleteExpired,
        });
      } catch (err) {
        console.warn("Supabase saveSettings error:", err);
      }
    }

    setStorage("settings", settings);
    await this.createAuditLog({
      eventType: "settings_updated",
      resourceType: "app_settings",
      details: { institutionCode: settings.institutionCode },
    });
  },

  // --- ANALYTICS AGGREGATION ---
  async getAnalyticsData() {
    const batches = await this.getBatches();
    const students = await this.getStudents();

    const totalStudents = batches.reduce((acc, b) => acc + b.total, 0);
    const totalGenerated = batches.reduce((acc, b) => acc + b.generated, 0);
    const totalFailed = batches.reduce((acc, b) => acc + b.failed, 0);
    const totalSkipped = batches.reduce((acc, b) => acc + b.skipped, 0);

    const deptMap: Record<string, number> = {};
    const courseMap: Record<string, number> = {};

    students.forEach((s) => {
      if (s.department) {
        deptMap[s.department] = (deptMap[s.department] || 0) + 1;
      }
      if (s.course) {
        courseMap[s.course] = (courseMap[s.course] || 0) + 1;
      }
    });

    return {
      totalBatches: batches.length,
      totalStudents,
      totalGenerated,
      totalFailed,
      totalSkipped,
      successRate: totalStudents > 0 ? Math.round((totalGenerated / totalStudents) * 100) : 0,
      departmentDistribution: deptMap,
      courseDistribution: courseMap,
      recentBatches: batches.slice(0, 5),
    };
  },
};
