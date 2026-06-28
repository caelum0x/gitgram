/**
 * Memory Service — unified memory layer over savedContexts.
 *
 * Beads tasks and Context7 library docs are first-class memory entries:
 * they are persisted into the same `saved_contexts` table that powers the
 * /v1/contexts/search/* endpoints, tagged with a `source` discriminator
 * (task | library). This reuses the EXISTING embedding + semantic-search
 * pipeline (see services/embeddings.ts and routes/contexts.ts) so ingested
 * tasks and docs are immediately searchable alongside conversation contexts.
 *
 * Write-through is best-effort: ingestion never throws into the caller's
 * primary operation. If a target user/project cannot be resolved, the write
 * is skipped (and logged) rather than failing the originating request.
 */

import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { db, schema } from "../db/index.js";
import {
  getEmbeddingService,
  type EmbeddingService,
} from "./embeddings.js";
import { resolveBeadsBinary } from "./engineManager.js";
import type { SavedContextSource } from "../db/schema.js";
import { logger } from "../lib/monitoring.js";

const execFileAsync = promisify(execFile);

/**
 * Resolve where ingested memory should be persisted. Both fields are required
 * by the saved_contexts schema (NOT NULL FKs to users/projects). Callers that
 * have an authenticated request should pass these explicitly; otherwise the
 * env-configured memory user/project is used (e.g. for unauthenticated
 * internal write-through such as Beads).
 */
export interface MemoryTarget {
  userId?: string;
  projectId?: string;
}

/** A Beads task as returned by the `bd` binary (loosely typed JSON). */
export interface BeadsTask {
  id?: string;
  title?: string;
  description?: string;
  status?: string;
  deps?: string[];
  dependencies?: string[];
  [key: string]: unknown;
}

/** A Context7 library documentation fetch result to ingest. */
export interface Context7DocInput {
  /** Context7 library ID (e.g. "/facebook/react"). */
  libraryId: string;
  /** The topic/query the docs were fetched for. */
  topic?: string;
  /** Optional resolved version. */
  version?: string | null;
  /** The documentation payload returned by the SDK (Documentation[] or text). */
  docs: unknown;
}

export interface IngestResult {
  /** Whether a saved_contexts row was written. */
  persisted: boolean;
  /** The saved_contexts id when persisted. */
  contextId?: string;
  /** Reason it was skipped, when not persisted. */
  skippedReason?: string;
}

const SKIPPED_NO_TARGET = "no target user/project resolvable";

/**
 * Resolve the effective memory target, falling back to env defaults.
 * Returns null when neither a userId nor projectId can be determined.
 */
function resolveTarget(target: MemoryTarget): { userId: string; projectId: string } | null {
  const userId = target.userId || process.env.AITM_MEMORY_USER_ID;
  const projectId = target.projectId || process.env.AITM_MEMORY_PROJECT_ID;

  if (!userId || !projectId) {
    return null;
  }

  return { userId, projectId };
}

function newContextId(): string {
  return `ctx_${crypto.randomBytes(12).toString("hex")}`;
}

/** Cap embedding/source text to keep within provider limits. */
function clampText(text: string, max = 6000): string {
  return text.length > max ? text.slice(0, max) : text;
}

/**
 * Generate an embedding for `text`, returning nulls on failure so ingestion
 * stays best-effort (mirrors routes/contexts.ts behaviour).
 */
async function tryEmbed(
  embeddingService: EmbeddingService,
  text: string
): Promise<{ embeddingJson: number[] | null; embeddingModel: string | null }> {
  try {
    const result = await embeddingService.generateEmbedding(text);
    return { embeddingJson: result.embedding, embeddingModel: result.model };
  } catch (error) {
    logger.warn("memoryService: embedding generation failed", {
      details: String(error),
    });
    return { embeddingJson: null, embeddingModel: null };
  }
}

/**
 * Persist a single memory entry into saved_contexts. Best-effort: returns an
 * IngestResult and never throws into the caller.
 */
async function persist(params: {
  target: MemoryTarget;
  source: SavedContextSource;
  name: string;
  description: string | null;
  embeddingText: string;
  tags: string[];
  metadata: Record<string, unknown>;
}): Promise<IngestResult> {
  const resolved = resolveTarget(params.target);
  if (!resolved) {
    logger.info("memoryService: skipping write-through", {
      source: params.source,
      reason: SKIPPED_NO_TARGET,
    });
    return { persisted: false, skippedReason: SKIPPED_NO_TARGET };
  }

  try {
    const embeddingService = getEmbeddingService();
    const { embeddingJson, embeddingModel } = await tryEmbed(
      embeddingService,
      clampText(params.embeddingText)
    );

    const contextId = newContextId();

    await db.insert(schema.savedContexts).values({
      id: contextId,
      userId: resolved.userId,
      projectId: resolved.projectId,
      name: params.name,
      description: params.description,
      source: params.source,
      embeddingJson,
      embeddingModel,
      tool: "aitm-memory",
      isAutoSaved: true,
      tags: params.tags,
      metadata: params.metadata,
    });

    return { persisted: true, contextId };
  } catch (error) {
    logger.warn("memoryService: failed to persist memory entry", {
      source: params.source,
      details: String(error),
    });
    return { persisted: false, skippedReason: String(error) };
  }
}

/**
 * Ingest a Beads task into the unified memory layer as a
 * saved_contexts(source='task') row, making it semantically searchable.
 */
