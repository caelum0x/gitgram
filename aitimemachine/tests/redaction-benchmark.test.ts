import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runRedactionBenchmark } from "../src/export/redaction-benchmark.js";
import { saveConsent } from "../src/auth/consent-policy.js";
import { TrainingExporter } from "../src/export/training-exporter.js";

describe("redaction benchmark metrics", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-redaction-bench-"));
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("computes precision/recall/f1 from default benchmark", () => {
    const report = runRedactionBenchmark();

    expect(report.sampleCount).toBeGreaterThan(0);
    expect(report.metrics.precision).toBeGreaterThanOrEqual(0);
    expect(report.metrics.recall).toBeGreaterThanOrEqual(0);
    expect(report.metrics.f1).toBeGreaterThanOrEqual(0);
  });

  it("includes redaction quality metrics in training export stats when redaction is enabled", async () => {
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
      redact: true,
    });

    expect(result.success).toBe(true);
    expect(result.stats.redactionQuality).toBeDefined();
    expect((result.stats.redactionQuality?.f1 ?? 0) >= 0).toBe(true);
    const reportPath = result.stats.redactionQuality?.reportPath;
    expect(typeof reportPath).toBe("string");
    expect(fs.existsSync(reportPath as string)).toBe(true);
  });
});
