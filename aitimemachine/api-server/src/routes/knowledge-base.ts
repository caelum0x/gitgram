import { Router, Response } from "express";
import { db, schema } from "../db/index.js";
import { and, eq, like, sql, desc } from "drizzle-orm";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { Errors, asyncHandler } from "../middleware/errors.js";
import {
  listKnowledgeFiles,
  getKnowledgeFile,
  searchKnowledgeFiles,
  deleteKnowledgeFile,
  deleteKnowledgeFilesByRepo,
  listKnowledgeArtifacts,
  getKnowledgeArtifact,
  deleteKnowledgeArtifact,
  getKnowledgeStats,
  unifiedKnowledgeSearch,
} from "../services/knowledgeBase.js";

const router = Router();

router.use(apiKeyAuth);

// ============================================================================
// GET /v1/knowledge-base/repositories
// ============================================================================

router.get(
  "/repositories",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) throw Errors.missingApiKey();

    const rows = await db
      .select({
        id: schema.repositories.id,
        projectId: schema.repositories.projectId,
        name: schema.repositories.name,
        rootPath: schema.repositories.rootPath,
        indexStatus: schema.repositories.indexStatus,
        lastIndexedAt: schema.repositories.lastIndexedAt,
        fileCount: sql<number>`count(${schema.knowledgeBaseFiles.id})`,
        updatedAt: schema.repositories.updatedAt,
      })
      .from(schema.repositories)
      .leftJoin(
        schema.knowledgeBaseFiles,
        eq(schema.knowledgeBaseFiles.repositoryId, schema.repositories.id)
      )
      .where(eq(schema.repositories.userId, userId))
      .groupBy(schema.repositories.id)
      .orderBy(desc(schema.repositories.updatedAt));

    res.json({
      repositories: rows.map((row: any) => ({
        id: row.id,
        project_id: row.projectId,
        name: row.name,
        root_path: row.rootPath,
        index_status: row.indexStatus,
        last_indexed_at: row.lastIndexedAt,
        kb_files: row.fileCount || 0,
        updated_at: row.updatedAt,
      })),
      total: rows.length,
    });
  })
);

// ============================================================================
// GET /v1/knowledge-base/repositories/:id/files
// ============================================================================

router.get(
  "/repositories/:id/files",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) throw Errors.missingApiKey();

    const { id } = req.params;
    const { prefix = "", limit = "50", offset = "0" } = req.query;

    const [repo] = await db
      .select()
      .from(schema.repositories)
      .where(and(eq(schema.repositories.id, id), eq(schema.repositories.userId, userId)))
      .limit(1);

    if (!repo) throw Errors.notFound("Repository", id);

    const conditions = [
      eq(schema.knowledgeBaseFiles.repositoryId, id),
      eq(schema.knowledgeBaseFiles.userId, userId),
    ];

    if (prefix) {
      conditions.push(like(schema.knowledgeBaseFiles.filePath, `${prefix}%`));
    }

    const files = await db
      .select({
        id: schema.knowledgeBaseFiles.id,
        filePath: schema.knowledgeBaseFiles.filePath,
        size: schema.knowledgeBaseFiles.size,
        language: schema.knowledgeBaseFiles.language,
        source: schema.knowledgeBaseFiles.source,
        storage: schema.knowledgeBaseFiles.storage,
        indexedAt: schema.knowledgeBaseFiles.indexedAt,
        updatedAt: schema.knowledgeBaseFiles.updatedAt,
      })
      .from(schema.knowledgeBaseFiles)
      .where(and(...conditions))
      .orderBy(desc(schema.knowledgeBaseFiles.updatedAt))
      .limit(Number(limit))
      .offset(Number(offset));

    res.json({
      repository_id: id,
      files: files.map((f: any) => ({
        id: f.id,
        path: f.filePath,
        size: f.size,
        language: f.language,
        source: f.source,
        storage: f.storage,
        indexed_at: f.indexedAt,
        updated_at: f.updatedAt,
      })),
      limit: Number(limit),
      offset: Number(offset),
    });
  })
);

// ============================================================================
// DELETE /v1/knowledge-base/repositories/:id/files
// ============================================================================

router.delete(
  "/repositories/:id/files",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) throw Errors.missingApiKey();

    const { id } = req.params;
    const [repo] = await db
      .select()
      .from(schema.repositories)
      .where(and(eq(schema.repositories.id, id), eq(schema.repositories.userId, userId)))
      .limit(1);

    if (!repo) throw Errors.notFound("Repository", id);

    const deletedCount = await deleteKnowledgeFilesByRepo(id, userId);
    res.json({ deleted: true, repository_id: id, files_deleted: deletedCount });
  })
);

