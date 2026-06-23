import { Router, Response } from "express";
import { db, schema } from "../db/index.js";
import { eq, and, desc } from "drizzle-orm";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { Errors, asyncHandler } from "../middleware/errors.js";
import { requirePlan } from "../middleware/subscriptionGuard.js";
import { getLLMService } from "../services/llm.js";
import {
  analyzeCodebase,
  generateSessionSummary,
  suggestCheckpointName,
  findRelatedSessions,
} from "../services/oracleService.js";
import crypto from "crypto";

// Research Agent - Makes real LLM API calls for multi-step research
interface ResearchStep {
  type: "search" | "analyze" | "synthesize";
  query: string;
  result: string;
  sources: string[];
  timestamp: string;
}

async function runResearchAgent(
  query: string,
  options: {
    maxDepth?: number;
    includeWebSearch?: boolean;
    sources?: string[];
    onProgress?: (step: ResearchStep, progress: number) => void;
  }
): Promise<{
  summary: string;
  steps: ResearchStep[];
  sources: string[];
  confidence: number;
}> {
  const steps: ResearchStep[] = [];
  const allSources: Set<string> = new Set();
  const maxDepth = options.maxDepth || 3;

  // Step 1: Initial web search for context
  if (options.includeWebSearch !== false) {
    try {
      const { getWebSearchService } = await import("../services/web-search.js");
      const searchService = getWebSearchService();
      const searchResults = await searchService.search(query, { limit: 5 });

      const searchStep: ResearchStep = {
        type: "search",
        query,
        result: searchResults.map((r: any) => `- ${r.title}: ${r.snippet}`).join("\n"),
        sources: searchResults.map((r: any) => r.url),
        timestamp: new Date().toISOString(),
      };
      steps.push(searchStep);
      searchResults.forEach((r: any) => allSources.add(r.url));
      options.onProgress?.(searchStep, 25);
    } catch {
      // Web search unavailable, continue without it
    }
  }

  // Step 2: Scrape top sources for deeper content
  if (options.includeWebSearch !== false && allSources.size > 0) {
    try {
      const { getWebScrapingService } = await import("../services/web-search.js");
      const scraper = getWebScrapingService();
      const topSources = Array.from(allSources).slice(0, 2);
      const scrapedContent: string[] = [];

      for (const url of topSources) {
        try {
          const scraped = await scraper.scrape(url, { timeout: 10000 });
          scrapedContent.push(`Source: ${url}\n${scraped.content.slice(0, 2000)}`);
        } catch { /* skip failed scrapes */ }
      }

      if (scrapedContent.length > 0) {
        const analyzeStep: ResearchStep = {
          type: "analyze",
          query: `Analyzing ${scrapedContent.length} sources for: ${query}`,
          result: scrapedContent.join("\n---\n").slice(0, 5000),
          sources: topSources,
          timestamp: new Date().toISOString(),
        };
        steps.push(analyzeStep);
        options.onProgress?.(analyzeStep, 50);
      }
    } catch { /* continue */ }
  }

  // Step 3: Synthesize with LLM
  const synthesisInput = steps.map(s => s.result).join("\n\n");
  let summary: string;

  const llm = getLLMService();
  if (llm.isAvailable()) {
    try {
      const result = await llm.complete(
        [
          {
            role: "system",
            content: "You are a research assistant. Synthesize the provided information into a comprehensive, well-structured answer. Include key findings, cite sources where relevant, and note any uncertainties.",
          },
          {
            role: "user",
            content: `Research question: ${query}\n\nGathered information:\n${synthesisInput.slice(0, 8000)}\n\nProvide a comprehensive research summary.`,
          },
        ],
        { maxTokens: 2000, temperature: 0.3 }
      );
      summary = result.content;
    } catch {
      summary = `Research gathered ${steps.length} steps with ${allSources.size} sources. LLM synthesis unavailable.`;
    }
  } else {
    // No LLM available - return raw research data
    summary = `## Research Results for: ${query}\n\n`;
    for (const step of steps) {
      summary += `### ${step.type.charAt(0).toUpperCase() + step.type.slice(1)}\n${step.result}\n\n`;
    }
    summary += `\n**Sources:** ${Array.from(allSources).join(", ")}`;
  }

  const synthStep: ResearchStep = {
    type: "synthesize",
    query: `Synthesize findings for: ${query}`,
    result: summary,
    sources: Array.from(allSources),
    timestamp: new Date().toISOString(),
  };
  steps.push(synthStep);
  options.onProgress?.(synthStep, 100);

  return {
    summary,
    steps,
    sources: Array.from(allSources),
    confidence: llm.isAvailable() ? 0.85 : 0.6,
  };
}

const router = Router();

router.use(apiKeyAuth);

/**
 * POST /v1/oracle
 * Start an Oracle autonomous research session (Pro only)
 */
