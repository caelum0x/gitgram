import { Router, Response } from "express";
import { db, schema } from "../db/index.js";
import { eq, and, desc } from "drizzle-orm";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { Errors, asyncHandler } from "../middleware/errors.js";
import {
  getWebSearchService,
  getWebScrapingService,
  WebSearchResult,
} from "../services/web-search.js";

const router = Router();

// All routes require authentication
router.use(apiKeyAuth);

// ============================================================================
// Types
// ============================================================================

interface WebSearchResponse {
  results: WebSearchResult[];
  total: number;
  query: string;
  safe_search: boolean;
  provider: string;
}

interface SearchHistoryEntry {
  id: string;
  query: string;
  results_count: number;
  timestamp: string;
  safe_search: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique ID with prefix
 */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Log a web search event for history tracking
 */
async function logSearchEvent(
  userId: string,
  query: string,
  resultsCount: number,
  safeSearch: boolean,
  provider: string
): Promise<string> {
  const eventId = generateId("ws");

  // Store in events table for history
  await db.insert(schema.events).values({
    projectId: "system", // Use system project for web searches
    userId,
    eventType: "web_search",
    payload: {
      id: eventId,
      query,
      results_count: resultsCount,
      safe_search: safeSearch,
      provider,
    },
  });

  return eventId;
}

// ============================================================================
// POST /v1/web-search - Perform a web search query
// ============================================================================

router.post(
  "/",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { query, limit = 10, safe_search = true, region, language } = req.body;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      throw Errors.missingParameter("query");
    }

    if (query.length > 500) {
      throw Errors.invalidParameter("query", "Query must be 500 characters or less");
    }

    const searchLimit = Math.min(Math.max(1, Number(limit) || 10), 50);
    const safeSearch = Boolean(safe_search);

    const userId = req.user!.userId;
    const searchService = getWebSearchService();
    const providerInfo = searchService.getProviderInfo();

    // Perform the search
    const results = await searchService.search(query.trim(), {
      limit: searchLimit,
      safeSearch,
      region,
      language,
    });

    // Log the search for history
    await logSearchEvent(userId, query.trim(), results.length, safeSearch, providerInfo.provider);

    const response: WebSearchResponse = {
      query: query.trim(),
      safe_search: safeSearch,
      results,
      total: results.length,
      provider: providerInfo.provider,
    };

    res.json(response);
  })
);

// ============================================================================
// POST /v1/web-search/scrape - Scrape content from a URL
// ============================================================================

router.post(
  "/scrape",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { url, selectors, include_markdown = false, timeout = 30000 } = req.body;

    if (!url || typeof url !== "string" || url.trim().length === 0) {
      throw Errors.missingParameter("url");
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      throw Errors.invalidParameter("url", "Invalid URL format");
    }

    // Validate selectors if provided
    if (selectors !== undefined) {
      if (!Array.isArray(selectors)) {
        throw Errors.invalidParameter("selectors", "Selectors must be an array of strings");
      }
      for (const selector of selectors) {
        if (typeof selector !== "string") {
          throw Errors.invalidParameter("selectors", "Each selector must be a string");
        }
      }
    }

    const scrapingService = getWebScrapingService();
    const providerInfo = scrapingService.getProviderInfo();

    // Perform the scrape
    const result = await scrapingService.scrape(url.trim(), {
      selectors,
      includeMarkdown: Boolean(include_markdown),
      timeout: Math.min(Number(timeout) || 30000, 60000),
    });

    res.json({
      ...result,
      provider: providerInfo.provider,
    });
  })
);

// ============================================================================
// GET /v1/web-search/history - Get recent web searches for the user
// ============================================================================

router.get(
  "/history",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { limit = "20", offset = "0" } = req.query;

    const userId = req.user!.userId;
    const queryLimit = Math.min(Math.max(1, Number(limit) || 20), 100);
    const queryOffset = Math.max(0, Number(offset) || 0);

    // Fetch search history from events table
    const events = await db
      .select({
        id: schema.events.id,
        payload: schema.events.payload,
        timestamp: schema.events.timestamp,
      })
      .from(schema.events)
      .where(
        and(
          eq(schema.events.userId, userId),
          eq(schema.events.eventType, "web_search")
        )
      )
      .orderBy(desc(schema.events.timestamp))
      .limit(queryLimit)
      .offset(queryOffset);

    // Transform events to history entries
    const history: SearchHistoryEntry[] = events.map((event: any) => {
      const payload = event.payload as {
        id: string;
        query: string;
        results_count: number;
        safe_search: boolean;
        provider?: string;
      };

      return {
        id: payload.id || event.id,
        query: payload.query,
        results_count: payload.results_count,
        timestamp: event.timestamp?.toISOString() || new Date().toISOString(),
        safe_search: payload.safe_search,
        provider: payload.provider,
      };
    });

    res.json({
      data: history,
      pagination: {
        limit: queryLimit,
        offset: queryOffset,
        has_more: events.length === queryLimit,
      },
    });
  })
);

// ============================================================================
// GET /v1/web-search/providers - Get available search providers
// ============================================================================

router.get(
  "/providers",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const searchService = getWebSearchService();
    const scrapingService = getWebScrapingService();

    const searchInfo = searchService.getProviderInfo();
    const scrapingInfo = scrapingService.getProviderInfo();

    res.json({
      search: {
        active_provider: searchInfo.provider,
        has_api_key: searchInfo.hasApiKey,
        available_providers: [
          {
            id: "brave",
            name: "Brave Search",
            configured: !!process.env.BRAVE_SEARCH_API_KEY,
            env_var: "BRAVE_SEARCH_API_KEY",
          },
          {
            id: "serpapi",
            name: "SerpAPI",
            configured: !!process.env.SERPAPI_KEY,
            env_var: "SERPAPI_KEY",
          },
          {
            id: "serper",
            name: "Serper.dev",
            configured: !!process.env.SERPER_API_KEY,
            env_var: "SERPER_API_KEY",
          },
          {
            id: "duckduckgo",
            name: "DuckDuckGo (Free)",
            configured: true,
            env_var: null,
          },
        ],
      },
      scraping: {
        active_provider: scrapingInfo.provider,
        has_api_key: scrapingInfo.hasApiKey,
        available_providers: [
          {
            id: "firecrawl",
            name: "Firecrawl",
            configured: !!process.env.FIRECRAWL_API_KEY,
            env_var: "FIRECRAWL_API_KEY",
          },
          {
            id: "cheerio",
            name: "Cheerio (Built-in)",
            configured: true,
            env_var: null,
          },
        ],
      },
    });
  })
);

export default router;
