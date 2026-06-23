import prisma from '../utils/prisma';
import * as polarService from './polarService';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SubscriptionTier = 'free' | 'pro' | 'team';
export type SubscriptionStatus = 'active' | 'canceled' | 'expired' | 'past_due';

export interface SubscriptionFeatures {
  maxRepos: number | 'unlimited';
  privateRepos: number | 'unlimited';
  aiAnalysisCalls: number;
  customProfile: boolean;
  priorityFeed?: boolean;
  teamDashboard?: boolean;
}

export interface UserSubscription {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  expiresAt: Date | null;
  cancelAtPeriodEnd: boolean;
  features: SubscriptionFeatures;
  polarSubscriptionId: string | null;
}

// Polar webhook event shapes — only the fields we actually use
export interface PolarSubscriptionEventData {
  id: string;
  status?: string;
  currentPeriodEnd?: string;
  current_period_end?: string;
  cancelAtPeriodEnd?: boolean;
  cancel_at_period_end?: boolean;
  metadata?: Record<string, string>;
  productId?: string;
  product_id?: string;
  customerId?: string;
  customer_id?: string;
  userId?: string;
  user_id?: string;
}

export interface PolarWebhookEvent {
  type: string;
  data: PolarSubscriptionEventData;
}

// ---------------------------------------------------------------------------
// Feature definitions per tier
// ---------------------------------------------------------------------------

const TIER_FEATURES: Record<SubscriptionTier, SubscriptionFeatures> = {
  free: {
    maxRepos: 5,
    privateRepos: 0,
    aiAnalysisCalls: 10,
    customProfile: false,
  },
  pro: {
    maxRepos: 50,
    privateRepos: 10,
    aiAnalysisCalls: 100,
    customProfile: true,
    priorityFeed: true,
  },
  team: {
    maxRepos: 'unlimited',
    privateRepos: 'unlimited',
    aiAnalysisCalls: 500,
    customProfile: true,
    priorityFeed: true,
    teamDashboard: true,
  },
};

