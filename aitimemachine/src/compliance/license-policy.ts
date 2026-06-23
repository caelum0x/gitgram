import * as fs from "fs";
import * as path from "path";

export type LicenseClass = "permissive" | "weak_copyleft" | "strong_copyleft" | "proprietary" | "unknown";
export type ComplianceTarget = "repo_ingest" | "dataset_export";

export interface LicenseAssessment {
  projectPath: string;
  detectedLicense: string;
  licenseClass: LicenseClass;
  /** When a dual-license SPDX expression is detected, this contains the individual classes. */
  dualLicenseClasses?: LicenseClass[];
  source: "package.json" | "license-file" | "none";
  allowed: boolean;
  reason: string;
}

const STRONG_COPYLEFT = ["gpl", "agpl", "lgpl", "mpl", "eupl", "cecill", "general public license"];
const WEAK_COPYLEFT = ["epl", "cddl", "osl"];
const PERMISSIVE = ["mit", "apache", "bsd", "isc", "unlicense", "zlib", "cc0"];
const PROPRIETARY_HINTS = ["proprietary", "all rights reserved", "commercial"];

function normalize(v: string): string {
  return v.trim().toLowerCase();
}

function classifySingleLicense(license: string): LicenseClass {
  if (!license) return "unknown";
  if (PROPRIETARY_HINTS.some((h) => license.includes(h))) return "proprietary";
  if (STRONG_COPYLEFT.some((h) => license.includes(h))) return "strong_copyleft";
  if (WEAK_COPYLEFT.some((h) => license.includes(h))) return "weak_copyleft";
  if (PERMISSIVE.some((h) => license.includes(h))) return "permissive";
  return "unknown";
}

/**
 * Parse an SPDX expression and return individual license classes.
 * Handles: "MIT OR GPL-3.0", "(MIT OR Apache-2.0)", "MIT AND GPL-3.0"
 */
function parseSpdxExpression(raw: string): LicenseClass[] {
  const cleaned = normalize(raw).replace(/[()]/g, "");
  // Split on OR or AND (case-insensitive) with surrounding whitespace
  const parts = cleaned.split(/\s+(?:or|and)\s+/i).map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) return [];
  return parts.map(classifySingleLicense);
}

function isDualLicense(raw: string): boolean {
  const cleaned = normalize(raw);
  return /\s+(or|and)\s+/i.test(cleaned);
}

const LICENSE_CLASS_RANK: Record<LicenseClass, number> = {
  proprietary: 4,
  strong_copyleft: 3,
  weak_copyleft: 2,
  unknown: 1,
  permissive: 0,
};

/**
 * For OR expressions, use the MOST permissive license (user can choose).
 * For AND expressions, use the MOST restrictive license (both must comply).
 */
function classifyLicense(raw: string): LicenseClass {
  const license = normalize(raw);
  if (!license) return "unknown";

  if (isDualLicense(raw)) {
    const classes = parseSpdxExpression(raw);
    if (classes.length > 0) {
      const isOr = /\s+or\s+/i.test(license);
      if (isOr) {
        // User can choose: pick most permissive
        return classes.reduce((best, c) =>
          LICENSE_CLASS_RANK[c] < LICENSE_CLASS_RANK[best] ? c : best
        );
      } else {
        // Must comply with all: pick most restrictive
        return classes.reduce((worst, c) =>
          LICENSE_CLASS_RANK[c] > LICENSE_CLASS_RANK[worst] ? c : worst
        );
      }
    }
  }

  return classifySingleLicense(license);
}

function readLicenseFromPackageJson(projectPath: string): string | null {
  try {
    const pkgPath = path.join(projectPath, "package.json");
    if (!fs.existsSync(pkgPath)) return null;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { license?: string; licenses?: Array<{ type?: string }> };
    if (typeof pkg.license === "string") return pkg.license;
    if (Array.isArray(pkg.licenses) && pkg.licenses[0]?.type) return pkg.licenses[0].type;
    return null;
  } catch {
    return null;
  }
}

function readLicenseFromFile(projectPath: string): string | null {
  const files = ["LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING"];
  for (const name of files) {
    const file = path.join(projectPath, name);
    if (!fs.existsSync(file)) continue;
    try {
      const snippet = fs.readFileSync(file, "utf-8").slice(0, 2048);
      return snippet;
    } catch {
      // ignore
    }
  }
  return null;
}

function defaultAllowedClasses(target: ComplianceTarget): LicenseClass[] {
  if (target === "dataset_export") {
    return ["permissive", "weak_copyleft", "unknown"];
  }
  return ["permissive", "weak_copyleft", "strong_copyleft", "unknown"];
}

function getAllowedClasses(target: ComplianceTarget, env: NodeJS.ProcessEnv = process.env): LicenseClass[] {
  const key = target === "dataset_export" ? "AITM_DATASET_EXPORT_ALLOWED_LICENSES" : "AITM_REPO_INGEST_ALLOWED_LICENSES";
  const raw = env[key];
  if (!raw) return defaultAllowedClasses(target);
  const set = raw
    .split(",")
    .map((s) => normalize(s))
    .filter(Boolean) as LicenseClass[];
  return set.length > 0 ? set : defaultAllowedClasses(target);
}

export function assessLicenseCompliance(projectPath: string, target: ComplianceTarget): LicenseAssessment {
  const fromPkg = readLicenseFromPackageJson(projectPath);
  const fromFile = fromPkg ? null : readLicenseFromFile(projectPath);
  const detected = fromPkg || fromFile || "unknown";
  const source: LicenseAssessment["source"] = fromPkg ? "package.json" : fromFile ? "license-file" : "none";
  const licenseClass = classifyLicense(detected);
  const allowedClasses = getAllowedClasses(target);
  const allowed = allowedClasses.includes(licenseClass);
  const dualClasses = isDualLicense(detected) ? parseSpdxExpression(detected) : undefined;

  return {
    projectPath,
    detectedLicense: detected,
    licenseClass,
    ...(dualClasses && dualClasses.length > 0 ? { dualLicenseClasses: dualClasses } : {}),
    source,
    allowed,
    reason: allowed
      ? `License class ${licenseClass} is allowed for ${target}`
      : `License class ${licenseClass} is not allowed for ${target}`,
  };
}

export function assertLicenseCompliance(projectPath: string, target: ComplianceTarget): LicenseAssessment {
  const assessment = assessLicenseCompliance(projectPath, target);
  if (!assessment.allowed) {
    throw new Error(
      `License policy blocked ${target}. Detected: ${assessment.detectedLicense} (${assessment.licenseClass}).`
    );
  }
  return assessment;
}
