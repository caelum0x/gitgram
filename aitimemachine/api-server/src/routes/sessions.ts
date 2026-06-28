import { Router } from "express";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import {
  getUserSessions,
  revokeSession,
  revokeAllSessions,
  getLocationFromIp,
  SessionInfo,
} from "../services/sessionManager.js";
import { logger } from "../lib/monitoring.js";

const router = Router();

// Response types
interface SessionResponse {
  id: string;
  device: {
    browser?: string;
    os?: string;
    device?: string;
    isMobile?: boolean;
  };
  location: string;
  ip_address: string | null;
  last_active: string | null;
  created_at: string | null;
  expires_at: string;
  is_current: boolean;
}

interface ListSessionsResponse {
  sessions: SessionResponse[];
  total: number;
}

interface RevokeResponse {
  success: boolean;
  message: string;
}

interface RevokeAllResponse {
  success: boolean;
  message: string;
  revoked_count: number;
}

/**
 * Transform internal session info to API response format
 * Uses sync version of getLocationFromIp for immediate response
 *
 * @param session         The session to format.
 * @param currentSessionId The id of the request's own session, when known, so
 *                         it can be flagged as the current device.
 */
function formatSession(
  session: SessionInfo,
  currentSessionId?: string
): SessionResponse {
  // Import the sync version for immediate response
  const { getLocationFromIpSync } = require("../services/sessionManager.js");
  return {
    id: session.id,
    device: session.deviceInfo || {},
    location: getLocationFromIpSync(session.ipAddress),
    ip_address: session.ipAddress,
    last_active: session.lastActiveAt?.toISOString() || null,
    created_at: session.createdAt?.toISOString() || null,
    expires_at: session.expiresAt.toISOString(),
    is_current:
      session.isCurrent ||
      (currentSessionId !== undefined && session.id === currentSessionId),
  };
}

/**
 * GET /v1/sessions
 * List all active sessions for the current user
 */
router.get("/", apiKeyAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;

    // The current session is identified by the session token used to
    // authenticate this request (set by the auth middleware as req.sessionId).
    // Clients using a raw API key without a session token can also pass their
    // session id explicitly via the X-Session-Id header.
    const headerSessionId =
      typeof req.headers["x-session-id"] === "string"
        ? req.headers["x-session-id"]
        : undefined;
    const currentSessionId = req.sessionId ?? headerSessionId;

    const sessions = await getUserSessions(userId);

    const response: ListSessionsResponse = {
      sessions: sessions.map((s) => formatSession(s, currentSessionId)),
      total: sessions.length,
    };

    res.json(response);
  } catch (error) {
    logger.error("Error listing sessions", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({
      error: {
        message: "Failed to list sessions",
        type: "internal_error",
      },
    });
  }
});

/**
 * DELETE /v1/sessions/:id
 * Revoke a specific session
 */
router.delete("/:id", apiKeyAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const sessionId = req.params.id;

    if (!sessionId) {
      return res.status(400).json({
        error: {
          message: "Session ID is required",
          type: "invalid_request_error",
        },
      });
    }

    await revokeSession(sessionId, userId);

    const response: RevokeResponse = {
      success: true,
      message: "Session revoked successfully",
    };

    res.json(response);
  } catch (error) {
    logger.error("Error revoking session", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({
      error: {
        message: "Failed to revoke session",
        type: "internal_error",
      },
    });
  }
});

/**
 * DELETE /v1/sessions
 * Revoke all sessions except the current one
 *
 * Query params:
 *   - except_current: boolean (default: true) - if true, keeps the current session
 *   - current_session_id: string - the ID of the current session to keep
 */
router.delete("/", apiKeyAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const exceptCurrent = req.query.except_current !== "false";
    const currentSessionId = req.query.current_session_id as string | undefined;

    let revokedCount: number;

    if (exceptCurrent && currentSessionId) {
      revokedCount = await revokeAllSessions(userId, currentSessionId);
    } else if (exceptCurrent) {
      // If except_current is true but no session ID provided,
      // we can't determine the current session, so we need to return an error
      // or revoke all sessions. Let's be safe and return an error.
      return res.status(400).json({
        error: {
          message: "current_session_id is required when except_current is true",
          type: "invalid_request_error",
        },
      });
    } else {
      revokedCount = await revokeAllSessions(userId);
    }

    const response: RevokeAllResponse = {
      success: true,
      message: revokedCount > 0
        ? `Revoked ${revokedCount} session(s)`
        : "No sessions to revoke",
      revoked_count: revokedCount,
    };

    res.json(response);
  } catch (error) {
    logger.error("Error revoking all sessions", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({
      error: {
        message: "Failed to revoke sessions",
        type: "internal_error",
      },
    });
  }
});

/**
 * POST /v1/sessions/cleanup
 * Admin endpoint to clean up expired sessions
 * Requires internal auth or admin privileges
 */
router.post("/cleanup", apiKeyAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // Import cleanup function
    const { cleanupExpired } = await import("../services/sessionManager.js");

    const cleanedCount = await cleanupExpired();

    res.json({
      success: true,
      message: `Cleaned up ${cleanedCount} expired session(s)`,
      cleaned_count: cleanedCount,
    });
  } catch (error) {
    logger.error("Error cleaning up sessions", error instanceof Error ? error : undefined, { details: String(error) });
    res.status(500).json({
      error: {
        message: "Failed to cleanup expired sessions",
        type: "internal_error",
      },
    });
  }
});

export default router;