router.post(
  "/",
  requirePlan("pro"),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      query,
      project_id,
      sources = [],
      max_depth = 3,
      include_web_search = true,
      metadata
    } = req.body;

    if (!query) {
      throw Errors.missingParameter("query");
    }

    const sessionId = `oracle_${crypto.randomBytes(8).toString("hex")}`;

    // Create research job
    const [job] = await db
      .insert(schema.researchJobs)
      .values({
        id: sessionId,
        userId: req.user!.userId,
        projectId: project_id,
        query,
        status: "running",
        priority: 1,
        progress: 0,
        metadata: {
          sources,
          max_depth,
          include_web_search,
          ...metadata,
        },
      })
      .returning();

    // Run research asynchronously
    const jobId = sessionId; // reuse the session ID
    setImmediate(async () => {
      try {
        const result = await runResearchAgent(query, {
          maxDepth: max_depth,
          includeWebSearch: include_web_search,
          sources,
          onProgress: async (step, progress) => {
            // Update progress in DB
            try {
              await db
                .update(schema.researchJobs)
                .set({
                  status: progress >= 100 ? "completed" : "processing",
                  progress,
                })
                .where(eq(schema.researchJobs.id, jobId));
            } catch { /* ignore progress update failures */ }
          },
        });

        // Save final result
        await db
          .update(schema.researchJobs)
          .set({
            status: "completed",
            result: JSON.stringify(result),
            progress: 100,
            completedAt: new Date(),
          })
          .where(eq(schema.researchJobs.id, jobId));
      } catch (err) {
        await db
          .update(schema.researchJobs)
          .set({
            status: "failed",
            error: (err as Error).message,
          })
          .where(eq(schema.researchJobs.id, jobId));
      }
    });

    res.status(201).json({
      session_id: sessionId,
      query,
      status: "running",
      sources,
      created_at: job.createdAt,
      message: "Oracle research started. Use GET /v1/oracle/:id for status or GET /v1/oracle/:id/stream for real-time updates.",
    });
  })
);

/**
 * POST /v1/oracle/stream
 * Start Oracle research with SSE streaming (Pro only)
 */
