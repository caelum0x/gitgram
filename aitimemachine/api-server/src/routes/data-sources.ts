import { Router, Response } from "express";
import { db, schema } from "../db/index.js";
import { eq, and, desc, like } from "drizzle-orm";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { Errors, asyncHandler } from "../middleware/errors.js";
import { getWebScrapingService } from "../services/web-search.js";
import crypto from "crypto";

const router = Router();

router.use(apiKeyAuth);

// In-memory cache for scraped pages (keyed by data source ID)
const scrapedPagesCache = new Map<
  string,
  {
    url: string;
    title: string;
    content: string;
    markdown?: string;
    metadata?: Record<string, any>;
    scrapedAt: string;
  }
>();

/**
 * GET /v1/data-sources
 * List all indexed data sources (documentation, websites)
 */
router.get(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { limit = 20, offset = 0 } = req.query;

    const sources = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.userId, req.user!.userId))
      .orderBy(desc(schema.projects.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));

    res.json({
      data: sources.map((s: any) => {
        const cached = scrapedPagesCache.get(s.id);
        return {
          id: s.id,
          name: s.name,
          url: s.rootPath,
          type: s.rootPath?.startsWith("http") ? "documentation" : "local",
          status: cached ? "ready" : "pending",
          pages_indexed: cached ? 1 : 0,
          created_at: s.createdAt,
          updated_at: s.updatedAt,
        };
      }),
      has_more: sources.length === Number(limit),
    });
  })
);

/**
 * POST /v1/data-sources
 * Index a new data source (documentation URL) - scrapes immediately
 */
router.post(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { url, name, type = "documentation" } = req.body;

    if (!url) {
      throw Errors.missingParameter("url");
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      throw Errors.invalidParameter("url", "Must be a valid URL");
    }

    const sourceId = `ds_${crypto.randomBytes(8).toString("hex")}`;
    const displayName = name || new URL(url).hostname;

    // Store as a project entry
    await db.insert(schema.projects).values({
      id: sourceId,
      userId: req.user!.userId,
      name: displayName,
      rootPath: url,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Scrape the URL
    const scraper = getWebScrapingService();
    try {
      const result = await scraper.scrape(url, {
        includeMarkdown: true,
        timeout: 15000,
      });

      // Cache the scraped content
      scrapedPagesCache.set(sourceId, {
        url,
        title: result.title || displayName,
        content: result.content,
        markdown: result.markdown,
        metadata: result.metadata,
        scrapedAt: new Date().toISOString(),
      });

      res.status(201).json({
        id: sourceId,
        url,
        name: result.title || displayName,
        type,
        status: "ready",
        title: result.title,
        content_length: result.content.length,
        has_markdown: !!result.markdown,
        metadata: result.metadata,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      // Still create the entry but mark as failed
      res.status(201).json({
        id: sourceId,
        url,
        name: displayName,
        type,
        status: "failed",
        error: (err as Error).message,
        created_at: new Date().toISOString(),
        message: "Scraping failed. The URL may be inaccessible or blocking scrapers.",
      });
    }
  })
);

/**
 * GET /v1/data-sources/:id
 * Get data source details and indexing status
 */
router.get(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const [project] = await db
      .select()
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, id),
          eq(schema.projects.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!project) {
      throw Errors.notFound("Data source", id);
    }

    const cached = scrapedPagesCache.get(id);

    res.json({
      id: project.id,
      name: project.name,
      url: project.rootPath,
      type: project.rootPath?.startsWith("http") ? "documentation" : "local",
      status: cached ? "ready" : "pending",
      pages_indexed: cached ? 1 : 0,
      title: cached?.title || project.name,
      content_length: cached?.content.length || 0,
      metadata: cached?.metadata || null,
      scraped_at: cached?.scrapedAt || null,
      created_at: project.createdAt,
      updated_at: project.updatedAt,
    });
  })
);

/**
 * DELETE /v1/data-sources/:id
 * Delete a data source
 */
router.delete(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const [project] = await db
      .select()
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, id),
          eq(schema.projects.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!project) {
      throw Errors.notFound("Data source", id);
    }

    await db.delete(schema.projects).where(eq(schema.projects.id, id));
    scrapedPagesCache.delete(id);

    res.json({ deleted: true, id });
  })
);

/**
 * GET /v1/data-sources/:id/content
 * Get page content from a data source
 */
