import { Router, Response } from "express";
import { db, schema } from "../db/index.js";
import { eq, and, desc, sql, like, inArray } from "drizzle-orm";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { Errors, asyncHandler } from "../middleware/errors.js";
import { createIndexingService, IndexingService } from "../services/indexing.js";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const router = Router();

// Indexing service instance
const indexingService = createIndexingService();

// In-memory job tracking (in production, use Redis or DB)
const indexingJobs = new Map<
  string,
  {
    jobId: string;
    repositoryId: string;
    status: "pending" | "cloning" | "indexing" | "completed" | "failed";
    progress: number;
    filesTotal: number;
    filesIndexed: number;
    error?: string;
    startedAt: Date;
    completedAt?: Date;
  }
>();

// All routes require authentication except GitHub webhook callbacks
router.use((req, res, next) => {
  if (req.method === "POST" && /^\/[^/]+\/webhook$/.test(req.path)) {
    return next();
  }
  return apiKeyAuth(req as AuthenticatedRequest, res, next);
});

/**
 * Helper function to generate unique IDs
 */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function persistReindexJob(options: {
  jobId: string;
  repositoryId: string;
  userId: string;
  status: string;
  progress: number;
  error?: string;
}): Promise<void> {
  try {
    await db.insert(schema.jobs).values({
      id: options.jobId,
      userId: options.userId,
      type: "reindex",
      status: options.status,
      params: { repositoryId: options.repositoryId },
      progress: options.progress,
      error: options.error,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } catch {
    // Best-effort persistence
  }
}

async function updateReindexJob(options: {
  jobId: string;
  status: string;
  progress: number;
  error?: string;
  result?: Record<string, unknown>;
  completedAt?: Date;
}): Promise<void> {
  try {
    await db
      .update(schema.jobs)
      .set({
        status: options.status,
        progress: options.progress,
        error: options.error,
        result: options.result,
        updatedAt: new Date(),
        completedAt: options.completedAt,
      })
      .where(eq(schema.jobs.id, options.jobId));
  } catch {
    // Best-effort persistence
  }
}

// Initial-indexing job persistence (type "index"). Mirrors the reindex helpers
// so the granular progress polled via GET /:id survives restarts and is visible
// across instances rather than living only in the in-memory Map.
async function persistIndexJob(options: {
  jobId: string;
  repositoryId: string;
  userId: string;
  status: string;
  progress: number;
  error?: string;
}): Promise<void> {
  try {
    await db.insert(schema.jobs).values({
      id: options.jobId,
      userId: options.userId,
      type: "index",
      status: options.status,
      params: { repositoryId: options.repositoryId },
      progress: options.progress,
      error: options.error,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } catch {
    // Best-effort persistence
  }
}

async function updateIndexJob(options: {
  jobId: string;
  status: string;
  progress: number;
  error?: string;
  result?: Record<string, unknown>;
  completedAt?: Date;
}): Promise<void> {
  try {
    await db
      .update(schema.jobs)
      .set({
        status: options.status,
        progress: options.progress,
        error: options.error,
        result: options.result,
        updatedAt: new Date(),
        completedAt: options.completedAt,
      })
      .where(eq(schema.jobs.id, options.jobId));
  } catch {
    // Best-effort persistence
  }
}

/**
 * Load the latest persisted index/reindex job for a repository from the DB,
 * used as a fallback when the in-memory progress entry is absent (e.g. after a
 * restart or when serving from a different instance).
 */
async function loadLatestIndexJob(
  repositoryId: string,
  userId: string
): Promise<
  | {
      jobId: string;
      status: string;
      progress: number;
      filesTotal: number | null;
      filesIndexed: number | null;
      error: string | undefined;
      startedAt: Date | null;
      completedAt: Date | null;
    }
  | null
> {
  const rows = await db
    .select()
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.userId, userId),
        inArray(schema.jobs.type, ["index", "reindex"])
      )
    )
    .orderBy(desc(schema.jobs.createdAt))
    .limit(50);

  const latest = rows.find(
    (row) => (row.params as Record<string, unknown> | null)?.repositoryId === repositoryId
  );
  if (!latest) {
    return null;
  }

  const result = latest.result as Record<string, unknown> | null;
  return {
    jobId: latest.id,
    status: latest.status || "pending",
    progress: latest.progress ?? 0,
    filesTotal: (result?.filesTotal as number | undefined) ?? null,
    filesIndexed: (result?.filesIndexed as number | undefined) ?? null,
    error: latest.error || undefined,
    startedAt: latest.createdAt ?? null,
    completedAt: latest.completedAt ?? null,
  };
}

/**
 * Helper function to parse GitHub URL
 */
function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  // Support various GitHub URL formats
  const patterns = [
    /github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/,
    /^([\w.-]+)\/([\w.-]+)$/, // owner/repo format
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
    }
  }
  return null;
}

/**
 * Helper function to get file tree from a directory
 */
interface FileTreeEntry {
  path: string;
  type: "file" | "directory";
  size?: number;
  children?: FileTreeEntry[];
}

