/**
 * Gitgram Bridge Service
 *
 * Bridges AITM events to the Gitgram social platform by posting structured
 * content when code events occur (commits, releases, restore sessions).
 *
 * All functions are no-ops when GITGRAM_API_URL is not configured.
 * postRestoreEventToGitgram is additionally a no-op when GITGRAM_API_KEY is absent.
 */

import { logger } from "../lib/monitoring.js";

// ============================================================================
// Configuration
// ============================================================================

const GITGRAM_API_URL =
  process.env.GITGRAM_API_URL || "http://localhost:4000";
const GITGRAM_API_KEY = process.env.GITGRAM_API_KEY;

// ============================================================================
// Types
// ============================================================================

export interface CommitData {
  hash: string;
  message: string;
  author: string;
  repoOwner: string;
  repoName: string;
}

export interface ReleaseData {
  tag: string;
  title: string;
  body: string;
  repoOwner: string;
  repoName: string;
}

export interface RestoreEventData {
  sessionId: string;
  userId: string;
  timestamp: string;
}

interface GitgramPostPayload {
  content: string;
  tags: string[];
  repoOwner?: string;
  repoName?: string;
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Returns true when the bridge is enabled (GITGRAM_API_URL is set and
 * non-empty). The default localhost value is treated as configured so that
 * local development works without extra env wiring.
 */
function isBridgeConfigured(): boolean {
  return Boolean(GITGRAM_API_URL);
}

/**
 * POST a payload to the Gitgram posts API.
 * Throws on network or non-2xx HTTP errors so callers can decide how to handle.
 */
async function postToGitgram(payload: GitgramPostPayload): Promise<void> {
  const url = `${GITGRAM_API_URL}/api/v1/posts`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (GITGRAM_API_KEY) {
    headers["Authorization"] = `Bearer ${GITGRAM_API_KEY}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "(unreadable)");
    throw new Error(
      `Gitgram API responded with ${response.status}: ${responseText}`
    );
  }
}

// ============================================================================
// Exported bridge functions
// ============================================================================

/**
 * Posts a commit event to Gitgram.
 * No-op when the bridge is not configured.
 */
export async function postCommitToGitgram(
  commitData: CommitData
): Promise<void> {
  if (!isBridgeConfigured()) {
    return;
  }

  const { hash, message, author, repoOwner, repoName } = commitData;

  const shortHash = hash.slice(0, 7);
  const content =
    `New commit in ${repoOwner}/${repoName}\n\n` +
    `${shortHash} — ${message}\n\n` +
    `Author: ${author}`;

  const payload: GitgramPostPayload = {
    content,
    tags: ["commit", repoName],
    repoOwner,
    repoName,
  };

  try {
    await postToGitgram(payload);
    logger.info("gitgramBridge: commit posted", {
      hash: shortHash,
      repo: `${repoOwner}/${repoName}`,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    logger.error("gitgramBridge: failed to post commit", undefined, {
      error: message,
      hash: shortHash,
      repo: `${repoOwner}/${repoName}`,
    });
  }
}

/**
 * Posts a release announcement to Gitgram.
 * No-op when the bridge is not configured.
 */
export async function postReleaseToGitgram(
  releaseData: ReleaseData
): Promise<void> {
  if (!isBridgeConfigured()) {
    return;
  }

  const { tag, title, body, repoOwner, repoName } = releaseData;

  const content =
    `Release ${tag} published for ${repoOwner}/${repoName}\n\n` +
    `${title}\n\n` +
    `${body}`;

  const payload: GitgramPostPayload = {
    content,
    tags: ["release", tag, repoName],
    repoOwner,
    repoName,
  };

  try {
    await postToGitgram(payload);
    logger.info("gitgramBridge: release posted", {
      tag,
      repo: `${repoOwner}/${repoName}`,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    logger.error("gitgramBridge: failed to post release", undefined, {
      error: message,
      tag,
      repo: `${repoOwner}/${repoName}`,
    });
  }
}

/**
 * Posts a restore-session event to Gitgram.
 * No-op when GITGRAM_API_KEY is absent (does NOT throw).
 * No-op when the bridge is not configured.
 */
export async function postRestoreEventToGitgram(
  restoreData: RestoreEventData
): Promise<void> {
  if (!isBridgeConfigured()) {
    return;
  }

  // Restore events are gated on API key presence — skip silently when absent.
  if (!GITGRAM_API_KEY) {
    return;
  }

  const { sessionId, userId, timestamp } = restoreData;

  const content =
    `AITM restore session completed\n\n` +
    `Session: ${sessionId}\n` +
    `User: ${userId}\n` +
    `At: ${timestamp}`;

  const payload: GitgramPostPayload = {
    content,
    tags: ["restore", "aitm"],
  };

  try {
    await postToGitgram(payload);
    logger.info("gitgramBridge: restore event posted", {
      sessionId,
      userId,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    logger.error("gitgramBridge: failed to post restore event", undefined, {
      error: message,
      sessionId,
      userId,
    });
  }
}
