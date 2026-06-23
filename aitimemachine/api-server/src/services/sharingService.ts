/**
 * Sharing Service
 *
 * Manages session share links: creation, validation, revocation, and listing.
 * Each share link is identified by a cryptographically random UUID, which acts
 * as the access token for public/team-scoped shares.
 */

import { randomUUID } from "crypto";
import { db, schema } from "../db/index.js";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "../lib/monitoring.js";

// ---------------------------------------------------------------------------
// In-memory store for share records (replace with a DB table when ready)
// ---------------------------------------------------------------------------
// We use a plain Map here because the schema does not yet have a session_shares
// table. The Map is process-local — acceptable for a single-server deployment.
// When a DB table is added, swap out the helpers below.

export type ShareVisibility = "public" | "private" | "team";

export interface ShareRecord {
  shareId: string;
  sessionId: string;
  ownerId: string;
  visibility: ShareVisibility;
  teamId?: string;
  createdAt: Date;
  expiresAt: Date | null;
}

export interface CreateShareOptions {
  visibility: ShareVisibility;
  /** Duration in hours until the link expires. Omit for no expiry. */
  expiresIn?: number;
  teamId?: string;
}

export interface ShareWithSession {
  share: ShareRecord;
  session: {
    id: string;
    projectId: string;
    tool: string;
    startedAt: string | null;
    endedAt: string | null;
    metadata: unknown;
  };
  checkpoints: Array<{
    id: string;
    name: string;
    description: string | null;
    triggerType: string | null;
    createdAt: string | null;
  }>;
  sharedBy: {
    id: string;
    name: string | null;
    email: string;
  };
}

// Process-local store. Key: shareId, Value: ShareRecord.
const shareStore = new Map<string, ShareRecord>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isExpired(record: ShareRecord): boolean {
  if (!record.expiresAt) return false;
  return record.expiresAt < new Date();
}

// ---------------------------------------------------------------------------
// Public service functions
// ---------------------------------------------------------------------------

/**
 * Create a share link for a session.
 *
 * Verifies the session belongs to `userId` before creating the record.
 * Returns the new ShareRecord on success, or throws on failure.
 */
export async function createShare(
  sessionId: string,
  userId: string,
  options: CreateShareOptions
): Promise<ShareRecord> {
  const { visibility, expiresIn, teamId } = options;

  // Validate visibility
  const validVisibilities: ShareVisibility[] = ["public", "private", "team"];
  if (!validVisibilities.includes(visibility)) {
    throw new Error(`Invalid visibility: ${visibility}`);
  }

  // Team shares must include a teamId
  if (visibility === "team" && !teamId) {
    throw new Error("teamId is required for team-visibility shares");
  }

  // Verify the session exists and belongs to this user
  const [session] = await db
    .select({
      id: schema.chatSessions.id,
      userId: schema.chatSessions.userId,
    })
    .from(schema.chatSessions)
    .where(
      and(
        eq(schema.chatSessions.id, sessionId),
        eq(schema.chatSessions.userId, userId)
      )
    )
    .limit(1);

  if (!session) {
    throw new Error(`Session '${sessionId}' not found or not owned by user`);
  }

  const shareId = randomUUID();
  const createdAt = new Date();
  const expiresAt =
    expiresIn != null
      ? new Date(createdAt.getTime() + expiresIn * 60 * 60 * 1000)
      : null;

  const record: ShareRecord = {
    shareId,
    sessionId,
    ownerId: userId,
    visibility,
    teamId: visibility === "team" ? teamId : undefined,
    createdAt,
    expiresAt,
  };

  shareStore.set(shareId, record);

  logger.info("Session share created", {
    shareId,
    sessionId,
    userId,
    visibility,
    expiresAt: expiresAt?.toISOString() ?? "never",
  });

  return record;
}

/**
 * Retrieve a share and its associated session data.
 *
 * For `public` shares, `requestingUserId` may be undefined.
 * For `team` shares, `requestingUserId` and `requestingTeamId` must match.
 * For `private` shares, only the owner may access.
 */
