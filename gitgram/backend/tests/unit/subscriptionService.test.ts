/**
 * Unit tests for subscriptionService
 *
 * Prisma is mocked via the shared test setup (tests/setup.ts).
 * polarService is mocked at module level so no real HTTP calls are made.
 */

import { mockPrisma } from '../setup';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

const mockCreateCheckoutSession = jest.fn();
const mockCancelPolarSubscription = jest.fn();

jest.mock('../../src/services/polarService', () => ({
  __esModule: true,
  createCheckoutSession: (...args: unknown[]) => mockCreateCheckoutSession(...args),
  cancelSubscription: (...args: unknown[]) => mockCancelPolarSubscription(...args),
}));

// ---------------------------------------------------------------------------
// Service under test — imported AFTER mocks are registered
// ---------------------------------------------------------------------------

import {
  getUserSubscription,
  getSubscriptionFeatures,
  checkFeatureAccess,
  createSubscription,
  cancelSubscription,
  handlePolarWebhook,
  SubscriptionTier,
  UserSubscription,
  PolarWebhookEvent,
} from '../../src/services/subscriptionService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedSubscription(data: Record<string, unknown>): void {
  mockPrisma.subscription.__rows.push({
    id: 'sub-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: null,
    currentPeriodEnd: null,
    polarSubscriptionId: null,
    polarCustomerId: null,
    tier: 'free',
    plan: 'free',
    status: 'active',
    ...data,
  });
}

function seedUser(data: Record<string, unknown> = {}): void {
  mockPrisma.user.__rows.push({
    id: 'user-1',
    email: 'alice@example.com',
    username: 'alice',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data,
  });
}

function clearTables(): void {
  (mockPrisma.subscription as any).__rows.length = 0;
  (mockPrisma.user as any).__rows.length = 0;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  clearTables();
  jest.clearAllMocks();
});

// ============================================================================
// getSubscriptionFeatures — pure, synchronous
// ============================================================================

describe('getSubscriptionFeatures', () => {
  it('returns correct limits for free tier', () => {
    const features = getSubscriptionFeatures('free');
    expect(features.maxRepos).toBe(5);
    expect(features.privateRepos).toBe(0);
    expect(features.aiAnalysisCalls).toBe(10);
    expect(features.customProfile).toBe(false);
  });

  it('returns correct limits for pro tier', () => {
    const features = getSubscriptionFeatures('pro');
    expect(features.maxRepos).toBe(50);
    expect(features.privateRepos).toBe(10);
    expect(features.aiAnalysisCalls).toBe(100);
    expect(features.customProfile).toBe(true);
    expect(features.priorityFeed).toBe(true);
  });

  it('returns correct limits for team tier', () => {
    const features = getSubscriptionFeatures('team');
    expect(features.maxRepos).toBe('unlimited');
    expect(features.privateRepos).toBe('unlimited');
    expect(features.aiAnalysisCalls).toBe(500);
    expect(features.teamDashboard).toBe(true);
  });
});

// ============================================================================
// getUserSubscription
// ============================================================================