// ============================================================================
// GET /v1/knowledge-base/repositories/:id/file
// ============================================================================

router.get(
  "/repositories/:id/file",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) throw Errors.missingApiKey();

    const { id } = req.params;
    const { path: filePath } = req.query;
    if (!filePath) throw Errors.missingParameter("path");

    const [repo] = await db
      .select()
      .from(schema.repositories)
      .where(and(eq(schema.repositories.id, id), eq(schema.repositories.userId, userId)))
      .limit(1);

    if (!repo) throw Errors.notFound("Repository", id);

    const [file] = await db
      .select()
      .from(schema.knowledgeBaseFiles)
      .where(
        and(
          eq(schema.knowledgeBaseFiles.repositoryId, id),
          eq(schema.knowledgeBaseFiles.userId, userId),
          eq(schema.knowledgeBaseFiles.filePath, filePath as string)
        )
      )
      .limit(1);

    if (!file) throw Errors.notFound("File", filePath as string);

    if (!file.content && file.s3) {
      return res.json({
        repository_id: id,
        path: file.filePath,
        storage: "s3",
        s3: file.s3,
      });
    }

    res.json({
      repository_id: id,
      path: file.filePath,
      storage: file.storage,
      content: file.content,
      language: file.language,
      size: file.size,
      updated_at: file.updatedAt,
    });
  })
);

// ============================================================================
// GET /v1/knowledge-base/search
// ============================================================================

router.get(
  "/search",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) throw Errors.missingApiKey();

    const { query, repositoryId, limit = "20" } = req.query;
    if (!query) throw Errors.missingParameter("query");

    const conditions = [eq(schema.knowledgeBaseFiles.userId, userId)];
    if (repositoryId) {
      conditions.push(eq(schema.knowledgeBaseFiles.repositoryId, repositoryId as string));
    }

    const rows = await db
      .select({
        id: schema.knowledgeBaseFiles.id,
        repositoryId: schema.knowledgeBaseFiles.repositoryId,
        filePath: schema.knowledgeBaseFiles.filePath,
        language: schema.knowledgeBaseFiles.language,
        updatedAt: schema.knowledgeBaseFiles.updatedAt,
        content: schema.knowledgeBaseFiles.content,
      })
      .from(schema.knowledgeBaseFiles)
      .where(
        and(
          ...conditions,
          sql`(${schema.knowledgeBaseFiles.filePath} ILIKE ${`%${query}%`} OR ${schema.knowledgeBaseFiles.content} ILIKE ${`%${query}%`})`
        )
      )
      .limit(Number(limit));

    res.json({
      query,
      results: rows.map((row: any) => ({
        id: row.id,
        repository_id: row.repositoryId,
        file_path: row.filePath,
        language: row.language,
        updated_at: row.updatedAt,
        snippet: row.content ? row.content.slice(0, 200) : null,
      })),
      total: rows.length,
    });
  })
);

// ============================================================================
// GET /v1/knowledge-base/artifacts
// ============================================================================

router.get(
  "/artifacts",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) throw Errors.missingApiKey();

    const { type, limit = "50", offset = "0" } = req.query;
    const conditions = [eq(schema.knowledgeBaseArtifacts.userId, userId)];
    if (type) {
      conditions.push(eq(schema.knowledgeBaseArtifacts.type, type as string));
    }

    const rows = await db
      .select()
      .from(schema.knowledgeBaseArtifacts)
      .where(and(...conditions))
      .orderBy(desc(schema.knowledgeBaseArtifacts.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));

    res.json({
      artifacts: rows.map((row: any) => ({
        id: row.id,
        type: row.type,
        format: row.format,
        storage: row.storage,
        size: row.size,
        stats: row.stats,
        s3: row.s3,
        created_at: row.createdAt,
      })),
      total: rows.length,
      limit: Number(limit),
      offset: Number(offset),
    });
  })
);

// ============================================================================
// GET /v1/knowledge-base/artifacts/:id
// ============================================================================

