import { Router, Response } from "express";
import { db, schema } from "../db/index.js";
import { eq, and, desc, like, or, sql, inArray } from "drizzle-orm";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { Errors, asyncHandler } from "../middleware/errors.js";
import crypto from "crypto";
import { getEmbeddingService } from "../services/embeddings.js";
import { logger } from "../lib/monitoring.js";

const router = Router();

// All routes require authentication
router.use(apiKeyAuth);

// Define message type for savedContexts
interface ContextMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

/**
 * Build text for embedding generation from context data
 */
function buildEmbeddingText(
  name: string,
  description: string | undefined | null,
  messages: ContextMessage[]
): string {
  const parts: string[] = [];

  // Include name and description
  parts.push(`Context: ${name}`);
  if (description) {
    parts.push(`Description: ${description}`);
  }

  // Include message content (limit to avoid token limits)
  const messageContent = messages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n")
    .slice(0, 6000); // Limit to ~6000 chars for embedding

  if (messageContent) {
    parts.push(`Conversation:\n${messageContent}`);
  }

  return parts.join("\n\n");
}

/**
 * GET /v1/contexts
 * List conversation contexts with optional filters
 */
router.get(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      projectId,
      project_id, // Support both camelCase and snake_case
      tool,
      tags,
      limit = 20,
      offset = 0,
    } = req.query;

    const effectiveProjectId = (projectId || project_id) as string | undefined;

    const conditions = [eq(schema.savedContexts.userId, req.user!.userId)];

    if (effectiveProjectId) {
      conditions.push(eq(schema.savedContexts.projectId, effectiveProjectId));
    }

    if (tool) {
      conditions.push(eq(schema.savedContexts.tool, tool as string));
    }

    // Filter by tags if provided (contexts must have at least one matching tag)
    let contexts;
    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : (tags as string).split(",");
      // Use SQL to check if any tag matches
      contexts = await db
        .select()
        .from(schema.savedContexts)
        .where(
          and(
            ...conditions,
            sql`${schema.savedContexts.tags} && ARRAY[${sql.join(
              tagArray.map((t) => sql`${t}`),
              sql`, `
            )}]::text[]`
          )
        )
        .orderBy(desc(schema.savedContexts.createdAt))
        .limit(Number(limit))
        .offset(Number(offset));
    } else {
      contexts = await db
        .select()
        .from(schema.savedContexts)
        .where(and(...conditions))
        .orderBy(desc(schema.savedContexts.createdAt))
        .limit(Number(limit))
        .offset(Number(offset));
    }

    res.json({
      data: contexts.map((ctx) => ({
        id: ctx.id,
        project_id: ctx.projectId,
        checkpoint_id: ctx.checkpointId,
        name: ctx.name,
        description: ctx.description,
        tool: ctx.tool,
        is_auto_saved: ctx.isAutoSaved,
        tags: ctx.tags,
        source: ctx.source,
        message_count: ctx.messages?.length || 0,
        open_files: ctx.openFiles,
        git_branch: ctx.gitBranch,
        created_at: ctx.createdAt,
        updated_at: ctx.updatedAt,
      })),
      has_more: contexts.length === Number(limit),
      limit: Number(limit),
      offset: Number(offset),
    });
  })
);

/**
 * POST /v1/contexts
 * Save a new conversation context
 */
