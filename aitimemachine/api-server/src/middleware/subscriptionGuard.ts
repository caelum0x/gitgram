import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth.js";

// Plan hierarchy for feature access
const PLAN_HIERARCHY: Record<string, number> = {
  free: 0,
  pro: 1,
  team: 2,
};

// Feature requirements by minimum plan
const FEATURE_REQUIREMENTS: Record<string, string> = {
  "cloud-sync": "pro",
  "unlimited-checkpoints": "pro",
  "unlimited-projects": "pro",
  "priority-support": "pro",
  "team-sharing": "team",
  "admin-dashboard": "team",
  "sso": "team",
  "audit-logs": "team",
};

/**
 * Middleware to require a minimum plan level
 * @param requiredPlan - The minimum plan required (free, pro, team)
 */
export function requirePlan(requiredPlan: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          type: "authentication_error",
          message: "Authentication required",
        },
      });
    }

    const userPlanLevel = PLAN_HIERARCHY[req.user.plan] ?? 0;
    const requiredPlanLevel = PLAN_HIERARCHY[requiredPlan] ?? 0;

    if (userPlanLevel < requiredPlanLevel) {
      return res.status(403).json({
        error: {
          type: "subscription_error",
          code: "plan_required",
          message: `This feature requires the ${requiredPlan} plan or higher`,
          required_plan: requiredPlan,
          current_plan: req.user.plan,
          upgrade_url: `${process.env.WEBSITE_URL || "https://timemachine.gitgram.app"}/pricing`,
        },
      });
    }

    next();
  };
}

/**
 * Middleware to require a specific feature
 * @param feature - The feature identifier to check
 */
export function requireFeature(feature: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          type: "authentication_error",
          message: "Authentication required",
        },
      });
    }

    const requiredPlan = FEATURE_REQUIREMENTS[feature];
    if (!requiredPlan) {
      // Unknown feature, allow by default
      return next();
    }

    const userPlanLevel = PLAN_HIERARCHY[req.user.plan] ?? 0;
    const requiredPlanLevel = PLAN_HIERARCHY[requiredPlan] ?? 0;

    if (userPlanLevel < requiredPlanLevel) {
      return res.status(403).json({
        error: {
          type: "subscription_error",
          code: "feature_not_available",
          message: `The "${feature}" feature requires the ${requiredPlan} plan or higher`,
          feature,
          required_plan: requiredPlan,
          current_plan: req.user.plan,
          upgrade_url: `${process.env.WEBSITE_URL || "https://timemachine.gitgram.app"}/pricing`,
        },
      });
    }

    next();
  };
}

/**
 * Check if a user's plan meets the minimum requirement
 */
export function hasPlanAccess(userPlan: string, requiredPlan: string): boolean {
  const userPlanLevel = PLAN_HIERARCHY[userPlan] ?? 0;
  const requiredPlanLevel = PLAN_HIERARCHY[requiredPlan] ?? 0;
  return userPlanLevel >= requiredPlanLevel;
}

/**
 * Check if a user has access to a specific feature
 */
export function hasFeatureAccess(userPlan: string, feature: string): boolean {
  const requiredPlan = FEATURE_REQUIREMENTS[feature];
  if (!requiredPlan) {
    return true; // Unknown features are allowed by default
  }
  return hasPlanAccess(userPlan, requiredPlan);
}

/**
 * Get list of features available for a plan
 */
export function getPlanFeatures(plan: string): string[] {
  const planLevel = PLAN_HIERARCHY[plan] ?? 0;
  return Object.entries(FEATURE_REQUIREMENTS)
    .filter(([_, requiredPlan]) => {
      const requiredLevel = PLAN_HIERARCHY[requiredPlan] ?? 0;
      return planLevel >= requiredLevel;
    })
    .map(([feature]) => feature);
}

/**
 * Plan limits for rate limiting and quotas
 */
export const PLAN_LIMITS = {
  free: {
    checkpointsPerDay: 50,
    projectsTotal: 1,
    storageBytes: 100 * 1024 * 1024, // 100 MB
    apiRequestsPerMinute: 30,
    cloudSyncEnabled: false,
  },
  pro: {
    checkpointsPerDay: -1, // unlimited
    projectsTotal: -1, // unlimited
    storageBytes: 10 * 1024 * 1024 * 1024, // 10 GB
    apiRequestsPerMinute: 100,
    cloudSyncEnabled: true,
  },
  team: {
    checkpointsPerDay: -1, // unlimited
    projectsTotal: -1, // unlimited
    storageBytes: 100 * 1024 * 1024 * 1024, // 100 GB
    apiRequestsPerMinute: 500,
    cloudSyncEnabled: true,
  },
};

/**
 * Get limits for a specific plan
 */
export function getPlanLimits(plan: string) {
  return PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS.free;
}
