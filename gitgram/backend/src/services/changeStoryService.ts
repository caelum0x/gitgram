import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import prisma from '../utils/prisma';
import logger from '../utils/logger';
import { createNotification } from './notificationService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AitmCheckpointWebhookPayload {
  projectId: string;
  checkpointId: string;
  previousCheckpointId?: string;
  label?: string;
  message?: string;
  filesChanged?: string[];
  linesAdded?: number;
  linesRemoved?: number;
  timestamp?: string;
}

interface AitmDiffSummary {
  added: number;
  removed: number;
  modified: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
  files: { filePath: string; changeType: string }[];
}

interface ChangeStoryDraft {
  repositoryId: string;
  ownerId: string;
  title: string;
  summary: string;
  checkpointId: string;
  fromCheckpointId?: string;
  aitmProjectId: string;
  diffSummary: { added: number; removed: number; modified: number };
  changedFiles: string[];
}

// ---------------------------------------------------------------------------
// AITM API helpers (server-side, using stored encrypted API key)
// ---------------------------------------------------------------------------

const AITM_BASE_URL = process.env.AITM_API_URL || 'https://timemachine-api.gitgram.app/v1';

function createAitmClient(apiKey: string): AxiosInstance {
  return axios.create({
    baseURL: AITM_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    timeout: 15000,
  });
}

/** Encrypt an API key for safe database storage. */
export function encryptApiKey(apiKey: string): string {
  const secret = process.env.AITM_ENCRYPTION_SECRET || 'gitgram-aitm-default-secret-key-32b';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(secret.padEnd(32, '0').slice(0, 32)), iv);
  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/** Decrypt a stored API key. */
export function decryptApiKey(encrypted: string): string {
  const secret = process.env.AITM_ENCRYPTION_SECRET || 'gitgram-aitm-default-secret-key-32b';
  const [ivHex, data] = encrypted.split(':');
  if (!ivHex || !data) throw new Error('Invalid encrypted key format');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(secret.padEnd(32, '0').slice(0, 32)), iv);
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ---------------------------------------------------------------------------
// Core service
// ---------------------------------------------------------------------------