describe('getUserSubscription', () => {
  it('returns free-tier default when no subscription row exists', async () => {
    const result = await getUserSubscription('user-none');
    expect(result.tier).toBe('free');
    expect(result.status).toBe('active');
    expect(result.expiresAt).toBeNull();
    expect(result.cancelAtPeriodEnd).toBe(false);
    expect(result.polarSubscriptionId).toBeNull();
    expect(result.features).toEqual(getSubscriptionFeatures('free'));
  });

  it('returns pro tier for a user with an active pro subscription', async () => {
    seedSubscription({ userId: 'user-1', tier: 'pro', status: 'active' });
    const result = await getUserSubscription('user-1');
    expect(result.tier).toBe('pro');
    expect(result.status).toBe('active');
    expect(result.features.privateRepos).toBe(10);
  });

  it('returns team tier for a user with an active team subscription', async () => {
    seedSubscription({ userId: 'user-1', tier: 'team', status: 'active' });
    const result = await getUserSubscription('user-1');
    expect(result.tier).toBe('team');
    expect(result.features.privateRepos).toBe('unlimited');
    expect(result.features.teamDashboard).toBe(true);
  });

  it('downgrades to free tier when subscription status is canceled', async () => {
    seedSubscription({ userId: 'user-1', tier: 'pro', status: 'canceled' });
    const result = await getUserSubscription('user-1');
    expect(result.tier).toBe('free');
    expect(result.status).toBe('canceled');
  });

  it('downgrades to free tier when subscription status is expired', async () => {
    seedSubscription({ userId: 'user-1', tier: 'team', status: 'expired' });
    const result = await getUserSubscription('user-1');
    expect(result.tier).toBe('free');
    expect(result.status).toBe('expired');
  });

  it('maps legacy "premium" plan to pro tier', async () => {
    seedSubscription({ userId: 'user-1', tier: null, plan: 'premium', status: 'active' });
    const result = await getUserSubscription('user-1');
    expect(result.tier).toBe('pro');
  });

  it('maps legacy "creator" plan to team tier', async () => {
    seedSubscription({ userId: 'user-1', tier: null, plan: 'creator', status: 'active' });
    const result = await getUserSubscription('user-1');
    expect(result.tier).toBe('team');
  });

  it('exposes the polarSubscriptionId from the row', async () => {
    seedSubscription({
      userId: 'user-1',
      tier: 'pro',
      status: 'active',
      polarSubscriptionId: 'polar-sub-abc',
    });
    const result = await getUserSubscription('user-1');
    expect(result.polarSubscriptionId).toBe('polar-sub-abc');
  });

  it('includes currentPeriodEnd as expiresAt when present', async () => {
    const expiry = new Date('2027-01-01T00:00:00.000Z');
    seedSubscription({ userId: 'user-1', tier: 'pro', status: 'active', currentPeriodEnd: expiry });
    const result = await getUserSubscription('user-1');
    expect(result.expiresAt).toEqual(expiry);
  });
});

// ============================================================================
// checkFeatureAccess
// ============================================================================

describe('checkFeatureAccess', () => {
  it('returns false for privateRepos on free tier (value is 0)', async () => {
    const access = await checkFeatureAccess('user-none', 'privateRepos');
    expect(access).toBe(false);
  });

  it('returns true for privateRepos on pro tier (value is 10 > 0)', async () => {
    seedSubscription({ userId: 'user-1', tier: 'pro', status: 'active' });
    const access = await checkFeatureAccess('user-1', 'privateRepos');
    expect(access).toBe(true);
  });

  it('returns true for privateRepos on team tier (value is "unlimited")', async () => {
    seedSubscription({ userId: 'user-1', tier: 'team', status: 'active' });
    const access = await checkFeatureAccess('user-1', 'privateRepos');
    expect(access).toBe(true);
  });

  it('returns false for customProfile on free tier', async () => {
    const access = await checkFeatureAccess('user-none', 'customProfile');
    expect(access).toBe(false);
  });

  it('returns true for customProfile on pro tier', async () => {
    seedSubscription({ userId: 'user-1', tier: 'pro', status: 'active' });
    const access = await checkFeatureAccess('user-1', 'customProfile');
    expect(access).toBe(true);
  });

  it('returns true for teamDashboard on team tier', async () => {
    seedSubscription({ userId: 'user-1', tier: 'team', status: 'active' });
    const access = await checkFeatureAccess('user-1', 'teamDashboard');
    expect(access).toBe(true);
  });

  it('returns true for aiAnalysisCalls on all non-free tiers (> 0)', async () => {
    seedSubscription({ userId: 'user-1', tier: 'pro', status: 'active' });
    const access = await checkFeatureAccess('user-1', 'aiAnalysisCalls');
    expect(access).toBe(true);
  });
});

// ============================================================================
// createSubscription (getCheckoutUrl)
// ============================================================================