async function getFileTree(
  dirPath: string,
  basePath: string = "",
  depth: number = 3,
  currentDepth: number = 0
): Promise<FileTreeEntry[]> {
  if (currentDepth >= depth) return [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const tree = [];

    for (const entry of entries) {
      // Skip hidden files/directories and node_modules
      if (entry.name.startsWith(".") || entry.name === "node_modules") {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.join(basePath, entry.name);

      if (entry.isDirectory()) {
        const children = await getFileTree(fullPath, relativePath, depth, currentDepth + 1);
        tree.push({
          path: relativePath,
          type: "directory" as const,
          children,
        });
      } else {
        const stats = await fs.stat(fullPath);
        tree.push({
          path: relativePath,
          type: "file" as const,
          size: stats.size,
        });
      }
    }

    return tree.sort((a, b) => {
      // Directories first, then alphabetical
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.path.localeCompare(b.path);
    });
  } catch (error) {
    return [];
  }
}

/**
 * Helper function to clone a GitHub repository
 */
async function cloneRepository(
  url: string,
  targetPath: string,
  branch?: string
): Promise<void> {
  const branchArg = branch ? `--branch ${branch}` : "";
  const cmd = `git clone --depth 1 ${branchArg} ${url} "${targetPath}"`;
  await execAsync(cmd);
}

/**
 * Helper function to get all files from a directory recursively
 */
async function getAllFiles(
  dirPath: string,
  basePath: string = "",
  options: { includePatterns?: string[]; excludePatterns?: string[]; maxFileSize?: number } = {}
): Promise<Array<{ path: string; content: string }>> {
  const files: Array<{ path: string; content: string }> = [];
  const maxSize = options.maxFileSize || 1024 * 1024; // 1MB default

  const defaultExclude = [
    "node_modules",
    ".git",
    "dist",
    "build",
    "__pycache__",
    ".next",
    "coverage",
    ".env",
    "*.lock",
    "package-lock.json",
    "yarn.lock",
  ];

  async function traverse(currentPath: string, relativePath: string) {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const relPath = path.join(relativePath, entry.name);

        // Check exclusions
        const shouldExclude = defaultExclude.some((pattern) => {
          if (pattern.startsWith("*")) {
            return entry.name.endsWith(pattern.slice(1));
          }
          return entry.name === pattern;
        });

        if (shouldExclude) continue;

        if (entry.isDirectory()) {
          await traverse(fullPath, relPath);
        } else {
          // Check file size
          const stats = await fs.stat(fullPath);
          if (stats.size > maxSize) continue;

          // Check if it's a text file (basic check)
          const ext = path.extname(entry.name).toLowerCase();
          const textExtensions = [
            ".ts",
            ".tsx",
            ".js",
            ".jsx",
            ".py",
            ".go",
            ".rs",
            ".java",
            ".kt",
            ".swift",
            ".rb",
            ".php",
            ".cs",
            ".c",
            ".cpp",
            ".h",
            ".hpp",
            ".vue",
            ".svelte",
            ".json",
            ".yaml",
            ".yml",
            ".md",
            ".txt",
            ".html",
            ".css",
            ".scss",
            ".less",
            ".sql",
            ".sh",
            ".bash",
            ".zsh",
            ".toml",
            ".xml",
          ];

          if (textExtensions.includes(ext) || !ext) {
            try {
              const content = await fs.readFile(fullPath, "utf-8");
              files.push({ path: relPath, content });
            } catch {
              // Skip files that can't be read as text
            }
          }
        }
      }
    } catch {
      // Skip directories that can't be read
    }
  }

  await traverse(dirPath, basePath);
  return files;
}

/**
 * POST /v1/repositories
 * Index a new repository (supports local path or GitHub URL)
 */
