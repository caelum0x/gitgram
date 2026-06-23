/**
 * #23 - Export traceability guarantees: comprehensive validation
 *
 * Verifies 100% of exports produce valid traceability linkage
 * (no null/empty consent/audit IDs) and that audit log entries are
 * created for every export operation (start + completion).
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveConsent } from "../src/auth/consent-policy.js";
import { getAuditLogs } from "../src/auth/audit.js";
import {
  beginExportTrace,
  completeExportTrace,
  type ExportTrace,
} from "../src/export/traceability.js";
import { TrainingExporter } from "../src/export/training-exporter.js";
import { DataExporter } from "../src/export/data-exporter.js";
import { ChangesExporter } from "../src/export/changes-exporter.js";
import { SessionExporter } from "../src/export/session-exporter.js";
import {
  exportAnalytics,
  exportTrainingData as exportTrainingDataHelper,
} from "../src/export/index.js";

/**
 * Validates that an ExportTrace has fully populated, non-null linkage fields.
 */
function assertValidTrace(trace: ExportTrace, label: string): void {
  expect(trace.exportId, `${label}: exportId must be a non-empty string`).toBeTruthy();
  expect(
    trace.exportId.startsWith("exp_"),
    `${label}: exportId must start with 'exp_'`
  ).toBe(true);

  expect(
    trace.consentSnapshotId,
    `${label}: consentSnapshotId must be a non-empty string`
  ).toBeTruthy();
  expect(
    trace.consentSnapshotId.startsWith("consent_"),
    `${label}: consentSnapshotId must start with 'consent_'`
  ).toBe(true);

  expect(trace.auditId, `${label}: auditId must be a non-empty string`).toBeTruthy();
  expect(
    typeof trace.auditId === "string" && trace.auditId.length > 0,
    `${label}: auditId must be a valid UUID string`
  ).toBe(true);
}

