import axios from 'axios';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AitmCheckpointMetadata {
  id: string;
  projectId: string;
  sha: string;
  message: string;
  files: string[];
  createdAt: string;
}

export interface AitmCheckpointRef {
  sha: string;
  message: string;
  files: string[];
  createdAt: string;
  [key: string]: string | string[];
}

// ---------------------------------------------------------------------------
// AITM API client
// ---------------------------------------------------------------------------

const AITM_API_URL = process.env.AITM_API_URL || 'http://localhost:3001';

/**
 * Validate that a checkpoint exists by calling the AITM API.
 *
 * Validation is **optional** — if the AITM API is unreachable the caller
 * should still allow the post to be created, just without verified metadata.
 *
 * @returns Checkpoint metadata on success, null on failure or unreachable API.
 */
export async function validateCheckpoint(
  checkpointId: string,
  projectId?: string
): Promise<AitmCheckpointMetadata | null> {
  try {
    const url = `${AITM_API_URL}/v1/checkpoints/${encodeURIComponent(checkpointId)}`;
    const params: Record<string, string> = {};
    if (projectId) {
      params.projectId = projectId;
    }

    const { data } = await axios.get<Record<string, unknown>>(url, {
      params,
      timeout: 10_000,
    });

    // Normalize the response into our metadata shape
    const checkpoint: AitmCheckpointMetadata = {
      id: String(data.id ?? checkpointId),
      projectId: String(data.projectId ?? projectId ?? ''),
      sha: String(data.sha ?? data.hash ?? ''),
      message: String(data.message ?? data.label ?? ''),
      files: Array.isArray(data.files)
        ? (data.files as string[])
        : Array.isArray(data.filesChanged)
          ? (data.filesChanged as string[])
          : [],
      createdAt: String(data.createdAt ?? new Date().toISOString()),
    };

    return checkpoint;
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    logger.warn(`AITM checkpoint validation failed for ${checkpointId}: ${message}`);
    return null;
  }
}

/**
 * Build the checkpoint ref JSON that gets stored on the Post row.
 */
export function buildCheckpointRef(
  meta: AitmCheckpointMetadata
): AitmCheckpointRef {
  return {
    sha: meta.sha,
    message: meta.message,
    files: meta.files,
    createdAt: meta.createdAt,
  };
}

/**
 * Format a human-readable description from checkpoint metadata,
 * used when creating a post from a checkpoint via the `from-checkpoint` flow.
 */
export function formatCheckpointDescription(meta: AitmCheckpointMetadata): string {
  const parts: string[] = [];

  if (meta.message) {
    parts.push(meta.message);
  } else {
    parts.push(`Checkpoint ${meta.sha ? meta.sha.slice(0, 8) : meta.id.slice(0, 8)}`);
  }

  if (meta.files.length > 0) {
    const fileList =
      meta.files.length <= 5
        ? meta.files.join(', ')
        : `${meta.files.slice(0, 5).join(', ')} and ${meta.files.length - 5} more`;
    parts.push(`Files changed: ${fileList}`);
  }

  return parts.join('\n\n');
}