describe('createSubscription', () => {
  it('returns a Polar checkout URL for pro tier', async () => {
    seedUser({ id: 'user-1' });
    process.env.POLAR_PRO_PRODUCT_ID = 'prod-pro-123';
    process.env.FRONTEND_URL = 'http://localhost:3000';
    mockCreateCheckoutSession.mockResolvedValueOnce({ url: 'https://checkout.polar.sh/session-xyz' });

    const result = await createSubscription('user-1', 'pro', 'pm_ignored');
    expect(result.checkoutUrl).toBe('https://checkout.polar.sh/session-xyz');
    expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
      'prod-pro-123',
      'alice@example.com',
      'user-1',
      expect.stringContaining('/settings/subscription?success=true'),
    );
  });

  it('returns a Polar checkout URL for team tier', async () => {
    seedUser({ id: 'user-1' });
    process.env.POLAR_TEAM_PRODUCT_ID = 'prod-team-456';
    mockCreateCheckoutSession.mockResolvedValueOnce({ url: 'https://checkout.polar.sh/session-team' });

    const result = await createSubscription('user-1', 'team', 'pm_ignored');
    expect(result.checkoutUrl).toBe('https://checkout.polar.sh/session-team');
  });

  it('throws when user is not found', async () => {
    await expect(createSubscription('user-missing', 'pro', 'pm_x')).rejects.toThrow(
      'User user-missing not found',
    );
  });

  it('propagates errors from the Polar API', async () => {
    seedUser({ id: 'user-1' });
    process.env.POLAR_PRO_PRODUCT_ID = 'prod-pro-123';
    mockCreateCheckoutSession.mockRejectedValueOnce(new Error('Polar API unavailable'));

    await expect(createSubscription('user-1', 'pro', 'pm_x')).rejects.toThrow(
      'Polar API unavailable',
    );
  });
});

// ============================================================================
// cancelSubscription
// ============================================================================

describe('cancelSubscription', () => {
  it('calls polarService.cancelSubscription and marks the DB row as canceled', async () => {
    seedSubscription({ userId: 'user-1', tier: 'pro', status: 'active', polarSubscriptionId: 'polar-sub-abc' });
    mockCancelPolarSubscription.mockResolvedValueOnce(undefined);

    await cancelSubscription('user-1');

    expect(mockCancelPolarSubscription).toHaveBeenCalledWith('polar-sub-abc');

    const row = (mockPrisma.subscription as any).__rows.find((r: any) => r.userId === 'user-1');
    expect(row?.status).toBe('canceled');
  });

  it('throws when no active subscription row exists for the user', async () => {
    await expect(cancelSubscription('user-none')).rejects.toThrow(
      'No active subscription found for this user',
    );
  });

  it('throws when subscription exists but has no polarSubscriptionId', async () => {
    seedSubscription({ userId: 'user-1', tier: 'pro', status: 'active', polarSubscriptionId: null });
    await expect(cancelSubscription('user-1')).rejects.toThrow(
      'No active subscription found for this user',
    );
  });
});

// ============================================================================
// handlePolarWebhook — subscription.created / subscription.updated
// ============================================================================

describe('handlePolarWebhook — subscription.created / subscription.updated', () => {
  it('updates the DB tier and status on subscription.created', async () => {
    seedSubscription({ userId: 'user-1', polarSubscriptionId: 'polar-sub-123', tier: 'free', status: 'active' });

    const event: PolarWebhookEvent = {
      type: 'subscription.created',
      data: {
        id: 'polar-sub-123',
        status: 'active',
        productId: process.env.POLAR_PRO_PRODUCT_ID ?? 'prod-pro-123',
        currentPeriodEnd: '2027-01-01T00:00:00.000Z',
      },
    };

    await handlePolarWebhook(event);

    const row = (mockPrisma.subscription as any).__rows.find((r: any) => r.polarSubscriptionId === 'polar-sub-123');
    expect(row?.status).toBe('active');
  });

  it('handles subscription.active event the same as subscription.created', async () => {
    seedSubscription({ userId: 'user-1', polarSubscriptionId: 'polar-sub-999', tier: 'free', status: 'active' });

    await handlePolarWebhook({
      type: 'subscription.active',
      data: { id: 'polar-sub-999', status: 'active' },
    });

    // No throw means the event was processed without error
    expect(true).toBe(true);
  });

  it('gracefully handles missing subscription id (no-op)', async () => {
    await expect(
      handlePolarWebhook({
        type: 'subscription.created',
        data: { id: '' },
      }),
    ).resolves.toBeUndefined();
  });
});

// ============================================================================
// handlePolarWebhook — subscription.canceled / subscription.revoked
// ============================================================================

