import axios from 'axios';
import crypto from 'crypto';
import prisma from '../utils/prisma';
import logger from '../utils/logger';

interface WebhookPayload {
  event: string;
  data: any;
  timestamp: number;
}

interface WebhookSettings {
  id: string;
  url: string;
  secret: string | null;
  events: string[];
}

export const sendWebhook = async (
  webhookId: string,
  url: string,
  payload: WebhookPayload,
  secret?: string | null
) => {
  const startTime = Date.now();
  let statusCode: number | undefined;
  let responseText: string | undefined;
  let success = false;
  let error: string | undefined;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Gitgram-Webhook/1.0',
      'X-Gitgram-Event': payload.event,
      'X-Gitgram-Delivery': crypto.randomUUID(),
    };

    if (secret) {
      const signature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');
      headers['X-Gitgram-Signature'] = `sha256=${signature}`;
    }

    const response = await axios.post(url, payload, {
      headers,
      timeout: 10000,
      validateStatus: () => true, // Don't throw on non-2xx
    });

    statusCode = response.status;
    responseText = typeof response.data === 'string'
      ? response.data.substring(0, 1000)
      : JSON.stringify(response.data).substring(0, 1000);
    success = response.status >= 200 && response.status < 300;

    if (!success) {
      error = `HTTP ${response.status}`;
    }
  } catch (err: any) {
    error = err.message;
    logger.error('Webhook delivery failed:', err.message);
  }

  const duration = Date.now() - startTime;

  // Record delivery
  try {
    await prisma.webhookDelivery.create({
      data: {
        webhookId,
        event: payload.event,
        payload: payload as any,
        statusCode,
        response: responseText,
        success,
        error,
        duration,
      },
    });
  } catch (dbError) {
    logger.error('Failed to record webhook delivery:', dbError);
  }

  return { success, statusCode, error, duration };
};

export const triggerWebhook = async (userId: string, event: string, data: any) => {
  const webhooks = await getWebhookSettings(userId);

  const payload: WebhookPayload = {
    event,
    data,
    timestamp: Date.now(),
  };

  const results = [];

  for (const webhook of webhooks) {
    if (webhook.events.includes(event) || webhook.events.includes('*')) {
      const result = await sendWebhook(webhook.id, webhook.url, payload, webhook.secret);
      results.push({ webhookId: webhook.id, ...result });
    }
  }

  return results;
};

async function getWebhookSettings(userId: string): Promise<WebhookSettings[]> {
  const webhooks = await prisma.userWebhook.findMany({
    where: {
      userId,
      active: true,
    },
    select: {
      id: true,
      url: true,
      secret: true,
      events: true,
    },
  });

  return webhooks;
}

// CRUD operations for webhooks
export const createWebhook = async (
  userId: string,
  data: { name: string; url: string; secret?: string; events: string[] }
) => {
  return prisma.userWebhook.create({
    data: {
      userId,
      name: data.name,
      url: data.url,
      secret: data.secret || null,
      events: data.events,
    },
  });
};

export const getUserWebhooks = async (userId: string) => {
  return prisma.userWebhook.findMany({
    where: { userId },
    include: {
      deliveries: {
        take: 10,
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
};

export const getWebhook = async (id: string, userId: string) => {
  return prisma.userWebhook.findFirst({
    where: { id, userId },
    include: {
      deliveries: {
        take: 50,
        orderBy: { createdAt: 'desc' },
      },
    },
  });
};

export const updateWebhook = async (
  id: string,
  userId: string,
  data: Partial<{ name: string; url: string; secret: string; events: string[]; active: boolean }>
) => {
  return prisma.userWebhook.updateMany({
    where: { id, userId },
    data,
  });
};

export const deleteWebhook = async (id: string, userId: string) => {
  return prisma.userWebhook.deleteMany({
    where: { id, userId },
  });
};

export const regenerateWebhookSecret = async (id: string, userId: string) => {
  const newSecret = crypto.randomBytes(32).toString('hex');
  await prisma.userWebhook.updateMany({
    where: { id, userId },
    data: { secret: newSecret },
  });
  return newSecret;
};

export const testWebhook = async (id: string, userId: string) => {
  const webhook = await prisma.userWebhook.findFirst({
    where: { id, userId },
  });

  if (!webhook) {
    throw new Error('Webhook not found');
  }

  const testPayload: WebhookPayload = {
    event: 'test',
    data: { message: 'This is a test webhook delivery from Gitgram' },
    timestamp: Date.now(),
  };

  return sendWebhook(webhook.id, webhook.url, testPayload, webhook.secret);
};

// Event types
export const WebhookEvents = {
  POST_CREATED: 'post.created',
  POST_LIKED: 'post.liked',
  POST_COMMENTED: 'post.commented',
  USER_FOLLOWED: 'user.followed',
  MESSAGE_RECEIVED: 'message.received',
  STORY_VIEWED: 'story.viewed',
  REPO_STARRED: 'repository.starred',
  REPO_FORKED: 'repository.forked',
};

export const getAllWebhookEvents = () => Object.values(WebhookEvents);