router.post(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      projectId,
      project_id, // Support both
      name,
      description,
      messages = [],
      systemPrompt,
      system_prompt,
      openFiles,
      open_files,
      workingDirectory,
      working_directory,
      gitBranch,
      git_branch,
      gitCommit,
      git_commit,
      checkpointId,
      checkpoint_id,
      tool = "claude-code",
      isAutoSaved,
      is_auto_saved,
      tags = [],
      expiresAt,
      expires_at,
      metadata,
    } = req.body;

    const effectiveProjectId = projectId || project_id;
    const effectiveSystemPrompt = systemPrompt || system_prompt;
    const effectiveOpenFiles = openFiles || open_files;
    const effectiveWorkingDirectory = workingDirectory || working_directory;
    const effectiveGitBranch = gitBranch || git_branch;
    const effectiveGitCommit = gitCommit || git_commit;
    const effectiveCheckpointId = checkpointId || checkpoint_id;
    const effectiveIsAutoSaved = isAutoSaved ?? is_auto_saved ?? false;
    const effectiveExpiresAt = expiresAt || expires_at;

    if (!effectiveProjectId) {
      throw Errors.missingParameter("projectId");
    }
    if (!name) {
      throw Errors.missingParameter("name");
    }

    // Verify project belongs to user
    const [project] = await db
      .select()
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, effectiveProjectId),
          eq(schema.projects.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!project) {
      throw Errors.projectNotFound(effectiveProjectId);
    }

    // If checkpointId is provided, verify it exists and belongs to user
    if (effectiveCheckpointId) {
      const [checkpoint] = await db
        .select()
        .from(schema.checkpoints)
        .where(
          and(
            eq(schema.checkpoints.id, effectiveCheckpointId),
            eq(schema.checkpoints.userId, req.user!.userId)
          )
        )
        .limit(1);

      if (!checkpoint) {
        throw Errors.checkpointNotFound(effectiveCheckpointId);
      }
    }

    // Generate context ID
    const contextId = `ctx_${crypto.randomBytes(12).toString("hex")}`;

    // Validate and format messages
    const formattedMessages: ContextMessage[] = messages.map((msg: { role: string; content: unknown; timestamp?: string }) => ({
      role: msg.role as "user" | "assistant" | "system",
      content: String(msg.content),
      timestamp: msg.timestamp || new Date().toISOString(),
    }));

    // Generate embedding for semantic search
    const embeddingService = getEmbeddingService();
    const textForEmbedding = buildEmbeddingText(name, description, formattedMessages);
    let embeddingJson: number[] | null = null;
    let embeddingModel: string | null = null;

    try {
      const embeddingResult = await embeddingService.generateEmbedding(textForEmbedding);
      embeddingJson = embeddingResult.embedding;
      embeddingModel = embeddingResult.model;
    } catch (error) {
      // Log but don't fail - embedding is optional
      logger.warn("Failed to generate embedding for context", { details: String(error) });
    }

    const [context] = await db
      .insert(schema.savedContexts)
      .values({
        id: contextId,
        userId: req.user!.userId,
        projectId: effectiveProjectId,
        checkpointId: effectiveCheckpointId || null,
        name,
        description: description || null,
        messages: formattedMessages,
        systemPrompt: effectiveSystemPrompt || null,
        openFiles: effectiveOpenFiles || null,
        workingDirectory: effectiveWorkingDirectory || null,
        gitBranch: effectiveGitBranch || null,
        gitCommit: effectiveGitCommit || null,
        embeddingJson,
        embeddingModel,
        tool,
        isAutoSaved: effectiveIsAutoSaved,
        tags: tags || null,
        expiresAt: effectiveExpiresAt ? new Date(effectiveExpiresAt) : null,
        metadata: metadata || null,
      })
      .returning();

    res.status(201).json({
      id: context.id,
      project_id: context.projectId,
      checkpoint_id: context.checkpointId,
      name: context.name,
      description: context.description,
      message_count: formattedMessages.length,
      tool: context.tool,
      is_auto_saved: context.isAutoSaved,
      tags: context.tags,
      source: context.source,
      open_files: context.openFiles,
      git_branch: context.gitBranch,
      created_at: context.createdAt,
    });
  })
);

/**
 * GET /v1/contexts/search/text
 * Text search across contexts
 */
