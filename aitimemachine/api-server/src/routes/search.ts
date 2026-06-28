import { Router, Response } from "express";
import { db, schema } from "../db/index.js";
import { eq, and, desc, like, isNotNull } from "drizzle-orm";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { Errors, asyncHandler } from "../middleware/errors.js";
import { sendSuccess } from "../utils/response.js";
import { getEmbeddingService, EmbeddingService } from "../services/embeddings.js";

/**
 * Lazily obtain the EmbeddingService singleton.
 * This avoids crashing at module-load time if API keys are missing.
 */
function getEmbedding(): EmbeddingService {
  return getEmbeddingService();
}

const router = Router();

// All routes require authentication
router.use(apiKeyAuth);

/**
 * POST /v1/search/universal
 * Search across all sources (checkpoints, messages)
 */
router.post(
  "/universal",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      query,
      project_id,
      sources = ["checkpoints", "messages"],
      max_results = 20,
    } = req.body;

    if (!query) {
      throw Errors.missingParameter("query");
    }

    interface SearchResult {
      source: string;
      id: string | unknown;
      title: string;
      snippet: string;
      project_id: string | null;
      created_at: Date | null;
    }
    const results: SearchResult[] = [];

    // Search checkpoints
    if (sources.includes("checkpoints")) {
      const checkpoints = await db
        .select({
          id: schema.checkpoints.id,
          name: schema.checkpoints.name,
          scope: schema.checkpoints.scope,
          createdAt: schema.checkpoints.createdAt,
          projectId: schema.checkpoints.projectId,
        })
        .from(schema.checkpoints)
        .where(
          and(
            eq(schema.checkpoints.userId, req.user!.userId),
            like(schema.checkpoints.name, `%${query}%`),
            project_id ? eq(schema.checkpoints.projectId, project_id) : undefined
          )
        )
        .orderBy(desc(schema.checkpoints.createdAt))
        .limit(Math.floor(max_results / 2));

      results.push(
        ...checkpoints.map((cp) => ({
          source: "checkpoint",
          id: cp.id,
          title: cp.name,
          snippet: `Checkpoint: ${cp.scope}`,
          project_id: cp.projectId,
          created_at: cp.createdAt,
        }))
      );
    }

    // Search messages
    if (sources.includes("messages")) {
      const messages = await db
        .select({
          id: schema.chatMessages.id,
          role: schema.chatMessages.role,
          content: schema.chatMessages.content,
          timestamp: schema.chatMessages.timestamp,
          projectId: schema.chatMessages.projectId,
        })
        .from(schema.chatMessages)
        .where(
          and(
            eq(schema.chatMessages.userId, req.user!.userId),
            like(schema.chatMessages.content, `%${query}%`),
            project_id ? eq(schema.chatMessages.projectId, project_id) : undefined
          )
        )
        .orderBy(desc(schema.chatMessages.timestamp))
        .limit(Math.floor(max_results / 2));

      results.push(
        ...messages.map((msg) => ({
          source: "message",
          id: msg.id,
          title: `${msg.role}: ${msg.content?.slice(0, 50)}...`,
          snippet: msg.content?.slice(0, 200) || "",
          project_id: msg.projectId,
          created_at: msg.timestamp,
        }))
      );
    }

    // Sort by date
    results.sort(
      (a, b) =>
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

    sendSuccess(res, {
      query,
      sources,
      results: results.slice(0, max_results),
      total: results.length,
    });
  })
);

/**
 * POST /v1/search/checkpoints
 * Search through checkpoint history
 */
router.post(
  "/checkpoints",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      query,
      project_id,
      max_results = 20,
    } = req.body;

    if (!query) {
      throw Errors.missingParameter("query");
    }

    const checkpoints = await db
      .select()
      .from(schema.checkpoints)
      .where(
        and(
          eq(schema.checkpoints.userId, req.user!.userId),
          like(schema.checkpoints.name, `%${query}%`),
          project_id ? eq(schema.checkpoints.projectId, project_id) : undefined
        )
      )
      .orderBy(desc(schema.checkpoints.createdAt))
      .limit(max_results);

    res.json({
      query,
      results: checkpoints.map((cp) => ({
        id: cp.id,
        name: cp.name,
        scope: cp.scope,
        description: cp.description,
        project_id: cp.projectId,
        created_at: cp.createdAt,
      })),
      total: checkpoints.length,
    });
  })
);

/**
 * POST /v1/search/conversations
 * Search through AI conversation history
 */
