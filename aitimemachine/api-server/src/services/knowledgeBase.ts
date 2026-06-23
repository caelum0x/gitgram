import { db, schema } from "../db/index.js";
import { and, eq, sql, desc, like } from "drizzle-orm";
import crypto from "crypto";
import { downloadS3ObjectText, uploadToS3 } from "./s3.js";
import { getEmbeddingService } from "./embeddings.js";
import { logger } from "../lib/monitoring.js";

const KB_MAX_CONTENT_BYTES = Number(process.env.KB_MAX_CONTENT_BYTES || 500_000);
const KB_MAX_FILE_BYTES = Number(process.env.KB_MAX_FILE_BYTES || 1_048_576);
const KB_S3_THRESHOLD_BYTES = Number(process.env.KB_S3_THRESHOLD_BYTES || 102_400); // 100 KB
const KB_S3_BUCKET = process.env.KB_S3_BUCKET || "";
const KB_S3_PREFIX = process.env.KB_S3_PREFIX || "knowledge-base";
const KB_EMBEDDINGS_ENABLED = process.env.KB_EMBEDDINGS_ENABLED !== "false";
const KB_EMBEDDING_MAX_BYTES = Number(process.env.KB_EMBEDDING_MAX_BYTES || 100_000);

const embeddingService = getEmbeddingService();

function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function generateEmbedding(content: string) {
  if (!KB_EMBEDDINGS_ENABLED) return null;
  const size = Buffer.byteLength(content, "utf8");
  if (size > KB_EMBEDDING_MAX_BYTES) return null;

  try {
    const result = await embeddingService.generateEmbedding(content.slice(0, 8000));
    return { embedding: result.embedding, model: result.model };
  } catch (error) {
    logger.warn("Knowledge base embedding generation failed", { details: String(error) });
    return null;
  }
}

export async function upsertKnowledgeFile(options: {
  repositoryId: string;
  projectId: string;
  userId: string;
  filePath: string;
  content: string;
  language?: string | null;
  source?: "local" | "git";
  storage?: "db" | "s3";
  s3?: { bucket: string; key: string; url?: string } | null;
}): Promise<{ stored: boolean; id?: string; reason?: string }> {
  const size = Buffer.byteLength(options.content, "utf8");
  if (size > KB_MAX_FILE_BYTES) {
    return { stored: false, reason: "file_too_large" };
  }

  const contentHash = hashContent(options.content);
  const embeddingResult = await generateEmbedding(options.content);

  const [existing] = await db
    .select()
    .from(schema.knowledgeBaseFiles)
    .where(
      and(
        eq(schema.knowledgeBaseFiles.repositoryId, options.repositoryId),
        eq(schema.knowledgeBaseFiles.filePath, options.filePath)
      )
    )
    .limit(1);

  if (existing && existing.contentHash === contentHash) {
    await db
      .update(schema.knowledgeBaseFiles)
      .set({ updatedAt: new Date() })
      .where(eq(schema.knowledgeBaseFiles.id, existing.id));
    return { stored: false, id: existing.id, reason: "unchanged" };
  }

  // Determine storage: use S3 for large files when bucket is configured
  let storage: "db" | "s3" = options.storage || "db";
  let s3Meta: { bucket: string; key: string; url?: string } | null = options.s3 || null;

  if (!s3Meta && KB_S3_BUCKET && size >= KB_S3_THRESHOLD_BYTES) {
    const s3Key = `${KB_S3_PREFIX}/files/${contentHash.slice(0, 2)}/${contentHash}`;

    // Content-addressed dedup: check if another row already has this hash in S3
    const [existingByHash] = await db
      .select({ s3: schema.knowledgeBaseFiles.s3 })
      .from(schema.knowledgeBaseFiles)
      .where(
        and(
          eq(schema.knowledgeBaseFiles.contentHash, contentHash),
          eq(schema.knowledgeBaseFiles.storage, "s3")
        )
      )
      .limit(1);

    if (existingByHash?.s3) {
      // Reuse the existing S3 reference — skip upload
      s3Meta = existingByHash.s3 as { bucket: string; key: string; url?: string };
    } else {
      // Upload to S3
      const result = await uploadToS3(options.content, {
        bucket: KB_S3_BUCKET,
        key: s3Key,
        contentType: "text/plain; charset=utf-8",
      });
      s3Meta = { bucket: result.bucket, key: result.key, url: result.url };
    }

    storage = "s3";
  }

  const values = {
    repositoryId: options.repositoryId,
    projectId: options.projectId,
    userId: options.userId,
    filePath: options.filePath,
    content: storage === "db" ? options.content : null,
    contentHash,
    size,
    language: options.language || null,
    source: options.source || "local",
    storage,
    s3: s3Meta,
    embeddingJson: embeddingResult?.embedding || null,
    embeddingModel: embeddingResult?.model || null,
    indexedAt: new Date(),
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(schema.knowledgeBaseFiles)
      .set(values)
      .where(eq(schema.knowledgeBaseFiles.id, existing.id));
    return { stored: true, id: existing.id };
  }

  const [inserted] = await db
    .insert(schema.knowledgeBaseFiles)
    .values(values as any)
    .returning({ id: schema.knowledgeBaseFiles.id });

  return { stored: true, id: inserted?.id };
}

