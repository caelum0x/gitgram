/**
 * Context7 Library Documentation Routes
 *
 * Resolves library IDs and fetches library documentation in-process via the
 * @upstash/context7-sdk client (no external Context7 server / CONTEXT7_URL
 * proxy). The REST surface is unchanged; only the transport moved from an
 * HTTP JSON-RPC proxy to a direct SDK call.
 *
 * After a successful docs fetch, results are written through to the unified
 * memory layer (saved_contexts, source='library') so /v1/contexts/search/*
 * can return them.
 *
 * All routes require a valid API key. Mounted at: /v1/context7
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { Context7, type Documentation, type Library } from "@upstash/context7-sdk";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { asyncHandler, Errors } from "../middleware/errors.js";
import { logger } from "../lib/monitoring.js";
import { ingestLibraryDoc } from "../services/memoryService.js";

const router = Router();
router.use(apiKeyAuth);

// ============================================================================
// Per-request Context7 client
//
// The Context7 key is resolved per request so each tenant/user can supply their
// own key (and consume their own rate limit) instead of every caller sharing
// one server-wide key. Resolution order mirrors the upstream Context7 MCP
// server's `extractApiKey`:
//   1. Authorization: Bearer <key>
//   2. X-Context7-Key / Context7-API-Key headers
// then falls back to the server-wide CONTEXT7_API_KEY env var.
//
// Note: the product's own API auth uses the `x-api-key` header, so we do NOT
// read `x-api-key` here (it carries the AITM key, not the Context7 key) —
// `X-Context7-Key` is the dedicated per-request Context7 header.
//
// Clients are cached by key so we don't reconstruct an SDK instance on every
// request, while still keeping per-key isolation.
// ============================================================================

const clientCache = new Map<string, Context7>();

/** Read a single header value, taking the first entry of array-valued headers. */
function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

/** Extract a Bearer token from an Authorization header, if present. */
function extractBearerToken(authorization: string | string[] | undefined): string | undefined {
  const header = headerValue(authorization);
  if (!header) {
    return undefined;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : undefined;
}

/**
 * Resolve the effective Context7 API key for a request: a per-request key from
 * headers when supplied, otherwise the server-wide env key. Returns null when
 * no key is available at all.
 */
function resolveApiKey(req: Request): string | null {
  const fromRequest =
    extractBearerToken(req.headers.authorization) ||
    headerValue(req.headers["x-context7-key"]) ||
    headerValue(req.headers["context7-api-key"]);

  const key = (fromRequest && fromRequest.trim()) || process.env.CONTEXT7_API_KEY;
  return key && key.trim().length > 0 ? key.trim() : null;
}

/**
 * Build (or reuse) an SDK client for the request's effective key. Returns null
 * when no key is configured so callers can surface a clean "unavailable" state
 * instead of crashing.
 */
function getClient(req: Request): Context7 | null {
  const apiKey = resolveApiKey(req);
  if (!apiKey) {
    return null;
  }

  const cached = clientCache.get(apiKey);
  if (cached) {
    return cached;
  }

  try {
    const client = new Context7({ apiKey });
    clientCache.set(apiKey, client);
    return client;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn("context7: failed to initialise SDK client", { reason: msg });
    return null;
  }
}

function requireClient(req: Request): Context7 {
  const client = getClient(req);
  if (!client) {
    throw new Error(
      "Context7 not configured: provide an X-Context7-Key header or set CONTEXT7_API_KEY"
    );
  }
  return client;
}

function clampTokens(raw: unknown, defaultVal: number, max = 10_000): number {
  const parsed = Number(raw);
  return isNaN(parsed) ? defaultVal : Math.min(Math.max(1, parsed), max);
}

// ============================================================================
// Schemas
// ============================================================================

const searchQuerySchema = z.object({
  q: z
    .string({ required_error: "q query param is required" })
    .min(1, "q must not be empty")
    .max(500, "q must be 500 characters or less"),
});

// ============================================================================
// GET /context7/status
// ============================================================================

router.get(
  "/status",
  asyncHandler(async (req: Request, res: Response) => {
    let available = false;
    let latencyMs: number | null = null;

    const client = getClient(req);
    if (client) {
      const start = Date.now();
      try {
        // Lightweight reachability probe against the live API.
        await client.searchLibrary("ping", "context7", { type: "json" });
        available = true;
        latencyMs = Date.now() - start;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.info("context7: probe failed", { reason: msg });
      }
    } else {
      logger.info("context7: not configured", { reason: "missing CONTEXT7_API_KEY" });
    }

    return res.json({
      success: true,
      data: {
        available,
        service: "context7",
        latencyMs,
      },
    });
  })
);

// ============================================================================
// GET /context7/search?q=:query
// Resolve a library name to matching Context7 libraries.
// ============================================================================

router.get(
  "/search",
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = searchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      throw Errors.invalidParameter(
        first?.path.join(".") || "q",
        first?.message ?? "Invalid query parameters"
      );
    }

    const { q } = parsed.data;

    logger.info("context7: search", { query: q });
    const libraries: Library[] = await requireClient(req).searchLibrary(q, q, {
      type: "json",
    });

    return res.json({ success: true, data: libraries });
  })
);