router.get(
  "/search/text",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { q, query, projectId, project_id, limit = 20 } = req.query;

    const searchQuery = (q || query) as string;
    const effectiveProjectId = (projectId || project_id) as string | undefined;

    if (!searchQuery) {
      throw Errors.missingParameter("q");
    }

    const conditions = [eq(schema.savedContexts.userId, req.user!.userId)];

    if (effectiveProjectId) {
      conditions.push(eq(schema.savedContexts.projectId, effectiveProjectId));
    }

    // Search in name, description, and message content
    const contexts = await db
      .select()
      .from(schema.savedContexts)
      .where(
        and(
          ...conditions,
          or(
            like(schema.savedContexts.name, `%${searchQuery}%`),
            like(schema.savedContexts.description, `%${searchQuery}%`),
            sql`${schema.savedContexts.messages}::text ILIKE ${`%${searchQuery}%`}`
          )
        )
      )
      .orderBy(desc(schema.savedContexts.createdAt))
      .limit(Number(limit));

    // Extract matching snippets from messages
    const results = contexts.map((ctx) => {
      const matches: Array<{ content: string; timestamp: string }> = [];

      if (ctx.messages) {
        for (const msg of ctx.messages) {
          if (msg.content.toLowerCase().includes(searchQuery.toLowerCase())) {
            // Extract a snippet around the match
            const index = msg.content.toLowerCase().indexOf(searchQuery.toLowerCase());
            const start = Math.max(0, index - 50);
            const end = Math.min(msg.content.length, index + searchQuery.length + 50);
            matches.push({
              content: (start > 0 ? "..." : "") + msg.content.slice(start, end) + (end < msg.content.length ? "..." : ""),
              timestamp: msg.timestamp,
            });
          }
        }
      }

      return {
        id: ctx.id,
        project_id: ctx.projectId,
        name: ctx.name,
        description: ctx.description,
        tool: ctx.tool,
        tags: ctx.tags,
        source: ctx.source,
        matches,
        created_at: ctx.createdAt,
      };
    });

    res.json({
      query: searchQuery,
      results,
      total: results.length,
    });
  })
);

/**
 * GET /v1/contexts/search/semantic
 * Semantic search across contexts using vector embeddings
 */
router.get(
  "/search/semantic",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { q, query, projectId, project_id, limit = 20, threshold = 0.3 } = req.query;

    const searchQuery = (q || query) as string;
    const effectiveProjectId = (projectId || project_id) as string | undefined;
    const similarityThreshold = Number(threshold);

    if (!searchQuery) {
      throw Errors.missingParameter("q");
    }

    // Generate embedding for the query
    const embeddingService = getEmbeddingService();
    const providerInfo = embeddingService.getProviderInfo();

    let queryEmbedding: number[];
    try {
      const embeddingResult = await embeddingService.generateEmbedding(searchQuery);
      queryEmbedding = embeddingResult.embedding;
    } catch (error) {
      // Fall back to text search if embedding fails
      logger.warn("Embedding generation failed, falling back to text search", { details: String(error) });
      return fallbackTextSearch(req, res, searchQuery, effectiveProjectId, Number(limit));
    }

    // Fetch all contexts with embeddings for this user
    const conditions = [eq(schema.savedContexts.userId, req.user!.userId)];
    if (effectiveProjectId) {
      conditions.push(eq(schema.savedContexts.projectId, effectiveProjectId));
    }

    const contexts = await db
      .select()
      .from(schema.savedContexts)
      .where(and(...conditions));

    // Calculate similarity scores
    type SavedContextRow = (typeof contexts)[number];
    const scoredContexts = contexts
      .filter((ctx) => ctx.embeddingJson && Array.isArray(ctx.embeddingJson))
      .map((ctx) => {
        const similarity = embeddingService.cosineSimilarity(
          queryEmbedding,
          ctx.embeddingJson as number[]
        );
        return { ctx, similarity };
      })
      .filter((item) => item.similarity >= similarityThreshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, Number(limit));

    // If no results with embeddings, fall back to text search
    if (scoredContexts.length === 0) {
      // Try text search for contexts without embeddings
      const textResults = contexts
        .filter((ctx) => {
          const searchLower = searchQuery.toLowerCase();
          return (
            ctx.name.toLowerCase().includes(searchLower) ||
            ctx.description?.toLowerCase().includes(searchLower) ||
            JSON.stringify(ctx.messages).toLowerCase().includes(searchLower)
          );
        })
        .slice(0, Number(limit));

      if (textResults.length > 0) {
        return res.json({
          query: searchQuery,
          results: textResults.map((ctx) => ({
            id: ctx.id,
            project_id: ctx.projectId,
            name: ctx.name,
            description: ctx.description,
            tool: ctx.tool,
            tags: ctx.tags,
            source: ctx.source,
            similarity_score: 0.5, // Default score for text matches
            created_at: ctx.createdAt,
          })),
          total: textResults.length,
          search_type: "text_fallback",
          embedding_provider: providerInfo.provider,
        });
      }
    }

    res.json({
      query: searchQuery,
      results: scoredContexts.map(({ ctx, similarity }) => ({
        id: ctx.id,
        project_id: ctx.projectId,
        name: ctx.name,
        description: ctx.description,
        tool: ctx.tool,
        tags: ctx.tags,
        similarity_score: Math.round(similarity * 1000) / 1000,
        created_at: ctx.createdAt,
      })),
      total: scoredContexts.length,
      search_type: "semantic",
      embedding_provider: providerInfo.provider,
      embedding_dimensions: providerInfo.dimensions,
      similarity_threshold: similarityThreshold,
    });
  })
);

