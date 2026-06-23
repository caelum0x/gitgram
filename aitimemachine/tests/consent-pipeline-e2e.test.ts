/**
 * #21 - Consent policies on capture/export: integration-level end-to-end test
 *
 * Verifies that consent denial blocks the full pipeline from capture through
 * every export path, and that no data leaks when consent is revoked.
 * Also covers paths not yet tested: exportAll aggregator, core/export,
 * core/session-exporter (via SessionExporter).
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TimeMachineEngine } from "../src/core/engine.js";
import { TrainingExporter } from "../src/export/training-exporter.js";
import { DataExporter } from "../src/export/data-exporter.js";
import { ChangesExporter } from "../src/export/changes-exporter.js";
import { SessionExporter } from "../src/export/session-exporter.js";
import {
  exportAll,
  exportTrainingData,
  exportAnalytics,
  exportConversationsToJSONL,
} from "../src/export/index.js";
import { saveConsent, ConsentError } from "../src/auth/consent-policy.js";
import { CloudSync } from "../src/cloud-sync.js";

describe("#21 consent pipeline end-to-end: denial blocks full pipeline", () => {
  let projectDir: string;
  let outputDir: string;
  let originalCwd: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-consent-e2e-"));
    outputDir = path.join(projectDir, "output");
    fs.mkdirSync(path.join(projectDir, ".aitimemachine"), { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "app.ts"),
      'export const hello = "world";\n',
      "utf-8"
    );
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("blocks every step: capture denied -> no data -> exports all denied", async () => {
    // Step 1: Revoke all consent
    saveConsent(projectDir, {
      policy: { operational_capture: false, training_export: false },
    });

    // Step 2: Capture should fail
    const engine = new TimeMachineEngine(projectDir);
    expect(() => engine.capture("test", { type: "manual" })).toThrow(ConsentError);

    // Step 3: All export paths should fail (even though there is no data)
    const dataExporter = new DataExporter(projectDir);
    await expect(
      dataExporter.exportAll({
        projectPath: projectDir,
        format: "json",
        outputPath: path.join(outputDir, "data.json"),
      })
    ).rejects.toThrow(ConsentError);

    const changesExporter = new ChangesExporter(projectDir);
    await expect(
      changesExporter.exportChanges({
        projectPath: projectDir,
        outputPath: path.join(outputDir, "changes.json"),
      })
    ).rejects.toThrow(ConsentError);

    const sessionExporter = new SessionExporter();
    await expect(
      sessionExporter.exportSessions({
        projectPath: projectDir,
        outputPath: path.join(outputDir, "sessions.json"),
      })
    ).rejects.toThrow(ConsentError);

    const trainingExporter = new TrainingExporter();
    await expect(
      trainingExporter.exportTrainingData({
        projectPath: projectDir,
        outputPath: path.join(outputDir, "training.jsonl"),
      })
    ).rejects.toThrow(ConsentError);

    // Step 4: Helper functions should also fail
    process.chdir(projectDir);

    expect(() =>
      exportAnalytics([], [], path.join(outputDir, "analytics.json"), "json")
    ).toThrow(ConsentError);

    expect(() =>
      exportConversationsToJSONL(
        [
          { role: "user", content: "hi" },
          { role: "assistant", content: "hello" },
        ],
        path.join(outputDir, "convos.jsonl")
      )
    ).toThrow(ConsentError);

    expect(() =>
      exportTrainingData(
        [
          { role: "user", content: "prompt" },
          { role: "assistant", content: "response" },
        ],
        path.join(outputDir, "train.jsonl"),
        "generic"
      )
    ).toThrow(ConsentError);

    // Step 5: exportAll aggregator should also fail
    await expect(
      exportAll(
        {
          messages: [
            { role: "user", content: "test" },
            { role: "assistant", content: "response" },
          ],
        },
        {
          outputDir: path.join(outputDir, "full-export"),
          includeTrainingData: true,
          includeAnalytics: true,
        }
      )
    ).rejects.toThrow(ConsentError);

    // Step 6: Verify no output files were created in the output directory
    const outputFiles = fs.readdirSync(outputDir).filter((f) => f !== "full-export");
    expect(outputFiles).toHaveLength(0);
  });

  it("allows capture then blocks when consent is revoked mid-pipeline", async () => {
    // Grant full consent
    saveConsent(projectDir, {
      policy: { operational_capture: true, training_export: true },
    });

    const engine = new TimeMachineEngine(projectDir);

    // Capture succeeds
    const tp = engine.capture("initial capture", { type: "manual" });
    expect(tp).toBeDefined();
    expect(tp.id).toBeTruthy();

    // Operational export succeeds
    const dataExporter = new DataExporter(projectDir);
    const exportResult = await dataExporter.exportAll({
      projectPath: projectDir,
      format: "json",
      outputPath: path.join(outputDir, "data.json"),
    });
    expect(exportResult.success).toBe(true);
    expect(fs.existsSync(exportResult.outputPath)).toBe(true);

    // Now revoke consent
    saveConsent(projectDir, {
      policy: { operational_capture: false, training_export: false },
    });

    // Subsequent capture should fail immediately
    expect(() => engine.capture("after revoke", { type: "manual" })).toThrow(
      ConsentError
    );

    // Subsequent export should fail immediately
    await expect(
      dataExporter.exportAll({
        projectPath: projectDir,
        format: "json",
        outputPath: path.join(outputDir, "data2.json"),
      })
    ).rejects.toThrow(ConsentError);

    // data2.json should not exist
    expect(fs.existsSync(path.join(outputDir, "data2.json"))).toBe(false);
  });

  it("blocks training exports but allows operational when only training_export is revoked", async () => {
    saveConsent(projectDir, {
      policy: { operational_capture: true, training_export: false },
    });

    // Capture should work (requires operational_capture)
    const engine = new TimeMachineEngine(projectDir);
    expect(() => engine.capture("operational ok", { type: "manual" })).not.toThrow();

    // Operational export should work
    const dataExporter = new DataExporter(projectDir);
    const exportResult = await dataExporter.exportAll({
      projectPath: projectDir,
      format: "json",
      outputPath: path.join(outputDir, "op-export.json"),
    });
    expect(exportResult.success).toBe(true);

    // Training export should fail
    const trainingExporter = new TrainingExporter();
    await expect(
      trainingExporter.exportTrainingData({
        projectPath: projectDir,
        outputPath: path.join(outputDir, "training.jsonl"),
      })
    ).rejects.toThrow(ConsentError);
    expect(fs.existsSync(path.join(outputDir, "training.jsonl"))).toBe(false);
  });

  it("blocks exportAll aggregator for training-scoped export when training_export denied", async () => {
    saveConsent(projectDir, {
      policy: { operational_capture: true, training_export: false },
    });
    process.chdir(projectDir);

    // exportAll with includeTrainingData=true requires training_export
    await expect(
      exportAll(
        {
          messages: [
            { role: "user", content: "prompt" },
            { role: "assistant", content: "answer" },
          ],
        },
        {
          outputDir: path.join(outputDir, "agg-export"),
          includeTrainingData: true,
          includeAnalytics: false,
        }
      )
    ).rejects.toThrow(ConsentError);
  });

  it("blocks CloudSync push and export when consent is revoked", async () => {
    saveConsent(projectDir, {
      policy: { operational_capture: false, training_export: false },
    });

    const sync = new CloudSync(projectDir);
    sync.configure("http://example.com/api", "test-key-000");

    // Push requires operational_capture
    await expect(sync.push()).rejects.toThrow(ConsentError);

    // Export requires operational_capture
    expect(() => sync.export(path.join(outputDir, "cloud.json"))).toThrow(
      ConsentError
    );
  });

  it("exportAll analytics-only mode blocked when operational_capture revoked", async () => {
    saveConsent(projectDir, {
      policy: { operational_capture: false, training_export: true },
    });
    process.chdir(projectDir);

    // Even analytics-only exportAll needs operational consent
    await expect(
      exportAll(
        { checkpoints: [] },
        {
          outputDir: path.join(outputDir, "analytics-only"),
          includeTrainingData: false,
          includeAnalytics: true,
          includeToolExamples: false,
          includeErrorRecovery: false,
          includeFileChanges: false,
        }
      )
    ).rejects.toThrow(ConsentError);
  });
});
