import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../utils/prisma';
import logger from '../utils/logger';

export interface WebhookRequest extends Request {
  webhookData?: {
    event: string;
    deliveryId: string;
    repoFullName: string;
    repositoryId: string;
    payload: any;
  };
}

/**
 * Verify GitHub webhook signature using HMAC-SHA256
 */
export const verifyGitHubWebhook = async (
  req: WebhookRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const signature = req.headers['x-hub-signature-256'] as string;
    const event = req.headers['x-github-event'] as string;
    const deliveryId = req.headers['x-github-delivery'] as string;

    // Validate required headers
    if (!signature || !event || !deliveryId) {
      logger.warn('GitHub webhook missing required headers');
      return res.status(400).json({ error: 'Missing required GitHub webhook headers' });
    }

    // Get repository from payload
    const repoFullName = req.body.repository?.full_name;
    if (!repoFullName) {
      logger.warn('GitHub webhook payload missing repository info');
      return res.status(400).json({ error: 'Missing repository in payload' });
    }

    // Find repository and its webhook config
    const repository = await prisma.repository.findUnique({
      where: { fullName: repoFullName },
      include: { webhook: true }
    });

    if (!repository) {
      logger.warn(`Repository not found for webhook: ${repoFullName}`);
      return res.status(404).json({ error: 'Repository not found' });
    }

    if (!repository.webhook?.active) {
      logger.warn(`Webhook not configured or inactive for: ${repoFullName}`);
      return res.status(404).json({ error: 'Webhook not configured for this repository' });
    }

    // Verify HMAC signature
    const rawBody = JSON.stringify(req.body);
    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', repository.webhook.secret)
      .update(rawBody)
      .digest('hex');

    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (signatureBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      logger.warn(`Invalid webhook signature for: ${repoFullName}`);
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Attach webhook data to request
    req.webhookData = {
      event,
      deliveryId,
      repoFullName,
      repositoryId: repository.id,
      payload: req.body
    };

    logger.info(`GitHub webhook verified: ${event} for ${repoFullName}`);
    next();
  } catch (error) {
    logger.error('GitHub webhook verification error:', error);
    res.status(500).json({ error: 'Webhook verification failed' });
  }
};

/**
 * Generate a secure webhook secret
 */
export const generateWebhookSecret = (): string => {
  return crypto.randomBytes(32).toString('hex');
};