/**
 * Fallback to text search when semantic search fails
 */
async function fallbackTextSearch(
  req: AuthenticatedRequest,
  res: Response,
  searchQuery: string,
  projectId: string | undefined,
  limit: number
): Promise<void> {
  const conditions = [eq(schema.savedContexts.userId, req.user!.userId)];
  if (projectId) {
    conditions.push(eq(schema.savedContexts.projectId, projectId));
  }

  const contexts = await db
    .select()
    .from(schema.savedContexts)
    .where(
      and(
        ...conditions,
        or(
          like(schema.savedContexts.name, `%${searchQuery}%`),
          like(schema.savedContexts.description, `%${searchQuery}%`),
          sql`${schema.savedContexts.messages}::text ILIKE ${`%${searchQuery}%`}`
        )
      )
    )
    .orderBy(desc(schema.savedContexts.createdAt))
    .limit(limit);

  res.json({
    query: searchQuery,
    results: contexts.map((ctx) => ({
      id: ctx.id,
      project_id: ctx.projectId,
      name: ctx.name,
      description: ctx.description,
      tool: ctx.tool,
      tags: ctx.tags,
      similarity_score: 0.5,
      created_at: ctx.createdAt,
    })),
    total: contexts.length,
    search_type: "text_fallback",
  });
}

/**
 * GET /v1/contexts/:id
 * Get a specific context by ID
 */
router.get(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const [context] = await db
      .select()
      .from(schema.savedContexts)
      .where(
        and(
          eq(schema.savedContexts.id, id),
          eq(schema.savedContexts.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!context) {
      throw Errors.notFound("Context", id);
    }

    res.json({
      id: context.id,
      project_id: context.projectId,
      checkpoint_id: context.checkpointId,
      name: context.name,
      description: context.description,
      messages: context.messages,
      system_prompt: context.systemPrompt,
      tool_state: context.toolState,
      open_files: context.openFiles,
      working_directory: context.workingDirectory,
      git_branch: context.gitBranch,
      git_commit: context.gitCommit,
      tool: context.tool,
      is_auto_saved: context.isAutoSaved,
      tags: context.tags,
      created_at: context.createdAt,
      updated_at: context.updatedAt,
      expires_at: context.expiresAt,
      metadata: context.metadata,
    });
  })
);

/**
 * PUT /v1/contexts/:id
 * Update a context
 */
