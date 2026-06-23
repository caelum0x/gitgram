import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  saveConsent,
  loadConsent,
  assertConsent,
  ConsentError,
  DEFAULT_CONSENT_POLICY,
} from "../src/auth/consent-policy.js";
import { TimeMachineEngine } from "../src/core/engine.js";
import { TrainingExporter } from "../src/export/training-exporter.js";
import { DataExporter } from "../src/export/data-exporter.js";
import { ChangesExporter } from "../src/export/changes-exporter.js";
import { SessionExporter } from "../src/export/session-exporter.js";
import { exportAnalytics, exportTrainingData, exportConversationsToJSONL } from "../src/export/index.js";
import { CloudSync } from "../src/cloud-sync.js";

describe("consent enforcement: capture paths", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-enforce-cap-"));
    fs.mkdirSync(path.join(projectDir, ".aitimemachine"), { recursive: true });
    fs.writeFileSync(path.join(projectDir, "main.ts"), "export const ok = true;\n", "utf-8");
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("blocks engine.capture() when operational_capture consent is revoked", () => {
    saveConsent(projectDir, {
      policy: { operational_capture: false, training_export: false },
    });

    const engine = new TimeMachineEngine(projectDir);
    expect(() => engine.capture("test", { type: "manual" })).toThrow(ConsentError);
  });

  it("allows engine.capture() when operational_capture consent is granted", () => {
    saveConsent(projectDir, {
      policy: { operational_capture: true, training_export: false },
    });

    const engine = new TimeMachineEngine(projectDir);
    expect(() => engine.capture("allowed", { type: "manual" })).not.toThrow();
  });

  it("blocks assertConsent(capture) directly when consent is revoked", () => {
    saveConsent(projectDir, {
      policy: { operational_capture: false, training_export: true },
    });

    expect(() =>
      assertConsent(projectDir, "capture", { source: "test.direct" })
    ).toThrow(ConsentError);
  });

  it("blocks cloud-sync push when operational_capture consent is revoked", () => {
    saveConsent(projectDir, {
      policy: { operational_capture: false, training_export: false },
    });

    const sync = new CloudSync(projectDir);
    sync.configure("http://example.com/api", "test-key-123");

    expect(sync.push()).rejects.toThrow(ConsentError);
  });

  it("blocks cloud-sync export when operational_capture consent is revoked", () => {
    saveConsent(projectDir, {
      policy: { operational_capture: false, training_export: false },
    });

    const sync = new CloudSync(projectDir);
    expect(() => sync.export(path.join(projectDir, "out.json"))).toThrow(ConsentError);
  });
});