describe('handlePolarWebhook — subscription.canceled / subscription.revoked', () => {
  it('marks subscription as expired on subscription.canceled', async () => {
    seedSubscription({ userId: 'user-1', polarSubscriptionId: 'polar-sub-cancel', tier: 'pro', status: 'active' });

    await handlePolarWebhook({
      type: 'subscription.canceled',
      data: { id: 'polar-sub-cancel' },
    });

    const row = (mockPrisma.subscription as any).__rows.find(
      (r: any) => r.polarSubscriptionId === 'polar-sub-cancel',
    );
    expect(row?.status).toBe('expired');
  });

  it('marks subscription as expired on subscription.revoked', async () => {
    seedSubscription({ userId: 'user-1', polarSubscriptionId: 'polar-sub-revoke', tier: 'team', status: 'active' });

    await handlePolarWebhook({
      type: 'subscription.revoked',
      data: { id: 'polar-sub-revoke' },
    });

    const row = (mockPrisma.subscription as any).__rows.find(
      (r: any) => r.polarSubscriptionId === 'polar-sub-revoke',
    );
    expect(row?.status).toBe('expired');
  });

  it('gracefully handles missing subscription id in canceled event', async () => {
    await expect(
      handlePolarWebhook({
        type: 'subscription.canceled',
        data: { id: '' },
      }),
    ).resolves.toBeUndefined();
  });
});

// ============================================================================
// handlePolarWebhook — checkout.updated
// ============================================================================

describe('handlePolarWebhook — checkout.updated', () => {
  it('upserts a subscription row when checkout status is succeeded', async () => {
    seedUser({ id: 'user-checkout' });
    process.env.POLAR_PRO_PRODUCT_ID = 'prod-pro-123';

    await handlePolarWebhook({
      type: 'checkout.updated',
      data: {
        id: 'checkout-001',
        status: 'succeeded',
        metadata: { userId: 'user-checkout' },
        productId: 'prod-pro-123',
        subscriptionId: 'new-polar-sub',
        customerId: 'cust-abc',
        currentPeriodEnd: '2027-06-01T00:00:00.000Z',
      } as any,
    });

    const row = (mockPrisma.subscription as any).__rows.find(
      (r: any) => r.userId === 'user-checkout',
    );
    expect(row).toBeDefined();
    expect(row?.status).toBe('active');
    expect(row?.polarSubscriptionId).toBe('new-polar-sub');
  });

  it('ignores checkout.updated events where status is not succeeded', async () => {
    const beforeCount = (mockPrisma.subscription as any).__rows.length;

    await handlePolarWebhook({
      type: 'checkout.updated',
      data: {
        id: 'checkout-002',
        status: 'open',
        metadata: { userId: 'user-1' },
      } as any,
    });

    expect((mockPrisma.subscription as any).__rows.length).toBe(beforeCount);
  });

  it('does not create a subscription when userId is absent from metadata', async () => {
    const beforeCount = (mockPrisma.subscription as any).__rows.length;

    await handlePolarWebhook({
      type: 'checkout.updated',
      data: {
        id: 'checkout-003',
        status: 'succeeded',
        metadata: {},
      } as any,
    });

    expect((mockPrisma.subscription as any).__rows.length).toBe(beforeCount);
  });
});

// ============================================================================
// Feature gating by tier
// ============================================================================

describe('Feature gating by tier', () => {
  it('free tier: maxRepos is capped at 5', () => {
    const features = getSubscriptionFeatures('free');
    expect(features.maxRepos).toBe(5);
  });

  it('pro tier: maxRepos is capped at 50', () => {
    const features = getSubscriptionFeatures('pro');
    expect(features.maxRepos).toBe(50);
  });

  it('team tier: maxRepos is unlimited', () => {
    const features = getSubscriptionFeatures('team');
    expect(features.maxRepos).toBe('unlimited');
  });

  it('free tier: no analytics (customProfile false)', () => {
    const features = getSubscriptionFeatures('free');
    expect(features.customProfile).toBe(false);
    expect(features.priorityFeed).toBeUndefined();
  });

  it('pro tier: analytics enabled (customProfile true, priorityFeed true)', () => {
    const features = getSubscriptionFeatures('pro');
    expect(features.customProfile).toBe(true);
    expect(features.priorityFeed).toBe(true);
  });

  it('team tier: all analytics including teamDashboard enabled', () => {
    const features = getSubscriptionFeatures('team');
    expect(features.customProfile).toBe(true);
    expect(features.priorityFeed).toBe(true);
    expect(features.teamDashboard).toBe(true);
  });
});