// Polar product IDs map to tiers
const PRODUCT_TO_TIER: Record<string, SubscriptionTier> = {
  [process.env.POLAR_PRO_PRODUCT_ID ?? '']: 'pro',
  [process.env.POLAR_TEAM_PRODUCT_ID ?? '']: 'team',
  // Legacy aliases kept for backward compatibility
  [process.env.POLAR_PREMIUM_PRODUCT_ID ?? '']: 'pro',
  [process.env.POLAR_CREATOR_PRODUCT_ID ?? '']: 'team',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveTier(tier: string | null | undefined): SubscriptionTier {
  if (tier === 'pro' || tier === 'team') return tier;
  // Map legacy plan names
  if (tier === 'premium') return 'pro';
  if (tier === 'creator') return 'team';
  return 'free';
}

function resolveStatus(status: string | null | undefined): SubscriptionStatus {
  if (
    status === 'active' ||
    status === 'canceled' ||
    status === 'expired' ||
    status === 'past_due'
  ) {
    return status;
  }
  return 'active';
}

function getField<T>(
  obj: Record<string, unknown> | null | undefined,
  ...keys: string[]
): T | undefined {
  for (const key of keys) {
    const value = (obj as Record<string, unknown> | undefined)?.[key];
    if (value !== undefined && value !== null) return value as T;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Public service
// ---------------------------------------------------------------------------

/**
 * Returns the current subscription for a user.
 * Falls back to a synthetic free-tier object when no row exists.
 */
export async function getUserSubscription(userId: string): Promise<UserSubscription> {
  const row = await prisma.subscription.findUnique({ where: { userId } });

  if (!row) {
    return buildFreeSubscription();
  }

  const tier = resolveTier(row.tier ?? row.plan);
  const status = resolveStatus(row.status);
  const isActive = status === 'active';

  return {
    tier: isActive ? tier : 'free',
    status,
    expiresAt: row.expiresAt ?? row.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: false,
    features: getSubscriptionFeatures(isActive ? tier : 'free'),
    polarSubscriptionId: row.polarSubscriptionId ?? null,
  };
}

/**
 * Creates a Polar checkout session for the given tier and returns a redirect URL.
 * The caller is responsible for redirecting the user to that URL.
 */
export async function createSubscription(
  userId: string,
  tier: 'pro' | 'team',
  _paymentMethodId: string,
): Promise<{ checkoutUrl: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error(`User ${userId} not found`);

  const productEnvVar = tier === 'team' ? 'POLAR_TEAM_PRODUCT_ID' : 'POLAR_PRO_PRODUCT_ID';
  const productId =
    process.env[productEnvVar] ??
    (tier === 'team'
      ? process.env.POLAR_CREATOR_PRODUCT_ID
      : process.env.POLAR_PREMIUM_PRODUCT_ID);

  if (!productId) {
    throw new Error(`Polar product ID not configured for tier "${tier}" (${productEnvVar})`);
  }

  const successUrl = `${process.env.FRONTEND_URL ?? ''}/settings/subscription?success=true`;

  const checkout = await polarService.createCheckoutSession(
    productId,
    user.email,
    userId,
    successUrl,
  );

  logger.info('Polar checkout session created', { userId, tier });

  return { checkoutUrl: checkout.url ?? '' };
}

/**
 * Marks the active subscription as "cancel at period end".
 * The tier stays active until Polar fires a cancellation webhook.
 */
export async function cancelSubscription(userId: string): Promise<void> {
  const row = await prisma.subscription.findUnique({ where: { userId } });

  if (!row?.polarSubscriptionId) {
    throw new Error('No active subscription found for this user');
  }

  await polarService.cancelSubscription(row.polarSubscriptionId);

  await prisma.subscription.update({
    where: { userId },
    data: { status: 'canceled' },
  });

  logger.info('Subscription cancel-at-period-end set', { userId });
}

/**
 * Returns the feature set for a given tier.
 * Pure, synchronous — safe to call without DB access.
 */
export function getSubscriptionFeatures(tier: SubscriptionTier): SubscriptionFeatures {
  return TIER_FEATURES[tier];
}

/**
 * Checks whether the user's current tier grants access to a specific feature.
 * Numeric features are treated as "access granted when > 0".
 */
export async function checkFeatureAccess(
  userId: string,
  feature: keyof SubscriptionFeatures,
): Promise<boolean> {
  const subscription = await getUserSubscription(userId);
  const value = subscription.features[feature];

  if (typeof value === 'boolean') return value;
  if (value === 'unlimited') return true;
  return (value as number) > 0;
}

/**
 * Processes incoming Polar webhook events that relate to subscriptions.
 * Supported event types:
 *   - subscription.created
 *   - subscription.updated
 *   - subscription.active
 *   - subscription.canceled
 *   - subscription.revoked
 *   - checkout.updated  (succeeded state only)
 */
export async function handlePolarWebhook(event: PolarWebhookEvent): Promise<void> {
  const { type, data } = event;

  logger.info('Processing Polar webhook event', { eventType: type });

  switch (type) {
    case 'subscription.created':
    case 'subscription.active':
    case 'subscription.updated': {
      await handleSubscriptionUpsert(data);
      break;
    }

    case 'subscription.canceled':
    case 'subscription.revoked': {
      await handleSubscriptionCanceled(data);
      break;
    }

    case 'checkout.updated': {
      await handleCheckoutUpdated(data as unknown as Record<string, unknown>);
      break;
    }

    default:
      logger.info('Unhandled Polar webhook event — ignored', { eventType: type });
  }
}

// ---------------------------------------------------------------------------
// Webhook sub-handlers
// ---------------------------------------------------------------------------

async function handleSubscriptionUpsert(data: PolarSubscriptionEventData): Promise<void> {
  const polarSubId = data.id;
  if (!polarSubId) {
    logger.warn('subscription.created/updated: missing subscription id');
    return;
  }

  const rawStatus = data.status ?? 'active';
  const status = resolveStatus(rawStatus);
  const currentPeriodEnd =
    data.currentPeriodEnd ?? data.current_period_end ?? undefined;

  const productId = getField<string>(
    data as unknown as Record<string, unknown>,
    'productId',
    'product_id',
  );
  const tier: SubscriptionTier =
    productId && PRODUCT_TO_TIER[productId] ? PRODUCT_TO_TIER[productId] : 'pro';

  await prisma.subscription.updateMany({
    where: { polarSubscriptionId: polarSubId },
    data: {
      tier,
      status,
      currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : undefined,
    },
  });

  logger.info('Subscription record updated from webhook', { polarSubId, tier, status });
}

async function handleSubscriptionCanceled(data: PolarSubscriptionEventData): Promise<void> {
  const polarSubId = data.id;
  if (!polarSubId) {
    logger.warn('subscription.canceled/revoked: missing subscription id');
    return;
  }

  await prisma.subscription.updateMany({
    where: { polarSubscriptionId: polarSubId },
    data: { status: 'expired' },
  });

  logger.info('Subscription marked expired from webhook', { polarSubId });
}

async function handleCheckoutUpdated(checkout: Record<string, unknown>): Promise<void> {
  if (getField<string>(checkout, 'status') !== 'succeeded') return;

  const metadata = (getField<Record<string, string>>(checkout, 'metadata') ?? {}) as Record<
    string,
    string
  >;
  const userId = getField<string>(metadata, 'userId', 'user_id');

  if (!userId) {
    logger.error('checkout.updated webhook: missing userId in metadata');
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    logger.error('checkout.updated webhook: user not found', { userId });
    return;
  }

  const subscriptionId = getField<string>(checkout, 'subscriptionId', 'subscription_id');
  const productId = getField<string>(checkout, 'productId', 'product_id');
  const customerId = getField<string>(checkout, 'customerId', 'customer_id');
  const currentPeriodEnd = getField<string>(checkout, 'currentPeriodEnd', 'current_period_end');

  const tier: SubscriptionTier =
    productId && PRODUCT_TO_TIER[productId] ? PRODUCT_TO_TIER[productId] : 'pro';

  await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      tier,
      plan: tier,
      status: 'active',
      polarCustomerId: customerId ?? null,
      polarSubscriptionId: subscriptionId ?? null,
      currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : null,
    },
    update: {
      tier,
      plan: tier,
      status: 'active',
      polarCustomerId: customerId ?? null,
      polarSubscriptionId: subscriptionId ?? null,
      currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : null,
    },
  });

  logger.info('Subscription upserted from checkout.updated webhook', { userId, tier });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildFreeSubscription(): UserSubscription {
  return {
    tier: 'free',
    status: 'active',
    expiresAt: null,
    cancelAtPeriodEnd: false,
    features: TIER_FEATURES.free,
    polarSubscriptionId: null,
  };
}
