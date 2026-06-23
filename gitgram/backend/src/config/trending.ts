/**
 * Trending Configuration Module
 *
 * Allows tuning signal weights, anti-gaming thresholds, decay parameters,
 * and velocity caps without code changes. Values can be overridden by:
 *   1. Database (TrendingSignalWeight table) - highest priority
 *   2. Environment variables (TRENDING_CONFIG_PATH for JSON file)
 *   3. These defaults - lowest priority
 */

import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

// ============================================
// SIGNAL WEIGHT CONFIGURATION
// ============================================

export interface SignalWeightConfig {
  name: string;
  weight: number;
  category: 'github' | 'social' | 'engagement_quality' | 'freshness' | 'creator';
  description: string;
}

export interface DecayConfig {
  /** Decay function: 'exponential' | 'linear' | 'logarithmic' */
  function: 'exponential' | 'linear' | 'logarithmic';
  /** For exponential: half-life in hours. For linear: hours until score reaches 0. For logarithmic: base. */
  parameter: number;
  /** Minimum decay multiplier (floor) -- score never drops below rawScore * minMultiplier */
  minMultiplier: number;
}

export interface TierConfig {
  windowHours: number;
  decay: DecayConfig;
  maxResults: number;
  /** Minimum raw score to be considered for this tier (filters noise) */
  minScoreThreshold: number;
}

export interface VelocityCapConfig {
  /** Max engagement events per entity within the burst window */
  maxEventsPerWindow: number;
  /** Burst detection window in minutes */
  windowMinutes: number;
  /** Penalty applied when velocity cap is exceeded (0-1) */
  penaltyWeight: number;
}

export interface AntiGamingConfig {
  /** Enable/disable anti-gaming system */
  enabled: boolean;

  /** Velocity caps by entity type */
  velocityCaps: {
    postLikes: VelocityCapConfig;
    postComments: VelocityCapConfig;
    repoFollows: VelocityCapConfig;
    userFollows: VelocityCapConfig;
  };

  /** Suspicious pattern detection thresholds */
  suspiciousPatterns: {
    /** % of engagement from accounts < N days old to flag */
    newAccountThreshold: number;
    /** Account age (days) to be considered "new" */
    newAccountAgeDays: number;
    /** % of engagement from low-activity accounts to flag */
    lowActivityThreshold: number;
    /** Minimum engagements before applying pattern checks */
    minEngagementsForCheck: number;
    /** Max comments from single user on one post before flagging */
    maxCommentsPerUserPerPost: number;
    /** Max likes from IPs sharing >N users to flag as cluster */
    ipClusterMinSharedUsers: number;
    /** Penalty weight for new-account engagement pattern */
    newAccountPenaltyWeight: number;
    /** Penalty weight for low-activity engager pattern */
    lowActivityPenaltyWeight: number;
    /** Penalty weight for comment spam pattern */
    commentSpamPenaltyWeight: number;
    /** Penalty weight for IP cluster pattern */
    ipClusterPenaltyWeight: number;
  };

  /** Score dampening for flagged entities */
  flaggedEntityDampening: {
    /** Multiplier applied to entities with unresolved anomalies (0-1) */
    dampeningMultiplier: number;
    /** Number of recent anomalies before dampening kicks in */
    anomalyCountThreshold: number;
    /** Hours to look back for anomalies */
    anomalyWindowHours: number;
  };

  /** Maximum total penalty that can be applied (0-1) */
  maxTotalPenalty: number;
}

export interface TrendingConfig {
  signalWeights: SignalWeightConfig[];
  tiers: Record<string, TierConfig>;
  antiGaming: AntiGamingConfig;
  /** Cache TTL in seconds by tier */
  cacheTTL: Record<string, number>;
  /** How often to refresh the config from disk/DB (milliseconds) */
  configRefreshIntervalMs: number;
}

// ============================================
// DEFAULT CONFIGURATION
// ============================================