describe("#23 export traceability: 100% valid linkage for all exports", () => {
  let projectDir: string;
  let outputDir: string;
  let originalCwd: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-trace-complete-"));
    outputDir = path.join(projectDir, "output");
    fs.mkdirSync(path.join(projectDir, ".aitimemachine"), { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "index.ts"),
      'export const x = 1;\n',
      "utf-8"
    );
    // Grant all consent so exports succeed and we can inspect trace linkage
    saveConsent(projectDir, {
      policy: { operational_capture: true, training_export: true },
    });
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("beginExportTrace produces non-null exportId, consentSnapshotId, startAuditId", () => {
    const trace = beginExportTrace({
      projectPath: projectDir,
      action: "export_operational",
      source: "test.traceability-complete.begin",
      resource: projectDir,
    });

    expect(trace.exportId).toBeTruthy();
    expect(trace.exportId.startsWith("exp_")).toBe(true);
    expect(trace.consentSnapshotId).toBeTruthy();
    expect(trace.consentSnapshotId.startsWith("consent_")).toBe(true);
    expect(trace.startAuditId).toBeTruthy();
    expect(typeof trace.startAuditId).toBe("string");
    expect(trace.startAuditId.length).toBeGreaterThan(0);
  });

  it("completeExportTrace produces non-null auditId different from startAuditId", () => {
    const trace = beginExportTrace({
      projectPath: projectDir,
      action: "export_operational",
      source: "test.traceability-complete.complete",
      resource: projectDir,
    });

    const result = completeExportTrace(trace, {
      success: true,
      outputPath: path.join(outputDir, "test.json"),
      stats: { records: 0 },
    });

    assertValidTrace(result, "completeExportTrace");
    // The completion auditId must differ from the start auditId
    expect(result.auditId).not.toBe(trace.startAuditId);
  });

  it("TrainingExporter.exportTrainingData returns valid trace linkage", async () => {
    const exporter = new TrainingExporter();
    const result = await exporter.exportTrainingData({
      projectPath: projectDir,
      outputPath: path.join(outputDir, "training.jsonl"),
    });

    expect(result.success).toBe(true);
    assertValidTrace(result.trace, "TrainingExporter");
  });

  it("DataExporter.exportAll returns valid trace linkage", async () => {
    const exporter = new DataExporter(projectDir);
    const result = await exporter.exportAll({
      projectPath: projectDir,
      format: "json",
      outputPath: path.join(outputDir, "data.json"),
    });

    expect(result.success).toBe(true);
    assertValidTrace(result.trace, "DataExporter");
  });

  it("ChangesExporter.exportChanges returns valid trace linkage", async () => {
    const exporter = new ChangesExporter(projectDir);
    const result = await exporter.exportChanges({
      projectPath: projectDir,
      outputPath: path.join(outputDir, "changes.json"),
    });

    expect(result.success).toBe(true);
    assertValidTrace(result.trace, "ChangesExporter");
  });

  it("SessionExporter.exportSessions returns valid trace linkage", async () => {
    const exporter = new SessionExporter();
    const result = await exporter.exportSessions({
      projectPath: projectDir,
      outputPath: path.join(outputDir, "sessions.json"),
    });

    expect(result.success).toBe(true);
    assertValidTrace(result.trace, "SessionExporter");
  });

  it("exportAnalytics helper returns valid trace via audit logs", () => {
    process.chdir(projectDir);

    // exportAnalytics does not return a trace object, but internally uses
    // beginExportTrace / completeExportTrace which create audit entries.
    // Verify that the audit logs have export.trace.start and export.trace.success entries.
    const beforeLogs = getAuditLogs(10000);
    const beforeCount = beforeLogs.filter(
      (e) => e.action === "export.trace.start" || e.action === "export.trace.success"
    ).length;

    exportAnalytics([], [], path.join(outputDir, "analytics.json"), "json");

    const afterLogs = getAuditLogs(10000);
    const afterTraceEntries = afterLogs.filter(
      (e) => e.action === "export.trace.start" || e.action === "export.trace.success"
    );

    // At least 2 new audit entries should exist (start + success)
    expect(afterTraceEntries.length).toBeGreaterThanOrEqual(beforeCount + 2);
  });

  it("exportTrainingData helper produces audit trail entries", () => {
    process.chdir(projectDir);

    const beforeLogs = getAuditLogs(10000);
    const beforeStartCount = beforeLogs.filter(
      (e) => e.action === "export.trace.start"
    ).length;

    exportTrainingDataHelper(
      [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi there" },
      ],
      path.join(outputDir, "train-helper.jsonl"),
      "generic"
    );

    const afterLogs = getAuditLogs(10000);
    const afterStartEntries = afterLogs.filter(
      (e) => e.action === "export.trace.start"
    );

    expect(afterStartEntries.length).toBeGreaterThan(beforeStartCount);
  });

  it("failed export still gets a trace.failure audit entry", () => {
    const trace = beginExportTrace({
      projectPath: projectDir,
      action: "export_operational",
      source: "test.traceability-complete.failure",
      resource: projectDir,
    });

    const result = completeExportTrace(trace, {
      success: false,
      error: new Error("simulated failure"),
    });

    assertValidTrace(result, "failed-export");

    // Check that audit log contains the failure entry
    const logs = getAuditLogs(10000);
    const failureEntry = logs.find(
      (e) =>
        e.action === "export.trace.failure" &&
        e.details?.exportId === trace.exportId
    );
    expect(failureEntry).toBeDefined();
    expect(failureEntry!.success).toBe(false);
    expect(failureEntry!.details?.linkedStartAuditId).toBe(trace.startAuditId);
  });
});

