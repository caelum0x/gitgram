/**
 * featureFlagService.ts
 *
 * Feature flag service for controlling feature rollouts.
 * Supports gradual rollouts, tier-based access, user lists, and more.
 *
 * Usage:
 *   isEnabled('new_feed_algorithm', userId, userTier)
 *   getEnabledFlags(userId, userTier)
 *   router.get('/feed', featureRequired('new_feed_algorithm'), handler)
 */

import crypto from 'crypto';
import { Request, RequestHandler, Response, NextFunction } from 'express';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FlagRule =
  | { type: 'always_on' }
  | { type: 'always_off' }
  | { type: 'percentage'; value: number }
  | { type: 'tier'; tiers: string[] }
  | { type: 'user_list'; userIds: string[] }
  | { type: 'user_hash_percentage'; percentage: number };

export interface FeatureFlag {
  name: string;
  description: string;
  rule: FlagRule;
  enabled: boolean;
}

// Extend Express Request so middleware can read the resolved user fields
interface AuthenticatedRequest extends Request {
  user?: {
    id?: string;
    userId?: string;
    tier?: string;
    betaOptIn?: boolean;
  };
}

// ---------------------------------------------------------------------------
// Flag Registry
// ---------------------------------------------------------------------------

const flagRegistry: Map<string, FeatureFlag> = new Map([
  [
    'new_feed_algorithm',
    {
      name: 'new_feed_algorithm',
      description: 'Gradual rollout of the engagement-weighted feed algorithm',
      rule: { type: 'user_hash_percentage', percentage: 20 },
      enabled: true,
    },
  ],
  [
    'enable_reels',
    {
      name: 'enable_reels',
      description: 'Short-form video reels — pro and team subscribers only initially',
      rule: { type: 'tier', tiers: ['pro', 'team'] },
      enabled: true,
    },
  ],
  [
    'enable_graphql',
    {
      name: 'enable_graphql',
      description: 'GraphQL API endpoint — percentage-based canary rollout',
      rule: { type: 'percentage', value: 10 },
      enabled: true,
    },
  ],
  [
    'enable_sse_notifications',
    {
      name: 'enable_sse_notifications',
      description: 'Server-Sent Events for real-time notifications (user opt-in)',
      rule: { type: 'always_off' },
      enabled: false,
    },
  ],
  [
    'dark_mode_default',
    {
      name: 'dark_mode_default',
      description: 'Default to dark mode based on device/OS preference',
      rule: { type: 'always_on' },
      enabled: true,
    },
  ],
  [
    'enable_ai_analysis',
    {
      name: 'enable_ai_analysis',
      description: 'AI-powered repository and code analysis features',
      rule: { type: 'tier', tiers: ['pro', 'team', 'enterprise'] },
      enabled: true,
    },
  ],
  [
    'enable_team_workspaces',
    {
      name: 'enable_team_workspaces',
      description: 'Shared team workspaces with role-based permissions',
      rule: { type: 'tier', tiers: ['team', 'enterprise'] },
      enabled: true,
    },
  ],
  [
    'beta_features',
    {
      name: 'beta_features',
      description: 'Access to experimental features for opted-in beta users',
      rule: { type: 'user_list', userIds: [] },
      enabled: false,
    },
  ],
]);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Deterministic hash of a userId to a 0-99 bucket.
 * The same userId always maps to the same bucket across restarts.
 */
function hashUserToBucket(userId: string): number {
  const hash = crypto.createHash('sha256').update(userId).digest('hex');
  // Take the first 8 hex characters as an unsigned 32-bit integer
  const numeric = parseInt(hash.slice(0, 8), 16);
  return numeric % 100;
}

