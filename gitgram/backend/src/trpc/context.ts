/**
 * tRPC context factory.
 *
 * Extracts a verified JWT from either the httpOnly `token` cookie or an
 * `Authorization: Bearer <token>` header, mirroring the existing Express
 * `authenticate` middleware.  The context is available in every procedure
 * resolver via `ctx`.
 */

import type { Request } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthenticatedContext {
  userId: string;
  user: { id: string };
}

export interface UnauthenticatedContext {
  userId: null;
  user: null;
}

export type Context = AuthenticatedContext | UnauthenticatedContext;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Builds the tRPC context from an incoming Express request.
 *
 * Returns `{ userId, user }` when a valid JWT is present, otherwise returns
 * `{ userId: null, user: null }` so public procedures can be called without
 * authentication.
 */
export async function createContext({ req }: { req: Request }): Promise<Context> {
  try {
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.token;
    const headerToken = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const token = cookieToken ?? headerToken;

    if (!token) {
      return { userId: null, user: null };
    }

    const decoded = verifyAccessToken(token);
    return { userId: decoded.userId, user: { id: decoded.userId } };
  } catch (err: unknown) {
    // Invalid / expired token — treat as unauthenticated rather than erroring
    logger.debug('tRPC createContext: token verification failed', err);
    return { userId: null, user: null };
  }
}
