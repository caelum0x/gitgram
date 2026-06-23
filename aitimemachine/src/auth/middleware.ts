import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth-service.js';
import { validateApiKey } from './api-keys.js';

const authService = new AuthService();

declare global {
  namespace Express {
    interface Request {
      user?: { userId: string; email: string; role: string };
    }
  }
}

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

function extractApiKey(req: Request): string | null {
  return (req.headers['x-api-key'] as string) || null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Try JWT token first
  const token = extractToken(req);
  if (token) {
    const decoded = authService.verifyToken(token);
    if (decoded) {
      req.user = { userId: decoded.userId, email: decoded.email, role: decoded.role };
      return next();
    }
  }

  // Try API key (new system - hashed keys from website)
  const apiKey = extractApiKey(req);
  if (apiKey) {
    const validated = validateApiKey(apiKey);
    if (validated) {
      req.user = { userId: validated.userId, email: '', role: 'user' };
      return next();
    }
    
    // Fallback to old system (local auth-service keys)
    const user = authService.verifyApiKey(apiKey);
    if (user) {
      req.user = { userId: user.id, email: user.email, role: user.role };
      return next();
    }
  }

  res.status(401).json({ error: 'Unauthorized' });
}

export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (token) {
    const decoded = authService.verifyToken(token);
    if (decoded) {
      req.user = { userId: decoded.userId, email: decoded.email, role: decoded.role };
    }
  }

  if (!req.user) {
    const apiKey = extractApiKey(req);
    if (apiKey) {
      const user = authService.verifyApiKey(apiKey);
      if (user) {
        req.user = { userId: user.id, email: user.email, role: user.role };
      }
    }
  }

  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}

// Simple rate limiter
const rateLimits = new Map<string, { count: number; reset: number }>();

export function rateLimit(max = 100, windowMs = 60000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.user?.userId || req.ip || 'anon';
    const now = Date.now();
    let record = rateLimits.get(key);

    if (!record || now > record.reset) {
      record = { count: 0, reset: now + windowMs };
      rateLimits.set(key, record);
    }

    record.count++;
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - record.count));

    if (record.count > max) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
    next();
  };
}
