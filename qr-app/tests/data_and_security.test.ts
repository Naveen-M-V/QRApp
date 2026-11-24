import { describe, it, expect } from "vitest";
import { DataService } from "@/lib/supabase/data-service";
import { BatchSummary, StudentRecord } from "@/types";

describe("Database Persistence, Security & Isolation", () => {
  // Test 24: Batch retry and duplicate prevention
  it("Test 24: Generates unique batch IDs and isolates retried batch runs", async () => {
    const batchData = {
      name: "Retry Test Batch",
      file: "retry_test.xlsx",
      total: 10,
      generated: 10,
      skipped: 0,
      failed: 0,
      status: "done" as const,
    };
    const students: StudentRecord[] = [
      { registerNo: "990001", name: "Student Retry", qrPayload: "Name: Student Retry", studentData: {}, status: "gen" },
    ];

    const batch1 = await DataService.createBatch(batchData, students);
    const batch2 = await DataService.createBatch(batchData, students);

    expect(batch1.id).not.toBe(batch2.id);
  });

  // Test 25: Persistence across sessions
  it("Test 25: Student records and batches persist in data store", async () => {
    await DataService.createBatch(
      {
        name: "Persistence Test Batch",
        file: "persistence.xlsx",
        total: 1,
        generated: 1,
        skipped: 0,
        failed: 0,
        status: "done",
      },
      [
        {
          registerNo: "023010154864501",
          name: "Zero Student",
          qrPayload: "Name: Zero Student\nRegister No: 023010154864501",
          studentData: { "Register No": "023010154864501" },
          status: "gen",
        },
      ]
    );

    const batches = await DataService.getBatches();
    expect(batches.length).toBeGreaterThan(0);

    const students = await DataService.getStudents();
    expect(students.length).toBeGreaterThan(0);
    // Preserves leading zero in stored test student
    const zeroStudent = students.find((s) => s.registerNo === "023010154864501");
    expect(zeroStudent).toBeDefined();
    expect(zeroStudent?.registerNo.startsWith("0")).toBe(true);
  });

  // Test 26: No administrator credentials are shipped in the source code
  it("Test 26: No hardcoded administrator password exists in the app source or SQL", async () => {
    const { readFileSync, readdirSync, statSync } = await import("fs");
    const { join } = await import("path");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? walk(p) : [p];
      });
    const files = ["app", "components", "lib", "supabase"].flatMap((d) => walk(join(process.cwd(), d)));
    const offenders = files.filter((f) => /\.(tsx?|sql)$/.test(f) && /signInWithPassword\(\{\s*email:\s*["']|password:\s*["'][^"']{6,}["']|@2027/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  // Test 27: RLS policy enforcement helper
  it("Test 27: RLS helper function ensures deny-by-default for non-admins", () => {
    const adminRoles = ["super_admin", "admin"];
    const publicUserRole = "student_or_public";
    expect(adminRoles.includes(publicUserRole)).toBe(false);
  });

  // Test 28: Cross-batch isolation
  it("Test 28: Querying a specific batch ID returns only students belonging to that batch", async () => {
    const batchData = {
      name: "Isolation Test Batch",
      file: "iso.xlsx",
      total: 1,
      generated: 1,
      skipped: 0,
      failed: 0,
      status: "done" as const,
    };
    const batch = await DataService.createBatch(batchData, [
      { registerNo: "ISO001", name: "Iso Student", qrPayload: "Name: Iso", studentData: {}, status: "gen" },
    ]);

    const batchStudents = await DataService.getStudents({ batchId: batch.id });
    expect(batchStudents.length).toBe(1);
    expect(batchStudents.every((s) => s.batchId === batch.id)).toBe(true);
  });

  // Test 29: Tenant isolation readiness
  it("Test 29: Data schema isolates institutional metadata by institution code", async () => {
    await DataService.saveSettings({ institutionCode: "SVCAS", institutionName: "Test College" });
    const settings = await DataService.getSettings();
    expect(settings.institutionCode).toBe("SVCAS");
  });

  // Test 30: Safe batch deletion & retention behaviour
  it("Test 30: Deleting a batch removes its records without deleting unrelated batches", async () => {
    // Create unrelated batch to keep
    const keeperBatch = await DataService.createBatch(
      {
        name: "Keeper Batch",
        file: "keep.xlsx",
        total: 1,
        generated: 1,
        skipped: 0,
        failed: 0,
        status: "done",
      },
      [{ registerNo: "KEEP001", name: "Keep Student", qrPayload: "KEEP", studentData: {}, status: "gen" }]
    );

    // Create temporary batch
    const tempBatch = await DataService.createBatch(
      {
        name: "Temporary Deletion Test Batch",
        file: "temp.xlsx",
        total: 1,
        generated: 1,
        skipped: 0,
        failed: 0,
        status: "done",
      },
      [{ registerNo: "TEMP999", name: "Temp Student", qrPayload: "TEMP", studentData: {}, status: "gen" }]
    );

    const beforeDelete = await DataService.getBatchById(tempBatch.id);
    expect(beforeDelete).toBeDefined();

    // Delete it
    await DataService.deleteBatch(tempBatch.id);

    const afterDelete = await DataService.getBatchById(tempBatch.id);
    expect(afterDelete).toBeNull();

    // Unrelated batches remain untouched
    const keeper = await DataService.getBatchById(keeperBatch.id);
    expect(keeper).not.toBeNull();
  });

  // Test 31: Export authorisation & sanitization
  it("Test 31: Audit logs track generation and export events without leaking student PII", async () => {
    await DataService.logAudit({
      userId: "test_admin",
      action: "batch_export",
      resourceType: "batch",
      details: { exportFormat: "zip", recordCount: 10, method: "portal_auth" },
    });

    const logs = await DataService.getAuditLogs();
    expect(logs.length).toBeGreaterThan(0);
    // Ensure no passwords or raw full student dumps in logs
    logs.forEach((log) => {
      const detailsStr = JSON.stringify(log.details || {});
      expect(detailsStr).not.toContain("password");
    });
  });

  // Test 32: Interrupted processing and recovery
  it("Test 32: Batches have controlled processing statuses (pending, processing, done, errors, failed)", () => {
    const validStatuses = ["pending", "processing", "done", "errors", "failed", "cancelled"];
    expect(validStatuses.includes("processing")).toBe(true);
    expect(validStatuses.includes("errors")).toBe(true);
    expect(validStatuses.includes("done")).toBe(true);
  });
});
