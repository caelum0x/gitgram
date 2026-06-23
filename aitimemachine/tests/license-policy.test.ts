import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assessLicenseCompliance, assertLicenseCompliance } from "../src/compliance/license-policy.js";
import { saveConsent } from "../src/auth/consent-policy.js";
import { TrainingExporter } from "../src/export/training-exporter.js";

describe("license policy guardrails", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-license-policy-"));
    fs.mkdirSync(path.join(projectDir, ".aitimemachine"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("classifies MIT as permissive and allows dataset export", () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", license: "MIT" }, null, 2),
      "utf-8"
    );

    const assessment = assessLicenseCompliance(projectDir, "dataset_export");
    expect(assessment.licenseClass).toBe("permissive");
    expect(assessment.allowed).toBe(true);
  });

  it("blocks strong copyleft licenses for dataset export by default", () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", license: "GPL-3.0" }, null, 2),
      "utf-8"
    );

    expect(() => assertLicenseCompliance(projectDir, "dataset_export")).toThrow(
      /License policy blocked dataset_export/
    );
  });

  it("enforces license gate in training exporter", async () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", license: "AGPL-3.0" }, null, 2),
      "utf-8"
    );
    saveConsent(projectDir, {
      policy: { operational_capture: true, training_export: true },
    });

    const exporter = new TrainingExporter();
    await expect(
      exporter.exportTrainingData({
        projectPath: projectDir,
        outputPath: path.join(projectDir, "training.jsonl"),
      })
    ).rejects.toThrow(/License policy blocked dataset_export/);
  });
});