export async function persistKnowledgeArtifact(options: {
  id: string;
  userId: string;
  projectId?: string | null;
  jobId?: string | null;
  type: "export" | "pipeline";
  format: string;
  content?: string | Record<string, unknown> | null;
  stats?: Record<string, unknown> | null;
  storage?: "db" | "s3";
  s3?: { bucket: string; key: string; url?: string } | null;
}): Promise<{ stored: boolean; reason?: string }> {
  const storage = options.storage || "db";
  let serialized: string | null = null;

  if (typeof options.content === "string") {
    serialized = options.content;
  } else if (options.content) {
    serialized = JSON.stringify(options.content);
  }

  const size = serialized ? Buffer.byteLength(serialized, "utf8") : 0;
  const shouldStoreContent = storage === "db" && size > 0 && size <= KB_MAX_CONTENT_BYTES;

  const contentHash = serialized ? hashContent(serialized) : null;
  const embeddingSource =
    serialized || (options.stats ? JSON.stringify(options.stats) : null) || "";
  const embeddingResult = embeddingSource
    ? await generateEmbedding(embeddingSource)
    : null;

  await db.insert(schema.knowledgeBaseArtifacts).values({
    id: options.id,
    userId: options.userId,
    projectId: options.projectId || null,
    jobId: options.jobId || null,
    type: options.type,
    format: options.format,
    storage,
    content: shouldStoreContent ? (typeof options.content === "string" ? { raw: options.content } : options.content) : null,
    contentHash: contentHash || undefined,
    size,
    stats: options.stats || undefined,
    s3: options.s3 || null,
    embeddingJson: embeddingResult?.embedding || null,
    embeddingModel: embeddingResult?.model || null,
    createdAt: new Date(),
  });

  return { stored: true };
}

// ============================================================================
// Query / List / Search
// ============================================================================

