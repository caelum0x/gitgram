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
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
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
  queryGraph,
  getSymbolContext,
  runCypher,
  structuralCheck,
  renameSymbol,
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

// query — natural-language, process-grouped graph-RAG retrieval.
// Exposed as GET (query params) and POST (body) for caller convenience.
const queryBodySchema = z.object({
  search_query: z
    .string({ required_error: "search_query is required" })
    .min(1, "search_query must not be empty")
    .max(2000, "search_query is too long"),
  task_context: z.string().min(1).max(2000).optional(),
  goal: z.string().min(1).max(2000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  max_symbols: z.coerce.number().int().min(1).max(200).optional(),
  include_content: z.coerce.boolean().optional(),
  repo: optionalRepo,
  service: z.string().min(1).max(2048).optional(),
});
const queryQuerySchema = queryBodySchema;

// context — 360-degree view of one symbol. At least one of name|uid required.
const contextBodySchema = z
  .object({
    name: z.string().min(1).max(512).optional(),
    uid: z.string().min(1).max(512).optional(),
    file_path: z.string().min(1).max(2048).optional(),
    kind: z.string().min(1).max(64).optional(),
    include_content: z.coerce.boolean().optional(),
    repo: optionalRepo,
    service: z.string().min(1).max(2048).optional(),
  })
  .refine((v) => Boolean(v.name) || Boolean(v.uid), {
    message: "at least one of 'name' or 'uid' is required",
    path: ["name"],
  });
const contextQuerySchema = contextBodySchema;

// cypher — raw parameterized query against the knowledge graph.
const cypherBodySchema = z.object({
  statement: z
    .string({ required_error: "statement is required" })
    .min(1, "statement must not be empty")
    .max(20000, "statement is too long"),
  params: z.record(z.unknown()).optional(),
  repo: optionalRepo,
});

// check — read-only structural CI check.
const checkQuerySchema = z.object({
  cycles: z.coerce.boolean().optional(),
  repo: optionalRepo,
});

// rename — graph-aware coordinated rename (DESTRUCTIVE; dry_run defaults true).
const renameBodySchema = z
  .object({
    new_name: z
      .string({ required_error: "new_name is required" })
      .min(1, "new_name must not be empty")
      .max(512, "new_name is too long"),
    symbol_name: z.string().min(1).max(512).optional(),
    symbol_uid: z.string().min(1).max(512).optional(),
    file_path: z.string().min(1).max(2048).optional(),
    dry_run: z.boolean().optional(),
    repo: optionalRepo,
  })
  .refine((v) => Boolean(v.symbol_name) || Boolean(v.symbol_uid), {
    message: "at least one of 'symbol_name' or 'symbol_uid' is required",
    path: ["symbol_name"],
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
// query — natural-language, process-grouped graph-RAG retrieval.
// The flagship "understand how code works" surface: returns execution flows
// ranked by relevance (BM25 + vector, fused via RRF) rather than a flat symbol
// list. Available as GET (query params) and POST (body).
// ============================================================================

async function runQuery(
  data: z.infer<typeof queryBodySchema>,
  res: Response
): Promise<Response> {
  logger.info("gitnexus: query", {
    searchQuery: data.search_query,
    repo: data.repo,
  });
  const result = await queryGraph({
    searchQuery: data.search_query,
    taskContext: data.task_context,
    goal: data.goal,
    limit: data.limit,
    maxSymbols: data.max_symbols,
    includeContent: data.include_content,
    repo: data.repo,
    service: data.service,
  });
  return res.json({ success: true, data: result });
}

router.get(
  "/query",
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = queryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      throw Errors.invalidParameter(
        first?.path.join(".") || "query",
        first?.message ?? "Invalid query parameters"
      );
    }
    return runQuery(parsed.data, res);
  })
);

router.post(
  "/query",
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = queryBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      throw Errors.invalidParameter(
        first?.path.join(".") || "body",
        first?.message ?? "Invalid request body"
      );
    }
    return runQuery(parsed.data, res);
  })
);