// ============================================================================
// GET /context7/libraries/:id/docs?version=&tokens=&topic=&query=
// Fetch documentation for a resolved library ID.
//
// The Context7 `/v2/context` endpoint reranks documentation against the text it
// receives. A `query` / `question` param sends a full natural-language question
// ("How do I set up JWT auth in Express?") for relevance-based retrieval; the
// coarser `topic` (a single subject keyword) is used as a fallback. When both
// are absent we send "overview" to fetch a broad context dump.
// ============================================================================

/**
 * Resolve the retrieval text Context7 reranks against. Prefers an explicit
 * natural-language `query`/`question`, then falls back to `topic`, then to a
 * broad default. Returns the text plus which source it came from.
 */
function resolveRetrievalQuery(req: Request): {
  query: string;
  topic: string | null;
  source: "query" | "topic" | "default";
} {
  const rawQuery =
    typeof req.query.query === "string"
      ? req.query.query
      : typeof req.query.question === "string"
        ? req.query.question
        : "";
  const trimmedQuery = rawQuery.trim();

  const rawTopic = typeof req.query.topic === "string" ? req.query.topic.trim() : "";

  if (trimmedQuery.length > 0) {
    return { query: trimmedQuery, topic: rawTopic.length > 0 ? rawTopic : null, source: "query" };
  }
  if (rawTopic.length > 0) {
    return { query: rawTopic, topic: rawTopic, source: "topic" };
  }
  return { query: "overview", topic: null, source: "default" };
}

router.get(
  "/libraries/:id/docs",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    if (!id || id.trim().length === 0) {
      throw Errors.missingParameter("id");
    }

    // tokens is preserved in the REST contract; the SDK does not expose a
    // per-request token cap, so it is recorded but does not change the call.
    const tokens = clampTokens(req.query.tokens, 5_000);
    const { query, topic, source } = resolveRetrievalQuery(req);
    if (query.length > 2000) {
      throw Errors.invalidParameter("query", "query must be 2000 characters or less");
    }
    const version =
      typeof req.query.version === "string" && req.query.version.trim().length > 0
        ? req.query.version.trim()
        : undefined;

    logger.info("context7: get library docs", {
      libraryId: id,
      version,
      query,
      topic,
      source,
      tokens,
    });

    const docs: Documentation[] = await requireClient(req).getContext(query, id, {
      type: "json",
    });

    // Write-through to the unified memory layer (best-effort; never blocks).
    void ingestLibraryDoc(
      { libraryId: id, topic: topic ?? query, version: version ?? null, docs },
      { userId: req.user?.userId }
    ).catch((error: unknown) => {
      logger.warn("context7: memory write-through failed", {
        libraryId: id,
        details: String(error),
      });
    });

    return res.json({
      success: true,
      libraryId: id,
      version: version ?? null,
      query,
      data: docs,
    });
  })
);