router.get(
  "/artifacts/:id",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) throw Errors.missingApiKey();

    const { id } = req.params;
    const [row] = await db
      .select()
      .from(schema.knowledgeBaseArtifacts)
      .where(and(eq(schema.knowledgeBaseArtifacts.id, id), eq(schema.knowledgeBaseArtifacts.userId, userId)))
      .limit(1);

    if (!row) throw Errors.notFound("Artifact", id);

    res.json({
      id: row.id,
      type: row.type,
      format: row.format,
      storage: row.storage,
      size: row.size,
      stats: row.stats,
      s3: row.s3,
      content: row.content,
      created_at: row.createdAt,
    });
  })
);

// ============================================================================
// GET /v1/knowledge-base/files - List all knowledge base files
// ============================================================================

router.get(
  "/files",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) throw Errors.missingApiKey();

    const {
      repository_id,
      project_id,
      language,
      limit = "50",
      offset = "0",
    } = req.query;

    const result = await listKnowledgeFiles(userId, {
      repositoryId: repository_id as string | undefined,
      projectId: project_id as string | undefined,
      language: language as string | undefined,
      limit: Number(limit),
      offset: Number(offset),
    });

    res.json({
      files: result.files.map((f: any) => ({
        id: f.id,
        repository_id: f.repositoryId,
        project_id: f.projectId,
        path: f.filePath,
        size: f.size,
        language: f.language,
        source: f.source,
        storage: f.storage,
        indexed_at: f.indexedAt,
        updated_at: f.updatedAt,
      })),
      total: result.total,
      limit: Number(limit),
      offset: Number(offset),
    });
  })
);

// ============================================================================
// GET /v1/knowledge-base/files/search - Search knowledge base files
// ============================================================================

router.get(
  "/files/search",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) throw Errors.missingApiKey();

    const { q, repository_id, language, limit = "20" } = req.query;
    if (!q) throw Errors.missingParameter("q");

    const rows = await searchKnowledgeFiles(userId, q as string, {
      repositoryId: repository_id as string | undefined,
      language: language as string | undefined,
      limit: Number(limit),
    });

    res.json({
      query: q,
      results: rows.map((row: any) => ({
        id: row.id,
        repository_id: row.repositoryId,
        file_path: row.filePath,
        language: row.language,
        size: row.size,
        updated_at: row.updatedAt,
        snippet: row.content ? row.content.slice(0, 200) : null,
      })),
      total: rows.length,
    });
  })
);

// ============================================================================
// GET /v1/knowledge-base/files/:id - Get single file by ID
// ============================================================================

router.get(
  "/files/:id",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) throw Errors.missingApiKey();

    const file = await getKnowledgeFile(req.params.id, userId);
    if (!file) throw Errors.notFound("File", req.params.id);

    if (!file.content && file.s3) {
      return res.json({
        id: file.id,
        repository_id: file.repositoryId,
        path: file.filePath,
        storage: "s3",
        s3: file.s3,
      });
    }

    res.json({
      id: file.id,
      repository_id: file.repositoryId,
      project_id: file.projectId,
      path: file.filePath,
      content: file.content,
      language: file.language,
      size: file.size,
      source: file.source,
      storage: file.storage,
      indexed_at: file.indexedAt,
      updated_at: file.updatedAt,
    });
  })
);

// ============================================================================
// DELETE /v1/knowledge-base/files/:id - Delete a single file
// ============================================================================

router.delete(
  "/files/:id",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) throw Errors.missingApiKey();

    const deleted = await deleteKnowledgeFile(req.params.id, userId);
    if (!deleted) throw Errors.notFound("File", req.params.id);

    res.json({ deleted: true, id: req.params.id });
  })
);

// ============================================================================
// DELETE /v1/knowledge-base/artifacts/:id - Delete a single artifact
// ============================================================================

router.delete(
  "/artifacts/:id",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) throw Errors.missingApiKey();

    const deleted = await deleteKnowledgeArtifact(req.params.id, userId);
    if (!deleted) throw Errors.notFound("Artifact", req.params.id);

    res.json({ deleted: true, id: req.params.id });
  })
);

// ============================================================================
// GET /v1/knowledge-base/unified-search
// Searches across KB files, artifacts, and code embeddings in one call.
// ============================================================================