router.post(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { url, path: localPath, branch, name, projectId } = req.body;

    if (!projectId) {
      throw Errors.missingParameter("projectId");
    }

    if (!url && !localPath) {
      throw Errors.invalidRequest("Either 'url' (GitHub URL) or 'path' (local path) is required");
    }

    // Verify project belongs to user
    const [project] = await db
      .select()
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, projectId),
          eq(schema.projects.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!project) {
      throw Errors.projectNotFound(projectId);
    }

    // Determine repository name and root path
    let repoName = name;
    let rootPath = localPath;
    let isGitHubRepo = false;

    if (url) {
      const parsed = parseGitHubUrl(url);
      if (!parsed) {
        throw Errors.invalidParameter("url", "Invalid GitHub URL format");
      }
      repoName = repoName || parsed.repo;
      isGitHubRepo = true;
      // For GitHub repos, we'll clone to a temp directory
      rootPath = `/tmp/aitm-repos/${req.user!.userId}/${parsed.owner}/${parsed.repo}`;
    } else {
      repoName = repoName || path.basename(localPath);
    }

    // Create repository record
    const repoId = generateId("repo");

    await db.insert(schema.repositories).values({
      id: repoId,
      projectId,
      userId: req.user!.userId,
      name: repoName,
      rootPath: rootPath,
      indexStatus: "pending",
      fileCount: 0,
      symbolCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        url: url || null,
        branch: branch || "main",
        isGitHub: isGitHubRepo,
      },
    });

    // Initialize job tracking. The in-memory Map gives fast, granular progress
    // for the originating instance; the jobs table is the durable source of
    // truth so progress survives restarts and is readable from other instances.
    const indexJobId = generateId("idxjob");
    const initialStatus = isGitHubRepo ? "cloning" : "indexing";
    indexingJobs.set(repoId, {
      jobId: indexJobId,
      repositoryId: repoId,
      status: initialStatus,
      progress: 0,
      filesTotal: 0,
      filesIndexed: 0,
      startedAt: new Date(),
    });
    await persistIndexJob({
      jobId: indexJobId,
      repositoryId: repoId,
      userId: req.user!.userId,
      status: initialStatus,
      progress: 0,
    });

    // Start async indexing process
    (async () => {
      const job = indexingJobs.get(repoId)!;

      try {
        // Clone if GitHub URL
        if (isGitHubRepo && url) {
          await db
            .update(schema.repositories)
            .set({ indexStatus: "indexing", updatedAt: new Date() })
            .where(eq(schema.repositories.id, repoId));

          // Create directory and clone
          await fs.mkdir(path.dirname(rootPath), { recursive: true });
          await cloneRepository(url, rootPath, branch);
          job.status = "indexing";
          await updateIndexJob({
            jobId: indexJobId,
            status: "indexing",
            progress: 0,
          });
        }

        // Get all files
        const files = await getAllFiles(rootPath);
        job.filesTotal = files.length;

        // Index the repository
        const result = await indexingService.indexRepository(repoId, files, {
          forceReindex: true,
          maxFileSize: 1024 * 1024,
          persistContent: true,
          source: isGitHubRepo ? "git" : "local",
        });

        job.status = result.status;
        job.filesIndexed = result.filesIndexed;
        job.progress = 100;
        job.completedAt = new Date();

        if (result.error) {
          job.error = result.error;
        }

        await updateIndexJob({
          jobId: indexJobId,
          status: result.status,
          progress: 100,
          error: result.error,
          result: { filesTotal: job.filesTotal, filesIndexed: result.filesIndexed },
          completedAt: job.completedAt,
        });
      } catch (error) {
        job.status = "failed";
        job.error = (error as Error).message;

        await db
          .update(schema.repositories)
          .set({ indexStatus: "failed", updatedAt: new Date() })
          .where(eq(schema.repositories.id, repoId));

        await updateIndexJob({
          jobId: indexJobId,
          status: "failed",
          progress: job.progress,
          error: job.error,
          completedAt: new Date(),
        });
      }
    })();

    res.status(201).json({
      id: repoId,
      project_id: projectId,
      name: repoName,
      url: url || null,
      path: rootPath,
      branch: branch || "main",
      status: isGitHubRepo ? "cloning" : "indexing",
      progress: {
        files_total: 0,
        files_indexed: 0,
        percent: 0,
      },
      created_at: new Date().toISOString(),
      message: "Repository indexing started. Use GET /v1/repositories/:id to check progress.",
    });
  })
);

/**
 * GET /v1/repositories
 * List all repositories for the authenticated user
 */
router.get(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { projectId, status, limit = "20", offset = "0" } = req.query;

    const conditions = [eq(schema.repositories.userId, req.user!.userId)];

    if (projectId) {
      conditions.push(eq(schema.repositories.projectId, projectId as string));
    }

    if (status) {
      conditions.push(eq(schema.repositories.indexStatus, status as string));
    }

    const repositories = await db
      .select()
      .from(schema.repositories)
      .where(and(...conditions))
      .orderBy(desc(schema.repositories.updatedAt))
      .limit(Number(limit))
      .offset(Number(offset));

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.repositories)
      .where(and(...conditions));

    res.json({
      data: repositories.map((repo) => ({
        id: repo.id,
        project_id: repo.projectId,
        name: repo.name,
        root_path: repo.rootPath,
        status: repo.indexStatus,
        file_count: repo.fileCount,
        symbol_count: repo.symbolCount,
        last_indexed_at: repo.lastIndexedAt,
        created_at: repo.createdAt,
        updated_at: repo.updatedAt,
        metadata: repo.metadata,
      })),
      total: countResult?.count || 0,
      limit: Number(limit),
      offset: Number(offset),
      has_more: (Number(offset) + repositories.length) < (countResult?.count || 0),
    });
  })
);

/**
 * GET /v1/repositories/:id
 * Get repository details and indexing status with progress
 */
