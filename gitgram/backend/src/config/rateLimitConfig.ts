/**
 * Rate Limit Configuration
 *
 * All rate limits are configurable via environment variables.
 * Defaults are production-safe values.
 */

// ---------------------------------------------------------------------------
// Per-IP Rate Limits (requests per window)
// ---------------------------------------------------------------------------

export const IP_RATE_LIMITS = {
  /** General API requests: default 100/min */
  GENERAL_API: {
    windowMs: 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_API_PER_MIN || '100', 10),
  },
  /** Authentication endpoints: default 10/min */
  AUTH: {
    windowMs: 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_AUTH_PER_MIN || '10', 10),
  },
  /** Upload endpoints: default 20/min */
  UPLOADS: {
    windowMs: 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_UPLOADS_PER_MIN || '20', 10),
  },
} as const;

// ---------------------------------------------------------------------------
// Per-User Rate Limits (actions per window)
// ---------------------------------------------------------------------------

export const USER_RATE_LIMITS = {
  /** Posts created: default 30/hour */
  POSTS: {
    windowMs: 60 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_USER_POSTS_PER_HOUR || '30', 10),
  },
  /** Comments created: default 60/hour */
  COMMENTS: {
    windowMs: 60 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_USER_COMMENTS_PER_HOUR || '60', 10),
  },
  /** Reactions (likes, saves): default 120/hour */
  REACTIONS: {
    windowMs: 60 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_USER_REACTIONS_PER_HOUR || '120', 10),
  },
  /** Follows: default 50/hour */
  FOLLOWS: {
    windowMs: 60 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_USER_FOLLOWS_PER_HOUR || '50', 10),
  },
  /** Reports submitted: default 20/hour */
  REPORTS: {
    windowMs: 60 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_USER_REPORTS_PER_HOUR || '20', 10),
  },
  /** Appeals submitted: default 8/day */
  APPEALS: {
    windowMs: 24 * 60 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_USER_APPEALS_PER_DAY || '8', 10),
  },
  /** Moderation actions by staff: default 240/hour */
  MODERATION_ACTIONS: {
    windowMs: 60 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MOD_ACTIONS_PER_HOUR || '240', 10),
  },
} as const;

// ---------------------------------------------------------------------------
// Spam Detection Thresholds
// ---------------------------------------------------------------------------

export const SPAM_CONFIG = {
  /** Similarity threshold (0-1) for near-duplicate detection */
  SIMILARITY_THRESHOLD: parseFloat(process.env.SPAM_SIMILARITY_THRESHOLD || '0.85'),
  /** Time window (ms) for duplicate detection: default 10 min */
  DUPLICATE_WINDOW_MS: parseInt(process.env.SPAM_DUPLICATE_WINDOW_MS || '600000', 10),
  /** Max similar posts before flagging */
  MAX_SIMILAR_POSTS: parseInt(process.env.SPAM_MAX_SIMILAR_POSTS || '2', 10),
  /** Rapid-fire threshold: actions per minute to trigger flag */
  RAPID_FIRE_THRESHOLD: parseInt(process.env.SPAM_RAPID_FIRE_THRESHOLD || '15', 10),
  /** New account age threshold in hours */
  NEW_ACCOUNT_AGE_HOURS: parseInt(process.env.SPAM_NEW_ACCOUNT_AGE_HOURS || '24', 10),
  /** Multiplier applied to rate limits for new accounts */
  NEW_ACCOUNT_LIMIT_MULTIPLIER: parseFloat(process.env.SPAM_NEW_ACCOUNT_LIMIT_MULTIPLIER || '0.5'),
} as const;

// ---------------------------------------------------------------------------
// Abuse Scoring
// ---------------------------------------------------------------------------

export const ABUSE_CONFIG = {
  /** Score threshold for soft restriction (read-only mode) */
  SOFT_RESTRICT_THRESHOLD: parseInt(process.env.ABUSE_SOFT_RESTRICT_THRESHOLD || '50', 10),
  /** Score threshold for hard restriction (temporary ban) */
  HARD_RESTRICT_THRESHOLD: parseInt(process.env.ABUSE_HARD_RESTRICT_THRESHOLD || '100', 10),
  /** Duration of soft restriction in minutes */
  SOFT_RESTRICT_DURATION_MIN: parseInt(process.env.ABUSE_SOFT_RESTRICT_DURATION_MIN || '30', 10),
  /** Duration of hard restriction in minutes */
  HARD_RESTRICT_DURATION_MIN: parseInt(process.env.ABUSE_HARD_RESTRICT_DURATION_MIN || '1440', 10),
  /** Score decay per hour (score reduces over time) */
  SCORE_DECAY_PER_HOUR: parseInt(process.env.ABUSE_SCORE_DECAY_PER_HOUR || '5', 10),
  /** Points added per violation type */
  VIOLATION_POINTS: {
    RATE_LIMIT_HIT: 5,
    DUPLICATE_CONTENT: 10,
    RAPID_FIRE_ACTION: 15,
    SPAM_CONTENT: 20,
    REPEATED_OFFENSE: 25,
  },
} as const;
