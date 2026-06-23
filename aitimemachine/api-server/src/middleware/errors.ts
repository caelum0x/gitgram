import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/monitoring.js";

/**
 * OpenAI-style error types
 */
export type ApiErrorType =
  | "invalid_request_error"
  | "authentication_error"
  | "permission_denied"
  | "not_found"
  | "rate_limit_exceeded"
  | "server_error"
  | "conflict"
  | "validation_error";

/**
 * OpenAI-style API error structure
 */
export interface ApiErrorResponse {
  error: {
    type: ApiErrorType;
    code: string;
    message: string;
    param?: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Normalize a plain error message into the standard API error shape.
 * This is used to keep legacy routes consistent without changing their internals.
 */
export function wrapErrorMessage(statusCode: number, message: string): ApiErrorResponse {
  let type: ApiErrorType;
  let code: string;

  switch (statusCode) {
    case 400:
      type = "invalid_request_error";
      code = "invalid_request";
      break;
    case 401:
      type = "authentication_error";
      code = "authentication_failed";
      break;
    case 403:
      type = "permission_denied";
      code = "permission_denied";
      break;
    case 404:
      type = "not_found";
      code = "not_found";
      break;
    case 409:
      type = "conflict";
      code = "conflict";
      break;
    case 429:
      type = "rate_limit_exceeded";
      code = "rate_limit_exceeded";
      break;
    default:
      type = "server_error";
      code = "server_error";
      break;
  }

  return {
    error: {
      type,
      code,
      message,
    },
  };
}

/**
 * Custom API Error class for consistent error handling
 */
export class ApiError extends Error {
  public type: ApiErrorType;
  public code: string;
  public statusCode: number;
  public param?: string;
  public details?: Record<string, unknown>;

  constructor(
    type: ApiErrorType,
    code: string,
    message: string,
    statusCode: number = 400,
    param?: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiError";
    this.type = type;
    this.code = code;
    this.statusCode = statusCode;
    this.param = param;
    this.details = details;
  }

  toResponse(): ApiErrorResponse {
    const response: ApiErrorResponse = {
      error: {
        type: this.type,
        code: this.code,
        message: this.message,
      },
    };

    if (this.param) {
      response.error.param = this.param;
    }

    if (this.details) {
      response.error.details = this.details;
    }

    return response;
  }
}

/**
 * Predefined error factories for common errors
 */
export const Errors = {
  // Authentication errors (401)
  invalidApiKey: () =>
    new ApiError(
      "authentication_error",
      "invalid_api_key",
      "The API key provided is invalid",
      401
    ),

  missingApiKey: () =>
    new ApiError(
      "authentication_error",
      "missing_api_key",
      "API key is required. Provide it in the X-API-Key header",
      401
    ),

  expiredApiKey: () =>
    new ApiError(
      "authentication_error",
      "expired_api_key",
      "The API key has expired",
      401
    ),

  // Permission errors (403)
  permissionDenied: (resource?: string) =>
    new ApiError(
      "permission_denied",
      "insufficient_permissions",
      resource
        ? `You don't have permission to access ${resource}`
        : "You don't have permission to perform this action",
      403
    ),

  quotaExceeded: (quotaType: string) =>
    new ApiError(
      "permission_denied",
      "quota_exceeded",
      `You have exceeded your ${quotaType} quota`,
      403
    ),

  // Not found errors (404)
  notFound: (resource: string, id?: string) =>
    new ApiError(
      "not_found",
      `${resource.toLowerCase()}_not_found`,
      id ? `${resource} '${id}' was not found` : `${resource} not found`,
      404
    ),

  projectNotFound: (projectId: string) =>
    new ApiError(
      "not_found",
      "project_not_found",
      `Project '${projectId}' was not found`,
      404
    ),

  checkpointNotFound: (checkpointId: string) =>
    new ApiError(
      "not_found",
      "checkpoint_not_found",
      `Checkpoint '${checkpointId}' was not found`,
      404
    ),

  blobNotFound: (hash: string) =>
    new ApiError(
      "not_found",
      "blob_not_found",
      `Blob '${hash}' was not found`,
      404
    ),

  // Validation errors (400)
  invalidRequest: (message: string, param?: string) =>
    new ApiError("invalid_request_error", "invalid_request", message, 400, param),

  missingParameter: (param: string) =>
    new ApiError(
      "validation_error",
      "missing_parameter",
      `Missing required parameter: ${param}`,
      400,
      param
    ),

  invalidParameter: (param: string, message: string) =>
    new ApiError(
      "validation_error",
      "invalid_parameter",
      message,
      400,
      param
    ),

  // Rate limit errors (429)
  rateLimitExceeded: (retryAfter?: number) =>
    new ApiError(
      "rate_limit_exceeded",
      "rate_limit_exceeded",
      "Rate limit exceeded. Please retry after the specified time.",
      429,
      undefined,
      retryAfter ? { retry_after: retryAfter } : undefined
    ),

  // Conflict errors (409)
  conflict: (message: string) =>
    new ApiError("conflict", "conflict", message, 409),

  resourceExists: (resource: string) =>
    new ApiError(
      "conflict",
      "resource_exists",
      `${resource} already exists`,
      409
    ),

  // Server errors (500)
  internal: (message?: string) =>
    new ApiError(
      "server_error",
      "internal_error",
      message || "An internal server error occurred",
      500
    ),

  serviceUnavailable: (service?: string) =>
    new ApiError(
      "server_error",
      "service_unavailable",
      service
        ? `The ${service} service is currently unavailable`
        : "Service temporarily unavailable",
      503
    ),
};

/**
 * Error handling middleware for Express
 * Converts errors to OpenAI-style responses
 */
export function errorHandler(
  err: Error | ApiError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Log error for debugging
  logger.error("Request error", err instanceof Error ? err : undefined, {
    path: req.path,
    method: req.method,
    error: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });

  // Report to Sentry if initialized
  if (process.env.SENTRY_DSN) {
    try {
      const Sentry = require("@sentry/node");
      Sentry.captureException(err);
    } catch (_) {
      // Sentry not available, skip
    }
  }

  // Handle ApiError instances
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json(err.toResponse());
  }

  // Handle validation errors from express-validator or similar
  if (err.name === "ValidationError") {
    const validationError = Errors.invalidRequest(err.message);
    return res.status(validationError.statusCode).json(validationError.toResponse());
  }

  // Handle JSON parsing errors
  if (err instanceof SyntaxError && "body" in err) {
    const parseError = Errors.invalidRequest("Invalid JSON in request body");
    return res.status(parseError.statusCode).json(parseError.toResponse());
  }

  // Default to internal server error
  const internalError = Errors.internal(
    process.env.NODE_ENV === "development" ? err.message : undefined
  );
  return res.status(internalError.statusCode).json(internalError.toResponse());
}

/**
 * 404 handler middleware
 */
export function notFoundHandler(req: Request, res: Response) {
  const error = Errors.notFound("Endpoint", req.path);
  return res.status(error.statusCode).json(error.toResponse());
}

/**
 * Async handler wrapper to catch errors in async route handlers
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
