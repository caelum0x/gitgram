/**
 * Oracle Service
 *
 * AI-powered codebase intelligence for AITM sessions:
 * - analyzeCodebase: reads key project files and detects frameworks/architecture
 * - generateSessionSummary: formats file changes into a human-readable summary
 * - suggestCheckpointName: classifies a diff and returns a semantic commit-style name
 * - findRelatedSessions: keyword-matches against stored checkpoint descriptions
 *
 * LLM calls are used when available (via getLLMService); all methods fall back
 * to deterministic heuristics so the service is always usable without API keys.
 */

import fs from "fs/promises";
import path from "path";
import { db, schema } from "../db/index.js";
import { eq, and, desc } from "drizzle-orm";
import { getLLMService } from "./llm.js";
import { logger } from "../lib/monitoring.js";

// ============================================================================
// Public types
// ============================================================================

export interface FrameworkInfo {
  name: string;
  version?: string;
  category: "runtime" | "framework" | "library" | "tool";
}

export interface CodebaseAnalysis {
  language: string;
  frameworks: FrameworkInfo[];
  architecturePattern: string;
  entryPoints: string[];
  hasTests: boolean;
  complexity: "low" | "medium" | "high";
  summary: string;
}

export interface RelatedSession {
  checkpointId: string;
  name: string;
  description: string | null;
  similarity: number;
  createdAt: Date | null;
}

// ============================================================================
// Internal helpers
// ============================================================================

interface PackageJson {
  name?: string;
  main?: string;
  module?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content;
  } catch {
    return null;
  }
}

/**
 * Detect frameworks from package.json deps
 */
function detectFrameworks(pkg: PackageJson): FrameworkInfo[] {
  const all: Record<string, string> = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };

  const knownFrameworks: Array<{ pattern: RegExp; name: string; category: FrameworkInfo["category"] }> = [
    // Runtimes / meta-frameworks
    { pattern: /^next$/, name: "Next.js", category: "framework" },
    { pattern: /^nuxt$/, name: "Nuxt", category: "framework" },
    { pattern: /^remix$/, name: "Remix", category: "framework" },
    // UI frameworks
    { pattern: /^react$/, name: "React", category: "framework" },
    { pattern: /^vue$/, name: "Vue", category: "framework" },
    { pattern: /^@angular\/core$/, name: "Angular", category: "framework" },
    { pattern: /^svelte$/, name: "Svelte", category: "framework" },
    // Backend frameworks
    { pattern: /^express$/, name: "Express", category: "framework" },
    { pattern: /^fastify$/, name: "Fastify", category: "framework" },
    { pattern: /^hono$/, name: "Hono", category: "framework" },
    { pattern: /^koa$/, name: "Koa", category: "framework" },
    { pattern: /^@nestjs\/core$/, name: "NestJS", category: "framework" },
    // ORMs / DB
    { pattern: /^drizzle-orm$/, name: "Drizzle ORM", category: "library" },
    { pattern: /^prisma$/, name: "Prisma", category: "library" },
    { pattern: /^typeorm$/, name: "TypeORM", category: "library" },
    { pattern: /^sequelize$/, name: "Sequelize", category: "library" },
    // Testing
    { pattern: /^vitest$/, name: "Vitest", category: "tool" },
    { pattern: /^jest$/, name: "Jest", category: "tool" },
    { pattern: /^@playwright\/test$/, name: "Playwright", category: "tool" },
    // Other
    { pattern: /^typescript$/, name: "TypeScript", category: "tool" },
    { pattern: /^zod$/, name: "Zod", category: "library" },
    { pattern: /^trpc$/, name: "tRPC", category: "library" },
  ];

  const found: FrameworkInfo[] = [];
  for (const { pattern, name, category } of knownFrameworks) {
    const match = Object.keys(all).find((dep) => pattern.test(dep));
    if (match) {
      found.push({ name, category, version: all[match] });
    }
  }
  return found;
}

/**
 * Infer architecture pattern from project structure signals
 */