export async function listKnowledgeFiles(
  userId: string,
  options: {
    repositoryId?: string;
    projectId?: string;
    language?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const conditions = [eq(schema.knowledgeBaseFiles.userId, userId)];
  if (options.repositoryId) {
    conditions.push(eq(schema.knowledgeBaseFiles.repositoryId, options.repositoryId));
  }
  if (options.projectId) {
    conditions.push(eq(schema.knowledgeBaseFiles.projectId, options.projectId));
  }
  if (options.language) {
    conditions.push(eq(schema.knowledgeBaseFiles.language, options.language));
  }

  const files = await db
    .select({
      id: schema.knowledgeBaseFiles.id,
      repositoryId: schema.knowledgeBaseFiles.repositoryId,
      projectId: schema.knowledgeBaseFiles.projectId,
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
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.knowledgeBaseFiles)
    .where(and(...conditions));

  return { files, total: Number(countResult?.count ?? 0) };
}

export async function getKnowledgeFile(fileId: string, userId: string) {
  const [file] = await db
    .select()
    .from(schema.knowledgeBaseFiles)
    .where(
      and(
        eq(schema.knowledgeBaseFiles.id, fileId),
        eq(schema.knowledgeBaseFiles.userId, userId)
      )
    )
    .limit(1);
  return file ?? null;
}

export async function searchKnowledgeFiles(
  userId: string,
  query: string,
  options: { repositoryId?: string; language?: string; limit?: number } = {}
) {
  const limit = options.limit ?? 20;
  const conditions = [eq(schema.knowledgeBaseFiles.userId, userId)];
  if (options.repositoryId) {
    conditions.push(eq(schema.knowledgeBaseFiles.repositoryId, options.repositoryId));
  }
  if (options.language) {
    conditions.push(eq(schema.knowledgeBaseFiles.language, options.language));
  }

  const rows = await db
    .select({
      id: schema.knowledgeBaseFiles.id,
      repositoryId: schema.knowledgeBaseFiles.repositoryId,
      filePath: schema.knowledgeBaseFiles.filePath,
      language: schema.knowledgeBaseFiles.language,
      size: schema.knowledgeBaseFiles.size,
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
    .limit(limit);

  return rows;
}

export async function deleteKnowledgeFile(fileId: string, userId: string): Promise<boolean> {
  const result = await db
    .delete(schema.knowledgeBaseFiles)
    .where(
      and(
        eq(schema.knowledgeBaseFiles.id, fileId),
        eq(schema.knowledgeBaseFiles.userId, userId)
      )
    )
    .returning({ id: schema.knowledgeBaseFiles.id });
  return result.length > 0;
}

export async function deleteKnowledgeFilesByRepo(
  repositoryId: string,
  userId: string
): Promise<number> {
  const result = await db
    .delete(schema.knowledgeBaseFiles)
    .where(
      and(
        eq(schema.knowledgeBaseFiles.repositoryId, repositoryId),
        eq(schema.knowledgeBaseFiles.userId, userId)
      )
    )
    .returning({ id: schema.knowledgeBaseFiles.id });
  return result.length;
}

export async function listKnowledgeArtifacts(
  userId: string,
  options: {
    type?: string;
    format?: string;
    projectId?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const conditions = [eq(schema.knowledgeBaseArtifacts.userId, userId)];
  if (options.type) {
    conditions.push(eq(schema.knowledgeBaseArtifacts.type, options.type));
  }
  if (options.format) {
    conditions.push(eq(schema.knowledgeBaseArtifacts.format, options.format));
  }
  if (options.projectId) {
    conditions.push(eq(schema.knowledgeBaseArtifacts.projectId, options.projectId));
  }

  const artifacts = await db
    .select()
    .from(schema.knowledgeBaseArtifacts)
    .where(and(...conditions))
    .orderBy(desc(schema.knowledgeBaseArtifacts.createdAt))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.knowledgeBaseArtifacts)
    .where(and(...conditions));

  return { artifacts, total: Number(countResult?.count ?? 0) };
}

export async function getKnowledgeArtifact(artifactId: string, userId: string) {
  const [artifact] = await db
    .select()
    .from(schema.knowledgeBaseArtifacts)
    .where(
      and(
        eq(schema.knowledgeBaseArtifacts.id, artifactId),
        eq(schema.knowledgeBaseArtifacts.userId, userId)
      )
    )
    .limit(1);
  return artifact ?? null;
}

export async function deleteKnowledgeArtifact(artifactId: string, userId: string): Promise<boolean> {
  const result = await db
    .delete(schema.knowledgeBaseArtifacts)
    .where(
      and(
        eq(schema.knowledgeBaseArtifacts.id, artifactId),
        eq(schema.knowledgeBaseArtifacts.userId, userId)
      )
    )
    .returning({ id: schema.knowledgeBaseArtifacts.id });
  return result.length > 0;
}

/**
 * Resolve the content of a KB file.
 * - If stored in DB, returns the content directly.
 * - If stored in S3, returns the S3 metadata so the caller can fetch/stream.
 */
export async function downloadKnowledgeFileContent(
  fileId: string,
  userId: string
): Promise<
  | { source: "db"; content: string }
  | { source: "s3"; s3: { bucket: string; key: string; url?: string } }
  | null
> {
  const file = await getKnowledgeFile(fileId, userId);
  if (!file) return null;

  if (file.storage === "s3" && file.s3) {
    return { source: "s3", s3: file.s3 as { bucket: string; key: string; url?: string } };
  }

  return { source: "db", content: file.content || "" };
}

export async function getKnowledgeStats(
  userId: string,
  projectId?: string
) {
  const fileConditions = [eq(schema.knowledgeBaseFiles.userId, userId)];
  if (projectId) {
    fileConditions.push(eq(schema.knowledgeBaseFiles.projectId, projectId));
  }

  const [fileStats] = await db
    .select({
      count: sql<number>`count(*)`,
      totalSize: sql<number>`coalesce(sum(${schema.knowledgeBaseFiles.size}), 0)`,
    })
    .from(schema.knowledgeBaseFiles)
    .where(and(...fileConditions));

  const artifactConditions = [eq(schema.knowledgeBaseArtifacts.userId, userId)];
  if (projectId) {
    artifactConditions.push(eq(schema.knowledgeBaseArtifacts.projectId, projectId));
  }

  const [artifactStats] = await db
    .select({
      count: sql<number>`count(*)`,
      totalSize: sql<number>`coalesce(sum(${schema.knowledgeBaseArtifacts.size}), 0)`,
    })
    .from(schema.knowledgeBaseArtifacts)
    .where(and(...artifactConditions));

  return {
    files: {
      count: Number(fileStats?.count ?? 0),
      totalSize: Number(fileStats?.totalSize ?? 0),
    },
    artifacts: {
      count: Number(artifactStats?.count ?? 0),
      totalSize: Number(artifactStats?.totalSize ?? 0),
    },
    totalSize:
      Number(fileStats?.totalSize ?? 0) + Number(artifactStats?.totalSize ?? 0),
  };
}

export async function unifiedKnowledgeSearch(
  userId: string,
  query: string,
  options: {
    repositoryId?: string;
    projectId?: string;
    limit?: number;
  } = {}
) {
  const limit = options.limit ?? 20;

  const files = await searchKnowledgeFiles(userId, query, {
    repositoryId: options.repositoryId,
    limit,
  });

  const artifactConditions = [eq(schema.knowledgeBaseArtifacts.userId, userId)];
  if (options.projectId) {
    artifactConditions.push(eq(schema.knowledgeBaseArtifacts.projectId, options.projectId));
  }

  const artifacts = await db
    .select({
      id: schema.knowledgeBaseArtifacts.id,
      type: schema.knowledgeBaseArtifacts.type,
      format: schema.knowledgeBaseArtifacts.format,
      storage: schema.knowledgeBaseArtifacts.storage,
      size: schema.knowledgeBaseArtifacts.size,
      stats: schema.knowledgeBaseArtifacts.stats,
      content: schema.knowledgeBaseArtifacts.content,
      createdAt: schema.knowledgeBaseArtifacts.createdAt,
    })
    .from(schema.knowledgeBaseArtifacts)
    .where(
      and(
        ...artifactConditions,
        sql`${schema.knowledgeBaseArtifacts.content}::text ILIKE ${`%${query}%`}`
      )
    )
    .limit(limit);

  const embeddingConditions = [eq(schema.codeEmbeddings.userId, userId)];
  if (options.repositoryId) {
    embeddingConditions.push(eq(schema.codeEmbeddings.repositoryId, options.repositoryId));
  }
  if (options.projectId) {
    embeddingConditions.push(eq(schema.codeEmbeddings.projectId, options.projectId));
  }

  const embeddings = await db
    .select({
      id: schema.codeEmbeddings.id,
      repositoryId: schema.codeEmbeddings.repositoryId,
      filePath: schema.codeEmbeddings.filePath,
      symbol: schema.codeEmbeddings.symbol,
      symbolType: schema.codeEmbeddings.symbolType,
      language: schema.codeEmbeddings.language,
      lineStart: schema.codeEmbeddings.lineStart,
      lineEnd: schema.codeEmbeddings.lineEnd,
      content: schema.codeEmbeddings.content,
    })
    .from(schema.codeEmbeddings)
    .where(
      and(
        ...embeddingConditions,
        sql`(${schema.codeEmbeddings.filePath} ILIKE ${`%${query}%`} OR ${schema.codeEmbeddings.symbol} ILIKE ${`%${query}%`} OR ${schema.codeEmbeddings.content} ILIKE ${`%${query}%`})`
      )
    )
    .limit(limit);

  return { files, artifacts, embeddings };
}

// ========================================================================
// Embedding Backfill
// ========================================================================

export async function backfillKnowledgeBaseEmbeddings(options: {
  userId?: string;
  repositoryId?: string;
  projectId?: string;
  limit?: number;
  batchSize?: number;
  force?: boolean;
  includeS3?: boolean;
} = {}) {
  const limit = options.limit ?? 500;
  const batchSize = options.batchSize ?? 50;
  const force = options.force ?? false;
  const includeS3 = options.includeS3 ?? false;

  const fileConditions = [];
  if (options.userId) fileConditions.push(eq(schema.knowledgeBaseFiles.userId, options.userId));
  if (options.repositoryId) fileConditions.push(eq(schema.knowledgeBaseFiles.repositoryId, options.repositoryId));
  if (options.projectId) fileConditions.push(eq(schema.knowledgeBaseFiles.projectId, options.projectId));
  if (!force) fileConditions.push(sql`${schema.knowledgeBaseFiles.embeddingJson} is null`);

  const artifactConditions = [];
  if (options.userId) artifactConditions.push(eq(schema.knowledgeBaseArtifacts.userId, options.userId));
  if (options.projectId) artifactConditions.push(eq(schema.knowledgeBaseArtifacts.projectId, options.projectId));
  if (!force) artifactConditions.push(sql`${schema.knowledgeBaseArtifacts.embeddingJson} is null`);

  const fileRows = await db
    .select({
      id: schema.knowledgeBaseFiles.id,
      content: schema.knowledgeBaseFiles.content,
      filePath: schema.knowledgeBaseFiles.filePath,
      storage: schema.knowledgeBaseFiles.storage,
      s3: schema.knowledgeBaseFiles.s3,
    })
    .from(schema.knowledgeBaseFiles)
    .where(fileConditions.length > 0 ? and(...fileConditions) : undefined)
    .limit(limit);

  const artifactRows = await db
    .select({
      id: schema.knowledgeBaseArtifacts.id,
      content: schema.knowledgeBaseArtifacts.content,
      stats: schema.knowledgeBaseArtifacts.stats,
    })
    .from(schema.knowledgeBaseArtifacts)
    .where(artifactConditions.length > 0 ? and(...artifactConditions) : undefined)
    .limit(limit);

  const result = {
    files: { processed: 0, updated: 0, skipped: 0, errors: 0 },
    artifacts: { processed: 0, updated: 0, skipped: 0, errors: 0 },
  };

  for (let i = 0; i < fileRows.length; i += batchSize) {
    const batch = fileRows.slice(i, i + batchSize);
    for (const file of batch) {
      result.files.processed++;
      let content = file.content as string | null;
      if (!content && includeS3 && file.storage === "s3" && file.s3) {
        const s3Meta = file.s3 as { bucket: string; key: string; url?: string };
        try {
          content = await downloadS3ObjectText({
            bucket: s3Meta.bucket,
            key: s3Meta.key,
            maxBytes: KB_EMBEDDING_MAX_BYTES,
          });
        } catch (error) {
          logger.warn("Failed to download KB S3 content for embedding", { details: String(error) });
        }
      }

      if (!content) {
        result.files.skipped++;
        continue;
      }
      const embeddingResult = await generateEmbedding(content);
      if (!embeddingResult) {
        result.files.skipped++;
        continue;
      }

      try {
        await db
          .update(schema.knowledgeBaseFiles)
          .set({
            embeddingJson: embeddingResult.embedding,
            embeddingModel: embeddingResult.model,
            updatedAt: new Date(),
          })
          .where(eq(schema.knowledgeBaseFiles.id, file.id));
        result.files.updated++;
      } catch (error) {
        logger.warn("Failed to update KB file embedding", { details: String(error) });
        result.files.errors++;
      }
    }
  }

  for (let i = 0; i < artifactRows.length; i += batchSize) {
    const batch = artifactRows.slice(i, i + batchSize);
    for (const artifact of batch) {
      result.artifacts.processed++;
      const text =
        artifact.content ? JSON.stringify(artifact.content)
          : artifact.stats ? JSON.stringify(artifact.stats)
            : "";
      if (!text) {
        result.artifacts.skipped++;
        continue;
      }

      const embeddingResult = await generateEmbedding(text);
      if (!embeddingResult) {
        result.artifacts.skipped++;
        continue;
      }

      try {
        await db
          .update(schema.knowledgeBaseArtifacts)
          .set({
            embeddingJson: embeddingResult.embedding,
            embeddingModel: embeddingResult.model,
          })
          .where(eq(schema.knowledgeBaseArtifacts.id, artifact.id));
        result.artifacts.updated++;
      } catch (error) {
        logger.warn("Failed to update KB artifact embedding", { details: String(error) });
        result.artifacts.errors++;
      }
    }
  }

  return result;
}