// ============================================================================
// context — 360-degree view of a single symbol (callers/callees, processes,
// file location). Available as GET (query params) and POST (body).
// ============================================================================

async function runContext(
  data: z.infer<typeof contextBodySchema>,
  res: Response
): Promise<Response> {
  logger.info("gitnexus: context", {
    name: data.name ?? data.uid,
    repo: data.repo,
  });
  const result = await getSymbolContext({
    name: data.name,
    uid: data.uid,
    filePath: data.file_path,
    kind: data.kind,
    includeContent: data.include_content,
    repo: data.repo,
    service: data.service,
  });
  return res.json({ success: true, data: result });
}

router.get(
  "/context",
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = contextQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      throw Errors.invalidParameter(
        first?.path.join(".") || "query",
        first?.message ?? "Invalid query parameters"
      );
    }
    return runContext(parsed.data, res);
  })
);

router.post(
  "/context",
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = contextBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      throw Errors.invalidParameter(
        first?.path.join(".") || "body",
        first?.message ?? "Invalid request body"
      );
    }
    return runContext(parsed.data, res);
  })
);

// ============================================================================
// cypher — arbitrary parameterized Cypher against the knowledge graph.
// User values MUST be bound via `params` ($placeholders), never interpolated
// into the statement, so the engine uses prepared-statement binding.
// ============================================================================

router.post(
  "/cypher",
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = cypherBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      throw Errors.invalidParameter(
        first?.path.join(".") || "body",
        first?.message ?? "Invalid request body"
      );
    }

    const { statement, params, repo } = parsed.data;
    logger.info("gitnexus: cypher", {
      statementLength: statement.length,
      paramKeys: params ? Object.keys(params) : [],
      repo,
    });
    const data = await runCypher({ statement, params, repo });

    return res.json({ success: true, data });
  })
);

// ============================================================================
// check — read-only structural CI check (import cycles).
// ============================================================================

router.get(
  "/check",
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = checkQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      throw Errors.invalidParameter(
        first?.path.join(".") || "query",
        first?.message ?? "Invalid query parameters"
      );
    }

    const { cycles, repo } = parsed.data;
    logger.info("gitnexus: check", { cycles, repo });
    const data = await structuralCheck({ cycles, repo });

    return res.json({ success: true, data });
  })
);

// ============================================================================
// rename — graph-aware coordinated rename (DESTRUCTIVE).
//
// Preview-by-default: dry_run defaults to TRUE. A non-preview rename (dry_run:
// false) actually rewrites files, so it requires an authenticated user and is
// recorded to the audit trail before and after execution.
// ============================================================================

router.post(
  "/rename",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const parsed = renameBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      throw Errors.invalidParameter(
        first?.path.join(".") || "body",
        first?.message ?? "Invalid request body"
      );
    }

    const { new_name, symbol_name, symbol_uid, file_path, dry_run, repo } =
      parsed.data;
    const isWrite = dry_run === false;

    // Write-path guard: a destructive (non-dry-run) rename requires an
    // authenticated user identity for the audit trail.
    if (isWrite && !req.user?.userId) {
      throw Errors.invalidParameter(
        "dry_run",
        "a non-preview rename (dry_run: false) requires an authenticated user"
      );
    }

    if (isWrite) {
      logger.warn("gitnexus: rename write requested", {
        userId: req.user?.userId,
        symbol: symbol_name ?? symbol_uid,
        newName: new_name,
        repo,
      });
    } else {
      logger.info("gitnexus: rename preview", {
        symbol: symbol_name ?? symbol_uid,
        newName: new_name,
        repo,
      });
    }

    const data = await renameSymbol({
      newName: new_name,
      symbolName: symbol_name,
      symbolUid: symbol_uid,
      filePath: file_path,
      dryRun: dry_run,
      repo,
    });

    if (isWrite) {
      logger.warn("gitnexus: rename write completed", {
        userId: req.user?.userId,
        symbol: symbol_name ?? symbol_uid,
        newName: new_name,
        fileCount: data.fileCount,
        repo,
      });
    }

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
