import { Request, Response, NextFunction } from 'express';

/**
 * Security headers middleware
 * Adds various security-related HTTP headers to protect against common vulnerabilities
 */
export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Prevent clickjacking attacks
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Enable XSS filter in browsers
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Control referrer information
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions Policy (formerly Feature-Policy)
  res.setHeader(
    'Permissions-Policy',
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
  );

  // Strict Transport Security (HSTS) - only in production with HTTPS
  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }

  next();
};

/**
 * Content Security Policy middleware
 * More restrictive CSP for enhanced security
 */
export const contentSecurityPolicy = (req: Request, res: Response, next: NextFunction) => {
  const isDev = process.env.NODE_ENV !== 'production';

  // CSP directives
  const directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'", isDev ? "'unsafe-inline'" : ''].filter(Boolean),
    'style-src': ["'self'", "'unsafe-inline'"], // Many CSS frameworks need unsafe-inline
    'img-src': ["'self'", 'data:', 'https:', 'blob:'],
    'font-src': ["'self'", 'https://fonts.gstatic.com'],
    'connect-src': [
      "'self'",
      'https://api.github.com',
      'wss://*.gitgram.com',
      isDev ? 'ws://localhost:*' : '',
      isDev ? 'http://localhost:*' : '',
    ].filter(Boolean),
    'media-src': ["'self'", 'blob:', 'https:'],
    'object-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    'base-uri': ["'self'"],
    'upgrade-insecure-requests': [],
  };

  const cspHeader = Object.entries(directives)
    .map(([key, values]) => {
      if (values.length === 0) return key;
      return `${key} ${values.join(' ')}`;
    })
    .join('; ');

  res.setHeader('Content-Security-Policy', cspHeader);

  next();
};

/**
 * CORS preflight cache header
 * Allows browsers to cache CORS preflight responses
 */
export const corsCacheHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Cache preflight requests for 24 hours
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  next();
};

/**
 * Remove sensitive headers that might leak server information
 */
export const removeSensitiveHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Remove X-Powered-By header (usually set by Express)
  res.removeHeader('X-Powered-By');

  next();
};

/**
 * Add cache control headers for API responses
 */
export const apiCacheControl = (req: Request, res: Response, next: NextFunction) => {
  // Don't cache API responses by default
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  next();
};

/**
 * Combined security middleware
 * Applies all security headers in one middleware
 */
export const applySecurityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // X-Frame-Options
  res.setHeader('X-Frame-Options', 'DENY');

  // X-Content-Type-Options
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // X-XSS-Protection
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer-Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Remove X-Powered-By
  res.removeHeader('X-Powered-By');

  // HSTS in production
  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }

  // Permissions Policy
  res.setHeader(
    'Permissions-Policy',
    'accelerometer=(), camera=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(self), payment=(), usb=()'
  );

  next();
};

/**
 * Middleware to add request ID for tracing
 */
export const requestId = (req: Request, res: Response, next: NextFunction) => {
  const id = req.headers['x-request-id'] || generateRequestId();
  res.setHeader('X-Request-ID', id);
  (req as any).requestId = id;
  next();
};

function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Export all middlewares
 */
export default {
  securityHeaders,
  contentSecurityPolicy,
  corsCacheHeaders,
  removeSensitiveHeaders,
  apiCacheControl,
  applySecurityHeaders,
  requestId,
};