export const DEFAULT_TRENDING_CONFIG: TrendingConfig = {
  signalWeights: [
    // GitHub signals
    { name: 'github_stars_recent', weight: 2.0, category: 'github', description: 'Recent GitHub stars within the scoring window' },
    { name: 'github_forks', weight: 3.0, category: 'github', description: 'Recent GitHub forks within the scoring window' },
    { name: 'github_watchers', weight: 1.0, category: 'github', description: 'GitHub watchers count (log-scaled)' },
    { name: 'github_prs_opened', weight: 4.0, category: 'github', description: 'Pull requests opened within the scoring window' },
    { name: 'github_releases', weight: 5.0, category: 'github', description: 'Releases published within the scoring window' },
    { name: 'github_commit_velocity', weight: 1.5, category: 'github', description: 'Push events (commit velocity) within the scoring window' },

    // On-platform social signals
    { name: 'post_likes', weight: 1.0, category: 'social', description: 'Likes on posts within the scoring window' },
    { name: 'post_comments', weight: 2.0, category: 'social', description: 'Comments on posts within the scoring window' },
    { name: 'post_shares', weight: 3.0, category: 'social', description: 'Shares of posts within the scoring window' },
    { name: 'post_views', weight: 0.1, category: 'social', description: 'Views on posts within the scoring window' },
    { name: 'follows_gained', weight: 2.5, category: 'social', description: 'New followers gained within the scoring window' },
    { name: 'change_story_post', weight: 2.5, category: 'social', description: 'Repository change story posts with AITM context' },
    { name: 'checkpoint_linked', weight: 2.0, category: 'social', description: 'Posts linked to an AITM checkpoint' },
    { name: 'changed_files_count', weight: 0.4, category: 'engagement_quality', description: 'Changed files included in a checkpoint-linked change story' },

    // Engagement quality signals
    { name: 'avg_comment_length', weight: 1.5, category: 'engagement_quality', description: 'Average comment length (normalized to 50 chars = 1 unit)' },
    { name: 'reply_depth', weight: 2.0, category: 'engagement_quality', description: 'Number of reply-comments (threaded conversation depth)' },
    { name: 'unique_engagers', weight: 3.0, category: 'engagement_quality', description: 'Count of distinct users who engaged' },

    // Creator authority signals
    { name: 'creator_follower_count', weight: 0.5, category: 'creator', description: 'Log10 of creator follower count' },
    { name: 'creator_post_quality', weight: 1.0, category: 'creator', description: 'Log10 of creator total post count' },
    { name: 'creator_account_age_days', weight: 0.3, category: 'creator', description: 'Account age in years (capped at 3)' },

    // Activity velocity signals
    { name: 'activity_velocity', weight: 2.0, category: 'freshness', description: 'Rate of engagement acceleration (events per hour delta)' },
    { name: 'engagement_momentum', weight: 1.5, category: 'freshness', description: 'Ratio of recent-half to older-half engagement' },
  ],

  tiers: {
    HOT_NOW: {
      windowHours: 4,
      decay: {
        function: 'exponential',
        parameter: 2,       // half-life of 2 hours
        minMultiplier: 0.01,
      },
      maxResults: 50,
      minScoreThreshold: 0.5,
    },
    TRENDING_TODAY: {
      windowHours: 24,
      decay: {
        function: 'exponential',
        parameter: 12,      // half-life of 12 hours
        minMultiplier: 0.05,
      },
      maxResults: 100,
      minScoreThreshold: 1.0,
    },
    THIS_WEEK: {
      windowHours: 168,     // 7 days
      decay: {
        function: 'logarithmic',
        parameter: 72,      // slow decay over 72 hours
        minMultiplier: 0.1,
      },
      maxResults: 100,
      minScoreThreshold: 2.0,
    },
    RISING_STARS: {
      windowHours: 72,
      decay: {
        function: 'exponential',
        parameter: 24,      // half-life of 24 hours
        minMultiplier: 0.05,
      },
      maxResults: 50,
      minScoreThreshold: 0.5,
    },
  },

  antiGaming: {
    enabled: true,

    velocityCaps: {
      postLikes: {
        maxEventsPerWindow: 10,
        windowMinutes: 10,
        penaltyWeight: 0.4,
      },
      postComments: {
        maxEventsPerWindow: 8,
        windowMinutes: 15,
        penaltyWeight: 0.3,
      },
      repoFollows: {
        maxEventsPerWindow: 20,
        windowMinutes: 30,
        penaltyWeight: 0.4,
      },
      userFollows: {
        maxEventsPerWindow: 15,
        windowMinutes: 20,
        penaltyWeight: 0.5,
      },
    },

    suspiciousPatterns: {
      newAccountThreshold: 0.5,        // 50% of engagement from new accounts
      newAccountAgeDays: 1,            // Accounts less than 1 day old
      lowActivityThreshold: 0.4,       // 40% of engagement from inactive accounts
      minEngagementsForCheck: 5,       // Need at least 5 engagements to check
      maxCommentsPerUserPerPost: 5,    // 5+ comments = spam
      ipClusterMinSharedUsers: 3,      // 3+ users from same IP = cluster
      newAccountPenaltyWeight: 0.5,
      lowActivityPenaltyWeight: 0.3,
      commentSpamPenaltyWeight: 0.2,
      ipClusterPenaltyWeight: 0.4,
    },

    flaggedEntityDampening: {
      dampeningMultiplier: 0.5,        // 50% score reduction for flagged entities
      anomalyCountThreshold: 2,        // 2+ anomalies in window triggers dampening
      anomalyWindowHours: 48,          // Look back 48 hours for anomalies
    },

    maxTotalPenalty: 0.95,             // Never fully zero out a score
  },

  cacheTTL: {
    HOT_NOW: 900,          // 15 minutes
    TRENDING_TODAY: 3600,  // 1 hour
    THIS_WEEK: 7200,       // 2 hours
    RISING_STARS: 3600,    // 1 hour
  },

  configRefreshIntervalMs: 5 * 60 * 1000, // 5 minutes
};