function inferArchitecture(
  frameworks: FrameworkInfo[],
  fileTree: string[]
): string {
  const names = frameworks.map((f) => f.name.toLowerCase());

  if (names.includes("nestjs")) return "Layered MVC (NestJS)";
  if (names.includes("next.js") || names.includes("remix")) return "Full-Stack SSR";
  if (names.includes("trpc")) return "End-to-End Typed API";
  if (fileTree.some((f) => /routes?\//.test(f) && /services?\//.test(f))) {
    return "Route + Service pattern";
  }
  if (fileTree.some((f) => /domain\//.test(f))) return "Domain-Driven Design";
  if (fileTree.some((f) => /controllers?\//.test(f))) return "MVC";
  if (names.some((n) => ["express", "fastify", "hono", "koa"].includes(n))) {
    return "REST API Service";
  }
  if (frameworks.some((f) => f.category === "framework")) return "Component-Based SPA";
  return "Library / CLI";
}

/**
 * Count changed lines in a unified diff string
 */
function countDiffLines(diff: string): { added: number; removed: number; files: number } {
  const lines = diff.split("\n");
  let added = 0;
  let removed = 0;
  let files = 0;

  for (const line of lines) {
    if (line.startsWith("diff --git") || line.startsWith("---") && line.includes("a/")) {
      if (line.startsWith("diff --git")) files++;
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      added++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      removed++;
    }
  }
  return { added, removed, files };
}

/**
 * Classify diff type heuristically
 */
function classifyDiff(diff: string): "feat" | "fix" | "refactor" | "docs" | "test" | "chore" {
  const lower = diff.toLowerCase();

  // Test changes
  if (/\.test\.|\.spec\.|__tests__/.test(lower)) return "test";

  // Docs only
  if (/\.md\b|readme|changelog|docs\//.test(lower) && !/\.ts\b|\.js\b|\.py\b/.test(lower)) {
    return "docs";
  }

  // Config / tooling only
  if (/package\.json|tsconfig|\.eslint|\.prettier|dockerfile|\.github/.test(lower) &&
    !diff.includes("src/")) {
    return "chore";
  }

  // Bug-fix signals in diff content
  if (/\b(fix|bug|error|exception|crash|null|undefined|fallback|catch)\b/.test(lower)) {
    return "fix";
  }

  // Refactor signals
  const { added, removed } = countDiffLines(diff);
  if (removed > added * 0.6 && removed > 10) return "refactor";

  return "feat";
}

/**
 * Keyword-based similarity: count matching words between two texts (0–1)
 */
function keywordSimilarity(a: string, b: string): number {
  const stopWords = new Set(["the", "a", "an", "is", "in", "of", "to", "and", "for", "with"]);
  const tokenize = (s: string): Set<string> =>
    new Set(
      s
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 2 && !stopWords.has(w))
    );

  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  return intersection / Math.max(setA.size, setB.size);
}

// ============================================================================
// Oracle Service
// ============================================================================

/**
 * Analyze a workspace directory and return structured codebase intelligence.
 */
export async function analyzeCodebase(workspacePath: string): Promise<CodebaseAnalysis> {
  const [pkgRaw, readmeRaw, tsconfigRaw] = await Promise.all([
    readFileSafe(path.join(workspacePath, "package.json")),
    readFileSafe(path.join(workspacePath, "README.md")),
    readFileSafe(path.join(workspacePath, "tsconfig.json")),
  ]);

  // Parse package.json
  let pkg: PackageJson = {};
  if (pkgRaw) {
    try {
      pkg = JSON.parse(pkgRaw) as PackageJson;
    } catch {
      logger.warn("oracle: failed to parse package.json", { workspacePath });
    }
  }

  // Determine primary language
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  const hasTypeScript = Boolean(allDeps["typescript"] || tsconfigRaw);

  let language = "Unknown";
  if (pkgRaw) {
    language = hasTypeScript ? "TypeScript" : "JavaScript";
  } else if (await readFileSafe(path.join(workspacePath, "pyproject.toml")) ||
    await readFileSafe(path.join(workspacePath, "setup.py"))) {
    language = "Python";
  } else if (await readFileSafe(path.join(workspacePath, "go.mod"))) {
    language = "Go";
  } else if (await readFileSafe(path.join(workspacePath, "Cargo.toml"))) {
    language = "Rust";
  }

  // Detect frameworks
  const frameworks = detectFrameworks(pkg);

  // Probe src directory for structure signals
  let fileTree: string[] = [];
  try {
    const entries = await fs.readdir(workspacePath, { recursive: true });
    fileTree = (entries as string[]).slice(0, 500);
  } catch {
    // Non-critical
  }

  const architecturePattern = inferArchitecture(frameworks, fileTree);

  // Entry points
  const entryPoints: string[] = [];
  if (pkg.main) entryPoints.push(pkg.main);
  if (pkg.module) entryPoints.push(pkg.module);
  if (pkg.scripts?.["start"]) entryPoints.push(`npm start → ${pkg.scripts["start"]}`);
  if (pkg.scripts?.["dev"]) entryPoints.push(`npm dev → ${pkg.scripts["dev"]}`);

  // Test presence
  const hasTests =
    Boolean(allDeps["vitest"] || allDeps["jest"] || allDeps["@playwright/test"]) ||
    fileTree.some((f) => /\.test\.|\.spec\./.test(f));

  // Complexity heuristic
  const fileCount = fileTree.filter((f) => /\.(ts|js|py|go|rs)$/.test(f)).length;
  const complexity: CodebaseAnalysis["complexity"] =
    fileCount > 100 ? "high" : fileCount > 30 ? "medium" : "low";

  // Build summary (LLM-enhanced when available)
  const llm = getLLMService();
  let summary: string;

  const heuristicSummary =
    `${language} project using ${frameworks.map((f) => f.name).join(", ") || "no detected frameworks"}. ` +
    `Architecture: ${architecturePattern}. Complexity: ${complexity} (${fileCount} source files). ` +
    (hasTests ? "Tests detected." : "No tests detected.");

  if (llm.isAvailable() && readmeRaw) {
    try {
      const result = await llm.complete(
        [
          {
            role: "system",
            content:
              "You are a senior software architect. Write a concise 2-sentence codebase summary for a developer unfamiliar with the project.",
          },
          {
            role: "user",
            content:
              `README excerpt:\n${readmeRaw.slice(0, 2000)}\n\n` +
              `Detected: ${heuristicSummary}\n\nSummarize the project.`,
          },
        ],
        { maxTokens: 200, temperature: 0.2 }
      );
      summary = result.content.trim();
    } catch {
      summary = heuristicSummary;
    }
  } else {
    summary = heuristicSummary;
  }

  return {
    language,
    frameworks,
    architecturePattern,
    entryPoints,
    hasTests,
    complexity,
    summary,
  };
}

/**
 * Generate a human-readable summary of an AITM checkpoint/session given its ID.
 * Reads associated checkpoint files from the DB.
 */
export async function generateSessionSummary(
  checkpointId: string,
  userId: string
): Promise<string> {
  // Fetch the checkpoint record
  const [checkpoint] = await db
    .select()
    .from(schema.checkpoints)
    .where(
      and(
        eq(schema.checkpoints.id, checkpointId),
        eq(schema.checkpoints.userId, userId)
      )
    )
    .limit(1);

  if (!checkpoint) {
    return `Checkpoint ${checkpointId} not found.`;
  }

  // Fetch associated files
  const files = await db
    .select()
    .from(schema.checkpointFiles)
    .where(eq(schema.checkpointFiles.checkpointId, checkpointId));

  const changed = files.filter((f) => f.changeType !== "unchanged");
  const added = files.filter((f) => f.changeType === "added");
  const modified = files.filter((f) => f.changeType === "modified");
  const deleted = files.filter((f) => f.changeType === "deleted");

  const fileList = changed
    .slice(0, 20)
    .map((f) => `  ${f.changeType === "added" ? "+" : f.changeType === "deleted" ? "-" : "~"} ${f.filePath}`)
    .join("\n");

  const heuristicSummary =
    `In this session, ${changed.length} file${changed.length !== 1 ? "s" : ""} were changed. ` +
    (added.length ? `${added.length} added. ` : "") +
    (modified.length ? `${modified.length} modified. ` : "") +
    (deleted.length ? `${deleted.length} deleted. ` : "") +
    (checkpoint.description ? `Notes: ${checkpoint.description}` : "") +
    (fileList ? `\n\nKey changes:\n${fileList}` : "");

  const llm = getLLMService();
  if (!llm.isAvailable() || changed.length === 0) {
    return heuristicSummary;
  }

  try {
    const result = await llm.complete(
      [
        {
          role: "system",
          content:
            "You are a helpful developer assistant. Given a list of file changes from a coding session, " +
            "write a concise human-readable summary starting with 'In this session, ...'.",
        },
        {
          role: "user",
          content:
            `Checkpoint name: ${checkpoint.name}\n` +
            (checkpoint.description ? `Description: ${checkpoint.description}\n` : "") +
            `\nFile changes:\n${fileList}\n\n` +
            `Stats: ${added.length} added, ${modified.length} modified, ${deleted.length} deleted.\n\n` +
            "Write a 2-3 sentence summary.",
        },
      ],
      { maxTokens: 250, temperature: 0.3 }
    );
    return result.content.trim();
  } catch {
    return heuristicSummary;
  }
}

/**
 * Suggest a semantic commit-style checkpoint name from a unified diff string.
 */
export async function suggestCheckpointName(diff: string): Promise<string> {
  const { added, removed, files } = countDiffLines(diff);
  const type = classifyDiff(diff);

  // Extract a concise scope from modified paths
  const pathMatches = diff.match(/^diff --git a\/(.+?) b\//gm) ?? [];
  const changedPaths = pathMatches
    .map((m) => m.replace("diff --git a/", "").replace(/ b\/.+$/, ""))
    .slice(0, 3);

  const scope = changedPaths
    .map((p) => path.basename(p, path.extname(p)))
    .filter((n) => n && n !== "index")
    .join(", ");

  const heuristicName =
    `${type}: ${scope || `update ${files} file${files !== 1 ? "s" : ""}`}` +
    (added + removed > 200 ? " (large change)" : "");

  const llm = getLLMService();
  if (!llm.isAvailable() || diff.length < 10) {
    return heuristicName;
  }

  try {
    const result = await llm.complete(
      [
        {
          role: "system",
          content:
            "You are a Git commit message expert. Given a diff summary, output a SINGLE conventional commit message " +
            "(format: `<type>: <short description>`, max 72 chars). Types: feat, fix, refactor, docs, test, chore. " +
            "Output ONLY the commit message — no explanation.",
        },
        {
          role: "user",
          content:
            `Diff stats: +${added} -${removed} lines across ${files} file(s)\n` +
            `Changed files: ${changedPaths.join(", ") || "unknown"}\n\n` +
            `Diff excerpt:\n${diff.slice(0, 3000)}`,
        },
      ],
      { maxTokens: 80, temperature: 0.2 }
    );
    const suggestion = result.content.trim().replace(/^['"`]|['"`]$/g, "");
    // Validate it looks like a conventional commit
    if (/^(feat|fix|refactor|docs|test|chore|perf|ci|build|style)[\(:]/.test(suggestion)) {
      return suggestion;
    }
    return heuristicName;
  } catch {
    return heuristicName;
  }
}

/**
 * Find checkpoints whose names/descriptions are similar to the given diff.
 * Uses keyword matching; returns up to `limit` results ordered by similarity.
 */
export async function findRelatedSessions(
  currentDiff: string,
  userId: string,
  limit = 5
): Promise<RelatedSession[]> {
  // Fetch recent checkpoints for this user to compare against
  const recent = await db
    .select({
      id: schema.checkpoints.id,
      name: schema.checkpoints.name,
      description: schema.checkpoints.description,
      createdAt: schema.checkpoints.createdAt,
    })
    .from(schema.checkpoints)
    .where(eq(schema.checkpoints.userId, userId))
    .orderBy(desc(schema.checkpoints.createdAt))
    .limit(200);

  if (recent.length === 0) return [];

  // Extract keywords from the current diff for matching
  const { added, removed } = countDiffLines(currentDiff);
  const pathMatches = currentDiff.match(/^diff --git a\/(.+?) b\//gm) ?? [];
  const changedPaths = pathMatches.map((m) =>
    m.replace("diff --git a/", "").replace(/ b\/.+$/, "")
  );
  const diffContext = [
    ...changedPaths.map((p) => path.basename(p)),
    currentDiff.slice(0, 500),
  ].join(" ");

  const scored: RelatedSession[] = recent.map((cp) => {
    const cpText = [cp.name, cp.description ?? ""].join(" ");
    const similarity = keywordSimilarity(diffContext, cpText);
    return {
      checkpointId: cp.id,
      name: cp.name,
      description: cp.description,
      similarity,
      createdAt: cp.createdAt,
    };
  });

  // Sort by similarity descending, exclude near-zero matches
  return scored
    .filter((s) => s.similarity > 0.05)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}