router.get(
  "/unified-search",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) throw Errors.missingApiKey();

    const { query, repository_id, project_id, limit = "20" } = req.query;
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      throw Errors.missingParameter("query");
    }

    const result = await unifiedKnowledgeSearch(userId, query, {
      repositoryId: repository_id as string | undefined,
      projectId: project_id as string | undefined,
      limit: Number(limit),
    });

    res.json({
      query,
      files: result.files.map((f: any) => ({
        id: f.id,
        repository_id: f.repositoryId,
        file_path: f.filePath,
        language: f.language,
        size: f.size,
        updated_at: f.updatedAt,
        snippet: f.content ? f.content.slice(0, 200) : null,
      })),
      artifacts: result.artifacts.map((a: any) => ({
        id: a.id,
        type: a.type,
        format: a.format,
        storage: a.storage,
        size: a.size,
        stats: a.stats,
        created_at: a.createdAt,
      })),
      embeddings: result.embeddings.map((e: any) => ({
        id: e.id,
        repository_id: e.repositoryId,
        file_path: e.filePath,
        symbol: e.symbol,
        symbol_type: e.symbolType,
        language: e.language,
        line_start: e.lineStart,
        line_end: e.lineEnd,
        snippet: e.content.slice(0, 200),
      })),
      total:
        result.files.length +
        result.artifacts.length +
        result.embeddings.length,
    });
  })
);

// ============================================================================
// GET /v1/knowledge-base/stats - Storage statistics
// ============================================================================

router.get(
  "/stats",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) throw Errors.missingApiKey();

    const { project_id } = req.query;
    const stats = await getKnowledgeStats(userId, project_id as string | undefined);

    res.json(stats);
  })
);

// ============================================================================
// GET /v1/knowledge-base/embeddings/status - Embedding coverage status
// ============================================================================

router.get(
  "/embeddings/status",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) throw Errors.missingApiKey();

    const { repository_id, project_id } = req.query;

    // Count files with/without embeddings
    const fileConditions = [eq(schema.knowledgeBaseFiles.userId, userId)];
    if (repository_id) {
      fileConditions.push(eq(schema.knowledgeBaseFiles.repositoryId, repository_id as string));
    }
    if (project_id) {
      fileConditions.push(eq(schema.knowledgeBaseFiles.projectId, project_id as string));
    }

    const [fileCounts] = await db
      .select({
        total: sql<number>`count(*)`,
        withEmbedding: sql<number>`count(*) filter (where ${schema.knowledgeBaseFiles.embeddingJson} is not null)`,
        withoutEmbedding: sql<number>`count(*) filter (where ${schema.knowledgeBaseFiles.embeddingJson} is null)`,
        avgSize: sql<number>`avg(${schema.knowledgeBaseFiles.size})`,
      })
      .from(schema.knowledgeBaseFiles)
      .where(and(...fileConditions));

    // Count artifacts with/without embeddings
    const artifactConditions = [eq(schema.knowledgeBaseArtifacts.userId, userId)];
    if (project_id) {
      artifactConditions.push(eq(schema.knowledgeBaseArtifacts.projectId, project_id as string));
    }

    const [artifactCounts] = await db
      .select({
        total: sql<number>`count(*)`,
        withEmbedding: sql<number>`count(*) filter (where ${schema.knowledgeBaseArtifacts.embeddingJson} is not null)`,
        withoutEmbedding: sql<number>`count(*) filter (where ${schema.knowledgeBaseArtifacts.embeddingJson} is null)`,
      })
      .from(schema.knowledgeBaseArtifacts)
      .where(and(...artifactConditions));

    const fileTotal = Number(fileCounts?.total ?? 0);
    const fileWithEmbedding = Number(fileCounts?.withEmbedding ?? 0);
    const artifactTotal = Number(artifactCounts?.total ?? 0);
    const artifactWithEmbedding = Number(artifactCounts?.withEmbedding ?? 0);

    const totalItems = fileTotal + artifactTotal;
    const totalWithEmbedding = fileWithEmbedding + artifactWithEmbedding;
    const coverage = totalItems > 0 ? totalWithEmbedding / totalItems : 0;

    res.json({
      files: {
        total: fileTotal,
        with_embedding: fileWithEmbedding,
        without_embedding: Number(fileCounts?.withoutEmbedding ?? 0),
        coverage: fileTotal > 0 ? fileWithEmbedding / fileTotal : 0,
        avg_size: Number(fileCounts?.avgSize ?? 0),
      },
      artifacts: {
        total: artifactTotal,
        with_embedding: artifactWithEmbedding,
        without_embedding: Number(artifactCounts?.withoutEmbedding ?? 0),
        coverage: artifactTotal > 0 ? artifactWithEmbedding / artifactTotal : 0,
      },
      overall: {
        total: totalItems,
        with_embedding: totalWithEmbedding,
        coverage,
        coverage_percent: Math.round(coverage * 100),
        meets_threshold: coverage >= 0.9, // 90% target
      },
    });
  })
);

export default router;
