import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as webhookService from '../services/webhookService';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

export const getWebhooks = asyncHandler(async (req: AuthRequest, res: Response) => {
  const webhooks = await webhookService.getUserWebhooks(req.userId!);
  res.json(webhooks);
});

export const getWebhook = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const webhook = await webhookService.getWebhook(id, req.userId!);

  if (!webhook) {
    throw Errors.notFound('Webhook');
  }

  res.json(webhook);
});

export const createWebhook = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, url, secret, events } = req.body;

  if (!name || !url || !events || !Array.isArray(events) || events.length === 0) {
    throw Errors.badRequest('Name, URL, and at least one event are required');
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    throw Errors.badRequest('Invalid URL format');
  }

  // Validate events
  const validEvents = webhookService.getAllWebhookEvents();
  const invalidEvents = events.filter((e: string) => e !== '*' && !validEvents.includes(e));
  if (invalidEvents.length > 0) {
    throw Errors.badRequest(`Invalid events: ${invalidEvents.join(', ')}`);
  }

  const webhook = await webhookService.createWebhook(req.userId!, {
    name,
    url,
    secret,
    events,
  });

  res.status(201).json(webhook);
});

export const updateWebhook = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, url, events, active } = req.body;

  // Validate URL if provided
  if (url) {
    try {
      new URL(url);
    } catch {
      throw Errors.badRequest('Invalid URL format');
    }
  }

  // Validate events if provided
  if (events) {
    const validEvents = webhookService.getAllWebhookEvents();
    const invalidEvents = events.filter((e: string) => e !== '*' && !validEvents.includes(e));
    if (invalidEvents.length > 0) {
      throw Errors.badRequest(`Invalid events: ${invalidEvents.join(', ')}`);
    }
  }

  const result = await webhookService.updateWebhook(id, req.userId!, {
    name,
    url,
    events,
    active,
  });

  if (result.count === 0) {
    throw Errors.notFound('Webhook');
  }

  res.json({ success: true });
});

export const deleteWebhook = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const result = await webhookService.deleteWebhook(id, req.userId!);

  if (result.count === 0) {
    throw Errors.notFound('Webhook');
  }

  res.json({ success: true });
});

export const regenerateSecret = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const newSecret = await webhookService.regenerateWebhookSecret(id, req.userId!);
  res.json({ secret: newSecret });
});

export const testWebhook = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  let result;
  try {
    result = await webhookService.testWebhook(id, req.userId!);
  } catch (error: any) {
    if (error instanceof ApiError) throw error;
    if (error.message === 'Webhook not found') {
      throw Errors.notFound('Webhook');
    }
    throw error;
  }
  res.json(result);
});

export const getWebhookEvents = async (_req: AuthRequest, res: Response) => {
  res.json({
    events: webhookService.getAllWebhookEvents(),
    descriptions: {
      'post.created': 'When you create a new post',
      'post.liked': 'When someone likes your post',
      'post.commented': 'When someone comments on your post',
      'user.followed': 'When someone follows you',
      'message.received': 'When you receive a direct message',
      'story.viewed': 'When someone views your story',
      'repository.starred': 'When someone stars your repository',
      'repository.forked': 'When someone forks your repository',
    },
  });
};
