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
// In-process Context7 client
// ============================================================================

let _client: Context7 | null = null;

/**
 * Lazily construct the SDK client. Returns null if no API key is configured so
 * callers can surface a clean "unavailable" state instead of crashing.
 */
function getClient(): Context7 | null {
  if (_client) {
    return _client;
  }

  const apiKey = process.env.CONTEXT7_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    _client = new Context7({ apiKey });
    return _client;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn("context7: failed to initialise SDK client", { reason: msg });
    return null;
  }
}

function requireClient(): Context7 {
  const client = getClient();
  if (!client) {
    throw new Error("Context7 not configured: set CONTEXT7_API_KEY");
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
  asyncHandler(async (_req: Request, res: Response) => {
    let available = false;
    let latencyMs: number | null = null;

    const client = getClient();
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
    const libraries: Library[] = await requireClient().searchLibrary(q, q, {
      type: "json",
    });

    return res.json({ success: true, data: libraries });
  })
);

// ============================================================================
// GET /context7/libraries/:id/docs?version=&tokens=&topic=
// Fetch documentation for a resolved library ID.
// ============================================================================

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
    const topic = typeof req.query.topic === "string" ? req.query.topic : "overview";
    const version =
      typeof req.query.version === "string" && req.query.version.trim().length > 0
        ? req.query.version.trim()
        : undefined;

    logger.info("context7: get library docs", { libraryId: id, version, topic, tokens });

    const docs: Documentation[] = await requireClient().getContext(topic, id, {
      type: "json",
    });

    // Write-through to the unified memory layer (best-effort; never blocks).
    void ingestLibraryDoc(
      { libraryId: id, topic, version: version ?? null, docs },
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
    const libraries: Library[] = await requireClient().searchLibrary(
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