describe("consent enforcement: export paths", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-enforce-exp-"));
    fs.mkdirSync(path.join(projectDir, ".aitimemachine"), { recursive: true });
    fs.writeFileSync(path.join(projectDir, "app.ts"), "console.log('hi');\n", "utf-8");
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("blocks TrainingExporter when training_export consent is missing", async () => {
    saveConsent(projectDir, {
      policy: { operational_capture: true, training_export: false },
    });

    const exporter = new TrainingExporter();
    await expect(
      exporter.exportTrainingData({
        projectPath: projectDir,
        outputPath: path.join(projectDir, "train.jsonl"),
      })
    ).rejects.toThrow(ConsentError);
  });

  it("blocks DataExporter when operational_capture consent is revoked", async () => {
    saveConsent(projectDir, {
      policy: { operational_capture: false, training_export: true },
    });

    const exporter = new DataExporter(projectDir);
    await expect(
      exporter.exportAll({
        projectPath: projectDir,
        format: "json",
        outputPath: path.join(projectDir, "data.json"),
      })
    ).rejects.toThrow(ConsentError);
  });

  it("blocks ChangesExporter when operational_capture consent is revoked", async () => {
    saveConsent(projectDir, {
      policy: { operational_capture: false, training_export: true },
    });

    const exporter = new ChangesExporter(projectDir);
    await expect(
      exporter.exportChanges({
        projectPath: projectDir,
        outputPath: path.join(projectDir, "changes.json"),
      })
    ).rejects.toThrow(ConsentError);
  });

  it("blocks SessionExporter when operational_capture consent is revoked", async () => {
    saveConsent(projectDir, {
      policy: { operational_capture: false, training_export: true },
    });

    const exporter = new SessionExporter();
    await expect(
      exporter.exportSessions({
        projectPath: projectDir,
        outputPath: path.join(projectDir, "sessions.json"),
      })
    ).rejects.toThrow(ConsentError);
  });

  it("blocks exportAnalytics helper when operational_capture consent is disabled", () => {
    saveConsent(projectDir, {
      policy: { operational_capture: false, training_export: true },
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

  it("blocks exportConversationsToJSONL when training_export consent is disabled", () => {
    saveConsent(projectDir, {
      policy: { operational_capture: true, training_export: false },
    });

    const output = path.join(projectDir, "convos.jsonl");
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

  it("blocks exportTrainingData helper when training_export consent is disabled", () => {
    saveConsent(projectDir, {
      policy: { operational_capture: true, training_export: false },
    });

    const output = path.join(projectDir, "training.jsonl");
    const cwd = process.cwd();
    process.chdir(projectDir);
    try {
      expect(() =>
        exportTrainingData(
          [
            { role: "user", content: "prompt" },
            { role: "assistant", content: "response" },
          ],
          output,
          "generic"
        )
      ).toThrow(ConsentError);
    } finally {
      process.chdir(cwd);
    }
  });
});

describe("consent enforcement: immediate effect of consent changes", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-enforce-imm-"));
    fs.mkdirSync(path.join(projectDir, ".aitimemachine"), { recursive: true });
    fs.writeFileSync(path.join(projectDir, "main.ts"), "export const ok = true;\n", "utf-8");
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("captures succeed then fail immediately after revoking operational_capture", () => {
    // Grant consent
    saveConsent(projectDir, {
      policy: { operational_capture: true, training_export: true },
    });

    const engine = new TimeMachineEngine(projectDir);

    // First capture should succeed
    expect(() => engine.capture("before revoke", { type: "manual" })).not.toThrow();

    // Revoke operational_capture
    saveConsent(projectDir, {
      policy: { operational_capture: false, training_export: true },
    });

    // Immediate next capture should fail -- no caching, reads consent fresh
    expect(() => engine.capture("after revoke", { type: "manual" })).toThrow(ConsentError);
  });

  it("export fails then succeeds immediately after granting training_export", async () => {
    // Deny training export
    saveConsent(projectDir, {
      policy: { operational_capture: true, training_export: false },
    });

    const exporter = new TrainingExporter();
    const opts = {
      projectPath: projectDir,
      outputPath: path.join(projectDir, "t.jsonl"),
    };

    // Should fail
    await expect(exporter.exportTrainingData(opts)).rejects.toThrow(ConsentError);

    // Grant training export
    saveConsent(projectDir, {
      policy: { operational_capture: true, training_export: true },
    });

    // Should succeed immediately
    const result = await exporter.exportTrainingData(opts);
    expect(result.success).toBe(true);
  });

  it("assertConsent reflects toggled consent in real time", () => {
    // Start with defaults (operational_capture: true, training_export: false)
    // Training export should be denied by default
    expect(() =>
      assertConsent(projectDir, "export_training", { source: "test" })
    ).toThrow(ConsentError);

    // Enable training_export
    saveConsent(projectDir, {
      policy: { operational_capture: true, training_export: true },
    });

    // Now it should pass
    expect(() =>
      assertConsent(projectDir, "export_training", { source: "test" })
    ).not.toThrow();

    // Revoke again
    saveConsent(projectDir, {
      policy: { operational_capture: true, training_export: false },
    });

    // Should fail again
    expect(() =>
      assertConsent(projectDir, "export_training", { source: "test" })
    ).toThrow(ConsentError);
  });
});

describe("consent enforcement: multi-level resolution", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-enforce-ml-"));
    fs.mkdirSync(path.join(projectDir, ".aitimemachine"), { recursive: true });
    fs.writeFileSync(path.join(projectDir, "main.ts"), "export const ok = true;\n", "utf-8");
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("uses default consent policy when no consent file exists", () => {
    const doc = loadConsent(projectDir);
    expect(doc.policy.operational_capture).toBe(DEFAULT_CONSENT_POLICY.operational_capture);
    expect(doc.policy.training_export).toBe(DEFAULT_CONSENT_POLICY.training_export);
  });

  it("project-level consent overrides defaults", () => {
    saveConsent(projectDir, {
      projectId: "proj-123",
      policy: { operational_capture: false, training_export: true },
    });

    const doc = loadConsent(projectDir);
    expect(doc.projectId).toBe("proj-123");
    expect(doc.policy.operational_capture).toBe(false);
    expect(doc.policy.training_export).toBe(true);
  });

  it("org-level consent can be set and loaded", () => {
    saveConsent(projectDir, {
      orgId: "org-456",
      policy: { operational_capture: true, training_export: true },
    });

    const doc = loadConsent(projectDir);
    expect(doc.orgId).toBe("org-456");
    expect(doc.policy.operational_capture).toBe(true);
    expect(doc.policy.training_export).toBe(true);
  });

  it("partial updates merge with existing consent", () => {
    // First: set both policies
    saveConsent(projectDir, {
      orgId: "org-1",
      projectId: "proj-1",
      policy: { operational_capture: true, training_export: false },
    });

    // Update only training_export
    saveConsent(projectDir, {
      policy: { operational_capture: true, training_export: true },
    });

    const doc = loadConsent(projectDir);
    // orgId and projectId should persist from previous save
    expect(doc.orgId).toBe("org-1");
    expect(doc.projectId).toBe("proj-1");
    expect(doc.policy.operational_capture).toBe(true);
    expect(doc.policy.training_export).toBe(true);
  });

  it("returns safe defaults for a corrupted consent file", () => {
    const consentFile = path.join(projectDir, ".aitimemachine", "consent.json");
    fs.writeFileSync(consentFile, "NOT_VALID_JSON{{{", "utf-8");

    const doc = loadConsent(projectDir);
    expect(doc.policy.operational_capture).toBe(DEFAULT_CONSENT_POLICY.operational_capture);
    expect(doc.policy.training_export).toBe(DEFAULT_CONSENT_POLICY.training_export);
  });
});

describe("consent enforcement: ConsentError structure", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-enforce-err-"));
    fs.mkdirSync(path.join(projectDir, ".aitimemachine"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("ConsentError has correct code and status", () => {
    saveConsent(projectDir, {
      policy: { operational_capture: false, training_export: false },
    });

    try {
      assertConsent(projectDir, "capture", { source: "test" });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ConsentError);
      const err = e as ConsentError;
      expect(err.code).toBe("CONSENT_REQUIRED");
      expect(err.status).toBe(403);
      expect(err.name).toBe("ConsentError");
    }
  });

  it("ConsentError includes details about the denied consent", () => {
    saveConsent(projectDir, {
      orgId: "org-test",
      projectId: "proj-test",
      policy: { operational_capture: true, training_export: false },
    });

    try {
      assertConsent(projectDir, "export_training", {
        source: "test.details",
        resource: "/export/training",
      });
      expect.unreachable("should have thrown");
    } catch (e) {
      const err = e as ConsentError;
      expect(err.details).toBeDefined();
      expect(err.details!.requiredConsent).toBe("training_export");
      expect(err.details!.source).toBe("test.details");
      expect(err.details!.orgId).toBe("org-test");
      expect(err.details!.projectId).toBe("proj-test");
      expect(err.details!.policy).toEqual({
        operational_capture: true,
        training_export: false,
      });
    }
  });

  it("ConsentError message includes the action and required consent", () => {
    saveConsent(projectDir, {
      policy: { operational_capture: false, training_export: true },
    });

    try {
      assertConsent(projectDir, "capture", { source: "test" });
      expect.unreachable("should have thrown");
    } catch (e) {
      const err = e as ConsentError;
      expect(err.message).toContain("capture");
      expect(err.message).toContain("operational_capture");
    }
  });
});

describe("consent enforcement: action type mapping", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-enforce-act-"));
    fs.mkdirSync(path.join(projectDir, ".aitimemachine"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("capture action requires operational_capture consent", () => {
    saveConsent(projectDir, {
      policy: { operational_capture: false, training_export: true },
    });

    expect(() =>
      assertConsent(projectDir, "capture", { source: "test" })
    ).toThrow(ConsentError);
  });

  it("export_operational action requires operational_capture consent", () => {
    saveConsent(projectDir, {
      policy: { operational_capture: false, training_export: true },
    });

    expect(() =>
      assertConsent(projectDir, "export_operational", { source: "test" })
    ).toThrow(ConsentError);
  });

  it("export_training action requires training_export consent", () => {
    saveConsent(projectDir, {
      policy: { operational_capture: true, training_export: false },
    });

    expect(() =>
      assertConsent(projectDir, "export_training", { source: "test" })
    ).toThrow(ConsentError);
  });

  it("all actions pass when both consent types are granted", () => {
    saveConsent(projectDir, {
      policy: { operational_capture: true, training_export: true },
    });

    expect(() =>
      assertConsent(projectDir, "capture", { source: "test" })
    ).not.toThrow();

    expect(() =>
      assertConsent(projectDir, "export_operational", { source: "test" })
    ).not.toThrow();

    expect(() =>
      assertConsent(projectDir, "export_training", { source: "test" })
    ).not.toThrow();
  });
});