export async function getShare(
  shareId: string,
  requestingUserId?: string,
  requestingTeamId?: string
): Promise<ShareWithSession> {
  const record = shareStore.get(shareId);

  if (!record) {
    throw new Error(`Share '${shareId}' not found`);
  }

  if (isExpired(record)) {
    throw new Error(`Share '${shareId}' has expired`);
  }

  // Visibility checks
  if (record.visibility === "private") {
    if (!requestingUserId || requestingUserId !== record.ownerId) {
      throw new Error("You do not have permission to view this share");
    }
  } else if (record.visibility === "team") {
    if (!requestingTeamId || requestingTeamId !== record.teamId) {
      throw new Error(
        "This share is restricted to a specific team. Join the team to access it."
      );
    }
  }
  // "public" — no additional check

  // Fetch session
  const [session] = await db
    .select({
      id: schema.chatSessions.id,
      projectId: schema.chatSessions.projectId,
      userId: schema.chatSessions.userId,
      tool: schema.chatSessions.tool,
      startedAt: schema.chatSessions.startedAt,
      endedAt: schema.chatSessions.endedAt,
      metadata: schema.chatSessions.metadata,
    })
    .from(schema.chatSessions)
    .where(eq(schema.chatSessions.id, record.sessionId))
    .limit(1);

  if (!session) {
    throw new Error(`Session '${record.sessionId}' no longer exists`);
  }

  // Fetch checkpoints for the session's project (scoped to owner)
  const checkpoints = await db
    .select({
      id: schema.checkpoints.id,
      name: schema.checkpoints.name,
      description: schema.checkpoints.description,
      triggerType: schema.checkpoints.triggerType,
      createdAt: schema.checkpoints.createdAt,
    })
    .from(schema.checkpoints)
    .where(
      and(
        eq(schema.checkpoints.projectId, session.projectId),
        eq(schema.checkpoints.userId, record.ownerId)
      )
    )
    .orderBy(desc(schema.checkpoints.createdAt))
    .limit(100);

  // Fetch owner info
  const [owner] = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
    })
    .from(schema.users)
    .where(eq(schema.users.id, record.ownerId))
    .limit(1);

  if (!owner) {
    throw new Error("Share owner not found");
  }

  return {
    share: record,
    session: {
      id: session.id,
      projectId: session.projectId,
      tool: session.tool,
      startedAt: session.startedAt?.toISOString() ?? null,
      endedAt: session.endedAt?.toISOString() ?? null,
      metadata: session.metadata,
    },
    checkpoints: checkpoints.map((cp) => ({
      id: cp.id,
      name: cp.name,
      description: cp.description,
      triggerType: cp.triggerType,
      createdAt: cp.createdAt?.toISOString() ?? null,
    })),
    sharedBy: {
      id: owner.id,
      name: owner.name,
      email: owner.email,
    },
  };
}

/**
 * Revoke (delete) a share link.
 *
 * Only the owner may revoke their share.
 */
export async function revokeShare(
  shareId: string,
  userId: string
): Promise<void> {
  const record = shareStore.get(shareId);

  if (!record) {
    throw new Error(`Share '${shareId}' not found`);
  }

  if (record.ownerId !== userId) {
    throw new Error("You do not have permission to revoke this share");
  }

  shareStore.delete(shareId);

  logger.info("Session share revoked", { shareId, userId });
}

/**
 * List all active (non-expired) shares for a given session.
 *
 * Requires `userId` to match the session owner.
 */
export async function listShares(
  sessionId: string,
  userId: string
): Promise<ShareRecord[]> {
  // Verify the session belongs to this user
  const [session] = await db
    .select({ id: schema.chatSessions.id })
    .from(schema.chatSessions)
    .where(
      and(
        eq(schema.chatSessions.id, sessionId),
        eq(schema.chatSessions.userId, userId)
      )
    )
    .limit(1);

  if (!session) {
    throw new Error(`Session '${sessionId}' not found or not owned by user`);
  }

  const results: ShareRecord[] = [];

  for (const record of shareStore.values()) {
    if (record.sessionId === sessionId && record.ownerId === userId) {
      if (!isExpired(record)) {
        results.push(record);
      }
    }
  }

  return results.sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}
