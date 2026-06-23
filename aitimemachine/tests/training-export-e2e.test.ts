import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrivacyRedactor } from "../src/export/privacy-redactor.js";
import {
  runRedactionBenchmark,
  type RedactionBenchmarkSample,
} from "../src/export/redaction-benchmark.js";
import { saveConsent } from "../src/auth/consent-policy.js";
import { TrainingExporter } from "../src/export/training-exporter.js";

describe("training export pipeline end-to-end", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-export-e2e-"));
    fs.mkdirSync(path.join(projectDir, ".aitimemachine"), { recursive: true });
    // Grant full consent for training export
    saveConsent(projectDir, {
      policy: {
        operational_capture: true,
        training_export: true,
      },
    });
    // Create a permissive license so compliance does not block
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "test-project", version: "1.0.0", license: "MIT" }),
      "utf-8"
    );
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("exports training data with redaction and records metrics end-to-end", async () => {
    const outputPath = path.join(projectDir, "training.jsonl");
    const exporter = new TrainingExporter();

    const result = await exporter.exportTrainingData({
      projectPath: projectDir,
      outputPath,
      redact: true,
      evaluateRedaction: true,
    });

    // Verify export succeeded
    expect(result.success).toBe(true);
    expect(fs.existsSync(outputPath)).toBe(true);

    // Verify redaction quality metrics are present
    expect(result.stats.redactionQuality).toBeDefined();
    const rq = result.stats.redactionQuality!;
    expect(rq.precision).toBeGreaterThanOrEqual(0);
    expect(rq.precision).toBeLessThanOrEqual(1);
    expect(rq.recall).toBeGreaterThanOrEqual(0);
    expect(rq.recall).toBeLessThanOrEqual(1);
    expect(rq.f1).toBeGreaterThanOrEqual(0);
    expect(rq.f1).toBeLessThanOrEqual(1);
    expect(rq.sampleCount).toBeGreaterThan(0);

    // Verify the redaction benchmark report JSON was written
    expect(rq.reportPath).toBeDefined();
    expect(fs.existsSync(rq.reportPath!)).toBe(true);
    const reportContent = JSON.parse(fs.readFileSync(rq.reportPath!, "utf-8"));
    expect(reportContent.report.metrics.precision).toBe(rq.precision);
    expect(reportContent.report.metrics.recall).toBe(rq.recall);
    expect(reportContent.report.sampleCount).toBe(rq.sampleCount);
  });

  it("exports without redaction does not include quality metrics", async () => {
    const outputPath = path.join(projectDir, "training-no-redact.jsonl");
    const exporter = new TrainingExporter();

    const result = await exporter.exportTrainingData({
      projectPath: projectDir,
      outputPath,
      redact: false,
      evaluateRedaction: false,
    });

    expect(result.success).toBe(true);
    expect(result.stats.redactionQuality).toBeUndefined();
  });

  it("produces a valid trace with exportId and consent snapshot", async () => {
    const outputPath = path.join(projectDir, "training-trace.jsonl");
    const exporter = new TrainingExporter();

    const result = await exporter.exportTrainingData({
      projectPath: projectDir,
      outputPath,
      redact: true,
    });

    expect(result.trace.exportId).toMatch(/^exp_/);
    expect(result.trace.consentSnapshotId).toMatch(/^consent_/);
    expect(typeof result.trace.auditId).toBe("string");
  });
});

