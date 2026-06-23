import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth.js";

// ============================================
// SCOPE CONSTANTS
// ============================================

export const SCOPES = {
  READ: "read",
  WRITE: "write",
  ADMIN: "admin",
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

// All available scopes
export const ALL_SCOPES: Scope[] = [SCOPES.READ, SCOPES.WRITE, SCOPES.ADMIN];

// Default scopes for new API keys
export const DEFAULT_SCOPES: Scope[] = [SCOPES.READ, SCOPES.WRITE];

// ============================================
// SCOPE HIERARCHY
// ============================================

// Admin scope includes all permissions
const SCOPE_HIERARCHY: Record<Scope, Scope[]> = {
  [SCOPES.READ]: [SCOPES.READ],
  [SCOPES.WRITE]: [SCOPES.WRITE],
  [SCOPES.ADMIN]: [SCOPES.READ, SCOPES.WRITE, SCOPES.ADMIN],
};

/**
 * Check if a set of scopes includes the required scope
 * (considering scope hierarchy)
 */
export function hasScope(userScopes: string[], requiredScope: Scope): boolean {
  // Check direct match
  if (userScopes.includes(requiredScope)) {
    return true;
  }

  // Check hierarchy - if user has a scope that includes the required scope
  for (const scope of userScopes) {
    const hierarchy = SCOPE_HIERARCHY[scope as Scope];
    if (hierarchy && hierarchy.includes(requiredScope)) {
      return true;
    }
  }

  return false;
}

// ============================================
// MIDDLEWARE FACTORY
// ============================================

/**
 * Middleware factory that requires a specific scope.
 * Must be used after apiKeyAuth middleware.
 *
 * @param scope - The required scope for the endpoint
 * @returns Express middleware function
 *
 * @example
 * router.get("/data", apiKeyAuth, requireScope("read"), handler);
 * router.post("/data", apiKeyAuth, requireScope("write"), handler);
 * router.delete("/keys/:id", apiKeyAuth, requireScope("admin"), handler);
 */
export function requireScope(scope: Scope) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Ensure user is authenticated
    if (!req.user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Authentication required",
      });
    }

    // Get scopes from the request (set by auth middleware)
    const userScopes = req.apiKeyScopes || [];

    // Check if user has the required scope
    if (!hasScope(userScopes, scope)) {
      return res.status(403).json({
        error: "Forbidden",
        message: `This endpoint requires '${scope}' scope`,
        required_scope: scope,
        your_scopes: userScopes,
      });
    }

    next();
  };
}

/**
 * Middleware factory that requires any one of the specified scopes.
 *
 * @param scopes - Array of acceptable scopes
 * @returns Express middleware function
 */
export function requireAnyScope(scopes: Scope[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Authentication required",
      });
    }

    const userScopes = req.apiKeyScopes || [];

    // Check if user has any of the required scopes
    const hasAnyScope = scopes.some((scope) => hasScope(userScopes, scope));

    if (!hasAnyScope) {
      return res.status(403).json({
        error: "Forbidden",
        message: `This endpoint requires one of the following scopes: ${scopes.join(", ")}`,
        required_scopes: scopes,
        your_scopes: userScopes,
      });
    }

    next();
  };
}

/**
 * Middleware factory that requires all of the specified scopes.
 *
 * @param scopes - Array of required scopes
 * @returns Express middleware function
 */
export function requireAllScopes(scopes: Scope[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Authentication required",
      });
    }

    const userScopes = req.apiKeyScopes || [];

    // Check if user has all required scopes
    const missingScopes = scopes.filter(
      (scope) => !hasScope(userScopes, scope)
    );

    if (missingScopes.length > 0) {
      return res.status(403).json({
        error: "Forbidden",
        message: `This endpoint requires all of the following scopes: ${scopes.join(", ")}`,
        required_scopes: scopes,
        missing_scopes: missingScopes,
        your_scopes: userScopes,
      });
    }

    next();
  };
}

// ============================================
// HTTP METHOD TO SCOPE MAPPING
// ============================================

/**
 * Maps HTTP methods to their default required scopes.
 * Used for automatic scope checking based on request method.
 */
export const METHOD_SCOPE_MAP: Record<string, Scope> = {
  GET: SCOPES.READ,
  HEAD: SCOPES.READ,
  OPTIONS: SCOPES.READ,
  POST: SCOPES.WRITE,
  PUT: SCOPES.WRITE,
  PATCH: SCOPES.WRITE,
  DELETE: SCOPES.WRITE,
};

/**
 * Middleware that automatically checks scope based on HTTP method.
 * GET/HEAD/OPTIONS require 'read', others require 'write'.
 */
export function autoScopeCheck(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Authentication required",
    });
  }

  const requiredScope = METHOD_SCOPE_MAP[req.method] || SCOPES.WRITE;
  const userScopes = req.apiKeyScopes || [];

  if (!hasScope(userScopes, requiredScope)) {
    return res.status(403).json({
      error: "Forbidden",
      message: `${req.method} requests require '${requiredScope}' scope`,
      required_scope: requiredScope,
      your_scopes: userScopes,
    });
  }

  next();
}

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Validate that scopes array contains only valid scopes.
 */
export function validateScopes(scopes: string[]): {
  valid: boolean;
  invalidScopes: string[];
} {
  const invalidScopes = scopes.filter(
    (scope) => !ALL_SCOPES.includes(scope as Scope)
  );
  return {
    valid: invalidScopes.length === 0,
    invalidScopes,
  };
}

/**
 * Normalize scopes array - remove duplicates and invalid scopes.
 */
export function normalizeScopes(scopes: string[]): Scope[] {
  const validScopes = scopes.filter((scope) =>
    ALL_SCOPES.includes(scope as Scope)
  ) as Scope[];
  return [...new Set(validScopes)];
}
