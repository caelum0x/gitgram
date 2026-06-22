#!/usr/bin/env node
/**
 * OpenAPI Spec Validator
 *
 * Validates OpenAPI YAML files for:
 * - Valid YAML syntax
 * - Required OpenAPI structure (info, paths, etc.)
 * - Common issues: missing descriptions, missing response codes
 * - Consistent naming conventions
 * - Resolvable schema references
 *
 * Usage:
 *   npx tsx scripts/validate-openapi-spec.ts
 *
 * Exit codes:
 *   0 - All specs valid
 *   1 - Validation errors found
 */

import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ValidationIssue {
  severity: "error" | "warning";
  path: string;
  message: string;
}

interface ParsedSpec {
  openapi?: string;
  info?: { title?: string; version?: string; description?: string };
  paths?: Record<string, Record<string, any>>;
  components?: {
    schemas?: Record<string, any>;
    securitySchemes?: Record<string, any>;
  };
}

// ---------------------------------------------------------------------------
// Simple YAML parser (enough for OpenAPI validation without dependencies)
// ---------------------------------------------------------------------------

function parseYAML(content: string): ParsedSpec {
  const result: any = {};
  const lines = content.split("\n");
  const stack: Array<{ indent: number; obj: any; key?: string }> = [
    { indent: -1, obj: result },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip empty lines and comments
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue;

    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;
    const trimmed = line.trim();

    // Pop stack until we find the right parent
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];

    // Match key: value
    const kvMatch = trimmed.match(/^([^:]+?):\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim().replace(/^["']|["']$/g, "");
      const value = kvMatch[2].trim();

      if (value === "" || value === "|" || value === ">") {
        // Object or block scalar
        const newObj: any = {};
        if (Array.isArray(parent.obj)) {
          parent.obj.push({ [key]: newObj });
        } else {
          parent.obj[key] = newObj;
        }
        stack.push({ indent, obj: newObj, key });
      } else {
        // Simple value
        let parsedValue: any = value;
        if (value === "true") parsedValue = true;
        else if (value === "false") parsedValue = false;
        else if (/^\d+$/.test(value)) parsedValue = parseInt(value, 10);
        else parsedValue = value.replace(/^["']|["']$/g, "");

        if (Array.isArray(parent.obj)) {
          parent.obj.push({ [key]: parsedValue });
        } else {
          parent.obj[key] = parsedValue;
        }
      }
    } else if (trimmed.startsWith("- ")) {
      // Array item
      const itemValue = trimmed.slice(2).trim();
      if (!Array.isArray(parent.obj)) {
        // Convert parent's value to array
        const parentParent = stack.length > 1 ? stack[stack.length - 2] : null;
        if (parentParent && parent.key) {
          const arr: any[] = [];
          parentParent.obj[parent.key] = arr;
          parent.obj = arr;
        }
      }
      if (Array.isArray(parent.obj)) {
        parent.obj.push(itemValue.replace(/^["']|["']$/g, ""));
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Validation rules
// ---------------------------------------------------------------------------

function validateSpecStructure(content: string, filePath: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const fileName = path.basename(filePath);

  // Check YAML can be parsed without errors
  let spec: ParsedSpec;
  try {
    spec = parseYAML(content);
  } catch (err: any) {
    issues.push({
      severity: "error",
      path: fileName,
      message: `YAML parse error: ${err.message}`,
    });
    return issues;
  }

  // Check required top-level fields
  if (!spec.openapi) {
    issues.push({
      severity: "error",
      path: `${fileName}/openapi`,
      message: "Missing required field: openapi (version string)",
    });
  } else if (!spec.openapi.toString().startsWith("3.")) {
    issues.push({
      severity: "warning",
      path: `${fileName}/openapi`,
      message: `OpenAPI version ${spec.openapi} may not be widely supported. Consider 3.0.x or 3.1.x`,
    });
  }

  if (!spec.info) {
    issues.push({
      severity: "error",
      path: `${fileName}/info`,
      message: "Missing required field: info",
    });
  } else {
    if (!spec.info.title) {
      issues.push({
        severity: "error",
        path: `${fileName}/info/title`,
        message: "Missing required field: info.title",
      });
    }
    if (!spec.info.version) {
      issues.push({
        severity: "error",
        path: `${fileName}/info/version`,
        message: "Missing required field: info.version",
      });
    }
    if (!spec.info.description) {
      issues.push({
        severity: "warning",
        path: `${fileName}/info/description`,
        message: "Missing recommended field: info.description",
      });
    }
  }

  if (!spec.paths || Object.keys(spec.paths).length === 0) {
    issues.push({
      severity: "error",
      path: `${fileName}/paths`,
      message: "No paths defined in spec",
    });
  }

  return issues;
}

function validatePaths(content: string, filePath: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const fileName = path.basename(filePath);
  const lines = content.split("\n");

  let inPaths = false;
  let currentPath = "";
  let currentMethod = "";
  let pathIndent = -1;
  let hasResponses = false;
  let hasSummary = false;
  let hasOperationId = false;
  let methodStartLine = 0;

  const operationIds = new Set<string>();
  const pathsFound = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (/^paths:\s*$/.test(trimmed)) {
      inPaths = true;
      pathIndent = -1;
      continue;
    }

    if (!inPaths) continue;

    // End of paths section
    if (/^\S/.test(line) && !line.startsWith(" ") && !line.startsWith("#") && trimmed !== "") {
      inPaths = false;
      continue;
    }

    // Detect path entry
    const pathMatch = trimmed.match(/^(\/[^:]*)\s*:\s*$/);
    if (pathMatch && line.match(/^\s{2}\//)) {
      // Save previous method check
      if (currentMethod && !hasResponses) {
        issues.push({
          severity: "warning",
          path: `${fileName}#${currentPath}/${currentMethod}`,
          message: `Missing responses for ${currentMethod.toUpperCase()} ${currentPath}`,
        });
      }

      currentPath = pathMatch[1].trim();
      currentMethod = "";
      hasResponses = false;
      hasSummary = false;
      hasOperationId = false;

      if (pathsFound.has(currentPath)) {
        issues.push({
          severity: "error",
          path: `${fileName}#${currentPath}`,
          message: `Duplicate path: ${currentPath}`,
        });
      }
      pathsFound.add(currentPath);

      // Check path naming convention
      if (/[A-Z]/.test(currentPath) && !currentPath.includes("{")) {
        issues.push({
          severity: "warning",
          path: `${fileName}#${currentPath}`,
          message: `Path contains uppercase characters. Use lowercase with hyphens for consistency.`,
        });
      }

      continue;
    }

    // Detect HTTP method
    const methodMatch = trimmed.match(/^(get|post|put|patch|delete)\s*:\s*$/);
    if (methodMatch && currentPath) {
      // Save previous method check
      if (currentMethod && !hasResponses) {
        issues.push({
          severity: "warning",
          path: `${fileName}#${currentPath}/${currentMethod}`,
          message: `Missing responses for ${currentMethod.toUpperCase()} ${currentPath}`,
        });
      }

      currentMethod = methodMatch[1];
      methodStartLine = i;
      hasResponses = false;
      hasSummary = false;
      hasOperationId = false;
      continue;
    }

    // Check for summary
    if (currentMethod && trimmed.startsWith("summary:")) {
      hasSummary = true;
      const summary = trimmed.replace(/^summary:\s*/, "").replace(/^["']|["']$/g, "");
      if (summary.length === 0) {
        issues.push({
          severity: "warning",
          path: `${fileName}#${currentPath}/${currentMethod}`,
          message: `Empty summary for ${currentMethod.toUpperCase()} ${currentPath}`,
        });
      }
    }

    // Check for operationId
    if (currentMethod && trimmed.startsWith("operationId:")) {
      hasOperationId = true;
      const opId = trimmed.replace(/^operationId:\s*/, "").replace(/^["']|["']$/g, "");
      if (operationIds.has(opId)) {
        issues.push({
          severity: "error",
          path: `${fileName}#${currentPath}/${currentMethod}`,
          message: `Duplicate operationId: ${opId}`,
        });
      }
      operationIds.add(opId);
    }

    // Check for responses
    if (currentMethod && trimmed === "responses:") {
      hasResponses = true;
    }
  }

  // Check last method
  if (currentMethod && !hasResponses) {
    issues.push({
      severity: "warning",
      path: `${fileName}#${currentPath}/${currentMethod}`,
      message: `Missing responses for ${currentMethod.toUpperCase()} ${currentPath}`,
    });
  }

  return issues;
}

function validateSchemaRefs(content: string, filePath: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const fileName = path.basename(filePath);

  // Find all $ref references
  const refRegex = /\$ref:\s*["']?#\/components\/schemas\/(\w+)["']?/g;
  let match: RegExpExecArray | null;
  const referencedSchemas = new Set<string>();

  while ((match = refRegex.exec(content)) !== null) {
    referencedSchemas.add(match[1]);
  }

  // Find all defined schemas
  const definedSchemas = new Set<string>();
  const schemaDefRegex = /^\s{4}(\w+):\s*$/gm;
  let inComponents = false;
  let inSchemas = false;

  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "components:") {
      inComponents = true;
      continue;
    }
    if (inComponents && trimmed === "schemas:") {
      inSchemas = true;
      continue;
    }
    if (inSchemas && /^\s{4}\w+:/.test(line)) {
      const schemaName = line.trim().replace(/:.*$/, "");
      definedSchemas.add(schemaName);
    }
    // End of schemas section
    if (inSchemas && /^\s{2}\w+:/.test(line) && !line.trim().startsWith("-")) {
      if (!line.match(/^\s{4}/)) {
        inSchemas = false;
      }
    }
  }

  // Check for unresolvable references
  for (const ref of referencedSchemas) {
    if (!definedSchemas.has(ref)) {
      issues.push({
        severity: "error",
        path: `${fileName}/components/schemas/${ref}`,
        message: `Unresolvable schema reference: #/components/schemas/${ref}`,
      });
    }
  }

  // Check for unused schemas (warning only)
  for (const schema of definedSchemas) {
    if (!referencedSchemas.has(schema)) {
      issues.push({
        severity: "warning",
        path: `${fileName}/components/schemas/${schema}`,
        message: `Schema "${schema}" is defined but never referenced`,
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface SpecConfig {
  name: string;
  file: string;
}

const rootDir = path.resolve(__dirname, "..");

const specs: SpecConfig[] = [
  {
    name: "AITimeMachine API",
    file: path.join(rootDir, "aitimemachine/api-server/docs/openapi.yaml"),
  },
  {
    name: "Gitgram Backend",
    file: path.join(rootDir, "gitgram/backend/docs/openapi.yaml"),
  },
];

let totalErrors = 0;
let totalWarnings = 0;

for (const spec of specs) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`  Validating: ${spec.name}`);
  console.log(`  File: ${spec.file}`);
  console.log(`${"=".repeat(80)}`);

  if (!fs.existsSync(spec.file)) {
    console.log(`  ERROR: File not found: ${spec.file}`);
    totalErrors++;
    continue;
  }

  const content = fs.readFileSync(spec.file, "utf-8");

  // Run all validation checks
  const allIssues: ValidationIssue[] = [
    ...validateSpecStructure(content, spec.file),
    ...validatePaths(content, spec.file),
    ...validateSchemaRefs(content, spec.file),
  ];

  const errors = allIssues.filter((i) => i.severity === "error");
  const warnings = allIssues.filter((i) => i.severity === "warning");

  totalErrors += errors.length;
  totalWarnings += warnings.length;

  if (errors.length > 0) {
    console.log(`\n  ERRORS (${errors.length}):`);
    for (const issue of errors) {
      console.log(`    [ERROR]   ${issue.path}`);
      console.log(`              ${issue.message}`);
    }
  }

  if (warnings.length > 0) {
    console.log(`\n  WARNINGS (${warnings.length}):`);
    for (const issue of warnings) {
      console.log(`    [WARN]    ${issue.path}`);
      console.log(`              ${issue.message}`);
    }
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log(`\n  All checks passed.`);
  }

  // Count paths and methods
  const pathRegex = /^\s{2}\/[^:]+:\s*$/gm;
  const methodRegex = /^\s{4}(get|post|put|patch|delete):\s*$/gm;
  const pathCount = (content.match(pathRegex) || []).length;
  const methodCount = (content.match(methodRegex) || []).length;

  console.log(`\n  Stats: ${pathCount} paths, ${methodCount} operations`);
}

// Summary
console.log(`\n${"=".repeat(80)}`);
console.log("  VALIDATION SUMMARY");
console.log(`${"=".repeat(80)}`);
console.log(`  Errors:   ${totalErrors}`);
console.log(`  Warnings: ${totalWarnings}`);

if (totalErrors > 0) {
  console.log(`\n  FAIL: ${totalErrors} error(s) found. Fix errors before merging.\n`);
  process.exit(1);
} else {
  console.log(`\n  PASS: All OpenAPI specs are structurally valid.\n`);
  process.exit(0);
}
