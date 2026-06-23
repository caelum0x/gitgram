import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/monitoring.js";

// ============================================================================
// Type Augmentation
// ============================================================================

declare global {
  namespace Express {
    interface Request {
      apiVersion?: string;
    }
  }
}

// ============================================================================
// Constants
// ============================================================================

/** Supported API versions in ascending order. */
const SUPPORTED_VERSIONS = ["v1", "v2"] as const;

/** The default version when none is specified. */
const DEFAULT_VERSION = "v1";

/** Versions that are currently deprecated. */
const DEPRECATED_VERSIONS = new Set<string>(["v1"]);

/** Sunset date for deprecated versions (ISO 8601). */
const SUNSET_DATE = "2026-12-31T23:59:59Z";

/** Regex to extract version prefix from URL path (e.g., /v1/, /v2/). */
const VERSION_URL_PATTERN = /^\/v(\d+)\//;

// ============================================================================
// Versioning Middleware
// ============================================================================

/**
 * API versioning middleware.
 *
 * Resolves the API version from the request in the following priority:
 *   1. `X-API-Version` header (e.g., "v1", "v2")
 *   2. URL path prefix (e.g., /v1/sessions, /v2/sessions)
 *   3. Falls back to the default version
 *
 * For legacy `/api/` routes (unversioned), the middleware attaches deprecation
 * headers and logs a warning so clients are aware they should migrate.
 */
export function versioningMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  let version: string | undefined;

  // 1. Check the X-API-Version header
  const headerVersion = req.headers["x-api-version"] as string | undefined;
  if (headerVersion) {
    // Normalize: accept both "v1" and "1"
    version = headerVersion.startsWith("v")
      ? headerVersion.toLowerCase()
      : `v${headerVersion}`;
  }

  // 2. Check URL path prefix
  if (!version) {
    const match = req.originalUrl.match(VERSION_URL_PATTERN);
    if (match) {
      version = `v${match[1]}`;
    }
  }

  // 3. Detect legacy /api/ routes (no version prefix)
  const isLegacyRoute = req.originalUrl.startsWith("/api/");

  // 4. Default
  if (!version) {
    version = DEFAULT_VERSION;
  }

  // Attach version to request
  req.apiVersion = version;

  // Set response header so clients always know which version was resolved
  res.setHeader("X-API-Version", version);

  // Handle legacy /api/ routes - always mark as deprecated
  if (isLegacyRoute) {
    res.setHeader("Deprecation", "true");
    res.setHeader("Sunset", SUNSET_DATE);
    res.setHeader(
      "Link",
      `</v1${req.originalUrl.replace(/^\/api/, "")}>; rel="successor-version"`
    );

    logger.warn("Deprecated API route accessed", {
      path: req.originalUrl,
      method: req.method,
      resolvedVersion: version,
      clientIp:
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        (req.headers["x-real-ip"] as string) ||
        req.socket?.remoteAddress ||
        "unknown",
    });
  }

  next();
}

// ============================================================================
// Version Gate Middleware
// ============================================================================

/**
 * Parse a version string like "v1" or "v2" into its numeric component.
 * Returns 0 if the string cannot be parsed.
 */
function parseVersionNumber(version: string): number {
  const match = version.match(/^v(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Returns middleware that rejects requests below a minimum API version.
 *
 * Usage:
 * ```ts
 * router.get("/new-endpoint", requireVersion("v2"), handler);
 * ```
 */
export function requireVersion(minVersion: string) {
  const minNum = parseVersionNumber(minVersion);

  return (req: Request, res: Response, next: NextFunction) => {
    const requestVersion = req.apiVersion || DEFAULT_VERSION;
    const requestNum = parseVersionNumber(requestVersion);

    if (requestNum < minNum) {
      return res.status(400).json({
        error: {
          type: "version_error",
          code: "unsupported_version",
          message: `This endpoint requires API version ${minVersion} or higher. You are using ${requestVersion}.`,
          details: {
            current_version: requestVersion,
            minimum_version: minVersion,
            upgrade_guide: "https://timemachine.gitgram.app/docs/api/versioning",
          },
        },
      });
    }

    next();
  };
}
