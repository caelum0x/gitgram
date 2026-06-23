import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TimeMachineEngine } from "../src/core/engine.js";
import { TrainingExporter } from "../src/export/training-exporter.js";
import { DataExporter } from "../src/export/data-exporter.js";
import { saveConsent, assertConsent, ConsentError } from "../src/auth/consent-policy.js";

describe("consent policy enforcement", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-consent-test-"));
    fs.mkdirSync(path.join(projectDir, ".aitimemachine"), { recursive: true });
    fs.writeFileSync(path.join(projectDir, "main.ts"), "export const ok = true;\n", "utf-8");
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("blocks capture when operational_capture is disabled", () => {
    saveConsent(projectDir, {
      policy: {
        operational_capture: false,
        training_export: false,
      },
    });

    const engine = new TimeMachineEngine(projectDir);
    expect(() => engine.capture("blocked capture", { type: "manual" })).toThrow(ConsentError);
  });

  it("blocks training export when training_export is disabled", async () => {
    saveConsent(projectDir, {
      policy: {
        operational_capture: true,
        training_export: false,
      },
    });

    const exporter = new TrainingExporter();
    await expect(
      exporter.exportTrainingData({
        projectPath: projectDir,
        outputPath: path.join(projectDir, "training.jsonl"),
      })
    ).rejects.toThrow(ConsentError);
  });

  it("blocks operational export when operational_capture is disabled", async () => {
    saveConsent(projectDir, {
      policy: {
        operational_capture: false,
        training_export: true,
      },
    });

    const exporter = new DataExporter(projectDir);
    await expect(
      exporter.exportAll({
        projectPath: projectDir,
        format: "json",
        outputPath: path.join(projectDir, "full-export.json"),
      })
    ).rejects.toThrow(ConsentError);
  });

  it("allows capture and training export when both consents are enabled", async () => {
    saveConsent(projectDir, {
      policy: {
        operational_capture: true,
        training_export: true,
      },
    });

    const engine = new TimeMachineEngine(projectDir);
    expect(() => engine.capture("allowed capture", { type: "manual" })).not.toThrow();

    const exporter = new TrainingExporter();
    const result = await exporter.exportTrainingData({
      projectPath: projectDir,
      outputPath: path.join(projectDir, "training.jsonl"),
    });
    expect(result.success).toBe(true);
    expect(fs.existsSync(result.outputPath)).toBe(true);
  });

  it("defaults to deny training export without explicit opt-in", () => {
    expect(() =>
      assertConsent(projectDir, "export_training", {
        source: "tests.default-training-deny",
      })
    ).toThrow(ConsentError);
  });
});