export const changeStoryService = {
  /**
   * Fetch a diff from AITM between two checkpoints.
   */
  async fetchDiff(
    apiKey: string,
    projectId: string,
    fromCheckpointId: string,
    toCheckpointId: string
  ): Promise<AitmDiffSummary> {
    const client = createAitmClient(apiKey);
    try {
      const { data } = await client.get(`/projects/${projectId}/diff`, {
        params: { from: fromCheckpointId, to: toCheckpointId },
      });
      return {
        added: data.summary?.added || 0,
        removed: data.summary?.removed || 0,
        modified: data.summary?.modified || 0,
        totalLinesAdded: data.summary?.totalLinesAdded || 0,
        totalLinesRemoved: data.summary?.totalLinesRemoved || 0,
        files: (data.files || []).map((f: any) => ({
          filePath: f.filePath || f.file || '',
          changeType: f.changeType || 'modified',
        })),
      };
    } catch (error: any) {
      logger.error('Failed to fetch AITM diff:', error.message);
      throw new Error('Failed to fetch diff from AITM');
    }
  },

  /**
   * Generate a change story draft from a checkpoint webhook event.
   * Returns the draft data ready for the repo owner to review.
   */
  async generateDraft(payload: AitmCheckpointWebhookPayload): Promise<ChangeStoryDraft | null> {
    const {
      projectId,
      checkpointId,
      previousCheckpointId,
      label,
      message,
      filesChanged,
      linesAdded,
      linesRemoved,
    } = payload;

    // Find repository linked to this AITM project
    const repoSettings = await prisma.repositoryAitmSettings.findFirst({
      where: { aitmProjectId: projectId, autoGenerateStories: true },
      include: { repository: true },
    });

    if (!repoSettings) {
      logger.info(`No auto-story repo linked to AITM project ${projectId}`);
      return null;
    }

    const repository = repoSettings.repository;
    const ownerId = repository.claimedBy;
    if (!ownerId) {
      logger.warn(`Repository ${repository.fullName} has no claimed owner, skipping auto-story`);
      return null;
    }

    // Get stored API key
    let apiKey: string;
    try {
      apiKey = decryptApiKey(repoSettings.encryptedApiKey);
    } catch {
      logger.error(`Failed to decrypt AITM API key for repo ${repository.fullName}`);
      return null;
    }

    // Try to fetch diff if we have a previous checkpoint
    let diffSummary = { added: 0, removed: 0, modified: 0 };
    let changedFilesList = filesChanged || [];

    if (previousCheckpointId) {
      try {
        const diff = await this.fetchDiff(apiKey, projectId, previousCheckpointId, checkpointId);
        diffSummary = { added: diff.added, removed: diff.removed, modified: diff.modified };
        if (diff.files.length > 0) {
          changedFilesList = diff.files.map((f) => f.filePath);
        }
      } catch {
        // Fall back to webhook-provided data
        diffSummary = {
          added: linesAdded || 0,
          removed: linesRemoved || 0,
          modified: changedFilesList.length,
        };
      }
    }

    const title = label || message || `Checkpoint ${checkpointId.slice(0, 8)} - ${repository.fullName}`;
    const summary = message
      ? `Auto-generated change story: ${message}`
      : `Automatic change story for checkpoint ${checkpointId.slice(0, 8)} on ${repository.fullName}. ${changedFilesList.length} files changed.`;

    return {
      repositoryId: repository.id,
      ownerId,
      title,
      summary,
      checkpointId,
      fromCheckpointId: previousCheckpointId,
      aitmProjectId: projectId,
      diffSummary,
      changedFiles: changedFilesList,
    };
  },

  /**
   * Create a draft change story post and notify the repo owner to review & publish.
   */
  async createDraftAndNotify(payload: AitmCheckpointWebhookPayload): Promise<{ draftId: string } | null> {
    const draft = await this.generateDraft(payload);
    if (!draft) return null;

    // Find or create the account for the owner
    const account = await prisma.account.findFirst({ where: { userId: draft.ownerId } });
    if (!account) {
      logger.warn(`No account found for owner ${draft.ownerId}`);
      return null;
    }

    // Build the AITM change story content block
    const content = [
      draft.title,
      draft.summary,
      '',
      '[AITM_CHANGE_STORY]',
      `title=${draft.title}`,
      `checkpointId=${draft.checkpointId}`,
      `fromCheckpointId=${draft.fromCheckpointId || ''}`,
      `aitmProjectId=${draft.aitmProjectId}`,
      `diffAdded=${draft.diffSummary.added}`,
      `diffRemoved=${draft.diffSummary.removed}`,
      `diffModified=${draft.diffSummary.modified}`,
      `changedFiles=${JSON.stringify(draft.changedFiles)}`,
      '[/AITM_CHANGE_STORY]',
    ].join('\n');

    // Create as a draft post (not published yet)
    const draftPost = await prisma.post.create({
      data: {
        accountId: account.id,
        userId: draft.ownerId,
        repositoryId: draft.repositoryId,
        repoUrl: `aitm://checkpoint/${draft.checkpointId}`,
        type: 'REPOSITORY',
        content,
        mediaUrls: [],
        status: 'DRAFT',
      },
    });

    // Notify the repo owner
    await createNotification(
      draft.ownerId,
      'REPO_UPDATE',
      `A new change story draft has been auto-generated for checkpoint ${draft.checkpointId.slice(0, 8)}. Review and publish it.`,
      undefined,
      draftPost.id
    );

    logger.info(`Auto-generated change story draft ${draftPost.id} for checkpoint ${draft.checkpointId}`);

    return { draftId: draftPost.id };
  },

  /**
   * Publish a draft change story (update status from DRAFT to published).
   */
  async publishDraft(draftId: string, userId: string): Promise<any> {
    const post = await prisma.post.findUnique({ where: { id: draftId } });
    if (!post) throw new Error('Draft not found');
    if (post.userId !== userId) throw new Error('Not authorized to publish this draft');

    const published = await prisma.post.update({
      where: { id: draftId },
      data: { status: 'PUBLISHED' },
      include: {
        user: { select: { id: true, username: true, avatar: true, verified: true } },
        repository: true,
      },
    });

    return published;
  },
};

export default changeStoryService;