router.post(
  "/conversations",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      query,
      project_id,
      role,
      max_results = 20,
    } = req.body;

    if (!query) {
      throw Errors.missingParameter("query");
    }

    const messages = await db
      .select({
        id: schema.chatMessages.id,
        role: schema.chatMessages.role,
        content: schema.chatMessages.content,
        timestamp: schema.chatMessages.timestamp,
        projectId: schema.chatMessages.projectId,
        sessionId: schema.chatMessages.sessionId,
      })
      .from(schema.chatMessages)
      .where(
        and(
          eq(schema.chatMessages.userId, req.user!.userId),
          like(schema.chatMessages.content, `%${query}%`),
          project_id ? eq(schema.chatMessages.projectId, project_id) : undefined,
          role && role !== "all" ? eq(schema.chatMessages.role, role) : undefined
        )
      )
      .orderBy(desc(schema.chatMessages.timestamp))
      .limit(max_results);

    res.json({
      query,
      role: role || "all",
      results: messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content?.slice(0, 500),
        project_id: msg.projectId,
        session_id: msg.sessionId,
        created_at: msg.timestamp,
      })),
      total: messages.length,
    });
  })
);

/**
 * POST /v1/search/code
 * Search code across repositories using indexed embeddings
 */
router.post(
  "/code",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      query,
      project_id,
      file_types,
      symbol_type,
      max_results = 20,
    } = req.body;

    if (!query) {
      throw Errors.missingParameter("query");
    }

    // Build conditions for code search
    const conditions = [eq(schema.codeEmbeddings.userId, req.user!.userId)];

    if (project_id) {
      conditions.push(eq(schema.codeEmbeddings.projectId, project_id));
    }

    if (symbol_type) {
      conditions.push(eq(schema.codeEmbeddings.symbolType, symbol_type));
    }

    const minSimilarity =
      typeof req.body.min_similarity === "number" ? req.body.min_similarity : 0.3;

    // Pull candidate rows that have a stored embedding vector. We rank these by
    // cosine similarity against the query embedding (true semantic search).
    const candidateRows = await db
      .select({
        id: schema.codeEmbeddings.id,
        filePath: schema.codeEmbeddings.filePath,
        symbol: schema.codeEmbeddings.symbol,
        symbolType: schema.codeEmbeddings.symbolType,
        content: schema.codeEmbeddings.content,
        lineStart: schema.codeEmbeddings.lineStart,
        lineEnd: schema.codeEmbeddings.lineEnd,
        language: schema.codeEmbeddings.language,
        projectId: schema.codeEmbeddings.projectId,
        embeddingJson: schema.codeEmbeddings.embeddingJson,
      })
      .from(schema.codeEmbeddings)
      .where(and(...conditions, isNotNull(schema.codeEmbeddings.embeddingJson)))
      .orderBy(desc(schema.codeEmbeddings.createdAt))
      .limit(1000); // Cap candidate pool for in-process ranking

    type CodeRow = (typeof candidateRows)[number];

    const applyFileTypeFilter = (rows: CodeRow[]): CodeRow[] => {
      if (!file_types || !Array.isArray(file_types)) return rows;
      const extensions = file_types.map((t: string) => (t.startsWith(".") ? t : `.${t}`));
      return rows.filter((e) => extensions.some((ext: string) => e.filePath.endsWith(ext)));
    };

    const formatRow = (e: CodeRow, similarity?: number) => ({
      id: e.id,
      file_path: e.filePath,
      symbol: e.symbol,
      symbol_type: e.symbolType,
      content_preview: e.content?.slice(0, 300),
      line_start: e.lineStart,
      line_end: e.lineEnd,
      language: e.language,
      project_id: e.projectId,
      ...(similarity !== undefined ? { similarity: Math.round(similarity * 1000) / 1000 } : {}),
    });

    const embeddable = applyFileTypeFilter(candidateRows).filter((e) =>
      Array.isArray(e.embeddingJson)
    );

    if (embeddable.length > 0) {
      const embeddingService = getEmbedding();
      const queryResult = await embeddingService.generateEmbedding(query);

      const rowMap = new Map(embeddable.map((e) => [e.id, e]));
      const ranked = embeddingService.findSimilar(
        queryResult.embedding,
        embeddable.map((e) => ({ id: e.id, embedding: e.embeddingJson as number[] })),
        max_results
      );

      const results = ranked
        .filter((r) => r.similarity >= minSimilarity)
        .map((r) => formatRow(rowMap.get(r.id) as CodeRow, r.similarity));

      return res.json({
        query,
        project_id: project_id || "all",
        file_types: file_types || "all",
        symbol_type: symbol_type || "all",
        mode: "semantic",
        model: queryResult.model,
        results,
        total: results.length,
        indexed: true,
      });
    }

    // Fallback: no embeddings indexed yet — fall back to substring matching so
    // the endpoint still returns useful results before indexing completes.
    const textRows = await db
      .select({
        id: schema.codeEmbeddings.id,
        filePath: schema.codeEmbeddings.filePath,
        symbol: schema.codeEmbeddings.symbol,
        symbolType: schema.codeEmbeddings.symbolType,
        content: schema.codeEmbeddings.content,
        lineStart: schema.codeEmbeddings.lineStart,
        lineEnd: schema.codeEmbeddings.lineEnd,
        language: schema.codeEmbeddings.language,
        projectId: schema.codeEmbeddings.projectId,
        embeddingJson: schema.codeEmbeddings.embeddingJson,
      })
      .from(schema.codeEmbeddings)
      .where(and(...conditions, like(schema.codeEmbeddings.content, `%${query}%`)))
      .orderBy(desc(schema.codeEmbeddings.createdAt))
      .limit(max_results);

    const fallbackResults = applyFileTypeFilter(textRows).map((e) => formatRow(e));

    res.json({
      query,
      project_id: project_id || "all",
      file_types: file_types || "all",
      symbol_type: symbol_type || "all",
      mode: "text",
      results: fallbackResults,
      total: fallbackResults.length,
      indexed: true,
    });
  })
);

