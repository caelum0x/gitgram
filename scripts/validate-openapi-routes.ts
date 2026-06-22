#!/usr/bin/env node
/**
 * OpenAPI Route Coverage Validator
 *
 * Parses Express route registrations from source code, compares them against
 * the OpenAPI spec, and reports coverage gaps.
 *
 * Usage:
 *   npx tsx scripts/validate-openapi-routes.ts
 *
 * Exit codes:
 *   0 - All routes covered
 *   1 - Undocumented routes found
 */

import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RouteInfo {
  method: string;
  path: string;
  file: string;
}

interface SpecRoute {
  method: string;
  path: string;
}

interface ProductConfig {
  name: string;
  routeDir: string;
  entryFile: string;
  specFile: string;
  basePrefix: string;
}

// ---------------------------------------------------------------------------
// Route extraction from source code
// ---------------------------------------------------------------------------

/**
 * Extract route registrations from an Express router file.
 * Matches patterns like: router.get("/path", ...) or router.post("/path", ...)
 */
function extractRoutesFromFile(filePath: string): Array<{ method: string; subPath: string }> {
  const routes: Array<{ method: string; subPath: string }> = [];

  if (!fs.existsSync(filePath)) {
    return routes;
  }

  const content = fs.readFileSync(filePath, "utf-8");

  // Match router.METHOD("path" or router.METHOD( followed by newline + "path"
  const routeRegex = /router\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/gi;

  let match: RegExpExecArray | null;
  while ((match = routeRegex.exec(content)) !== null) {
    const method = match[1].toUpperCase();
    const subPath = match[2];
    routes.push({ method, subPath });
  }

  // Also match multiline patterns like router.get(\n  "/path",
  const multilineRegex = /router\.(get|post|put|patch|delete)\(\s*\n\s*["'`]([^"'`]+)["'`]/gi;
  while ((match = multilineRegex.exec(content)) !== null) {
    const method = match[1].toUpperCase();
    const subPath = match[2];
    // Avoid duplicates
    if (!routes.some((r) => r.method === method && r.subPath === subPath)) {
      routes.push({ method, subPath });
    }
  }

  return routes;
}

/**
 * Parse the entry file (index.ts) to find route mount points.
 * Matches patterns like: app.use("/v1/sync", syncRoutes);
 */
function extractMountPoints(entryFile: string): Map<string, string> {
  const mounts = new Map<string, string>();

  if (!fs.existsSync(entryFile)) {
    return mounts;
  }

  const content = fs.readFileSync(entryFile, "utf-8");

  // Match import statements to map variable names to file names
  const importMap = new Map<string, string>();
  const importRegex = /import\s+(\w+)\s+from\s+["'`]\.\/routes\/([^"'`]+)["'`]/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    importMap.set(match[1], match[2].replace(/\.js$/, ""));
  }

  // Also handle CommonJS requires
  const requireRegex = /(?:const|let|var)\s+(\w+)\s*=\s*require\(\s*["'`]\.\/routes\/([^"'`]+)["'`]\s*\)/g;
  while ((match = requireRegex.exec(content)) !== null) {
    importMap.set(match[1], match[2].replace(/\.js$/, ""));
  }

  // Match app.use("/path", variableName)
  const useRegex = /app\.use\(\s*["'`]([^"'`]+)["'`]\s*,\s*(?:[^,)]*,\s*)*(\w+Routes?)\s*\)/g;
  while ((match = useRegex.exec(content)) !== null) {
    const mountPath = match[1];
    const varName = match[2];
    const routeFile = importMap.get(varName);
    if (routeFile) {
      // Use the first mount point for each route file (prefer v1 routes)
      if (!mounts.has(routeFile) || mountPath.startsWith("/v1") || mountPath.startsWith("/api/v1")) {
        mounts.set(routeFile, mountPath);
      }
    }
  }

  return mounts;
}

/**
 * Build the full list of implemented routes for a product.
 */
function getImplementedRoutes(config: ProductConfig): RouteInfo[] {
  const routes: RouteInfo[] = [];
  const mounts = extractMountPoints(config.entryFile);

  // Also handle inline routes defined directly in the entry file
  const entryContent = fs.existsSync(config.entryFile)
    ? fs.readFileSync(config.entryFile, "utf-8")
    : "";

  // Match app.get/post directly in entry file
  const inlineRegex = /app\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/gi;
  let inlineMatch: RegExpExecArray | null;
  while ((inlineMatch = inlineRegex.exec(entryContent)) !== null) {
    const method = inlineMatch[1].toUpperCase();
    const fullPath = inlineMatch[2];
    routes.push({ method, path: fullPath, file: path.basename(config.entryFile) });
  }

  // Get route files
  if (!fs.existsSync(config.routeDir)) {
    console.error(`Route directory not found: ${config.routeDir}`);
    return routes;
  }

  const routeFiles = fs.readdirSync(config.routeDir).filter((f) => f.endsWith(".ts"));

  for (const file of routeFiles) {
    const filePath = path.join(config.routeDir, file);
    const routeName = file.replace(/\.ts$/, "");
    const mountPath = mounts.get(routeName);

    if (!mountPath) {
      // Try to find mount via various naming conventions
      continue;
    }

    const fileRoutes = extractRoutesFromFile(filePath);

    for (const { method, subPath } of fileRoutes) {
      // Build full path
      let fullPath = mountPath;
      if (subPath === "/") {
        // Root of the mount
      } else {
        fullPath = mountPath + subPath;
      }

      // Normalize: remove trailing slash, collapse double slashes
      fullPath = fullPath.replace(/\/+/g, "/").replace(/\/$/, "") || "/";

      routes.push({ method, path: fullPath, file });
    }
  }

  return routes;
}

// ---------------------------------------------------------------------------
// OpenAPI spec parsing
// ---------------------------------------------------------------------------

/**
 * Parse OpenAPI YAML spec to extract paths.
 * Simple YAML parser for our specific use case (no external deps).
 */
function parseOpenAPIRoutes(specFile: string): SpecRoute[] {
  if (!fs.existsSync(specFile)) {
    console.error(`OpenAPI spec not found: ${specFile}`);
    return [];
  }

  const content = fs.readFileSync(specFile, "utf-8");
  const routes: SpecRoute[] = [];
  const lines = content.split("\n");

  let currentPath = "";
  let inPaths = false;
  let pathIndent = -1;
  let methodIndent = -1;

  for (const line of lines) {
    const trimmed = line.trimEnd();

    // Detect paths: section
    if (/^paths:\s*$/.test(trimmed)) {
      inPaths = true;
      pathIndent = -1;
      continue;
    }

    if (!inPaths) continue;

    // If we hit a top-level key that's not a path, end paths section
    if (/^\S/.test(line) && !line.startsWith(" ") && !line.startsWith("#")) {
      inPaths = false;
      continue;
    }

    // Match path entries (indented with spaces)
    const pathMatch = trimmed.match(/^(\s+)(\/[^:]*)\s*:\s*$/);
    if (pathMatch) {
      const indent = pathMatch[1].length;
      if (pathIndent === -1 || indent <= pathIndent) {
        pathIndent = indent;
        currentPath = pathMatch[2].trim();
        methodIndent = -1;
        continue;
      }
    }

    // Match HTTP methods under a path
    if (currentPath) {
      const methodMatch = trimmed.match(/^(\s+)(get|post|put|patch|delete)\s*:\s*$/);
      if (methodMatch) {
        const indent = methodMatch[1].length;
        if (indent > pathIndent) {
          routes.push({
            method: methodMatch[2].toUpperCase(),
            path: currentPath,
          });
        }
      }
    }
  }

  return routes;
}

// ---------------------------------------------------------------------------
// Normalization and comparison
// ---------------------------------------------------------------------------

/**
 * Normalize a route path for comparison.
 * Express :param becomes {param}, wildcards are handled, etc.
 */
function normalizePath(routePath: string): string {
  return routePath
    .replace(/:(\w+)/g, "{$1}") // :param -> {param}
    .replace(/\/\*/g, "/{path}") // wildcard
    .replace(/\/+/g, "/") // collapse slashes
    .replace(/\/$/, "") // remove trailing slash
    .toLowerCase();
}

/**
 * Create a route key for comparison (METHOD:normalizedPath)
 */
function routeKey(method: string, routePath: string): string {
  return `${method}:${normalizePath(routePath)}`;
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function printTable(title: string, rows: Array<{ method: string; path: string; detail?: string }>) {
  if (rows.length === 0) return;

  console.log(`\n${"=".repeat(80)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(80)}`);
  console.log(`  ${"Method".padEnd(10)} ${"Path".padEnd(55)} ${rows[0].detail ? "Detail" : ""}`);
  console.log(`  ${"-".repeat(10)} ${"-".repeat(55)} ${rows[0].detail ? "-".repeat(10) : ""}`);

  for (const row of rows) {
    console.log(`  ${row.method.padEnd(10)} ${row.path.padEnd(55)} ${row.detail || ""}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function validateProduct(config: ProductConfig): { undocumented: number; stale: number; covered: number } {
  console.log(`\n${"#".repeat(80)}`);
  console.log(`  Validating: ${config.name}`);
  console.log(`${"#".repeat(80)}`);

  // Get implemented routes
  const implemented = getImplementedRoutes(config);
  console.log(`  Found ${implemented.length} implemented routes`);

  // Get spec routes
  const specRoutes = parseOpenAPIRoutes(config.specFile);
  console.log(`  Found ${specRoutes.length} routes in OpenAPI spec`);

  // Build lookup sets
  const implKeys = new Set(implemented.map((r) => routeKey(r.method, r.path)));
  const specKeys = new Set(specRoutes.map((r) => routeKey(r.method, r.path)));

  // Find undocumented routes (in code but not spec)
  const undocumented = implemented.filter((r) => !specKeys.has(routeKey(r.method, r.path)));

  // Find stale routes (in spec but not code)
  const stale = specRoutes.filter((r) => !implKeys.has(routeKey(r.method, r.path)));

  // Find covered routes (in both)
  const covered = implemented.filter((r) => specKeys.has(routeKey(r.method, r.path)));

  // Print results
  const total = new Set([...implKeys, ...specKeys]).size;
  const coveragePercent = total > 0 ? ((covered.length / total) * 100).toFixed(1) : "0";

  console.log(`\n  Coverage: ${covered.length}/${total} routes (${coveragePercent}%)`);

  if (undocumented.length > 0) {
    printTable(
      `UNDOCUMENTED (${undocumented.length}) - Routes in code but NOT in spec`,
      undocumented.map((r) => ({ method: r.method, path: r.path, detail: r.file }))
    );
  } else {
    console.log(`\n  All implemented routes are documented in the OpenAPI spec.`);
  }

  if (stale.length > 0) {
    printTable(
      `STALE (${stale.length}) - Routes in spec but NOT in code`,
      stale.map((r) => ({ method: r.method, path: r.path }))
    );
  }

  if (covered.length > 0) {
    printTable(
      `COVERED (${covered.length}) - Routes in both code and spec`,
      covered.map((r) => ({ method: r.method, path: r.path }))
    );
  }

  return {
    undocumented: undocumented.length,
    stale: stale.length,
    covered: covered.length,
  };
}

// ---------------------------------------------------------------------------
// Product configurations
// ---------------------------------------------------------------------------

const rootDir = path.resolve(__dirname, "..");

const products: ProductConfig[] = [
  {
    name: "AITimeMachine API",
    routeDir: path.join(rootDir, "aitimemachine/api-server/src/routes"),
    entryFile: path.join(rootDir, "aitimemachine/api-server/src/index.ts"),
    specFile: path.join(rootDir, "aitimemachine/api-server/docs/openapi.yaml"),
    basePrefix: "/v1",
  },
  {
    name: "Gitgram Backend",
    routeDir: path.join(rootDir, "gitgram/backend/src/routes"),
    entryFile: path.join(rootDir, "gitgram/backend/src/index.ts"),
    specFile: path.join(rootDir, "gitgram/backend/docs/openapi.yaml"),
    basePrefix: "/api/v1",
  },
];

// Run validation
let hasFailures = false;
const results: Array<{ name: string; undocumented: number; stale: number; covered: number }> = [];

for (const product of products) {
  const result = validateProduct(product);
  results.push({ name: product.name, ...result });

  if (result.undocumented > 0) {
    hasFailures = true;
  }
}

// Print summary
console.log(`\n${"=".repeat(80)}`);
console.log("  SUMMARY");
console.log(`${"=".repeat(80)}`);
console.log(`  ${"Product".padEnd(30)} ${"Covered".padEnd(12)} ${"Undocumented".padEnd(15)} ${"Stale".padEnd(10)}`);
console.log(`  ${"-".repeat(30)} ${"-".repeat(12)} ${"-".repeat(15)} ${"-".repeat(10)}`);

for (const r of results) {
  const total = r.covered + r.undocumented;
  const pct = total > 0 ? `(${((r.covered / total) * 100).toFixed(0)}%)` : "";
  console.log(
    `  ${r.name.padEnd(30)} ${(r.covered + " " + pct).padEnd(12)} ${String(r.undocumented).padEnd(15)} ${String(r.stale).padEnd(10)}`
  );
}

if (hasFailures) {
  console.log(`\n  FAIL: Undocumented routes found. Update OpenAPI specs to achieve full coverage.\n`);
  process.exit(1);
} else {
  console.log(`\n  PASS: All implemented routes are documented.\n`);
  process.exit(0);
}
