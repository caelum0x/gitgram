import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';
import * as polarService from '../services/polarService';
import { asyncHandler, Errors } from '../middleware/errorHandler';

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
