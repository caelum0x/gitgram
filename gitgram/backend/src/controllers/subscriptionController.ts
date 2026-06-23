import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';
import * as polarService from '../services/polarService';
import logger from '../utils/logger';
import { asyncHandler, Errors } from '../middleware/errorHandler';
import { validateEvent, WebhookVerificationError } from '../lib/polarWebhooks';

function getField<T>(input: Record<string, any> | null | undefined, ...keys: string[]): T | undefined {
  for (const key of keys) {
    const value = input?.[key];
    if (value !== undefined && value !== null) {
      return value as T;
    }
  }
  return undefined;
}

export const createCheckout = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { plan } = req.body; // premium or creator
  const userId = req.userId;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw Errors.notFound('User');

  const productId = plan === 'creator'
    ? process.env.POLAR_CREATOR_PRODUCT_ID
    : process.env.POLAR_PREMIUM_PRODUCT_ID;

  if (!productId) {
    throw Errors.badRequest('Product not configured for this plan');
  }

  const checkout = await polarService.createCheckoutSession(
    productId,
    user.email,
    userId!,
    `${process.env.FRONTEND_URL}/settings/subscription?success=true`,
  );

  res.json({ url: checkout.url });
});

export const getSubscription = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  const subscription = await prisma.subscription.findUnique({ where: { userId } });
  res.json(subscription || { plan: 'free', status: 'active' });
});

export const cancelSubscription = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  const subscription = await prisma.subscription.findUnique({ where: { userId } });

  if (!subscription?.polarSubscriptionId) {
    throw Errors.badRequest('No active subscription');
  }

  await polarService.cancelSubscription(subscription.polarSubscriptionId);
  await prisma.subscription.update({
    where: { userId },
    data: { status: 'canceled' },
  });

  res.json({ message: 'Subscription canceled' });
});

export const webhook = async (req: Request, res: Response) => {
  const webhookSecret = process.env.POLAR_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error('POLAR_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  let event;

  try {
    const payload = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    event = validateEvent(
      payload,
      req.headers as unknown as Record<string, string>,
      webhookSecret,
    );
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return (res as any).status(403).send('');
    }
    return (res as any).status(400).send(`Webhook Error: ${(err as Error).message}`);
  }

  if (event.type === 'checkout.updated') {
    const checkout = event.data as Record<string, any>;

    if (getField<string>(checkout, 'status') !== 'succeeded') {
      return (res as any).status(202).json({ received: true });
    }

    // Extract userId from metadata
    const metadata = getField<Record<string, any>>(checkout, 'metadata') || {};
    const userId = getField<string>(metadata, 'userId', 'user_id');
    if (!userId) {
      logger.error('Webhook error: Missing userId in checkout metadata');
      return (res as any).status(400).json({ error: 'Missing userId in metadata' });
    }

    // Validate CUID format
    const cuidRegex = /^c[a-z0-9]{20,}$/i;
    if (!cuidRegex.test(userId)) {
      logger.error(`Webhook error: Invalid userId format: ${userId}`);
      return (res as any).status(400).json({ error: 'Invalid userId format' });
    }

    // Verify user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      logger.error(`Webhook error: User not found for userId: ${userId}`);
      return (res as any).status(400).json({ error: 'User not found' });
    }

    const subscriptionId = getField<string>(checkout, 'subscriptionId', 'subscription_id');
    const productId = getField<string>(checkout, 'productId', 'product_id');
    const customerId = getField<string>(checkout, 'customerId', 'customer_id');
    const currentPeriodEnd = getField<string>(checkout, 'currentPeriodEnd', 'current_period_end');

    const plan = productId === process.env.POLAR_CREATOR_PRODUCT_ID ? 'creator' : 'premium';

    await prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        plan,
        status: 'active',
        polarCustomerId: customerId || null,
        polarSubscriptionId: subscriptionId || null,
        currentPeriodEnd: currentPeriodEnd
          ? new Date(currentPeriodEnd)
          : null,
      },
      update: {
        plan,
        status: 'active',
        polarCustomerId: customerId || null,
        polarSubscriptionId: subscriptionId || null,
        currentPeriodEnd: currentPeriodEnd
          ? new Date(currentPeriodEnd)
          : null,
      },
    });
  }

  if (event.type === 'subscription.canceled' || event.type === 'subscription.revoked') {
    const subscription = event.data as Record<string, any>;
    const polarSubId = getField<string>(subscription, 'id');

    if (polarSubId) {
      await prisma.subscription.updateMany({
        where: { polarSubscriptionId: polarSubId },
        data: { status: 'expired' },
      });
    }
  }

  if (
    event.type === 'subscription.created' ||
    event.type === 'subscription.active' ||
    event.type === 'subscription.updated'
  ) {
    const subscription = event.data as Record<string, any>;
    const polarSubId = getField<string>(subscription, 'id');
    const currentPeriodEnd = getField<string>(subscription, 'currentPeriodEnd', 'current_period_end');
    const status = getField<string>(subscription, 'status') || 'active';

    if (polarSubId) {
      await prisma.subscription.updateMany({
        where: { polarSubscriptionId: polarSubId },
        data: {
          status,
          currentPeriodEnd: currentPeriodEnd
            ? new Date(currentPeriodEnd)
            : null,
        },
      });
    }
  }

  (res as any).status(202).json({ received: true });
};
