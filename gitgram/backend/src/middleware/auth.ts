import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';

// User type for authenticated requests
export interface AuthUser {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  isAdmin?: boolean;
  isPremium?: boolean;
}

export interface AuthRequest extends Request {
  userId?: string;
  user?: AuthUser;
}

/** Extract JWT from httpOnly cookie (primary) or Authorization header (fallback for migration) */
function extractToken(req: AuthRequest): string | undefined {
  return req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = verifyAccessToken(token);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = extractToken(req);
    if (token) {
      try {
        const decoded = verifyAccessToken(token);
        req.userId = decoded.userId;
      } catch (error) {
        // Invalid token, but continue without auth
      }
    }
    next();
  } catch (error) {
    next();
  }
};