function evaluateRule(
  rule: FlagRule,
  userId: string | undefined,
  userTier: string | undefined,
): boolean {
  switch (rule.type) {
    case 'always_on':
      return true;

    case 'always_off':
      return false;

    case 'percentage': {
      if (userId === undefined) {
        // Without a user anchor, fall back to a random roll at request time.
        // This is intentionally non-deterministic for anonymous traffic.
        return Math.random() * 100 < rule.value;
      }
      return hashUserToBucket(userId) < rule.value;
    }

    case 'user_hash_percentage': {
      if (userId === undefined) {
        return false;
      }
      return hashUserToBucket(userId) < rule.percentage;
    }

    case 'tier': {
      if (userTier === undefined) {
        return false;
      }
      return rule.tiers.includes(userTier);
    }

    case 'user_list': {
      if (userId === undefined) {
        return false;
      }
      return rule.userIds.includes(userId);
    }

    default: {
      // Exhaustive check — TypeScript will warn if a new rule type is added
      // without handling it here.
      const _exhaustive: never = rule;
      logger.warn('featureFlagService: unknown rule type encountered', { rule: _exhaustive });
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if the named feature flag is enabled for the given user.
 * Evaluation is deterministic: the same userId + tier always yields the same result.
 *
 * @param flagName  - One of the registered flag names.
 * @param userId    - Optional user identifier for hash/list rules.
 * @param userTier  - Optional subscription tier for tier-based rules.
 */
export function isEnabled(
  flagName: string,
  userId?: string,
  userTier?: string,
): boolean {
  const flag = flagRegistry.get(flagName);

  if (flag === undefined) {
    logger.warn('featureFlagService.isEnabled: unknown flag', { flagName });
    return false;
  }

  if (!flag.enabled) {
    return false;
  }

  return evaluateRule(flag.rule, userId, userTier);
}

/**
 * Returns the names of all flags that are currently enabled for the given user.
 *
 * @param userId   - The user's unique identifier.
 * @param userTier - The user's subscription tier.
 */
export function getEnabledFlags(userId: string, userTier: string): string[] {
  const enabled: string[] = [];

  for (const [name, flag] of flagRegistry) {
    if (flag.enabled && evaluateRule(flag.rule, userId, userTier)) {
      enabled.push(name);
    }
  }

  return enabled;
}

/**
 * Updates (or creates) a flag's rule at runtime.
 * Intended for admin-only use; callers are responsible for authorisation.
 *
 * @param flagName - The flag to update.
 * @param rule     - The new rule to apply.
 */
export function setFlag(flagName: string, rule: FlagRule): void {
  const existing = flagRegistry.get(flagName);

  if (existing !== undefined) {
    flagRegistry.set(flagName, { ...existing, rule });
    logger.info('featureFlagService.setFlag: rule updated', { flagName, rule });
  } else {
    // Create a minimal new flag entry so callers can introduce flags on the fly
    flagRegistry.set(flagName, {
      name: flagName,
      description: '',
      rule,
      enabled: true,
    });
    logger.info('featureFlagService.setFlag: new flag registered', { flagName, rule });
  }
}

/**
 * Returns a snapshot of all registered feature flags.
 */
export function getAllFlags(): FeatureFlag[] {
  return Array.from(flagRegistry.values());
}

// ---------------------------------------------------------------------------
// Express middleware
// ---------------------------------------------------------------------------

/**
 * Express middleware factory that returns 403 when the named feature is not
 * enabled for the requesting user.
 *
 * Reads `req.user.id` (or `req.user.userId`) and `req.user.tier` from whatever
 * auth middleware has already populated `req.user`.
 *
 * @param flagName - The feature flag that must be enabled to proceed.
 */
export function featureRequired(flagName: string): RequestHandler {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const userId = req.user?.id ?? req.user?.userId;
    const userTier = req.user?.tier;

    if (isEnabled(flagName, userId, userTier)) {
      next();
      return;
    }

    logger.info('featureFlagService.featureRequired: access denied', {
      flagName,
      userId,
      userTier,
    });

    res.status(403).json({
      error: {
        type: 'FEATURE_DISABLED',
        code: 'FEATURE_NOT_ENABLED',
        message: `The feature '${flagName}' is not available for your account.`,
      },
    });
  };
}

export default {
  isEnabled,
  getEnabledFlags,
  setFlag,
  getAllFlags,
  featureRequired,
};