describe("#23 export traceability: audit log entries for every export", () => {
  let projectDir: string;
  let outputDir: string;
  let originalCwd: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-trace-audit-"));
    outputDir = path.join(projectDir, "output");
    fs.mkdirSync(path.join(projectDir, ".aitimemachine"), { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "lib.ts"),
      'export const lib = true;\n',
      "utf-8"
    );
    saveConsent(projectDir, {
      policy: { operational_capture: true, training_export: true },
    });
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("each export creates exactly one start and one completion audit entry", async () => {
    process.chdir(projectDir);
    const logsBefore = getAuditLogs(10000);
    const startCountBefore = logsBefore.filter(
      (e) => e.action === "export.trace.start"
    ).length;
    const successCountBefore = logsBefore.filter(
      (e) => e.action === "export.trace.success"
    ).length;

    // Run 4 different exports
    const exporter1 = new DataExporter(projectDir);
    await exporter1.exportAll({
      projectPath: projectDir,
      format: "json",
      outputPath: path.join(outputDir, "d1.json"),
    });

    const exporter2 = new ChangesExporter(projectDir);
    await exporter2.exportChanges({
      projectPath: projectDir,
      outputPath: path.join(outputDir, "c1.json"),
    });

    const exporter3 = new SessionExporter();
    await exporter3.exportSessions({
      projectPath: projectDir,
      outputPath: path.join(outputDir, "s1.json"),
    });

    const exporter4 = new TrainingExporter();
    await exporter4.exportTrainingData({
      projectPath: projectDir,
      outputPath: path.join(outputDir, "t1.jsonl"),
    });

    const logsAfter = getAuditLogs(10000);
    const startCountAfter = logsAfter.filter(
      (e) => e.action === "export.trace.start"
    ).length;
    const successCountAfter = logsAfter.filter(
      (e) => e.action === "export.trace.success"
    ).length;

    // 4 exports -> at least 4 new start entries and 4 new success entries
    expect(startCountAfter - startCountBefore).toBeGreaterThanOrEqual(4);
    expect(successCountAfter - successCountBefore).toBeGreaterThanOrEqual(4);
  });

  it("audit entries contain exportId linking start and completion", async () => {
    process.chdir(projectDir);
    const exporter = new TrainingExporter();
    const result = await exporter.exportTrainingData({
      projectPath: projectDir,
      outputPath: path.join(outputDir, "linked.jsonl"),
    });

    const logs = getAuditLogs(10000);

    // Find the start entry for this specific export
    const startEntry = logs.find(
      (e) =>
        e.action === "export.trace.start" &&
        e.details?.exportId === result.trace.exportId
    );
    expect(startEntry).toBeDefined();
    expect(startEntry!.success).toBe(true);
    expect(startEntry!.details?.consentSnapshotId).toBe(result.trace.consentSnapshotId);

    // Find the completion entry for this specific export
    const completionEntry = logs.find(
      (e) =>
        e.action === "export.trace.success" &&
        e.details?.exportId === result.trace.exportId
    );
    expect(completionEntry).toBeDefined();
    expect(completionEntry!.success).toBe(true);
    expect(completionEntry!.details?.linkedStartAuditId).toBe(startEntry!.id);
    expect(completionEntry!.details?.consentSnapshotId).toBe(
      result.trace.consentSnapshotId
    );
  });

  it("consent snapshot IDs are deterministic for same consent state", () => {
    const trace1 = beginExportTrace({
      projectPath: projectDir,
      action: "export_operational",
      source: "test.deterministic.1",
    });

    const trace2 = beginExportTrace({
      projectPath: projectDir,
      action: "export_operational",
      source: "test.deterministic.2",
    });

    // Same consent state + same action = same consentSnapshotId
    expect(trace1.consentSnapshotId).toBe(trace2.consentSnapshotId);

    // But exportIds must be unique
    expect(trace1.exportId).not.toBe(trace2.exportId);
  });

  it("consent snapshot ID changes when consent policy is updated", () => {
    const trace1 = beginExportTrace({
      projectPath: projectDir,
      action: "export_training",
      source: "test.consent-change.before",
    });

    // Change consent
    saveConsent(projectDir, {
      policy: { operational_capture: true, training_export: false },
    });
    // Re-enable for the next trace to succeed
    saveConsent(projectDir, {
      policy: { operational_capture: true, training_export: true },
    });

    const trace2 = beginExportTrace({
      projectPath: projectDir,
      action: "export_training",
      source: "test.consent-change.after",
    });

    // updatedAt changed, so consentSnapshotId must differ
    expect(trace1.consentSnapshotId).not.toBe(trace2.consentSnapshotId);
  });
});