router.get(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const [repo] = await db
      .select()
      .from(schema.repositories)
      .where(
        and(
          eq(schema.repositories.id, id),
          eq(schema.repositories.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!repo) {
      throw Errors.notFound("Repository", id);
    }

    // Get job progress. Prefer the fast in-memory entry on this instance; fall
    // back to the durable jobs table so progress survives restarts and is
    // correct when served from a different instance.
    const inMemoryJob = indexingJobs.get(id);
    const dbJob = inMemoryJob ? null : await loadLatestIndexJob(id, req.user!.userId);
    const job = inMemoryJob
      ? {
          status: inMemoryJob.status as string,
          filesTotal: inMemoryJob.filesTotal,
          filesIndexed: inMemoryJob.filesIndexed,
          progress: inMemoryJob.progress,
          error: inMemoryJob.error,
        }
      : dbJob
      ? {
          status: dbJob.status,
          filesTotal: dbJob.filesTotal ?? 0,
          filesIndexed: dbJob.filesIndexed ?? 0,
          progress: dbJob.progress,
          error: dbJob.error,
        }
      : null;

    // Get detailed stats from indexing service
    let stats = null;
    try {
      stats = await indexingService.getRepositoryStats(id);
    } catch {
      // Stats may not be available yet
    }

    res.json({
      id: repo.id,
      project_id: repo.projectId,
      name: repo.name,
      root_path: repo.rootPath,
      status: job?.status || repo.indexStatus,
      progress: {
        files_total: job?.filesTotal || repo.fileCount || 0,
        files_indexed: job?.filesIndexed || repo.fileCount || 0,
        percent: job?.progress || (repo.indexStatus === "completed" ? 100 : 0),
      },
      stats: stats
        ? {
            file_count: stats.fileCount,
            symbol_count: stats.symbolCount,
            language_breakdown: stats.languageBreakdown,
            symbol_type_breakdown: stats.symbolTypeBreakdown,
          }
        : null,
      last_indexed_at: repo.lastIndexedAt,
      created_at: repo.createdAt,
      updated_at: repo.updatedAt,
      metadata: repo.metadata,
      error: job?.error || null,
    });
  })
);

/**
 * DELETE /v1/repositories/:id
 * Delete a repository and optionally its data
 */
router.delete(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { deleteFiles = "false" } = req.query;

    const [repo] = await db
      .select()
      .from(schema.repositories)
      .where(
        and(
          eq(schema.repositories.id, id),
          eq(schema.repositories.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!repo) {
      throw Errors.notFound("Repository", id);
    }

    // Delete associated data
    await db
      .delete(schema.codeEmbeddings)
      .where(eq(schema.codeEmbeddings.repositoryId, id));

    await db
      .delete(schema.indexedFiles)
      .where(eq(schema.indexedFiles.repositoryId, id));

    // Delete repository record
    await db.delete(schema.repositories).where(eq(schema.repositories.id, id));

    // Remove from job tracking
    indexingJobs.delete(id);

    // Optionally delete cloned files
    if (deleteFiles === "true" && repo.rootPath.startsWith("/tmp/aitm-repos/")) {
      try {
        await fs.rm(repo.rootPath, { recursive: true, force: true });
      } catch {
        // Ignore file deletion errors
      }
    }

    res.json({
      deleted: true,
      id: id,
      message: "Repository and associated data deleted successfully",
    });
  })
);

/**
 * PATCH /v1/repositories/:id
 * Rename or update repository settings
 */
router.patch(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { name, metadata } = req.body;

    const [repo] = await db
      .select()
      .from(schema.repositories)
      .where(
        and(
          eq(schema.repositories.id, id),
          eq(schema.repositories.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!repo) {
      throw Errors.notFound("Repository", id);
    }

    // Prepare updates
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name) updates.name = name;
    if (metadata) {
      updates.metadata = { ...((repo.metadata as Record<string, unknown>) || {}), ...metadata };
    }

    await db
      .update(schema.repositories)
      .set(updates)
      .where(eq(schema.repositories.id, id));

    res.json({
      id,
      name: name || repo.name,
      updated_at: new Date().toISOString(),
      message: "Repository updated successfully",
    });
  })
);

/**
 * GET /v1/repositories/:id/tree
 * Get repository file tree structure
 */
router.get(
  "/:id/tree",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { path: subPath = "", depth = "3" } = req.query;

    const [repo] = await db
      .select()
      .from(schema.repositories)
      .where(
        and(
          eq(schema.repositories.id, id),
          eq(schema.repositories.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!repo) {
      throw Errors.notFound("Repository", id);
    }

    // Get tree from file system if available
    const targetPath = path.join(repo.rootPath, subPath as string);
    let tree = [];

    try {
      tree = await getFileTree(targetPath, subPath as string, Number(depth));
    } catch (error) {
      // If file system is not available, get from indexed files
      const indexedFiles = await db
        .select({
          filePath: schema.indexedFiles.filePath,
          lineCount: schema.indexedFiles.lineCount,
          language: schema.indexedFiles.language,
        })
        .from(schema.indexedFiles)
        .where(eq(schema.indexedFiles.repositoryId, id))
        .limit(1000);

      // Build tree from indexed files
      const fileMap = new Map<string, { path: string; type: string; language?: string | null; line_count?: number | null }>();

      for (const file of indexedFiles) {
        const parts = file.filePath.split("/");
        let current = "";

        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const isFile = i === parts.length - 1;
          const fullPath = current ? `${current}/${part}` : part;

          if (!fileMap.has(fullPath)) {
            fileMap.set(fullPath, {
              path: fullPath,
              type: isFile ? "file" : "directory",
              language: isFile ? file.language : undefined,
              line_count: isFile ? file.lineCount : undefined,
            });
          }

          current = fullPath;
        }
      }

      tree = Array.from(fileMap.values());
    }

    res.json({
      repository_id: id,
      path: subPath || "/",
      depth: Number(depth),
      tree,
      total_items: tree.length,
    });
  })
);

