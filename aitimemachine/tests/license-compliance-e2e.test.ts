import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assessLicenseCompliance,
  assertLicenseCompliance,
  type LicenseClass,
} from "../src/compliance/license-policy.js";
import { saveConsent } from "../src/auth/consent-policy.js";
import { TrainingExporter } from "../src/export/training-exporter.js";

describe("license compliance - unknown licenses", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-lic-unknown-"));
    fs.mkdirSync(path.join(projectDir, ".aitimemachine"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("classifies missing license as unknown", () => {
    // No package.json, no LICENSE file
    const assessment = assessLicenseCompliance(projectDir, "dataset_export");
    expect(assessment.licenseClass).toBe("unknown");
    expect(assessment.source).toBe("none");
    expect(assessment.detectedLicense).toBe("unknown");
  });

  it("classifies unrecognized SPDX identifiers as unknown", () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", license: "WTFPL-2.0" }),
      "utf-8"
    );
    const assessment = assessLicenseCompliance(projectDir, "dataset_export");
    expect(assessment.licenseClass).toBe("unknown");
    expect(assessment.source).toBe("package.json");
  });

  it("unknown license is allowed for dataset_export by default", () => {
    // Default allowed classes include "unknown" for dataset_export
    const assessment = assessLicenseCompliance(projectDir, "dataset_export");
    expect(assessment.allowed).toBe(true);
  });

  it("unknown license is allowed for repo_ingest by default", () => {
    const assessment = assessLicenseCompliance(projectDir, "repo_ingest");
    expect(assessment.allowed).toBe(true);
  });

  it("classifies package.json with no license field as unknown", () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0" }),
      "utf-8"
    );
    const assessment = assessLicenseCompliance(projectDir, "dataset_export");
    // package.json exists but has no license field, falls through to LICENSE file or "unknown"
    expect(assessment.licenseClass).toBe("unknown");
  });

  it("classifies empty license string as unknown", () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", license: "" }),
      "utf-8"
    );
    const assessment = assessLicenseCompliance(projectDir, "dataset_export");
    // Empty string returns null from readLicenseFromPackageJson, falls to file, then "unknown"
    expect(assessment.licenseClass).toBe("unknown");
  });

  it("handles malformed package.json gracefully", () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      "{ broken json !!!",
      "utf-8"
    );
    const assessment = assessLicenseCompliance(projectDir, "dataset_export");
    expect(assessment.licenseClass).toBe("unknown");
    expect(assessment.source).toBe("none");
  });
});

describe("license compliance - dual-licensed repos (SPDX expressions)", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-lic-dual-"));
    fs.mkdirSync(path.join(projectDir, ".aitimemachine"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("OR expression uses most permissive: MIT OR GPL-3.0 => permissive", () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", license: "MIT OR GPL-3.0" }),
      "utf-8"
    );
    const assessment = assessLicenseCompliance(projectDir, "dataset_export");
    expect(assessment.licenseClass).toBe("permissive");
    expect(assessment.allowed).toBe(true);
    expect(assessment.dualLicenseClasses).toContain("permissive");
    expect(assessment.dualLicenseClasses).toContain("strong_copyleft");
  });

  it("OR expression with parentheses: (Apache-2.0 OR MIT) => permissive", () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", license: "(Apache-2.0 OR MIT)" }),
      "utf-8"
    );
    const assessment = assessLicenseCompliance(projectDir, "dataset_export");
    expect(assessment.licenseClass).toBe("permissive");
    expect(assessment.allowed).toBe(true);
  });

  it("AND expression uses most restrictive: MIT AND GPL-3.0 => strong_copyleft", () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", license: "MIT AND GPL-3.0" }),
      "utf-8"
    );
    const assessment = assessLicenseCompliance(projectDir, "dataset_export");
    expect(assessment.licenseClass).toBe("strong_copyleft");
    expect(assessment.allowed).toBe(false);
    expect(assessment.dualLicenseClasses).toContain("permissive");
    expect(assessment.dualLicenseClasses).toContain("strong_copyleft");
  });

  it("OR expression with GPL choices: GPL-2.0 OR Apache-2.0 => permissive (user can choose)", () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", license: "GPL-2.0 OR Apache-2.0" }),
      "utf-8"
    );
    const assessment = assessLicenseCompliance(projectDir, "dataset_export");
    expect(assessment.licenseClass).toBe("permissive");
    expect(assessment.allowed).toBe(true);
  });

  it("AND expression with weak_copyleft: EPL-1.0 AND MIT => weak_copyleft", () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", license: "EPL-1.0 AND MIT" }),
      "utf-8"
    );
    const assessment = assessLicenseCompliance(projectDir, "dataset_export");
    expect(assessment.licenseClass).toBe("weak_copyleft");
    expect(assessment.allowed).toBe(true);
  });

  it("OR expression GPL OR AGPL => strong_copyleft (both are copyleft)", () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", license: "GPL-3.0 OR AGPL-3.0" }),
      "utf-8"
    );
    const assessment = assessLicenseCompliance(projectDir, "dataset_export");
    // Both are strong_copyleft, least restrictive is still strong_copyleft
    expect(assessment.licenseClass).toBe("strong_copyleft");
    expect(assessment.allowed).toBe(false);
  });
});