router.put(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const {
      name,
      description,
      messages,
      systemPrompt,
      system_prompt,
      openFiles,
      open_files,
      workingDirectory,
      working_directory,
      gitBranch,
      git_branch,
      gitCommit,
      git_commit,
      checkpointId,
      checkpoint_id,
      toolState,
      tool_state,
      tags,
      expiresAt,
      expires_at,
      metadata,
    } = req.body;

    // Verify ownership
    const [existing] = await db
      .select()
      .from(schema.savedContexts)
      .where(
        and(
          eq(schema.savedContexts.id, id),
          eq(schema.savedContexts.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!existing) {
      throw Errors.notFound("Context", id);
    }

    // Build update object with only provided fields
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (messages !== undefined) {
      updates.messages = messages.map((msg: { role: string; content: unknown; timestamp?: string }) => ({
        role: msg.role as "user" | "assistant" | "system",
        content: String(msg.content),
        timestamp: msg.timestamp || new Date().toISOString(),
      }));
    }
    if (systemPrompt !== undefined || system_prompt !== undefined) {
      updates.systemPrompt = systemPrompt ?? system_prompt;
    }
    if (openFiles !== undefined || open_files !== undefined) {
      updates.openFiles = openFiles ?? open_files;
    }
    if (workingDirectory !== undefined || working_directory !== undefined) {
      updates.workingDirectory = workingDirectory ?? working_directory;
    }
    if (gitBranch !== undefined || git_branch !== undefined) {
      updates.gitBranch = gitBranch ?? git_branch;
    }
    if (gitCommit !== undefined || git_commit !== undefined) {
      updates.gitCommit = gitCommit ?? git_commit;
    }
    if (checkpointId !== undefined || checkpoint_id !== undefined) {
      const effectiveCheckpointId = checkpointId ?? checkpoint_id;
      if (effectiveCheckpointId) {
        // Verify checkpoint exists and belongs to user
        const [checkpoint] = await db
          .select()
          .from(schema.checkpoints)
          .where(
            and(
              eq(schema.checkpoints.id, effectiveCheckpointId),
              eq(schema.checkpoints.userId, req.user!.userId)
            )
          )
          .limit(1);
        if (!checkpoint) {
          throw Errors.checkpointNotFound(effectiveCheckpointId);
        }
      }
      updates.checkpointId = effectiveCheckpointId;
    }
    if (toolState !== undefined || tool_state !== undefined) {
      updates.toolState = toolState ?? tool_state;
    }
    if (tags !== undefined) updates.tags = tags;
    if (expiresAt !== undefined || expires_at !== undefined) {
      const exp = expiresAt ?? expires_at;
      updates.expiresAt = exp ? new Date(exp) : null;
    }
    if (metadata !== undefined) updates.metadata = metadata;

    // Regenerate embedding if content changed
    const needsNewEmbedding = name !== undefined || description !== undefined || messages !== undefined;
    if (needsNewEmbedding) {
      const embeddingService = getEmbeddingService();
      const finalName = name ?? existing.name;
      const finalDescription = description ?? existing.description;
      const finalMessages = (updates.messages as ContextMessage[] | undefined) ?? existing.messages ?? [];

      try {
        const textForEmbedding = buildEmbeddingText(finalName, finalDescription, finalMessages);
        const embeddingResult = await embeddingService.generateEmbedding(textForEmbedding);
        updates.embeddingJson = embeddingResult.embedding;
        updates.embeddingModel = embeddingResult.model;
      } catch (error) {
        logger.warn("Failed to regenerate embedding for context", { details: String(error) });
      }
    }

    const [updated] = await db
      .update(schema.savedContexts)
      .set(updates)
      .where(eq(schema.savedContexts.id, id))
      .returning();

    res.json({
      id: updated.id,
      project_id: updated.projectId,
      checkpoint_id: updated.checkpointId,
      name: updated.name,
      description: updated.description,
      message_count: updated.messages?.length || 0,
      tool: updated.tool,
      is_auto_saved: updated.isAutoSaved,
      tags: updated.tags,
      open_files: updated.openFiles,
      git_branch: updated.gitBranch,
      created_at: updated.createdAt,
      updated_at: updated.updatedAt,
    });
  })
);

/**
 * DELETE /v1/contexts/:id
 * Delete a context
 */
router.delete(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    // Verify ownership
    const [existing] = await db
      .select()
      .from(schema.savedContexts)
      .where(
        and(
          eq(schema.savedContexts.id, id),
          eq(schema.savedContexts.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!existing) {
      throw Errors.notFound("Context", id);
    }

    await db
      .delete(schema.savedContexts)
      .where(eq(schema.savedContexts.id, id));

    res.json({
      deleted: true,
      id,
    });
  })
);

/**
 * POST /v1/contexts/:id/regenerate-embedding
 * Regenerate embedding for an existing context
 */
router.post(
  "/:id/regenerate-embedding",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    // Get context and verify ownership
    const [context] = await db
      .select()
      .from(schema.savedContexts)
      .where(
        and(
          eq(schema.savedContexts.id, id),
          eq(schema.savedContexts.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!context) {
      throw Errors.notFound("Context", id);
    }

    // Generate new embedding
    const embeddingService = getEmbeddingService();
    const textForEmbedding = buildEmbeddingText(
      context.name,
      context.description,
      context.messages || []
    );

    const embeddingResult = await embeddingService.generateEmbedding(textForEmbedding);

    // Update the context with new embedding
    await db
      .update(schema.savedContexts)
      .set({
        embeddingJson: embeddingResult.embedding,
        embeddingModel: embeddingResult.model,
        updatedAt: new Date(),
      })
      .where(eq(schema.savedContexts.id, id));

    res.json({
      id,
      embedding_generated: true,
      embedding_model: embeddingResult.model,
      embedding_dimensions: embeddingResult.dimensions,
    });
  })
);