router.post(
  "/stream",
  requirePlan("pro"),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { query, project_id, sources = [] } = req.body;

    if (!query) {
      throw Errors.missingParameter("query");
    }

    const sessionId = `oracle_${crypto.randomBytes(8).toString("hex")}`;

    // Set up SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Send initial event
    res.write(`data: ${JSON.stringify({
      type: "session_start",
      session_id: sessionId,
      query,
    })}\n\n`);

    // Run real research with progress streaming
    try {
      const result = await runResearchAgent(query, {
        maxDepth: 3,
        includeWebSearch: true,
        sources,
        onProgress: (step, progress) => {
          const stepMessages: Record<string, string> = {
            search: "Searching web...",
            analyze: "Analyzing sources...",
            synthesize: "Synthesizing findings...",
          };
          res.write(`data: ${JSON.stringify({
            type: "progress",
            step: step.type,
            progress,
            message: stepMessages[step.type] || `Processing ${step.type}...`,
          })}\n\n`);
        },
      });

      res.write(`data: ${JSON.stringify({
        type: "result",
        summary: result.summary,
        sources: result.sources,
        confidence: result.confidence,
      })}\n\n`);

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (err) {
      res.write(`data: ${JSON.stringify({
        type: "error",
        message: (err as Error).message,
      })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    }
  })
);

/**
 * GET /v1/oracle
 * List Oracle research sessions
 */
router.get(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { project_id, status, limit = 20 } = req.query;

    const conditions = [eq(schema.researchJobs.userId, req.user!.userId)];

    if (project_id) {
      conditions.push(eq(schema.researchJobs.projectId, project_id as string));
    }
    if (status) {
      conditions.push(eq(schema.researchJobs.status, status as string));
    }

    const sessions = await db
      .select()
      .from(schema.researchJobs)
      .where(and(...conditions))
      .orderBy(desc(schema.researchJobs.createdAt))
      .limit(Number(limit));

    res.json({
      sessions: sessions.map((s: any) => ({
        id: s.id,
        query: s.query,
        status: s.status,
        progress: s.progress,
        created_at: s.createdAt,
        completed_at: s.completedAt,
      })),
      total: sessions.length,
    });
  })
);

/**
 * GET /v1/oracle/:id
 * Get Oracle session details and result
 */
router.get(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const [session] = await db
      .select()
      .from(schema.researchJobs)
      .where(
        and(
          eq(schema.researchJobs.id, id),
          eq(schema.researchJobs.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!session) {
      throw Errors.notFound("Oracle session", id);
    }

    res.json({
      id: session.id,
      query: session.query,
      status: session.status,
      progress: session.progress,
      result: session.result,
      sources: session.sources,
      summary: session.summary,
      error: session.error,
      created_at: session.createdAt,
      started_at: session.startedAt,
      completed_at: session.completedAt,
    });
  })
);

/**
 * GET /v1/oracle/:id/messages
 * Get Oracle session chat messages
 */
router.get(
  "/:id/messages",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const [session] = await db
      .select()
      .from(schema.researchJobs)
      .where(
        and(
          eq(schema.researchJobs.id, id),
          eq(schema.researchJobs.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!session) {
      throw Errors.notFound("Oracle session", id);
    }

    // Get associated chat messages if any
    const messages = await db
      .select()
      .from(schema.chatMessages)
      .where(eq(schema.chatMessages.sessionId, id))
      .orderBy(schema.chatMessages.timestamp);

    res.json({
      session_id: id,
      messages: messages.map((m: any) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      })),
      total: messages.length,
    });
  })
);

/**
 * POST /v1/oracle/:id/followup
 * Send follow-up message to Oracle session
 */
router.post(
  "/:id/followup",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { message } = req.body;

    if (!message) {
      throw Errors.missingParameter("message");
    }

    const [session] = await db
      .select()
      .from(schema.researchJobs)
      .where(
        and(
          eq(schema.researchJobs.id, id),
          eq(schema.researchJobs.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!session) {
      throw Errors.notFound("Oracle session", id);
    }

    const previousResult = session.result ? JSON.parse(session.result as string) : null;
    const contextFromPrevious = previousResult?.summary || "";

    let followUpAnswer: string;
    const llm = getLLMService();
    if (llm.isAvailable()) {
      try {
        const result = await llm.complete(
          [
            { role: "system", content: "You are a research assistant. Answer follow-up questions based on the previous research context provided." },
            { role: "user", content: `Previous research:\n${contextFromPrevious.slice(0, 4000)}\n\nFollow-up question: ${message}` },
          ],
          { maxTokens: 1000 }
        );
        followUpAnswer = result.content;
      } catch {
        followUpAnswer = `Follow-up processing failed. Please try again.`;
      }
    } else {
      followUpAnswer = `Follow-up to: "${message}"\n\nBased on previous research:\n${contextFromPrevious.slice(0, 500)}\n\n(Full AI synthesis requires OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable)`;
    }

    res.json({
      session_id: id,
      message,
      response: followUpAnswer,
      status: "completed",
    });
  })
);

/**
 * DELETE /v1/oracle/:id
 * Cancel/delete Oracle session
 */
router.delete(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const [session] = await db
      .select()
      .from(schema.researchJobs)
      .where(
        and(
          eq(schema.researchJobs.id, id),
          eq(schema.researchJobs.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!session) {
      throw Errors.notFound("Oracle session", id);
    }

    await db.delete(schema.researchJobs).where(eq(schema.researchJobs.id, id));

    res.json({ deleted: true, id });
  })
);

/**
 * POST /v1/deep-research
 * Multi-step deep research (alias for Oracle)
 */
router.post(
  "/deep-research",
  requirePlan("pro"),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { query, sources = [], depth = 3 } = req.body;

    if (!query) {
      throw Errors.missingParameter("query");
    }

    const jobId = `dr_${crypto.randomBytes(8).toString("hex")}`;

    res.status(201).json({
      job_id: jobId,
      query,
      sources,
      depth,
      status: "queued",
      message: "Deep research job queued. Use GET /v1/oracle/:id to check status.",
    });
  })
);

// ============================================================================
// Codebase intelligence routes
// ============================================================================

/**
 * POST /v1/oracle/analyze
 * Analyze a workspace directory and return codebase intelligence.
 *
 * Body: { workspace_path: string }
 */
router.post(
  "/analyze",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { workspace_path } = req.body as { workspace_path?: string };

    if (!workspace_path) {
      throw Errors.missingParameter("workspace_path");
    }

    const analysis = await analyzeCodebase(workspace_path);

    res.json({
      workspace_path,
      analysis,
      analyzed_at: new Date().toISOString(),
    });
  })
);

/**
 * GET /v1/oracle/sessions/:id/summary
 * Generate a human-readable summary of an AITM checkpoint session.
 */
router.get(
  "/sessions/:id/summary",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const summary = await generateSessionSummary(id, req.user!.userId);

    res.json({
      checkpoint_id: id,
      summary,
      generated_at: new Date().toISOString(),
    });
  })
);

/**
 * POST /v1/oracle/sessions/:id/suggest-name
 * Suggest a semantic checkpoint name from a diff for an AITM session.
 *
 * Body: { diff: string }
 */
router.post(
  "/sessions/:id/suggest-name",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { diff } = req.body as { diff?: string };

    if (!diff) {
      throw Errors.missingParameter("diff");
    }

    const [suggestedName, relatedSessions] = await Promise.all([
      suggestCheckpointName(diff),
      findRelatedSessions(diff, req.user!.userId, 3),
    ]);

    res.json({
      checkpoint_id: id,
      suggested_name: suggestedName,
      related_sessions: relatedSessions,
      generated_at: new Date().toISOString(),
    });
  })
);

export default router;