describe("license compliance - license changes mid-export", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-lic-change-"));
    fs.mkdirSync(path.join(projectDir, ".aitimemachine"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("re-assessment after license change reflects new license", () => {
    // Start with MIT
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", license: "MIT" }),
      "utf-8"
    );
    const first = assessLicenseCompliance(projectDir, "dataset_export");
    expect(first.licenseClass).toBe("permissive");
    expect(first.allowed).toBe(true);

    // Change to GPL
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", license: "GPL-3.0" }),
      "utf-8"
    );
    const second = assessLicenseCompliance(projectDir, "dataset_export");
    expect(second.licenseClass).toBe("strong_copyleft");
    expect(second.allowed).toBe(false);
  });

  it("assertLicenseCompliance throws after license changes to restrictive", () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", license: "MIT" }),
      "utf-8"
    );
    // First call should succeed
    expect(() => assertLicenseCompliance(projectDir, "dataset_export")).not.toThrow();

    // Change license to restrictive
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", license: "AGPL-3.0-only" }),
      "utf-8"
    );
    // Second call should throw
    expect(() => assertLicenseCompliance(projectDir, "dataset_export")).toThrow(
      /License policy blocked dataset_export/
    );
  });

  it("license removal causes fallback to LICENSE file or unknown", () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", license: "MIT" }),
      "utf-8"
    );
    const first = assessLicenseCompliance(projectDir, "dataset_export");
    expect(first.source).toBe("package.json");

    // Remove license field
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0" }),
      "utf-8"
    );
    const second = assessLicenseCompliance(projectDir, "dataset_export");
    // Falls back to license-file or none
    expect(second.source).not.toBe("package.json");
  });
});

describe("license compliance - detection from LICENSE file", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-lic-file-"));
    fs.mkdirSync(path.join(projectDir, ".aitimemachine"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("reads MIT from LICENSE file when package.json has no license", () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0" }),
      "utf-8"
    );
    fs.writeFileSync(
      path.join(projectDir, "LICENSE"),
      "MIT License\n\nCopyright (c) 2024 Test\n\nPermission is hereby granted...",
      "utf-8"
    );
    const assessment = assessLicenseCompliance(projectDir, "dataset_export");
    expect(assessment.source).toBe("license-file");
    expect(assessment.licenseClass).toBe("permissive");
  });

  it("reads GPL from LICENSE.md file", () => {
    fs.writeFileSync(
      path.join(projectDir, "LICENSE.md"),
      "GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007\n\n...",
      "utf-8"
    );
    const assessment = assessLicenseCompliance(projectDir, "dataset_export");
    expect(assessment.source).toBe("license-file");
    expect(assessment.licenseClass).toBe("strong_copyleft");
    expect(assessment.allowed).toBe(false);
  });

  it("reads from LICENSE.txt file", () => {
    fs.writeFileSync(
      path.join(projectDir, "LICENSE.txt"),
      "Apache License, Version 2.0\n\n...",
      "utf-8"
    );
    const assessment = assessLicenseCompliance(projectDir, "dataset_export");
    expect(assessment.source).toBe("license-file");
    expect(assessment.licenseClass).toBe("permissive");
  });

  it("reads from COPYING file", () => {
    fs.writeFileSync(
      path.join(projectDir, "COPYING"),
      "This program is released under the BSD 3-Clause License.\n\n...",
      "utf-8"
    );
    const assessment = assessLicenseCompliance(projectDir, "dataset_export");
    expect(assessment.source).toBe("license-file");
    expect(assessment.licenseClass).toBe("permissive");
  });

  it("detects proprietary license from LICENSE file", () => {
    fs.writeFileSync(
      path.join(projectDir, "LICENSE"),
      "PROPRIETARY SOFTWARE LICENSE\nAll rights reserved.\nNo redistribution without permission.",
      "utf-8"
    );
    const assessment = assessLicenseCompliance(projectDir, "dataset_export");
    expect(assessment.source).toBe("license-file");
    expect(assessment.licenseClass).toBe("proprietary");
    expect(assessment.allowed).toBe(false);
  });

  it("package.json license takes priority over LICENSE file", () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", license: "MIT" }),
      "utf-8"
    );
    fs.writeFileSync(
      path.join(projectDir, "LICENSE"),
      "GNU GENERAL PUBLIC LICENSE Version 3",
      "utf-8"
    );
    const assessment = assessLicenseCompliance(projectDir, "dataset_export");
    expect(assessment.source).toBe("package.json");
    expect(assessment.licenseClass).toBe("permissive");
  });
});

