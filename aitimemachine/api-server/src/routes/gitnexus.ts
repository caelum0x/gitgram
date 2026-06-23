/**
 * GitNexus Proxy Routes
 *
 * REST API layer over the gitNexusService helpers. All routes require a valid
 * API key and validate their inputs with Zod before delegating to the service.
 *
 * Mounted at: /v1/gitnexus
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { apiKeyAuth } from "../middleware/auth.js";
import { asyncHandler, Errors } from "../middleware/errors.js";
import { logger } from "../lib/monitoring.js";
import {
  isAvailable,
  analyzeCodeStructure,
  findImpactedFiles,
  getApiRoutes,
  getDependencyGraph,
  searchSymbols,
} from "../services/gitNexusService.js";

const router = Router();
router.use(apiKeyAuth);

// ============================================================================
// Schemas
// ============================================================================

const workspacePathSchema = z.object({
  workspacePath: z
    .string({ required_error: "workspacePath is required" })
    .min(1, "workspacePath must not be empty")
    .max(2048, "workspacePath is too long"),
});

const analyzeBodySchema = workspacePathSchema;

const impactBodySchema = workspacePathSchema.extend({
  changedFile: z
    .string({ required_error: "changedFile is required" })
    .min(1, "changedFile must not be empty")
    .max(2048, "changedFile is too long"),
});

const workspaceQuerySchema = z.object({
  workspacePath: z
    .string({ required_error: "workspacePath query param is required" })
    .min(1, "workspacePath must not be empty")
    .max(2048, "workspacePath is too long"),
});

const symbolQuerySchema = workspaceQuerySchema.extend({
  query: z
    .string({ required_error: "query param is required" })
    .min(1, "query must not be empty")
    .max(500, "query must be 500 characters or less"),
});

// ============================================================================
// GET /gitnexus/status
// ============================================================================

router.get(
  "/status",
  asyncHandler(async (_req: Request, res: Response) => {
    const available = await isAvailable();

    return res.json({
      success: true,
      data: {
        available,
        service: "gitnexus",
      },
    });
  })
);

// ============================================================================
// POST /gitnexus/analyze
// ============================================================================

router.post(
  "/analyze",
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = analyzeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      throw Errors.invalidParameter(first?.path.join(".") || "body", first?.message ?? "Invalid request body");
    }

    const { workspacePath } = parsed.data;

    logger.info("gitnexus: analyzeCodeStructure", { workspacePath });
    const data = await analyzeCodeStructure(workspacePath);

    return res.json({ success: true, data });
  })
);

// ============================================================================
// POST /gitnexus/impact
// ============================================================================

router.post(
  "/impact",
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = impactBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      throw Errors.invalidParameter(first?.path.join(".") || "body", first?.message ?? "Invalid request body");
    }

    const { changedFile, workspacePath } = parsed.data;

    logger.info("gitnexus: findImpactedFiles", { changedFile, workspacePath });
    const data = await findImpactedFiles(changedFile, workspacePath);

    return res.json({ success: true, data });
  })
);

// ============================================================================
// GET /gitnexus/routes
// ============================================================================

router.get(
  "/routes",
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = workspaceQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      throw Errors.invalidParameter(first?.path.join(".") || "query", first?.message ?? "Invalid query parameters");
    }

    const { workspacePath } = parsed.data;

    logger.info("gitnexus: getApiRoutes", { workspacePath });
    const data = await getApiRoutes(workspacePath);

    return res.json({ success: true, data });
  })
);

// ============================================================================
// GET /gitnexus/dependencies
// ============================================================================

router.get(
  "/dependencies",
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = workspaceQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      throw Errors.invalidParameter(first?.path.join(".") || "query", first?.message ?? "Invalid query parameters");
    }

    const { workspacePath } = parsed.data;

    logger.info("gitnexus: getDependencyGraph", { workspacePath });
    const data = await getDependencyGraph(workspacePath);

    return res.json({ success: true, data });
  })
);

// ============================================================================
// GET /gitnexus/symbols
// ============================================================================

router.get(
  "/symbols",
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = symbolQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      throw Errors.invalidParameter(first?.path.join(".") || "query", first?.message ?? "Invalid query parameters");
    }

    const { query, workspacePath } = parsed.data;

    logger.info("gitnexus: searchSymbols", { query, workspacePath });
    const data = await searchSymbols(query, workspacePath);

    return res.json({ success: true, data });
  })
);

// ============================================================================
// Error handler — surface upstream GitNexus failures as 502
// ============================================================================

router.use((err: unknown, _req: Request, res: Response, next: (e: unknown) => void) => {
  if (err instanceof Error && err.message.startsWith("gitNexus:")) {
    logger.error("gitnexus proxy error", err, { message: err.message });
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