/**
 * POST /v1/contexts/regenerate-all-embeddings
 * Regenerate embeddings for all contexts without embeddings
 */
router.post(
  "/regenerate-all-embeddings",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { projectId, project_id, force = false } = req.body;
    const effectiveProjectId = projectId || project_id;

    // Build conditions
    const conditions = [eq(schema.savedContexts.userId, req.user!.userId)];
    if (effectiveProjectId) {
      conditions.push(eq(schema.savedContexts.projectId, effectiveProjectId));
    }

    // Get contexts that need embeddings
    let contexts = await db
      .select()
      .from(schema.savedContexts)
      .where(and(...conditions));

    // Filter to only those without embeddings (unless force=true)
    if (!force) {
      contexts = contexts.filter((ctx) => !ctx.embeddingJson);
    }

    if (contexts.length === 0) {
      return res.json({
        processed: 0,
        message: "No contexts need embedding regeneration",
      });
    }

    // Generate embeddings
    const embeddingService = getEmbeddingService();
    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const context of contexts) {
      try {
        const textForEmbedding = buildEmbeddingText(
          context.name,
          context.description,
          context.messages || []
        );

        const embeddingResult = await embeddingService.generateEmbedding(textForEmbedding);

        await db
          .update(schema.savedContexts)
          .set({
            embeddingJson: embeddingResult.embedding,
            embeddingModel: embeddingResult.model,
            updatedAt: new Date(),
          })
          .where(eq(schema.savedContexts.id, context.id));

        successCount++;
      } catch (error) {
        errorCount++;
        errors.push({
          id: context.id,
          error: (error as Error).message,
        });
      }
    }

    const providerInfo = embeddingService.getProviderInfo();

    res.json({
      processed: successCount,
      errors: errorCount,
      total: contexts.length,
      embedding_provider: providerInfo.provider,
      embedding_dimensions: providerInfo.dimensions,
      error_details: errors.length > 0 ? errors.slice(0, 10) : undefined, // Limit error details
    });
  })
);

/**
 * GET /v1/contexts/embedding-status
 * Get embedding status for user's contexts
 */
router.get(
  "/embedding-status",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { projectId, project_id } = req.query;
    const effectiveProjectId = (projectId || project_id) as string | undefined;

    const conditions = [eq(schema.savedContexts.userId, req.user!.userId)];
    if (effectiveProjectId) {
      conditions.push(eq(schema.savedContexts.projectId, effectiveProjectId));
    }

    const contexts = await db
      .select()
      .from(schema.savedContexts)
      .where(and(...conditions));

    const withEmbeddings = contexts.filter((ctx) => ctx.embeddingJson);
    const withoutEmbeddings = contexts.filter((ctx) => !ctx.embeddingJson);

    // Get model breakdown
    const modelBreakdown: Record<string, number> = {};
    for (const ctx of withEmbeddings) {
      const model = ctx.embeddingModel || "unknown";
      modelBreakdown[model] = (modelBreakdown[model] || 0) + 1;
    }

    const embeddingService = getEmbeddingService();
    const providerInfo = embeddingService.getProviderInfo();

    res.json({
      total_contexts: contexts.length,
      with_embeddings: withEmbeddings.length,
      without_embeddings: withoutEmbeddings.length,
      embedding_coverage: contexts.length > 0
        ? Math.round((withEmbeddings.length / contexts.length) * 100)
        : 0,
      model_breakdown: modelBreakdown,
      current_provider: providerInfo.provider,
      current_dimensions: providerInfo.dimensions,
      contexts_needing_embedding: withoutEmbeddings.map((ctx) => ({
        id: ctx.id,
        name: ctx.name,
      })),
    });
  })
);

export default router;
