import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveConsent } from "../src/auth/consent-policy.js";
import { beginExportTrace, completeExportTrace } from "../src/export/traceability.js";
import { TrainingExporter } from "../src/export/training-exporter.js";

describe("export traceability linkage", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-export-trace-"));
    fs.mkdirSync(path.join(projectDir, ".aitimemachine"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("links consent snapshot and audit IDs for trace start/finish", () => {
    const trace = beginExportTrace({
      projectPath: projectDir,
      action: "export_operational",
      source: "tests.export-traceability",
      resource: projectDir,
    });

    expect(trace.exportId.startsWith("exp_")).toBe(true);
    expect(trace.consentSnapshotId.startsWith("consent_")).toBe(true);
    expect(typeof trace.startAuditId).toBe("string");

    const done = completeExportTrace(trace, {
      success: true,
      outputPath: path.join(projectDir, "out.json"),
      stats: { records: 0 },
    });

    expect(done.exportId).toBe(trace.exportId);
    expect(done.consentSnapshotId).toBe(trace.consentSnapshotId);
    expect(done.auditId).not.toBe(trace.startAuditId);
  });

  it("returns trace IDs from training exporter result", async () => {
    saveConsent(projectDir, {
      policy: {
        operational_capture: true,
        training_export: true,
      },
    });

    const exporter = new TrainingExporter();
    const result = await exporter.exportTrainingData({
      projectPath: projectDir,
      outputPath: path.join(projectDir, "training.jsonl"),
    });

    expect(result.success).toBe(true);
    expect(result.trace.exportId.startsWith("exp_")).toBe(true);
    expect(result.trace.consentSnapshotId.startsWith("consent_")).toBe(true);
    expect(typeof result.trace.auditId).toBe("string");
  });
});