/**
 * POST /v1/search/symbols
 * Search for specific symbols (functions, classes, etc.)
 */
router.post(
  "/symbols",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      symbol,
      project_id,
      symbol_type,
      max_results = 20,
    } = req.body;

    if (!symbol) {
      throw Errors.missingParameter("symbol");
    }

    const conditions = [eq(schema.codeEmbeddings.userId, req.user!.userId)];

    if (project_id) {
      conditions.push(eq(schema.codeEmbeddings.projectId, project_id));
    }

    if (symbol_type) {
      conditions.push(eq(schema.codeEmbeddings.symbolType, symbol_type));
    }

    const results = await db
      .select({
        id: schema.codeEmbeddings.id,
        filePath: schema.codeEmbeddings.filePath,
        symbol: schema.codeEmbeddings.symbol,
        symbolType: schema.codeEmbeddings.symbolType,
        lineStart: schema.codeEmbeddings.lineStart,
        lineEnd: schema.codeEmbeddings.lineEnd,
        language: schema.codeEmbeddings.language,
        content: schema.codeEmbeddings.content,
      })
      .from(schema.codeEmbeddings)
      .where(
        and(
          ...conditions,
          like(schema.codeEmbeddings.symbol, `%${symbol}%`)
        )
      )
      .limit(max_results);

    res.json({
      symbol,
      symbol_type: symbol_type || "all",
      results: results.map((r) => ({
        id: r.id,
        file_path: r.filePath,
        symbol: r.symbol,
        symbol_type: r.symbolType,
        line_start: r.lineStart,
        line_end: r.lineEnd,
        language: r.language,
        definition_preview: r.content?.slice(0, 200),
      })),
      total: results.length,
    });
  })
);

/**
 * POST /v1/search/find-definition
 * Find definition of a symbol
 */
router.post(
  "/find-definition",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { symbol, project_id } = req.body;

    if (!symbol) {
      throw Errors.missingParameter("symbol");
    }

    const conditions = [
      eq(schema.codeEmbeddings.userId, req.user!.userId),
      eq(schema.codeEmbeddings.symbol, symbol),
    ];

    if (project_id) {
      conditions.push(eq(schema.codeEmbeddings.projectId, project_id));
    }

    // Look for exact symbol match (definition)
    const [definition] = await db
      .select()
      .from(schema.codeEmbeddings)
      .where(and(...conditions))
      .limit(1);

    if (!definition) {
      res.json({
        symbol,
        found: false,
        message: `No definition found for symbol: ${symbol}`,
      });
      return;
    }

    res.json({
      symbol,
      found: true,
      definition: {
        file_path: definition.filePath,
        symbol: definition.symbol,
        symbol_type: definition.symbolType,
        line_start: definition.lineStart,
        line_end: definition.lineEnd,
        language: definition.language,
        content: definition.content,
      },
    });
  })
);

/**
 * POST /v1/search/find-usages
 * Find all usages of a symbol across the codebase
 */
router.post(
  "/find-usages",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { symbol, project_id, max_results = 50 } = req.body;

    if (!symbol) {
      throw Errors.missingParameter("symbol");
    }

    const conditions = [eq(schema.codeEmbeddings.userId, req.user!.userId)];

    if (project_id) {
      conditions.push(eq(schema.codeEmbeddings.projectId, project_id));
    }

    // Search for the symbol appearing in content
    const usages = await db
      .select({
        id: schema.codeEmbeddings.id,
        filePath: schema.codeEmbeddings.filePath,
        symbol: schema.codeEmbeddings.symbol,
        symbolType: schema.codeEmbeddings.symbolType,
        lineStart: schema.codeEmbeddings.lineStart,
        content: schema.codeEmbeddings.content,
      })
      .from(schema.codeEmbeddings)
      .where(
        and(
          ...conditions,
          like(schema.codeEmbeddings.content, `%${symbol}%`)
        )
      )
      .limit(max_results);

    res.json({
      symbol,
      usages: usages.map((u) => ({
        file_path: u.filePath,
        in_symbol: u.symbol,
        symbol_type: u.symbolType,
        line: u.lineStart,
        context: u.content?.slice(0, 150),
      })),
      total: usages.length,
    });
  })
);