// ============================================
// CONFIG LOADING
// ============================================

let loadedConfig: TrendingConfig | null = null;
let lastLoadTime = 0;

/**
 * Deep merge two objects, preferring values from `override` where present.
 * Arrays are replaced, not merged.
 */
function deepMerge<T extends Record<string, any>>(base: T, override: Partial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(override) as Array<keyof T>) {
    const overrideVal = override[key];
    if (overrideVal === undefined) continue;

    if (
      typeof overrideVal === 'object' &&
      overrideVal !== null &&
      !Array.isArray(overrideVal) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key] as any, overrideVal as any);
    } else {
      result[key] = overrideVal as T[keyof T];
    }
  }
  return result;
}

/**
 * Load trending configuration from a JSON file if TRENDING_CONFIG_PATH is set.
 * Falls back to defaults if file is missing or invalid.
 */
function loadConfigFromFile(): Partial<TrendingConfig> | null {
  const configPath = process.env.TRENDING_CONFIG_PATH;
  if (!configPath) return null;

  try {
    const resolvedPath = path.isAbsolute(configPath)
      ? configPath
      : path.resolve(process.cwd(), configPath);

    if (!fs.existsSync(resolvedPath)) {
      logger.warn(`Trending config file not found: ${resolvedPath}`);
      return null;
    }

    const raw = fs.readFileSync(resolvedPath, 'utf-8');
    const parsed = JSON.parse(raw);
    logger.info(`Loaded trending config from: ${resolvedPath}`);
    return parsed;
  } catch (error) {
    logger.error('Failed to load trending config file:', error);
    return null;
  }
}

/**
 * Get the current trending configuration.
 * Reloads from file if the refresh interval has elapsed.
 */
export function getTrendingConfig(): TrendingConfig {
  const now = Date.now();
  const refreshInterval = loadedConfig?.configRefreshIntervalMs ?? DEFAULT_TRENDING_CONFIG.configRefreshIntervalMs;

  if (loadedConfig && now - lastLoadTime < refreshInterval) {
    return loadedConfig;
  }

  const fileOverrides = loadConfigFromFile();
  if (fileOverrides) {
    loadedConfig = deepMerge(DEFAULT_TRENDING_CONFIG, fileOverrides);
  } else {
    loadedConfig = { ...DEFAULT_TRENDING_CONFIG };
  }

  lastLoadTime = now;
  return loadedConfig;
}

/**
 * Force-reload configuration (e.g. after admin changes the JSON file).
 */
export function reloadTrendingConfig(): TrendingConfig {
  lastLoadTime = 0;
  loadedConfig = null;
  return getTrendingConfig();
}

/**
 * Override the loaded config at runtime (useful for tests or admin API).
 */
export function setTrendingConfigOverride(override: Partial<TrendingConfig>): TrendingConfig {
  const current = getTrendingConfig();
  loadedConfig = deepMerge(current, override);
  lastLoadTime = Date.now();
  return loadedConfig;
}

/**
 * Reset to defaults (for tests).
 */
export function resetTrendingConfig(): void {
  loadedConfig = null;
  lastLoadTime = 0;
}

// Export deep merge for testing
export { deepMerge };
