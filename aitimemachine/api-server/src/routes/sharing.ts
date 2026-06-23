/**
 * Session Sharing Routes
 *
 * Endpoints for creating, viewing, listing, and revoking session share links.
 *
 * Authenticated routes (require API key):
 *   POST   /v1/sessions/:id/share            - create a share link
 *   GET    /v1/sessions/:id/shares           - list all shares for a session
 *   DELETE /v1/sessions/:id/shares/:shareId  - revoke a share link
 *
 * Public route (no auth required):
 *   GET    /v1/shared/:shareId               - view a shared session
 */

import { Router, Request, Response } from "express";
import { apiKeyAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { requireScope, SCOPES } from "../middleware/scopeCheck.js";
import { asyncHandler, Errors } from "../middleware/errors.js";
import {
  createShare,
  getShare,
  revokeShare,
  listShares,
  ShareVisibility,
  ShareRecord,
} from "../services/sharingService.js";

const router = Router();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateShareBody {
  visibility?: unknown;
  expiresIn?: unknown;
  teamId?: unknown;
}

interface CreateShareResponse {
  shareId: string;
  shareUrl: string;
  visibility: ShareVisibility;
  expiresAt: string | null;
}

interface ShareListItem {
  shareId: string;
  visibility: ShareVisibility;
  teamId?: string;
  createdAt: string;
  expiresAt: string | null;
  shareUrl: string;
}

function buildShareUrl(shareId: string, req: Request): string {
  const baseUrl =
    process.env.AITM_PUBLIC_URL ||
    `${req.protocol}://${req.get("host")}`;
  return `${baseUrl}/shared/${shareId}`;
}

function formatShareRecord(record: ShareRecord, req: Request): ShareListItem {
  return {
    shareId: record.shareId,
    visibility: record.visibility,
    teamId: record.teamId,
    createdAt: record.createdAt.toISOString(),
    expiresAt: record.expiresAt?.toISOString() ?? null,
    shareUrl: buildShareUrl(record.shareId, req),
  };
}

// ---------------------------------------------------------------------------
// POST /v1/sessions/:id/share
// ---------------------------------------------------------------------------

router.post(
  "/sessions/:id/share",
  apiKeyAuth,
  requireScope(SCOPES.WRITE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const sessionId = req.params.id;
    const userId = req.user!.userId;
    const body = req.body as CreateShareBody;

    const visibility = body.visibility;
    if (
      visibility !== "public" &&
      visibility !== "private" &&
      visibility !== "team"
    ) {
      throw Errors.invalidParameter(
        "visibility",
        "visibility must be one of: public, private, team"
      );
    }

    if (
      body.expiresIn !== undefined &&
      (typeof body.expiresIn !== "number" ||
        !Number.isFinite(body.expiresIn) ||
        body.expiresIn <= 0)
    ) {
      throw Errors.invalidParameter(
        "expiresIn",
        "expiresIn must be a positive number representing hours"
      );
    }

    if (visibility === "team" && typeof body.teamId !== "string") {
      throw Errors.missingParameter("teamId");
    }

    let record: Awaited<ReturnType<typeof createShare>>;
    try {
      record = await createShare(sessionId, userId, {
        visibility,
        expiresIn:
          typeof body.expiresIn === "number" ? body.expiresIn : undefined,
        teamId: typeof body.teamId === "string" ? body.teamId : undefined,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create share";
      if (message.includes("not found or not owned")) {
        throw Errors.notFound("Session", sessionId);
      }
      throw Errors.invalidRequest(message);
    }

    const response: CreateShareResponse = {
      shareId: record.shareId,
      shareUrl: buildShareUrl(record.shareId, req),
      visibility: record.visibility,
      expiresAt: record.expiresAt?.toISOString() ?? null,
    };

    res.status(201).json(response);
  })
);

// ---------------------------------------------------------------------------
// GET /v1/shared/:shareId  (public — no auth required)
// ---------------------------------------------------------------------------

router.get(
  "/shared/:shareId",
  asyncHandler(async (req: Request, res: Response) => {
    const { shareId } = req.params;

    // Optional auth — if a bearer/api-key header is present, honour it for
    // private/team visibility checks, but don't fail if it is absent.
    const authHeader =
      req.headers["x-api-key"] || req.headers["authorization"];
    const requestingUserId = (req as AuthenticatedRequest).user?.userId;
    const teamId =
      typeof req.query.teamId === "string" ? req.query.teamId : undefined;

    let result: Awaited<ReturnType<typeof getShare>>;
    try {
      result = await getShare(shareId, requestingUserId, teamId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Not found";
      if (message.includes("not found")) {
        throw Errors.notFound("Share", shareId);
      }
      if (message.includes("expired")) {
        throw Errors.invalidRequest(
          "This share link has expired",
          "shareId"
        );
      }
      if (
        message.includes("permission") ||
        message.includes("restricted to")
      ) {
        throw Errors.permissionDenied(message);
      }
      throw Errors.invalidRequest(message);
    }

    res.json({
      session: result.session,
      checkpoints: result.checkpoints,
      visibility: result.share.visibility,
      sharedBy: result.sharedBy,
      expiresAt: result.share.expiresAt?.toISOString() ?? null,
      shareId: result.share.shareId,
    });
  })
);

// ---------------------------------------------------------------------------
// DELETE /v1/sessions/:id/shares/:shareId
// ---------------------------------------------------------------------------

router.delete(
  "/sessions/:id/shares/:shareId",
  apiKeyAuth,
  requireScope(SCOPES.WRITE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { shareId } = req.params;
    const userId = req.user!.userId;

    try {
      await revokeShare(shareId, userId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to revoke";
      if (message.includes("not found")) {
        throw Errors.notFound("Share", shareId);
      }
      if (message.includes("permission")) {
        throw Errors.permissionDenied();
      }
      throw Errors.invalidRequest(message);
    }

    res.json({ revoked: true, shareId });
  })
);

// ---------------------------------------------------------------------------
// GET /v1/sessions/:id/shares
// ---------------------------------------------------------------------------

router.get(
  "/sessions/:id/shares",
  apiKeyAuth,
  requireScope(SCOPES.READ),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const sessionId = req.params.id;
    const userId = req.user!.userId;

    let shares: Awaited<ReturnType<typeof listShares>>;
    try {
      shares = await listShares(sessionId, userId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to list";
      if (message.includes("not found or not owned")) {
        throw Errors.notFound("Session", sessionId);
      }
      throw Errors.invalidRequest(message);
    }

    res.json({
      shares: shares.map((s) => formatShareRecord(s, req)),
      total: shares.length,
    });
  })
);

export default router;