export async function ingestTask(
  task: BeadsTask,
  target: MemoryTarget = {}
): Promise<IngestResult> {
  const title = (task.title || task.id || "Untitled task").toString();
  const description = task.description ? String(task.description) : null;
  const deps = (task.deps || task.dependencies || []).filter(
    (d): d is string => typeof d === "string"
  );

  const embeddingParts = [`Task: ${title}`];
  if (description) {
    embeddingParts.push(`Description: ${description}`);
  }
  if (deps.length > 0) {
    embeddingParts.push(`Depends on: ${deps.join(", ")}`);
  }

  return persist({
    target,
    source: "task",
    name: title,
    description,
    embeddingText: embeddingParts.join("\n\n"),
    tags: ["beads", "task"],
    metadata: {
      kind: "beads_task",
      taskId: task.id ?? null,
      status: task.status ?? null,
      deps,
      raw: task,
    },
  });
}

/** Coerce an arbitrary docs payload into searchable text. */
function docsToText(docs: unknown): string {
  if (typeof docs === "string") {
    return docs;
  }
  if (Array.isArray(docs)) {
    return docs
      .map((d) => {
        if (d && typeof d === "object") {
          const rec = d as Record<string, unknown>;
          const title = typeof rec.title === "string" ? rec.title : "";
          const content = typeof rec.content === "string" ? rec.content : "";
          return [title, content].filter(Boolean).join("\n");
        }
        return String(d);
      })
      .join("\n\n");
  }
  try {
    return JSON.stringify(docs);
  } catch {
    return String(docs);
  }
}

/**
 * Ingest a Context7 library documentation fetch into the unified memory layer
 * as a saved_contexts(source='library') row, making it semantically searchable.
 */
export async function ingestLibraryDoc(
  doc: Context7DocInput,
  target: MemoryTarget = {}
): Promise<IngestResult> {
  const topic = doc.topic && doc.topic.trim().length > 0 ? doc.topic.trim() : "overview";
  const versionSuffix = doc.version ? `@${doc.version}` : "";
  const name = `${doc.libraryId}${versionSuffix} — ${topic}`;
  const docText = docsToText(doc.docs);

  const embeddingText = [
    `Library: ${doc.libraryId}${versionSuffix}`,
    `Topic: ${topic}`,
    docText ? `Docs:\n${docText}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return persist({
    target,
    source: "library",
    name,
    description: `Context7 documentation for ${doc.libraryId} (${topic})`,
    embeddingText,
    tags: ["context7", "library"],
    metadata: {
      kind: "context7_doc",
      libraryId: doc.libraryId,
      version: doc.version ?? null,
      topic,
    },
  });
}

// ============================================================================
// Beads dependency-graph helpers
//
// Thin wrappers over the `bd` binary (resolved via engineManager) that expose
// the dependency DAG operations the multi-agent orchestration relies on:
// `bd dep add`, `bd dep list`, and `bd dep cycles`. These return the parsed
// `--json` payload from the binary. Kept here (next to ingestTask) so all
// beads-backed memory operations live in one service.
// ============================================================================

function beadsBinary(): string {
  return resolveBeadsBinary().path ?? "bd";
}

function parseBeadsJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    // Some `bd` mutations emit a human-readable confirmation rather than JSON;
    // surface the raw message instead of throwing.
    return { message: trimmed };
  }
}

/** Allowed beads dependency edge types (mirrors `bd dep add -t`). */
export type BeadsDependencyType =
  | "blocks"
  | "tracks"
  | "related"
  | "parent-child"
  | "discovered-from"
  | "until"
  | "caused-by"
  | "validates"
  | "relates-to"
  | "supersedes";

const VALID_DEP_TYPES: ReadonlySet<string> = new Set([
  "blocks",
  "tracks",
  "related",
  "parent-child",
  "discovered-from",
  "until",
  "caused-by",
  "validates",
  "relates-to",
  "supersedes",
]);

/**
 * Add a dependency edge: `blocked` depends on `blocker`. Runs the per-edge
 * cycle check (the binary refuses and errors if the edge would create a cycle).
 * Throws on failure (e.g. unknown id, or a would-be cycle) so the caller can
 * map it to an HTTP status.
 */
export async function addDependency(
  blocked: string,
  blocker: string,
  type?: string
): Promise<unknown> {
  const args = ["dep", "add", blocked, blocker];
  if (type && VALID_DEP_TYPES.has(type)) {
    args.push("--type", type);
  }
  args.push("--json");

  const { stdout } = await execFileAsync(beadsBinary(), args);
  return parseBeadsJson(stdout);
}

/**
 * List dependencies for a task. `direction='down'` (default) returns what the
 * task depends on (its blockers); `direction='up'` returns what depends on it.
 */
export async function listDependencies(
  id: string,
  direction: "up" | "down" = "down"
): Promise<unknown> {
  const args = ["dep", "list", id, `--direction=${direction}`, "--json"];
  const { stdout } = await execFileAsync(beadsBinary(), args);
  return parseBeadsJson(stdout);
}

/**
 * Detect dependency cycles across the whole graph. Returns the parsed analysis
 * from `bd dep cycles --json`.
 */
export async function findDependencyCycles(): Promise<unknown> {
  const { stdout } = await execFileAsync(beadsBinary(), ["dep", "cycles", "--json"]);
  return parseBeadsJson(stdout);
}