// ============================================================================
// POST /context7/query
// Natural-language query-docs flow: send a full question and a resolved library
// id (or a search term to resolve first) and get back reranked documentation
// for that specific question. Body: { query, libraryId? , library?, version? }.
// ============================================================================

const queryDocsBodySchema = z.object({
  query: z
    .string({ required_error: "query is required" })
    .min(1, "query must not be empty")
    .max(2000, "query must be 2000 characters or less"),
  libraryId: z.string().min(1).max(512).optional(),
  library: z.string().min(1).max(512).optional(),
  version: z.string().min(1).max(128).optional(),
});

router.post(
  "/query",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = queryDocsBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      throw Errors.invalidParameter(
        first?.path.join(".") || "body",
        first?.message ?? "Invalid request body"
      );
    }
    if (!parsed.data.libraryId && !parsed.data.library) {
      throw Errors.invalidParameter(
        "libraryId",
        "one of 'libraryId' or 'library' (a search term) is required"
      );
    }

    const { query, version } = parsed.data;
    const client = requireClient(req);

    // Resolve a library search term to a concrete id when no id was supplied,
    // using the query as the relevance signal for the resolve step.
    let libraryId = parsed.data.libraryId?.trim();
    if (!libraryId && parsed.data.library) {
      const matches: Library[] = await client.searchLibrary(query, parsed.data.library, {
        type: "json",
      });
      const top = matches[0];
      if (!top || typeof top.id !== "string" || top.id.trim().length === 0) {
        throw Errors.invalidParameter(
          "library",
          `no Context7 library matched '${parsed.data.library}'`
        );
      }
      libraryId = top.id.trim();
    }

    if (!libraryId) {
      throw Errors.invalidParameter("libraryId", "library id could not be resolved");
    }

    logger.info("context7: query docs", { libraryId, query });

    const docs: Documentation[] = await client.getContext(query, libraryId, {
      type: "json",
    });

    void ingestLibraryDoc(
      { libraryId, topic: query, version: version ?? null, docs },
      { userId: req.user?.userId }
    ).catch((error: unknown) => {
      logger.warn("context7: memory write-through failed", {
        libraryId,
        details: String(error),
      });
    });

    return res.json({
      success: true,
      libraryId,
      version: version ?? null,
      query,
      data: docs,
    });
  })
);

// ============================================================================
// GET /context7/libraries?q=
// List/search libraries (alias of search; q optional).
// ============================================================================

router.get(
  "/libraries",
  asyncHandler(async (req: Request, res: Response) => {
    const q = typeof req.query.q === "string" ? req.query.q : "";

    logger.info("context7: list libraries", { query: q });
    // The SDK requires a non-empty libraryName; fall back to the query (or a
    // broad term) so a bare /libraries listing still returns results.
    const libraryName = q || "library";
    const libraries: Library[] = await requireClient(req).searchLibrary(
      q || "popular libraries",
      libraryName,
      { type: "json" }
    );

    return res.json({ success: true, data: libraries });
  })
);

// ============================================================================
// Error handler — surface Context7 failures as 502
// ============================================================================

router.use((err: unknown, _req: Request, res: Response, next: (e: unknown) => void) => {
  const isContext7Error =
    err instanceof Error &&
    (err.name === "Context7Error" || err.message.startsWith("Context7"));
  if (isContext7Error) {
    logger.error("context7 error", err, { message: err.message });
    return res.status(502).json({
      success: false,
      error: {
        type: "server_error",
        code: "upstream_error",
        message: err.message,
      },
    });
  }
  next(err);
});

export default router;