describe("license compliance - integration: restrictive license blocks training export", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-lic-integ-"));
    fs.mkdirSync(path.join(projectDir, ".aitimemachine"), { recursive: true });
    saveConsent(projectDir, {
      policy: { operational_capture: true, training_export: true },
    });
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("GPL-3.0 blocks TrainingExporter.exportTrainingData", async () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", license: "GPL-3.0" }),
      "utf-8"
    );

    const exporter = new TrainingExporter();
    await expect(
      exporter.exportTrainingData({
        projectPath: projectDir,
        outputPath: path.join(projectDir, "training.jsonl"),
      })
    ).rejects.toThrow(/License policy blocked dataset_export/);
  });

  it("AGPL-3.0 blocks TrainingExporter.exportTrainingData", async () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", license: "AGPL-3.0" }),
      "utf-8"
    );

    const exporter = new TrainingExporter();
    await expect(
      exporter.exportTrainingData({
        projectPath: projectDir,
        outputPath: path.join(projectDir, "training.jsonl"),
      })
    ).rejects.toThrow(/License policy blocked dataset_export/);
  });

  it("proprietary license blocks export", async () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", license: "Proprietary" }),
      "utf-8"
    );

    const exporter = new TrainingExporter();
    await expect(
      exporter.exportTrainingData({
        projectPath: projectDir,
        outputPath: path.join(projectDir, "training.jsonl"),
      })
    ).rejects.toThrow(/License policy blocked dataset_export/);
  });

  it("MIT allows TrainingExporter.exportTrainingData", async () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", license: "MIT" }),
      "utf-8"
    );

    const exporter = new TrainingExporter();
    const result = await exporter.exportTrainingData({
      projectPath: projectDir,
      outputPath: path.join(projectDir, "training.jsonl"),
    });
    expect(result.success).toBe(true);
  });

  it("dual-license MIT OR GPL-3.0 allows export (OR picks permissive)", async () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", license: "MIT OR GPL-3.0" }),
      "utf-8"
    );

    const exporter = new TrainingExporter();
    const result = await exporter.exportTrainingData({
      projectPath: projectDir,
      outputPath: path.join(projectDir, "training.jsonl"),
    });
    expect(result.success).toBe(true);
  });

  it("dual-license MIT AND GPL-3.0 blocks export (AND picks restrictive)", async () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", license: "MIT AND GPL-3.0" }),
      "utf-8"
    );

    const exporter = new TrainingExporter();
    await expect(
      exporter.exportTrainingData({
        projectPath: projectDir,
        outputPath: path.join(projectDir, "training.jsonl"),
      })
    ).rejects.toThrow(/License policy blocked dataset_export/);
  });
});