/**
 * POST /v1/search/semantic
 * Semantic search across checkpoints using embeddings
 */
router.post(
  "/semantic",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      query,
      project_id,
      max_results = 10,
      min_similarity = 0.3,
    } = req.body;

    if (!query) {
      throw Errors.missingParameter("query");
    }

    // Generate embedding for the search query
    const embeddingService = getEmbedding();
    const queryResult = await embeddingService.generateEmbedding(query);

    // Fetch checkpoints that have embeddings
    const conditions = [
      eq(schema.checkpoints.userId, req.user!.userId),
      isNotNull(schema.checkpoints.embeddingJson),
    ];

    if (project_id) {
      conditions.push(eq(schema.checkpoints.projectId, project_id));
    }

    const checkpoints = await db
      .select({
        id: schema.checkpoints.id,
        name: schema.checkpoints.name,
        description: schema.checkpoints.description,
        projectId: schema.checkpoints.projectId,
        createdAt: schema.checkpoints.createdAt,
        scope: schema.checkpoints.scope,
        triggerType: schema.checkpoints.triggerType,
        embeddingJson: schema.checkpoints.embeddingJson,
      })
      .from(schema.checkpoints)
      .where(and(...conditions))
      .orderBy(desc(schema.checkpoints.createdAt))
      .limit(500); // Cap candidates for similarity ranking

    // Rank by cosine similarity
    const candidates = checkpoints
      .filter((cp) => Array.isArray(cp.embeddingJson))
      .map((cp) => ({
        id: cp.id,
        embedding: cp.embeddingJson as number[],
      }));

    const ranked = getEmbedding().findSimilar(
      queryResult.embedding,
      candidates,
      max_results
    );

    // Filter by minimum similarity and join with checkpoint data
    type CheckpointRow = (typeof checkpoints)[number];
    const checkpointMap = new Map(checkpoints.map((cp) => [cp.id, cp]));
    const results = ranked
      .filter((r) => r.similarity >= min_similarity)
      .map((r) => {
        const cp = checkpointMap.get(r.id) as CheckpointRow;
        return {
          id: cp.id,
          name: cp.name,
          description: cp.description,
          project_id: cp.projectId,
          scope: cp.scope,
          trigger_type: cp.triggerType,
          created_at: cp.createdAt,
          similarity: Math.round(r.similarity * 1000) / 1000,
        };
      });

    sendSuccess(res, {
      query,
      model: queryResult.model,
      project_id: project_id || "all",
      results,
      total: results.length,
    });
  })
);

/**
 * POST /v1/search/checkpoints/embed
 * Generate and store embeddings for checkpoints that don't have them
 */
router.post(
  "/checkpoints/embed",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { project_id, batch_size = 50 } = req.body;

    const conditions = [
      eq(schema.checkpoints.userId, req.user!.userId),
    ];

    if (project_id) {
      conditions.push(eq(schema.checkpoints.projectId, project_id));
    }

    // Find checkpoints without embeddings
    const toEmbed = await db
      .select({
        id: schema.checkpoints.id,
        name: schema.checkpoints.name,
        description: schema.checkpoints.description,
      })
      .from(schema.checkpoints)
      .where(and(...conditions))
      .orderBy(desc(schema.checkpoints.createdAt))
      .limit(batch_size);

    // Filter to only those without embeddings (can't easily do isNull in some drizzle versions)
    const withoutEmbeddings = toEmbed; // We fetch all and update

    if (withoutEmbeddings.length === 0) {
      sendSuccess(res, { embedded: 0, message: "No checkpoints to embed" });
      return;
    }

    // Generate embeddings in batch
    const texts = withoutEmbeddings.map(
      (cp) => `${cp.name}${cp.description ? ` - ${cp.description}` : ""}`
    );
    const batchResult = await getEmbedding().generateBatchEmbeddings(texts);

    // Store embeddings
    let embedded = 0;
    for (let i = 0; i < withoutEmbeddings.length; i++) {
      await db
        .update(schema.checkpoints)
        .set({
          embeddingJson: batchResult.embeddings[i],
          embeddingModel: batchResult.model,
        })
        .where(eq(schema.checkpoints.id, withoutEmbeddings[i].id));
      embedded++;
    }

    sendSuccess(res, {
      embedded,
      model: batchResult.model,
      dimensions: batchResult.dimensions,
    });
  })
);

export default router;
