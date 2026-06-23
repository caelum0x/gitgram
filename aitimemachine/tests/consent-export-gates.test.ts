import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { saveConsent, ConsentError } from "../src/auth/consent-policy.js";
import { ChangesExporter } from "../src/export/changes-exporter.js";
import { exportAnalytics } from "../src/export/index.js";
import { exportConversationsToJSONL } from "../src/export/training-data.js";

describe("consent export helper gates", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-consent-export-"));
    fs.mkdirSync(path.join(projectDir, ".aitimemachine"), { recursive: true });
    fs.writeFileSync(path.join(projectDir, "a.ts"), "export const a = 1;\n", "utf-8");
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("blocks ChangesExporter when operational_capture consent is disabled", async () => {
    saveConsent(projectDir, {
      policy: {
        operational_capture: false,
        training_export: true,
      },
    });

    const exporter = new ChangesExporter(projectDir);
    await expect(
      exporter.exportChanges({
        projectPath: projectDir,
        outputPath: path.join(projectDir, "changes.json"),
      })
    ).rejects.toThrow(ConsentError);
  });

  it("blocks exportAnalytics helper when operational_capture consent is disabled", () => {
    saveConsent(projectDir, {
      policy: {
        operational_capture: false,
        training_export: true,
      },
    });

    const output = path.join(projectDir, "analytics.json");
    const cwd = process.cwd();
    process.chdir(projectDir);
    try {
      expect(() => exportAnalytics([], [], output, "json")).toThrow(ConsentError);
    } finally {
      process.chdir(cwd);
    }
  });

  it("blocks exportConversationsToJSONL helper when training_export consent is disabled", () => {
    saveConsent(projectDir, {
      policy: {
        operational_capture: true,
        training_export: false,
      },
    });

    const output = path.join(projectDir, "training.jsonl");
    const cwd = process.cwd();
    process.chdir(projectDir);
    try {
      expect(() =>
        exportConversationsToJSONL(
          [
            { role: "user", content: "hello" },
            { role: "assistant", content: "world" },
          ],
          output
        )
      ).toThrow(ConsentError);
    } finally {
      process.chdir(cwd);
    }
  });
});
