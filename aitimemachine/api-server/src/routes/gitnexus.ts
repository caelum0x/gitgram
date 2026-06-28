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
  detectChanges,
  apiImpact,
  traceSymbols,
  shapeCheck,
  explainTaint,
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

const detectChangesBodySchema = z
  .object({
    scope: z.enum(["unstaged", "staged", "all", "compare"]).default("unstaged"),
    baseRef: z.string().min(1).max(255).optional(),
    worktree: z.string().min(1).max(2048).optional(),
    repo: z.string().min(1).max(2048).optional(),
  })
  .refine((v) => v.scope !== "compare" || (v.baseRef && v.baseRef.length > 0), {
    message: "baseRef is required when scope is 'compare'",
    path: ["baseRef"],
  });

const optionalRepo = z.string().min(1).max(2048).optional();

// api_impact — require at least one of route | file.
const apiImpactShape = {
  route: z.string().min(1).max(2048).optional(),
  file: z.string().min(1).max(2048).optional(),
  repo: optionalRepo,
};
const apiImpactBodySchema = z
  .object(apiImpactShape)
  .refine((v) => Boolean(v.route) || Boolean(v.file), {
    message: "at least one of 'route' or 'file' is required",
    path: ["route"],
  });
const apiImpactQuerySchema = apiImpactBodySchema;

const traceQuerySchema = z
  .object({
    from: z.string().min(1).max(512).optional(),
    fromUid: z.string().min(1).max(512).optional(),
    fromFile: z.string().min(1).max(2048).optional(),
    to: z.string().min(1).max(512).optional(),
    toUid: z.string().min(1).max(512).optional(),
    toFile: z.string().min(1).max(2048).optional(),
    maxDepth: z.coerce.number().int().min(1).max(30).optional(),
    includeTests: z.coerce.boolean().optional(),
    repo: optionalRepo,
  })
  .refine((v) => Boolean(v.from) || Boolean(v.fromUid), {
    message: "a source symbol ('from' or 'fromUid') is required",
    path: ["from"],
  })
  .refine((v) => Boolean(v.to) || Boolean(v.toUid), {
    message: "a target symbol ('to' or 'toUid') is required",
    path: ["to"],
  });

const shapeCheckQuerySchema = z.object({
  route: z.string().min(1).max(2048).optional(),
  repo: optionalRepo,
});

const explainQuerySchema = z.object({
  target: z.string().min(1).max(2048).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  repo: optionalRepo,
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
// POST /gitnexus/detect-changes
// Map a git diff (uncommitted/staged/compare) to affected processes + risk.
// ============================================================================

router.post(
  "/detect-changes",
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = detectChangesBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      throw Errors.invalidParameter(
        first?.path.join(".") || "body",
        first?.message ?? "Invalid request body"
      );
    }

    const { scope, baseRef, worktree, repo } = parsed.data;

    logger.info("gitnexus: detectChanges", { scope, baseRef, repo });
    const data = await detectChanges({ scope, baseRef, worktree, repo });

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
// api-impact — pre-change blast-radius / risk verdict for a route handler.
// Available as GET (query params) and POST (body) for caller convenience.
// ============================================================================

router.get(
  "/api-impact",
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = apiImpactQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      throw Errors.invalidParameter(
        first?.path.join(".") || "query",
        first?.message ?? "Invalid query parameters"
      );
    }

    const { route, file, repo } = parsed.data;
    logger.info("gitnexus: apiImpact", { route, file, repo });
    const data = await apiImpact({ route, file, repo });

    return res.json({ success: true, data });
  })
);

router.post(
  "/api-impact",
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = apiImpactBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      throw Errors.invalidParameter(
        first?.path.join(".") || "body",
        first?.message ?? "Invalid request body"
      );
    }

    const { route, file, repo } = parsed.data;
    logger.info("gitnexus: apiImpact", { route, file, repo });
    const data = await apiImpact({ route, file, repo });

    return res.json({ success: true, data });
  })
);

// ============================================================================
// trace — shortest call/member path between two symbols.
// ============================================================================

router.get(
  "/trace",
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = traceQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      throw Errors.invalidParameter(
        first?.path.join(".") || "query",
        first?.message ?? "Invalid query parameters"
      );
    }

    logger.info("gitnexus: traceSymbols", {
      from: parsed.data.from ?? parsed.data.fromUid,
      to: parsed.data.to ?? parsed.data.toUid,
    });
    const data = await traceSymbols(parsed.data);

    return res.json({ success: true, data });
  })
);

// ============================================================================
// shape-check — API response-shape drift between routes and consumers.
// ============================================================================

router.get(
  "/shape-check",
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = shapeCheckQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      throw Errors.invalidParameter(
        first?.path.join(".") || "query",
        first?.message ?? "Invalid query parameters"
      );
    }

    const { route, repo } = parsed.data;
    logger.info("gitnexus: shapeCheck", { route, repo });
    const data = await shapeCheck({ route, repo });

    return res.json({ success: true, data });
  })
);

// ============================================================================
// explain — persisted taint / security findings (requires --pdg index).
// ============================================================================

router.get(
  "/explain",
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = explainQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      throw Errors.invalidParameter(
        first?.path.join(".") || "query",
        first?.message ?? "Invalid query parameters"
      );
    }

    const { target, limit, repo } = parsed.data;
    logger.info("gitnexus: explainTaint", { target, limit, repo });
    const data = await explainTaint({ target, limit, repo });

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