describe("license compliance - all license classifications", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-lic-class-"));
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  const permissiveLicenses = ["MIT", "Apache-2.0", "BSD-3-Clause", "ISC", "Unlicense", "Zlib", "CC0-1.0"];
  const strongCopyleftLicenses = ["GPL-2.0", "GPL-3.0", "AGPL-3.0", "LGPL-2.1", "MPL-2.0", "EUPL-1.2"];
  const weakCopyleftLicenses = ["EPL-1.0", "EPL-2.0", "CDDL-1.0"];
  const proprietaryLicenses = ["Proprietary", "All Rights Reserved", "Commercial License"];

  for (const lic of permissiveLicenses) {
    it(`classifies "${lic}" as permissive`, () => {
      fs.writeFileSync(
        path.join(projectDir, "package.json"),
        JSON.stringify({ name: "x", version: "1.0.0", license: lic }),
        "utf-8"
      );
      const assessment = assessLicenseCompliance(projectDir, "dataset_export");
      expect(assessment.licenseClass).toBe("permissive");
      expect(assessment.allowed).toBe(true);
    });
  }

  for (const lic of strongCopyleftLicenses) {
    it(`classifies "${lic}" as strong_copyleft and blocks dataset_export`, () => {
      fs.writeFileSync(
        path.join(projectDir, "package.json"),
        JSON.stringify({ name: "x", version: "1.0.0", license: lic }),
        "utf-8"
      );
      const assessment = assessLicenseCompliance(projectDir, "dataset_export");
      expect(assessment.licenseClass).toBe("strong_copyleft");
      expect(assessment.allowed).toBe(false);
    });
  }

  for (const lic of strongCopyleftLicenses) {
    it(`classifies "${lic}" as strong_copyleft and allows repo_ingest`, () => {
      fs.writeFileSync(
        path.join(projectDir, "package.json"),
        JSON.stringify({ name: "x", version: "1.0.0", license: lic }),
        "utf-8"
      );
      const assessment = assessLicenseCompliance(projectDir, "repo_ingest");
      expect(assessment.licenseClass).toBe("strong_copyleft");
      expect(assessment.allowed).toBe(true);
    });
  }

  for (const lic of weakCopyleftLicenses) {
    it(`classifies "${lic}" as weak_copyleft`, () => {
      fs.writeFileSync(
        path.join(projectDir, "package.json"),
        JSON.stringify({ name: "x", version: "1.0.0", license: lic }),
        "utf-8"
      );
      const assessment = assessLicenseCompliance(projectDir, "dataset_export");
      expect(assessment.licenseClass).toBe("weak_copyleft");
      expect(assessment.allowed).toBe(true);
    });
  }

  for (const lic of proprietaryLicenses) {
    it(`classifies "${lic}" as proprietary and blocks dataset_export`, () => {
      fs.writeFileSync(
        path.join(projectDir, "package.json"),
        JSON.stringify({ name: "x", version: "1.0.0", license: lic }),
        "utf-8"
      );
      const assessment = assessLicenseCompliance(projectDir, "dataset_export");
      expect(assessment.licenseClass).toBe("proprietary");
      expect(assessment.allowed).toBe(false);
    });
  }
});