/**
 * GET /v1/repositories/:id/file
 * Get file content from repository
 */
router.get(
  "/:id/file",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { path: filePath, encoding = "utf8" } = req.query;

    if (!filePath) {
      throw Errors.missingParameter("path");
    }

    const [repo] = await db
      .select()
      .from(schema.repositories)
      .where(
        and(
          eq(schema.repositories.id, id),
          eq(schema.repositories.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!repo) {
      throw Errors.notFound("Repository", id);
    }

    const fullPath = path.join(repo.rootPath, filePath as string);

    // Security check: prevent path traversal
    if (!fullPath.startsWith(repo.rootPath)) {
      throw Errors.invalidParameter("path", "Invalid file path");
    }

    try {
      const stats = await fs.stat(fullPath);

      if (stats.isDirectory()) {
        throw Errors.invalidParameter("path", "Path is a directory, not a file");
      }

      // Check file size (limit to 5MB)
      if (stats.size > 5 * 1024 * 1024) {
        throw Errors.invalidRequest("File too large. Maximum size is 5MB.");
      }

      const content = await fs.readFile(fullPath, encoding as BufferEncoding);
      const ext = path.extname(fullPath).toLowerCase();

      // Try to get symbols for this file
      const symbols = await indexingService.getFileSymbols(id, filePath as string);

      res.json({
        repository_id: id,
        path: filePath,
        content,
        size: stats.size,
        encoding,
        extension: ext,
        symbols: symbols.map((s) => ({
          name: s.name,
          type: s.type,
          line_start: s.lineStart,
          line_end: s.lineEnd,
        })),
      });
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
        throw Errors.notFound("File", filePath as string);
      }
      if (error instanceof Error && error.message.includes("Invalid")) {
        throw error;
      }
      throw Errors.internal(`Failed to read file: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  })
);

/**
 * POST /v1/repositories/:id/search
 * Search repository code with regex support
 */
router.post(
  "/:id/search",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const {
      query,
      regex = false,
      case_sensitive = false,
      file_types,
      symbol_type,
      max_results = 50,
      include_content = true,
    } = req.body;

    if (!query) {
      throw Errors.missingParameter("query");
    }

    const [repo] = await db
      .select()
      .from(schema.repositories)
      .where(
        and(
          eq(schema.repositories.id, id),
          eq(schema.repositories.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!repo) {
      throw Errors.notFound("Repository", id);
    }

    // Build search conditions
    const conditions = [eq(schema.codeEmbeddings.repositoryId, id)];

    if (symbol_type) {
      conditions.push(eq(schema.codeEmbeddings.symbolType, symbol_type));
    }

    // Get code embeddings
    const embeddings = await db
      .select()
      .from(schema.codeEmbeddings)
      .where(and(...conditions))
      .limit(1000); // Get more for filtering

    let results = embeddings;

    // Apply regex or text search
    if (regex) {
      try {
        const pattern = new RegExp(query, case_sensitive ? "" : "i");
        results = embeddings.filter(
          (e) =>
            pattern.test(e.content) ||
            pattern.test(e.symbol || "") ||
            pattern.test(e.filePath)
        );
      } catch (error) {
        throw Errors.invalidParameter("query", "Invalid regex pattern");
      }
    } else {
      const searchQuery = case_sensitive ? query : query.toLowerCase();
      results = embeddings.filter((e) => {
        const content = case_sensitive ? e.content : e.content.toLowerCase();
        const symbol = case_sensitive
          ? e.symbol || ""
          : (e.symbol || "").toLowerCase();
        const filePath = case_sensitive ? e.filePath : e.filePath.toLowerCase();

        return (
          content.includes(searchQuery) ||
          symbol.includes(searchQuery) ||
          filePath.includes(searchQuery)
        );
      });
    }

    // Filter by file types
    if (file_types && Array.isArray(file_types)) {
      const extensions = file_types.map((t: string) =>
        t.startsWith(".") ? t : `.${t}`
      );
      results = results.filter((e) =>
        extensions.some((ext: string) => e.filePath.endsWith(ext))
      );
    }

    // Limit results
    results = results.slice(0, max_results);

    // Score and sort results
    const scoredResults = results.map((e) => {
      let score = 0;
      const searchLower = query.toLowerCase();

      // Exact symbol match
      if (e.symbol?.toLowerCase() === searchLower) score += 10;
      // Symbol contains query
      else if (e.symbol?.toLowerCase().includes(searchLower)) score += 5;

      // File path match
      if (e.filePath.toLowerCase().includes(searchLower)) score += 3;

      // Content match (count occurrences)
      const contentLower = e.content.toLowerCase();
      const matches = contentLower.split(searchLower).length - 1;
      score += Math.min(matches, 5);

      return { ...e, score };
    });

    scoredResults.sort((a, b) => b.score - a.score);

    res.json({
      repository_id: id,
      query,
      regex,
      case_sensitive,
      results: scoredResults.map((r) => ({
        id: r.id,
        file_path: r.filePath,
        symbol: r.symbol,
        symbol_type: r.symbolType,
        line_start: r.lineStart,
        line_end: r.lineEnd,
        language: r.language,
        content: include_content ? r.content : undefined,
        content_preview: r.content.slice(0, 200),
        score: r.score,
      })),
      total: scoredResults.length,
      truncated: embeddings.length >= 1000,
    });
  })
);

/**
 * POST /v1/repositories/:id/reindex
 * Trigger re-indexing of a repository
 */
router.post(
  "/:id/reindex",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { force = false } = req.body;

    const [repo] = await db
      .select()
      .from(schema.repositories)
      .where(
        and(
          eq(schema.repositories.id, id),
          eq(schema.repositories.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!repo) {
      throw Errors.notFound("Repository", id);
    }

    // Check if already indexing
    const existingJob = indexingJobs.get(id);
    if (existingJob && existingJob.status === "indexing") {
      throw Errors.conflict("Repository is already being indexed");
    }

    // Initialize job tracking
    const jobId = generateId("reindex");
    indexingJobs.set(id, {
      jobId,
      repositoryId: id,
      status: "indexing",
      progress: 0,
      filesTotal: 0,
      filesIndexed: 0,
      startedAt: new Date(),
    });
    await persistReindexJob({
      jobId,
      repositoryId: id,
      userId: req.user!.userId,
      status: "running",
      progress: 0,
    });

    // Start async reindexing
    (async () => {
      const job = indexingJobs.get(id)!;

      try {
        const files = await getAllFiles(repo.rootPath);
        job.filesTotal = files.length;

        const result = await indexingService.indexRepository(id, files, {
          forceReindex: force,
          maxFileSize: 1024 * 1024,
          persistContent: true,
          source: (repo.metadata as Record<string, unknown> | null)?.isGitHub ? "git" : "local",
        });

        job.status = result.status;
        job.filesIndexed = result.filesIndexed;
        job.progress = 100;
        job.completedAt = new Date();

        if (result.error) {
          job.error = result.error;
        }
        await updateReindexJob({
          jobId: job.jobId,
          status: result.status === "completed" ? "completed" : "failed",
          progress: 100,
          error: result.error,
          result: { filesIndexed: result.filesIndexed, filesTotal: job.filesTotal },
          completedAt: job.completedAt,
        });
      } catch (error) {
        job.status = "failed";
        job.error = (error as Error).message;
        await updateReindexJob({
          jobId: job.jobId,
          status: "failed",
          progress: job.progress,
          error: job.error,
          completedAt: new Date(),
        });

        await db
          .update(schema.repositories)
          .set({ indexStatus: "failed", updatedAt: new Date() })
          .where(eq(schema.repositories.id, id));
      }
    })();

    res.json({
      id,
      job_id: jobId,
      status: "indexing",
      message: "Repository reindexing started",
    });
  })
);

/**
 * GET /v1/repositories/:id/reindex/status
 * Get latest reindex job status for a repository
 */
router.get(
  "/:id/reindex/status",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const [repo] = await db
      .select()
      .from(schema.repositories)
      .where(
        and(
          eq(schema.repositories.id, id),
          eq(schema.repositories.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!repo) {
      throw Errors.notFound("Repository", id);
    }

    const inMemory = indexingJobs.get(id);
    if (inMemory) {
      return res.json({
        repository_id: id,
        job_id: inMemory.jobId,
        status: inMemory.status,
        progress: inMemory.progress,
        files_total: inMemory.filesTotal,
        files_indexed: inMemory.filesIndexed,
        error: inMemory.error,
        started_at: inMemory.startedAt.toISOString(),
        completed_at: inMemory.completedAt?.toISOString(),
      });
    }

    const rows = await db
      .select()
      .from(schema.jobs)
      .where(and(eq(schema.jobs.userId, req.user!.userId), eq(schema.jobs.type, "reindex")))
      .orderBy(desc(schema.jobs.createdAt))
      .limit(25);

    const latest = rows.find((row) => (row.params as Record<string, unknown> | null)?.repositoryId === id);
    if (!latest) {
      throw Errors.notFound("Reindex job", id);
    }

    const latestResult = latest.result as Record<string, unknown> | null;
    res.json({
      repository_id: id,
      job_id: latest.id,
      status: latest.status,
      progress: latest.progress,
      files_total: (latestResult?.filesTotal as number) ?? null,
      files_indexed: (latestResult?.filesIndexed as number) ?? null,
      error: latest.error || undefined,
      started_at: latest.createdAt?.toISOString(),
      completed_at: latest.completedAt?.toISOString(),
    });
  })
);

/**
 * GET /v1/repositories/:id/reindex/jobs
 * List reindex jobs for a repository
 */
router.get(
  "/:id/reindex/jobs",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const [repo] = await db
      .select()
      .from(schema.repositories)
      .where(
        and(
          eq(schema.repositories.id, id),
          eq(schema.repositories.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!repo) {
      throw Errors.notFound("Repository", id);
    }

    const rows = await db
      .select()
      .from(schema.jobs)
      .where(and(eq(schema.jobs.userId, req.user!.userId), eq(schema.jobs.type, "reindex")))
      .orderBy(desc(schema.jobs.createdAt))
      .limit(50);

    const jobs = rows
      .filter((row) => (row.params as Record<string, unknown> | null)?.repositoryId === id)
      .map((row) => {
        const result = row.result as Record<string, unknown> | null;
        return {
          job_id: row.id,
          status: row.status,
          progress: row.progress,
          files_total: (result?.filesTotal as number) ?? null,
          files_indexed: (result?.filesIndexed as number) ?? null,
          error: row.error || undefined,
          started_at: row.createdAt?.toISOString(),
          completed_at: row.completedAt?.toISOString(),
        };
      });

    res.json({
      repository_id: id,
      jobs,
      total: jobs.length,
    });
  })
);

/**
 * GET /v1/repositories/:id/symbols
 * Search for symbols (functions, classes, etc.) in repository
 */
router.get(
  "/:id/symbols",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { query, type, limit = "50", offset = "0" } = req.query;

    const [repo] = await db
      .select()
      .from(schema.repositories)
      .where(
        and(
          eq(schema.repositories.id, id),
          eq(schema.repositories.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!repo) {
      throw Errors.notFound("Repository", id);
    }

    const conditions = [eq(schema.codeEmbeddings.repositoryId, id)];

    if (type && type !== "all") {
      conditions.push(eq(schema.codeEmbeddings.symbolType, type as string));
    }

    if (query) {
      conditions.push(like(schema.codeEmbeddings.symbol, `%${query}%`));
    }

    const symbols = await db
      .select({
        id: schema.codeEmbeddings.id,
        symbol: schema.codeEmbeddings.symbol,
        symbolType: schema.codeEmbeddings.symbolType,
        filePath: schema.codeEmbeddings.filePath,
        lineStart: schema.codeEmbeddings.lineStart,
        lineEnd: schema.codeEmbeddings.lineEnd,
        language: schema.codeEmbeddings.language,
      })
      .from(schema.codeEmbeddings)
      .where(and(...conditions))
      .limit(Number(limit))
      .offset(Number(offset));

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.codeEmbeddings)
      .where(and(...conditions));

    res.json({
      repository_id: id,
      query: query || null,
      type: type || "all",
      symbols: symbols.map((s) => ({
        id: s.id,
        name: s.symbol,
        type: s.symbolType,
        file_path: s.filePath,
        line_start: s.lineStart,
        line_end: s.lineEnd,
        language: s.language,
      })),
      total: countResult?.count || 0,
      limit: Number(limit),
      offset: Number(offset),
    });
  })
);

/**
 * GET /v1/repositories/:id/history
 * Get file history across checkpoints (if available)
 */
router.get(
  "/:id/history",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { path: filePath, limit = "20" } = req.query;

    const [repo] = await db
      .select()
      .from(schema.repositories)
      .where(
        and(
          eq(schema.repositories.id, id),
          eq(schema.repositories.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!repo) {
      throw Errors.notFound("Repository", id);
    }

    // Get checkpoints that contain this repository's project
    const checkpoints = await db
      .select()
      .from(schema.checkpoints)
      .where(eq(schema.checkpoints.projectId, repo.projectId))
      .orderBy(desc(schema.checkpoints.createdAt))
      .limit(Number(limit));

    res.json({
      repository_id: id,
      path: filePath || null,
      history: checkpoints.map((cp) => ({
        checkpoint_id: cp.id,
        description: cp.name,
        scope: cp.scope,
        timestamp: cp.createdAt,
      })),
      total: checkpoints.length,
    });
  })
);

/**
 * POST /v1/repositories/:id/webhook/configure
 * Generate a webhook secret and return configuration for GitHub
 */
router.post(
  "/:id/webhook/configure",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const [repo] = await db
      .select()
      .from(schema.repositories)
      .where(
        and(
          eq(schema.repositories.id, id),
          eq(schema.repositories.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!repo) {
      throw Errors.notFound("Repository", id);
    }

    // Generate a new webhook secret
    const webhookSecret = crypto.randomBytes(32).toString("hex");

    // Store the secret in repository metadata
    const currentMetadata = (repo.metadata as Record<string, unknown>) || {};
    await db
      .update(schema.repositories)
      .set({
        metadata: {
          ...currentMetadata,
          webhookSecret,
          webhookConfiguredAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(schema.repositories.id, id));

    const webhookUrl = `/v1/repositories/${id}/webhook`;

    res.json({
      webhook_url: webhookUrl,
      webhook_secret: webhookSecret,
      repository_id: id,
      instructions: {
        step1: "Go to your GitHub repository Settings > Webhooks > Add webhook",
        step2: `Set Payload URL to: <your-server-url>${webhookUrl}`,
        step3: "Set Content type to: application/json",
        step4: `Set Secret to: ${webhookSecret}`,
        step5: "Select 'Just the push event'",
        step6: "Click 'Add webhook'",
      },
    });
  })
);

/**
 * POST /v1/repositories/:id/webhook
 * Receive GitHub push events and trigger auto-reindexing
 * No API key auth - uses HMAC signature verification instead
 */
router.post(
  "/:id/webhook",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    // Get repository (no user auth check - webhook uses HMAC)
    const [repo] = await db
      .select()
      .from(schema.repositories)
      .where(eq(schema.repositories.id, id))
      .limit(1);

    if (!repo) {
      throw Errors.notFound("Repository", id);
    }

    const metadata = (repo.metadata as Record<string, unknown>) || {};
    const webhookSecret = metadata.webhookSecret as string | undefined;

    if (!webhookSecret) {
      throw Errors.invalidRequest("Webhook not configured for this repository");
    }

    // Verify GitHub HMAC signature
    const signature = req.headers["x-hub-signature-256"] as string;
    if (!signature) {
      return res.status(401).json({
        error: { type: "auth_error", message: "Missing X-Hub-Signature-256 header" },
      });
    }

    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
    const body = rawBody ? rawBody : Buffer.from(JSON.stringify(req.body));
    const expectedSignature =
      "sha256=" + crypto.createHmac("sha256", webhookSecret).update(body).digest("hex");

    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      return res.status(401).json({
        error: { type: "auth_error", message: "Invalid webhook signature" },
      });
    }

    // Check event type
    const event = req.headers["x-github-event"] as string;

    if (event === "ping") {
      return res.json({ message: "pong", repository_id: id });
    }

    if (event !== "push") {
      return res.json({ message: `Ignoring event: ${event}`, repository_id: id });
    }

    // Check if push is to the default branch
    const payload = req.body;
    const defaultBranch = (metadata.branch as string) || "main";
    const pushRef = payload.ref || "";
    const pushBranch = pushRef.replace("refs/heads/", "");

    if (pushBranch !== defaultBranch) {
      return res.json({
        message: `Ignoring push to non-default branch: ${pushBranch}`,
        repository_id: id,
        default_branch: defaultBranch,
      });
    }

    // Check if already indexing
    const existingJob = indexingJobs.get(id);
    if (existingJob && existingJob.status === "indexing") {
      return res.json({
        message: "Repository is already being indexed",
        repository_id: id,
        status: "indexing",
      });
    }

    // Trigger reindex
    const jobId = generateId("reindex");
    indexingJobs.set(id, {
      jobId,
      repositoryId: id,
      status: "indexing",
      progress: 0,
      filesTotal: 0,
      filesIndexed: 0,
      startedAt: new Date(),
    });
    await persistReindexJob({
      jobId,
      repositoryId: id,
      userId: repo.userId,
      status: "running",
      progress: 0,
    });

    // Start async reindexing
    (async () => {
      const job = indexingJobs.get(id)!;

      try {
        // Re-clone if GitHub repo
        if (metadata.isGitHub && metadata.url) {
          await fs.rm(repo.rootPath, { recursive: true, force: true }).catch(() => {});
          await fs.mkdir(path.dirname(repo.rootPath), { recursive: true });
          await cloneRepository(metadata.url as string, repo.rootPath, defaultBranch);
        }

        const files = await getAllFiles(repo.rootPath);
        job.filesTotal = files.length;

        const result = await indexingService.indexRepository(id, files, {
          forceReindex: true,
          maxFileSize: 1024 * 1024,
          persistContent: true,
          source: metadata.isGitHub ? "git" : "local",
        });

        job.status = result.status;
        job.filesIndexed = result.filesIndexed;
        job.progress = 100;
        job.completedAt = new Date();

        if (result.error) {
          job.error = result.error;
        }
        await updateReindexJob({
          jobId: job.jobId,
          status: result.status === "completed" ? "completed" : "failed",
          progress: 100,
          error: result.error,
          result: { filesIndexed: result.filesIndexed, filesTotal: job.filesTotal },
          completedAt: job.completedAt,
        });

        await db
          .update(schema.repositories)
          .set({
            indexStatus: result.status,
            lastIndexedAt: new Date(),
            updatedAt: new Date(),
            metadata: {
              ...metadata,
              lastIndexedCommit: payload.after || payload.head_commit?.id || null,
              lastIndexedRef: payload.ref || null,
            },
          })
          .where(eq(schema.repositories.id, id));
      } catch (error) {
        job.status = "failed";
        job.error = (error as Error).message;
        await updateReindexJob({
          jobId: job.jobId,
          status: "failed",
          progress: job.progress,
          error: job.error,
          completedAt: new Date(),
        });

        await db
          .update(schema.repositories)
          .set({ indexStatus: "failed", updatedAt: new Date() })
          .where(eq(schema.repositories.id, id));
      }
    })();

    res.json({
      message: "Reindexing triggered by push event",
      repository_id: id,
      branch: pushBranch,
      commit: payload.after || payload.head_commit?.id,
      status: "indexing",
      job_id: jobId,
    });
  })
);

export default router;