router.get(
  "/:id/content",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { format = "text" } = req.query;

    const [project] = await db
      .select()
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, id),
          eq(schema.projects.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!project) {
      throw Errors.notFound("Data source", id);
    }

    // Check cache first
    let cached = scrapedPagesCache.get(id);

    // If not cached and URL exists, scrape on-demand
    if (!cached && project.rootPath?.startsWith("http")) {
      const scraper = getWebScrapingService();
      try {
        const result = await scraper.scrape(project.rootPath, {
          includeMarkdown: true,
          timeout: 15000,
        });

        cached = {
          url: project.rootPath,
          title: result.title || project.name,
          content: result.content,
          markdown: result.markdown,
          metadata: result.metadata,
          scrapedAt: new Date().toISOString(),
        };
        scrapedPagesCache.set(id, cached);
      } catch (err) {
        res.json({
          id,
          url: project.rootPath,
          content: null,
          error: (err as Error).message,
          message: "Failed to fetch content",
        });
        return;
      }
    }

    if (!cached) {
      res.json({
        id,
        content: null,
        message: "No content available for local data source",
      });
      return;
    }

    res.json({
      id,
      url: cached.url,
      title: cached.title,
      content: format === "markdown" ? (cached.markdown || cached.content) : cached.content,
      format: format === "markdown" && cached.markdown ? "markdown" : "text",
      content_length: cached.content.length,
      metadata: cached.metadata,
      scraped_at: cached.scrapedAt,
    });
  })
);

/**
 * GET /v1/data-sources/:id/tree
 * Get documentation tree structure (sections from scraped content)
 */
router.get(
  "/:id/tree",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const [project] = await db
      .select()
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, id),
          eq(schema.projects.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!project) {
      throw Errors.notFound("Data source", id);
    }

    const cached = scrapedPagesCache.get(id);

    if (!cached) {
      res.json({
        id,
        tree: [],
        message: "No content indexed. POST to /v1/data-sources to index.",
      });
      return;
    }

    // Parse headings from content to build a tree
    const content = cached.markdown || cached.content;
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    const tree: Array<{ level: number; title: string; line: number }> = [];
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        tree.push({
          level: match[1].length,
          title: match[2].trim(),
          line: i + 1,
        });
      }
    }

    res.json({
      id,
      url: cached.url,
      title: cached.title,
      tree,
      total_sections: tree.length,
    });
  })
);

/**
 * POST /v1/data-sources/:id/search
 * Search within a data source's content
 */
router.post(
  "/:id/search",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { query, max_results = 20 } = req.body;

    if (!query) {
      throw Errors.missingParameter("query");
    }

    const [project] = await db
      .select()
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, id),
          eq(schema.projects.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!project) {
      throw Errors.notFound("Data source", id);
    }

    const cached = scrapedPagesCache.get(id);

    if (!cached) {
      res.json({
        query,
        data_source_id: id,
        results: [],
        total: 0,
        message: "No content indexed. POST to /v1/data-sources to index.",
      });
      return;
    }

    // Search within the content
    const content = cached.markdown || cached.content;
    const lines = content.split("\n");
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter((t: string) => t.length > 1);

    const results: Array<{
      line: number;
      content: string;
      score: number;
      section?: string;
    }> = [];

    let currentSection = "";

    for (let i = 0; i < lines.length; i++) {
      // Track current section
      const headingMatch = lines[i].match(/^#{1,6}\s+(.+)$/);
      if (headingMatch) {
        currentSection = headingMatch[1].trim();
      }

      const lineLower = lines[i].toLowerCase();
      let score = 0;

      // Exact phrase match
      if (lineLower.includes(queryLower)) {
        score += 5;
      }

      // Term matching
      for (const term of queryTerms) {
        if (lineLower.includes(term)) {
          score += 1;
        }
      }

      if (score > 0) {
        // Include context (1 line before, 1 after)
        const contextStart = Math.max(0, i - 1);
        const contextEnd = Math.min(lines.length, i + 2);
        const context = lines.slice(contextStart, contextEnd).join("\n");

        results.push({
          line: i + 1,
          content: context.slice(0, 300),
          score,
          section: currentSection || undefined,
        });
      }
    }

    // Sort by score and limit
    results.sort((a, b) => b.score - a.score);
    const limited = results.slice(0, max_results);

    res.json({
      query,
      data_source_id: id,
      url: cached.url,
      results: limited,
      total: limited.length,
    });
  })
);

/**
 * PATCH /v1/data-sources/:id
 * Rename/update a data source
 */
router.patch(
  "/:id",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { name } = req.body;

    const [project] = await db
      .select()
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, id),
          eq(schema.projects.userId, req.user!.userId)
        )
      )
      .limit(1);

    if (!project) {
      throw Errors.notFound("Data source", id);
    }

    if (name) {
      await db
        .update(schema.projects)
        .set({ name, updatedAt: new Date() })
        .where(eq(schema.projects.id, id));
    }

    res.json({
      id,
      name: name || project.name,
      updated_at: new Date().toISOString(),
    });
  })
);

export default router;