describe("license compliance - endpoint structured data verification", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-lic-endpoint-"));
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("returns all required fields in assessment response", () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "test-project", version: "1.0.0", license: "MIT" }),
      "utf-8"
    );

    const ingest = assessLicenseCompliance(projectDir, "repo_ingest");
    const dataset = assessLicenseCompliance(projectDir, "dataset_export");

    // Simulate the compliance endpoint response
    const response = {
      projectPath: projectDir,
      repoIngest: ingest,
      datasetExport: dataset,
    };

    // Verify structure matches what the API endpoint returns
    expect(response.projectPath).toBe(projectDir);

    // Verify repoIngest fields
    expect(response.repoIngest).toHaveProperty("projectPath");
    expect(response.repoIngest).toHaveProperty("detectedLicense");
    expect(response.repoIngest).toHaveProperty("licenseClass");
    expect(response.repoIngest).toHaveProperty("source");
    expect(response.repoIngest).toHaveProperty("allowed");
    expect(response.repoIngest).toHaveProperty("reason");
    expect(typeof response.repoIngest.projectPath).toBe("string");
    expect(typeof response.repoIngest.detectedLicense).toBe("string");
    expect(typeof response.repoIngest.licenseClass).toBe("string");
    expect(typeof response.repoIngest.source).toBe("string");
    expect(typeof response.repoIngest.allowed).toBe("boolean");
    expect(typeof response.repoIngest.reason).toBe("string");

    // Verify datasetExport fields
    expect(response.datasetExport).toHaveProperty("projectPath");
    expect(response.datasetExport).toHaveProperty("detectedLicense");
    expect(response.datasetExport).toHaveProperty("licenseClass");
    expect(response.datasetExport).toHaveProperty("source");
    expect(response.datasetExport).toHaveProperty("allowed");
    expect(response.datasetExport).toHaveProperty("reason");
  });

  it("endpoint response includes dual license info for SPDX expressions", () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", license: "MIT OR GPL-3.0" }),
      "utf-8"
    );

    const dataset = assessLicenseCompliance(projectDir, "dataset_export");
    const response = {
      projectPath: projectDir,
      repoIngest: assessLicenseCompliance(projectDir, "repo_ingest"),
      datasetExport: dataset,
    };

    expect(response.datasetExport.dualLicenseClasses).toBeDefined();
    expect(response.datasetExport.dualLicenseClasses).toContain("permissive");
    expect(response.datasetExport.dualLicenseClasses).toContain("strong_copyleft");
  });

  it("endpoint response does not include dualLicenseClasses for simple licenses", () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", license: "MIT" }),
      "utf-8"
    );

    const dataset = assessLicenseCompliance(projectDir, "dataset_export");
    expect(dataset.dualLicenseClasses).toBeUndefined();
  });

  it("license class is one of the valid enum values", () => {
    const validClasses: LicenseClass[] = [
      "permissive",
      "weak_copyleft",
      "strong_copyleft",
      "proprietary",
      "unknown",
    ];

    // Test with MIT
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", license: "MIT" }),
      "utf-8"
    );
    const assessment = assessLicenseCompliance(projectDir, "dataset_export");
    expect(validClasses).toContain(assessment.licenseClass);
  });

  it("source is one of the valid enum values", () => {
    const validSources = ["package.json", "license-file", "none"];

    // package.json source
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", license: "MIT" }),
      "utf-8"
    );
    expect(validSources).toContain(
      assessLicenseCompliance(projectDir, "dataset_export").source
    );

    // Remove package.json, add LICENSE file
    fs.unlinkSync(path.join(projectDir, "package.json"));
    fs.writeFileSync(path.join(projectDir, "LICENSE"), "MIT License\n...", "utf-8");
    expect(validSources).toContain(
      assessLicenseCompliance(projectDir, "dataset_export").source
    );

    // Remove LICENSE file too
    fs.unlinkSync(path.join(projectDir, "LICENSE"));
    expect(validSources).toContain(
      assessLicenseCompliance(projectDir, "dataset_export").source
    );
  });

  it("reason string includes license class and target", () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", license: "MIT" }),
      "utf-8"
    );
    const assessment = assessLicenseCompliance(projectDir, "dataset_export");
    expect(assessment.reason).toContain("permissive");
    expect(assessment.reason).toContain("dataset_export");
  });

  it("reason string for blocked license indicates not allowed", () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", license: "GPL-3.0" }),
      "utf-8"
    );
    const assessment = assessLicenseCompliance(projectDir, "dataset_export");
    expect(assessment.reason).toContain("strong_copyleft");
    expect(assessment.reason).toContain("not allowed");
  });
});

describe("license compliance - legacy package.json licenses array", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aitm-lic-legacy-"));
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it("reads license from licenses[0].type (legacy npm format)", () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({
        name: "x",
        version: "1.0.0",
        licenses: [{ type: "MIT", url: "https://opensource.org/licenses/MIT" }],
      }),
      "utf-8"
    );
    const assessment = assessLicenseCompliance(projectDir, "dataset_export");
    expect(assessment.licenseClass).toBe("permissive");
    expect(assessment.source).toBe("package.json");
  });

  it("falls back when licenses array is empty", () => {
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ name: "x", version: "1.0.0", licenses: [] }),
      "utf-8"
    );
    const assessment = assessLicenseCompliance(projectDir, "dataset_export");
    // No license found in package.json
    expect(assessment.source).not.toBe("package.json");
  });
});