describe("PrivacyRedactor edge cases", () => {
  let redactor: PrivacyRedactor;

  beforeEach(() => {
    redactor = new PrivacyRedactor();
  });

  it("handles empty strings", () => {
    expect(redactor.redact("")).toBe("");
    expect(redactor.detect("")).toEqual([]);
  });

  it("handles text with no PII", () => {
    const clean = "This is a perfectly clean string with no secrets.";
    expect(redactor.redact(clean)).toBe(clean);
    expect(redactor.detect(clean)).toEqual([]);
  });

  it("detects and redacts OpenAI API keys", () => {
    const text = "export OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456";
    const redacted = redactor.redact(text);
    expect(redacted).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
    expect(redacted).toContain("[REDACTED_API_KEY]");

    const matches = redactor.detect(text);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches.some((m) => m.rule === "OpenAI API key")).toBe(true);
  });

  it("detects and redacts Anthropic API keys", () => {
    const text = "key is sk-ant-api03-abcdefghijklmnopqrstuvwx";
    const redacted = redactor.redact(text);
    expect(redacted).not.toContain("sk-ant-api03");
    expect(redacted).toContain("[REDACTED_API_KEY]");
  });

  it("detects and redacts GitHub Personal Access Tokens", () => {
    const text = "GITHUB_TOKEN=ghp_1234567890abcdefghijklmnopqrstuvwxyz1234";
    const redacted = redactor.redact(text);
    expect(redacted).not.toContain("ghp_1234567890abcdefghijklmnopqrstuvwxyz1234");
    // The generic token= rule fires after the specific ghp_ rule, producing [REDACTED]
    expect(redacted).toContain("[REDACTED]");
  });

  it("detects and redacts GitHub OAuth tokens", () => {
    const text = "token: gho_abcdefghijklmnopqrstuvwxyz0123456789ABCD";
    const redacted = redactor.redact(text);
    expect(redacted).not.toContain("gho_abcdefghijklmnopqrstuvwxyz0123456789ABCD");
    // The generic token= rule fires after the specific gho_ rule, producing [REDACTED]
    expect(redacted).toContain("[REDACTED]");
  });

  it("detects and redacts Slack tokens", () => {
    const text = "SLACK_TOKEN=xoxb-1234567890-abcdef";
    const redacted = redactor.redact(text);
    expect(redacted).not.toContain("xoxb-1234567890-abcdef");
    // The generic token= rule fires after the specific xoxb- rule, producing [REDACTED]
    expect(redacted).toContain("[REDACTED]");
  });

  it("detects and redacts AWS Access Keys", () => {
    const text = "AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF";
    const redacted = redactor.redact(text);
    expect(redacted).not.toContain("AKIA1234567890ABCDEF");
    expect(redacted).toContain("[REDACTED_AWS_KEY]");
  });

  it("detects and redacts email addresses", () => {
    const text = "Contact user@example.com for support";
    const redacted = redactor.redact(text);
    expect(redacted).not.toContain("user@example.com");
    expect(redacted).toContain("[REDACTED_EMAIL]");
  });

  it("detects and redacts IP addresses", () => {
    const text = "Server at 192.168.1.100 is responding";
    const redacted = redactor.redact(text);
    expect(redacted).not.toContain("192.168.1.100");
    expect(redacted).toContain("[REDACTED_IP]");
  });

  it("detects and redacts credit card numbers", () => {
    const text = "Card: 4111 1111 1111 1111 was charged";
    const redacted = redactor.redact(text);
    expect(redacted).not.toContain("4111 1111 1111 1111");
    expect(redacted).toContain("[REDACTED_CC]");
  });

  it("detects and redacts credit card numbers with dashes", () => {
    const text = "CC number 4111-1111-1111-1111 end";
    const redacted = redactor.redact(text);
    expect(redacted).not.toContain("4111-1111-1111-1111");
    expect(redacted).toContain("[REDACTED_CC]");
  });

  it("detects and redacts JWT tokens", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const text = `Authorization: Bearer ${jwt}`;
    const redacted = redactor.redact(text);
    expect(redacted).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");

    const matches = redactor.detect(text);
    expect(matches.some((m) => m.rule === "JWT Token")).toBe(true);
  });

  it("detects and redacts SSH private keys", () => {
    const text = `Here is a key:
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF4PbnGcY5unA67hiQ==
-----END RSA PRIVATE KEY-----
done`;
    const redacted = redactor.redact(text);
    expect(redacted).not.toContain("MIIEowIBAAKCAQEA0Z3VS5JJcds3xfn");
    expect(redacted).toContain("[REDACTED_PRIVATE_KEY]");

    const matches = redactor.detect(text);
    expect(matches.some((m) => m.rule === "Private Key")).toBe(true);
  });

  it("detects and redacts OPENSSH private keys", () => {
    const text = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAA==
-----END OPENSSH PRIVATE KEY-----`;
    const redacted = redactor.redact(text);
    expect(redacted).not.toContain("b3BlbnNzaC1rZXktdjEAAAAA");
    expect(redacted).toContain("[REDACTED_PRIVATE_KEY]");
  });

  it("detects password assignments", () => {
    const text = 'const dbPassword = "super_secret_123";';
    const redacted = redactor.redact(text);
    // password= assignment rule should fire
    expect(redacted).toContain("[REDACTED]");
    expect(redacted).not.toContain("super_secret_123");
  });

  it("detects multiple PII types in the same text", () => {
    const text = `
Send email to admin@corp.com from 10.0.0.1.
API key: sk-1234567890abcdefghijklmnopqrstuv
Token: ghp_abcdefghijklmnopqrstuvwxyz0123456789ABCD
`;
    const matches = redactor.detect(text);
    const rules = new Set(matches.map((m) => m.rule));
    expect(rules.has("Email")).toBe(true);
    expect(rules.has("IP Address")).toBe(true);
    expect(rules.has("OpenAI API key")).toBe(true);
    expect(rules.has("GitHub PAT")).toBe(true);

    const redacted = redactor.redact(text);
    expect(redacted).not.toContain("admin@corp.com");
    expect(redacted).not.toContain("10.0.0.1");
    expect(redacted).not.toContain("sk-1234567890abcdefghijklmnopqrstuv");
    expect(redacted).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789ABCD");
  });

  it("redactObject redacts sensitive keys regardless of value format", () => {
    const obj = {
      username: "alice",
      password: "hunter2",
      apiKey: "sk-test123456789012345678901234",
      data: { token: "abc123", nested: { secret: "xyz" } },
    };
    const redacted = redactor.redactObject(obj);
    expect(redacted.password).toBe("[REDACTED]");
    expect(redacted.apiKey).toBe("[REDACTED]");
    expect(redacted.data.token).toBe("[REDACTED]");
    expect(redacted.data.nested.secret).toBe("[REDACTED]");
    // Non-sensitive keys preserved
    expect(redacted.username).toBe("alice");
  });

  it("redactObject handles null and undefined gracefully", () => {
    expect(redactor.redactObject(null)).toBeNull();
    expect(redactor.redactObject(undefined)).toBeUndefined();
  });

  it("redactObject handles arrays", () => {
    const arr = ["user@example.com", "clean text", "sk-abcdefghijklmnopqrstuvwxyz123456"];
    const redacted = redactor.redactObject(arr);
    expect(redacted[0]).toContain("[REDACTED_EMAIL]");
    expect(redacted[1]).toBe("clean text");
    expect(redacted[2]).toContain("[REDACTED_API_KEY]");
  });

  it("addPattern allows custom patterns to be added", () => {
    redactor.addPattern(/CUSTOM_SECRET_[A-Z]+/g, "[CUSTOM_REDACTED]", "Custom Secret");
    const text = "value is CUSTOM_SECRET_FOOBAR end";
    const redacted = redactor.redact(text);
    expect(redacted).toContain("[CUSTOM_REDACTED]");
    expect(redacted).not.toContain("CUSTOM_SECRET_FOOBAR");
  });

  it("getRedactionStats returns counts per rule", () => {
    const text = "user@a.com and admin@b.com and 10.0.0.1";
    const stats = redactor.getRedactionStats(text);
    const emailStat = stats.find((s) => s.rule === "Email");
    expect(emailStat).toBeDefined();
    expect(emailStat!.count).toBe(2);
    const ipStat = stats.find((s) => s.rule === "IP Address");
    expect(ipStat).toBeDefined();
    expect(ipStat!.count).toBe(1);
  });
});

describe("redaction benchmark with custom samples", () => {
  it("handles empty expected secrets (control sample)", () => {
    const redactor = new PrivacyRedactor();
    const samples: RedactionBenchmarkSample[] = [
      {
        id: "no-secrets",
        text: "Just some regular code with variables and functions",
        expectedSecrets: [],
      },
    ];
    const report = runRedactionBenchmark(redactor, samples);
    expect(report.sampleCount).toBe(1);
    // No true positives, no false negatives expected
    expect(report.metrics.falseNegatives).toBe(0);
  });

  it("correctly measures false negatives for unrecognized patterns", () => {
    const redactor = new PrivacyRedactor();
    const samples: RedactionBenchmarkSample[] = [
      {
        id: "custom-secret",
        text: "MyCustomSecret=XYZ_ULTRA_SECRET_VALUE_42",
        expectedSecrets: ["XYZ_ULTRA_SECRET_VALUE_42"],
      },
    ];
    const report = runRedactionBenchmark(redactor, samples);
    // The redactor does not have a rule for this made-up format
    expect(report.metrics.falseNegatives).toBeGreaterThanOrEqual(1);
    expect(report.metrics.recall).toBeLessThan(1);
  });

  it("correctly measures true positives for known patterns", () => {
    const redactor = new PrivacyRedactor();
    const samples: RedactionBenchmarkSample[] = [
      {
        id: "known-email",
        text: "Contact support@example.com",
        expectedSecrets: ["support@example.com"],
      },
    ];
    const report = runRedactionBenchmark(redactor, samples);
    expect(report.metrics.truePositives).toBe(1);
    expect(report.metrics.falseNegatives).toBe(0);
    expect(report.metrics.recall).toBe(1);
  });

  it("handles samples with mixed hits and misses", () => {
    const redactor = new PrivacyRedactor();
    const samples: RedactionBenchmarkSample[] = [
      {
        id: "mixed",
        text: "email: admin@test.org and custom_value=NOTDETECTABLE",
        expectedSecrets: ["admin@test.org", "NOTDETECTABLE"],
      },
    ];
    const report = runRedactionBenchmark(redactor, samples);
    // Email should be detected (TP=1), NOTDETECTABLE should be missed (FN=1)
    expect(report.metrics.truePositives).toBeGreaterThanOrEqual(1);
    expect(report.metrics.falseNegatives).toBeGreaterThanOrEqual(1);
    expect(report.metrics.precision).toBeGreaterThan(0);
    expect(report.metrics.recall).toBeLessThan(1);
  });

  it("evaluate returns zero metrics for empty samples array", () => {
    const redactor = new PrivacyRedactor();
    const metrics = redactor.evaluate([]);
    expect(metrics.truePositives).toBe(0);
    expect(metrics.falsePositives).toBe(0);
    expect(metrics.falseNegatives).toBe(0);
    expect(metrics.precision).toBe(0);
    expect(metrics.recall).toBe(0);
    expect(metrics.f1).toBe(0);
  });
});
