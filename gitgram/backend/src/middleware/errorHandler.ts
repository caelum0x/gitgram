import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

/**
 * Standardized error types for structured API responses
 */
export type ApiErrorType =
  | 'invalid_request_error'
  | 'authentication_error'
  | 'permission_denied'
  | 'not_found'
  | 'rate_limit_exceeded'
  | 'server_error'
  | 'conflict'
  | 'payment_required'
  | 'validation_error';

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
 * Custom API Error class for consistent error handling
 */
export class ApiError extends Error {
  public type: ApiErrorType;
  public code: string;
  public statusCode: number;
  public isOperational: boolean;
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
    this.name = 'ApiError';
    this.type = type;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = true;
    this.param = param;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
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

// Backward-compatible aliases
export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export class CustomError extends ApiError {
  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    const type = statusCode >= 500 ? 'server_error' : 'invalid_request_error';
    super(type, 'custom_error', message, statusCode);
    this.isOperational = isOperational;
  }
}

/**
 * Predefined error factories for common errors
 */
export const Errors = {
  // Authentication errors (401)
  unauthorized: (message?: string) =>
    new ApiError(
      'authentication_error',
      'unauthorized',
      message || 'Authentication required',
      401
    ),

  invalidCredentials: () =>
    new ApiError(
      'authentication_error',
      'invalid_credentials',
      'Invalid email or password',
      401
    ),

  invalidToken: () =>
    new ApiError(
      'authentication_error',
      'invalid_token',
      'The token provided is invalid or expired',
      401
    ),

  // Permission errors (403)
  forbidden: (message?: string) =>
    new ApiError(
      'permission_denied',
      'forbidden',
      message || 'You do not have permission to perform this action',
      403
    ),

  notOwner: (resource: string) =>
    new ApiError(
      'permission_denied',
      'not_owner',
      `You do not own this ${resource}`,
      403
    ),

  // Not found errors (404)
  notFound: (resource: string, id?: string) =>
    new ApiError(
      'not_found',
      `${resource.toLowerCase().replace(/\s+/g, '_')}_not_found`,
      id ? `${resource} '${id}' was not found` : `${resource} not found`,
      404
    ),

  userNotFound: (id?: string) =>
    new ApiError(
      'not_found',
      'user_not_found',
      id ? `User '${id}' was not found` : 'User not found',
      404
    ),

  postNotFound: (id?: string) =>
    new ApiError(
      'not_found',
      'post_not_found',
      id ? `Post '${id}' was not found` : 'Post not found',
      404
    ),

  commentNotFound: () =>
    new ApiError('not_found', 'comment_not_found', 'Comment not found', 404),

  conversationNotFound: () =>
    new ApiError('not_found', 'conversation_not_found', 'Conversation not found', 404),

  // Validation errors (400)
  badRequest: (message: string, param?: string) =>
    new ApiError('invalid_request_error', 'bad_request', message, 400, param),

  missingField: (field: string) =>
    new ApiError(
      'validation_error',
      'missing_field',
      `Missing required field: ${field}`,
      400,
      field
    ),

  invalidField: (field: string, message: string) =>
    new ApiError('validation_error', 'invalid_field', message, 400, field),

  // Payment required errors (402)
  paymentRequired: (message?: string) =>
    new ApiError(
      'payment_required',
      'payment_required',
      message || 'Payment is required to access this resource',
      402
    ),

  // Conflict errors (409)
  conflict: (message: string) =>
    new ApiError('conflict', 'conflict', message, 409),

  alreadyExists: (resource: string) =>
    new ApiError('conflict', 'already_exists', `${resource} already exists`, 409),

  // Rate limit errors (429)
  rateLimited: (retryAfter?: number) =>
    new ApiError(
      'rate_limit_exceeded',
      'rate_limit_exceeded',
      'Too many requests. Please try again later.',
      429,
      undefined,
      retryAfter ? { retry_after: retryAfter } : undefined
    ),

  // Server errors (500)
  internal: (message?: string) =>
    new ApiError(
      'server_error',
      'internal_error',
      message || 'An internal server error occurred',
      500
    ),

  serviceUnavailable: (service?: string) =>
    new ApiError(
      'server_error',
      'service_unavailable',
      service
        ? `The ${service} service is currently unavailable`
        : 'Service temporarily unavailable',
      503
    ),
};

/**
 * Error handling middleware for Express
 */
export const errorHandler = (
  err: Error | ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  // Handle ApiError instances
  if (err instanceof ApiError) {
    logger.error('API Error:', {
      type: err.type,
      code: err.code,
      message: err.message,
      statusCode: err.statusCode,
      path: req.path,
      method: req.method,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });

    return res.status(err.statusCode).json(err.toResponse());
  }

  // Handle validation errors from express-validator
  if (err.name === 'ValidationError') {
    const validationError = Errors.badRequest(err.message);
    logger.warn('Validation Error:', { message: err.message, path: req.path });
    return res.status(validationError.statusCode).json(validationError.toResponse());
  }

  // Handle JSON parsing errors
  if (err instanceof SyntaxError && 'body' in err) {
    const parseError = Errors.badRequest('Invalid JSON in request body');
    return res.status(parseError.statusCode).json(parseError.toResponse());
  }

  // Default to internal server error - don't leak details in production
  const statusCode = (err as any).statusCode || 500;
  logger.error('Unhandled Error:', {
    message: err.message,
    statusCode,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  const internalError = Errors.internal(
    process.env.NODE_ENV === 'development' ? err.message : undefined
  );
  return res.status(internalError.statusCode).json(internalError.toResponse());
};

/**
 * Async handler wrapper to catch errors in async route handlers
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
