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

/**
 * List the subscription plans this deployment actually supports. The set is
 * derived from the backend checkout contract (createCheckout maps `plan` to a
 * Polar product id), so the mobile/web clients never have to hardcode plan ids.
 * A plan is only `available` for checkout when its Polar product id is
 * configured via environment variables.
 */
export const getPlans = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  const subscription = userId
    ? await prisma.subscription.findUnique({ where: { userId } })
    : null;
  const currentPlan = subscription?.status === 'active' ? subscription.plan : 'free';

  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: '$0',
      interval: 'month',
      available: false,
      features: ['Public repositories', 'Community support', '1GB storage'],
    },
    {
      id: 'premium',
      name: 'Premium',
      price: '$9.99',
      interval: 'month',
      available: Boolean(process.env.POLAR_PREMIUM_PRODUCT_ID),
      features: ['Ad-free experience', 'Custom themes', '10GB storage', 'Priority support'],
    },
    {
      id: 'creator',
      name: 'Creator',
      price: '$19.99',
      interval: 'month',
      available: Boolean(process.env.POLAR_CREATOR_PRODUCT_ID),
      features: ['Everything in Premium', '100GB storage', 'Creator analytics', 'Monetization tools'],
    },
  ];

  res.json({ plans, currentPlan });
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
