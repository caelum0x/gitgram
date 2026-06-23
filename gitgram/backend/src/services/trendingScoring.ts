/**
 * Trending Scoring Engine -- Pure Functions
 *
 * This module contains all the pure (non-DB, non-side-effect) scoring logic
 * extracted from trendingRankingService so it can be unit-tested without mocks.
 *
 * Responsibilities:
 *   - Decay functions (exponential, linear, logarithmic)
 *   - Weighted score calculation
 *   - Activity velocity & engagement momentum computation
 *   - Anti-gaming heuristics (burst detection, pattern analysis, velocity caps)
 *   - Score dampening for flagged entities
 */

import type { DecayConfig, VelocityCapConfig, AntiGamingConfig } from '../config/trending';

// ============================================
// TYPES
// ============================================

export interface AntiGamingAnomaly {
  type: string;
  severity: number;
  details: string;
  actorIds: string[];
}

export interface AntiGamingResult {
  penalty: number;
  anomalies: AntiGamingAnomaly[];
}

export interface ScoringResult {
  rawScore: number;
  decayedScore: number;
  signalBreakdown: Record<string, number>;
  decayMultiplier: number;
}

// ============================================
// DECAY FUNCTIONS
// ============================================

/**
 * Exponential decay: score halves every `halfLifeHours`.
 */
export function exponentialDecay(ageHours: number, halfLifeHours: number, minMultiplier: number = 0): number {
  const decay = Math.pow(0.5, ageHours / halfLifeHours);
  return Math.max(minMultiplier, decay);
}

/**
 * Linear decay: score drops to 0 at `zeroAtHours`.
 */
export function linearDecay(ageHours: number, zeroAtHours: number, minMultiplier: number = 0): number {
  const decay = Math.max(0, 1 - ageHours / zeroAtHours);
  return Math.max(minMultiplier, decay);
}

/**
 * Logarithmic decay: slow decay using logarithm base.
 * Decays slower than exponential -- good for weekly/long-term trending.
 */
export function logarithmicDecay(ageHours: number, parameter: number, minMultiplier: number = 0): number {
  // 1 / (1 + log(1 + ageHours/parameter))
  const decay = 1 / (1 + Math.log(1 + ageHours / parameter));
  return Math.max(minMultiplier, decay);
}

/**
 * Compute decay based on config.
 */
export function computeDecay(ageHours: number, config: DecayConfig): number {
  switch (config.function) {
    case 'exponential':
      return exponentialDecay(ageHours, config.parameter, config.minMultiplier);
    case 'linear':
      return linearDecay(ageHours, config.parameter, config.minMultiplier);
    case 'logarithmic':
      return logarithmicDecay(ageHours, config.parameter, config.minMultiplier);
    default:
      return exponentialDecay(ageHours, config.parameter, config.minMultiplier);
  }
}

// ============================================
// WEIGHTED SCORE CALCULATION
// ============================================

/**
 * Calculate a weighted score from signal values and weight map,
 * then apply time decay.
 */
export function calculateWeightedScore(
  signals: Record<string, number>,
  weights: Map<string, number>,
  ageHours: number,
  decayConfig: DecayConfig
): ScoringResult {
  const signalBreakdown: Record<string, number> = {};
  let rawScore = 0;

  for (const [signalName, signalValue] of Object.entries(signals)) {
    const weight = weights.get(signalName) || 0;
    const contribution = signalValue * weight;
    signalBreakdown[signalName] = contribution;
    rawScore += contribution;
  }

  const decayMultiplier = computeDecay(ageHours, decayConfig);
  const decayedScore = rawScore * decayMultiplier;

  signalBreakdown._decay = decayMultiplier;
  signalBreakdown._ageHours = ageHours;
  signalBreakdown._rawScoreBeforeDecay = rawScore;

  return { rawScore: decayedScore, decayedScore, signalBreakdown, decayMultiplier };
}

// ============================================
// ACTIVITY VELOCITY & MOMENTUM
// ============================================

/**
 * Compute activity velocity: the rate of engagement events per hour.
 * Used as an additional signal.
 *
 * @param eventTimestamps - timestamps (ms) of engagement events within the window
 * @param windowHours - total window length in hours
 * @returns events per hour
 */
export function computeActivityVelocity(
  eventTimestamps: number[],
  windowHours: number
): number {
  if (eventTimestamps.length === 0 || windowHours <= 0) return 0;
  return eventTimestamps.length / windowHours;
}

/**
 * Compute engagement momentum: ratio of engagement in the recent half of the
 * window vs the older half. A value > 1 means momentum is increasing (good for trending).
 *
 * @param eventTimestamps - timestamps (ms) of engagement events
 * @param windowStart - window start (ms)
 * @param windowEnd - window end (ms)
 * @returns momentum ratio (>1 = accelerating, <1 = decelerating)
 */
export function computeEngagementMomentum(
  eventTimestamps: number[],
  windowStart: number,
  windowEnd: number
): number {
  if (eventTimestamps.length < 2) return 1;

  const midpoint = windowStart + (windowEnd - windowStart) / 2;
  const olderHalf = eventTimestamps.filter((t) => t < midpoint).length;
  const recentHalf = eventTimestamps.filter((t) => t >= midpoint).length;

  if (olderHalf === 0) return recentHalf > 0 ? 2 : 1; // All in recent half = high momentum
  return recentHalf / olderHalf;
}

// ============================================
// BURST DETECTION (Anti-Gaming)
// ============================================

/**
 * Detect event bursts within a sliding window.
 * Returns the maximum burst count found.
 */
export function detectBurst(
  timestamps: number[],
  velocityCap: VelocityCapConfig
): { burstDetected: boolean; maxBurstCount: number; severity: number } {
  if (timestamps.length < velocityCap.maxEventsPerWindow) {
    return { burstDetected: false, maxBurstCount: 0, severity: 0 };
  }

  const sorted = [...timestamps].sort((a, b) => a - b);
  const burstWindowMs = velocityCap.windowMinutes * 60 * 1000;
  let maxBurstCount = 0;

  // Sliding window using two pointers for efficiency
  let left = 0;
  for (let right = 0; right < sorted.length; right++) {
    while (sorted[right] - sorted[left] > burstWindowMs) {
      left++;
    }
    const count = right - left + 1;
    if (count > maxBurstCount) {
      maxBurstCount = count;
    }
  }

  const burstDetected = maxBurstCount >= velocityCap.maxEventsPerWindow;
  const severity = burstDetected
    ? Math.min(1, maxBurstCount / (velocityCap.maxEventsPerWindow * 2))
    : 0;

  return { burstDetected, maxBurstCount, severity };
}

// ============================================
// SUSPICIOUS PATTERN DETECTION
// ============================================

export interface EngagerProfile {
  userId: string;
  accountAgeDays: number;
  postCount: number;
  followerCount: number;
}

/**
 * Detect if a large proportion of engagers are from new accounts.
 */
export function detectNewAccountPattern(
  engagers: EngagerProfile[],
  config: AntiGamingConfig['suspiciousPatterns']
): AntiGamingAnomaly | null {
  if (engagers.length < config.minEngagementsForCheck) return null;

  const newAccounts = engagers.filter(
    (e) => e.accountAgeDays < config.newAccountAgeDays
  );

  const ratio = newAccounts.length / engagers.length;
  if (ratio < config.newAccountThreshold) return null;

  const severity = Math.min(1, ratio);
  return {
    type: 'new_account_engagement',
    severity,
    details: `${newAccounts.length}/${engagers.length} engagements from accounts < ${config.newAccountAgeDays} day(s) old`,
    actorIds: newAccounts.map((e) => e.userId),
  };
}

/**
 * Detect if a large proportion of engagers have no posts or followers.
 */
export function detectLowActivityPattern(
  engagers: EngagerProfile[],
  config: AntiGamingConfig['suspiciousPatterns']
): AntiGamingAnomaly | null {
  if (engagers.length < config.minEngagementsForCheck) return null;

  const lowActivity = engagers.filter(
    (e) => e.postCount === 0 && e.followerCount === 0
  );

  const ratio = lowActivity.length / engagers.length;
  if (ratio < config.lowActivityThreshold) return null;

  const severity = Math.min(1, ratio);
  return {
    type: 'low_activity_engagers',
    severity,
    details: `${lowActivity.length}/${engagers.length} engagements from inactive accounts`,
    actorIds: lowActivity.map((e) => e.userId),
  };
}

/**
 * Detect comment spam: users posting an excessive number of comments on a single entity.
 */
export function detectCommentSpam(
  commentUserIds: string[],
  config: AntiGamingConfig['suspiciousPatterns']
): AntiGamingAnomaly | null {
  const counts = new Map<string, number>();
  for (const uid of commentUserIds) {
    counts.set(uid, (counts.get(uid) || 0) + 1);
  }

  const spammers = Array.from(counts.entries()).filter(
    ([, count]) => count >= config.maxCommentsPerUserPerPost
  );

  if (spammers.length === 0) return null;

  return {
    type: 'comment_spam',
    severity: 0.4,
    details: `${spammers.length} user(s) with ${config.maxCommentsPerUserPerPost}+ comments on same entity`,
    actorIds: spammers.map(([id]) => id),
  };
}

/**
 * Detect IP-based clusters: multiple user accounts performing actions from the same IP.
 */
export function detectIpCluster(
  actionsWithIps: Array<{ userId: string; ip: string }>,
  config: AntiGamingConfig['suspiciousPatterns']
): AntiGamingAnomaly | null {
  if (actionsWithIps.length === 0) return null;

  // Group unique users by IP
  const ipToUsers = new Map<string, Set<string>>();
  for (const action of actionsWithIps) {
    if (!action.ip) continue;
    if (!ipToUsers.has(action.ip)) {
      ipToUsers.set(action.ip, new Set());
    }
    ipToUsers.get(action.ip)!.add(action.userId);
  }

  // Find IPs with suspicious numbers of unique users
  const suspiciousIps: string[] = [];
  const suspiciousUserIds = new Set<string>();
  for (const [ip, users] of ipToUsers.entries()) {
    if (users.size >= config.ipClusterMinSharedUsers) {
      suspiciousIps.push(ip);
      users.forEach((uid) => suspiciousUserIds.add(uid));
    }
  }

  if (suspiciousIps.length === 0) return null;

  const severity = Math.min(1, suspiciousUserIds.size / actionsWithIps.length);
  return {
    type: 'ip_cluster',
    severity,
    details: `${suspiciousIps.length} IP(s) with ${suspiciousUserIds.size} shared users performing bulk actions`,
    actorIds: Array.from(suspiciousUserIds),
  };
}

// ============================================
// AGGREGATE ANTI-GAMING PENALTY
// ============================================

/**
 * Calculate total penalty from anomalies, respecting the max total penalty cap.
 */
export function calculateTotalPenalty(
  anomalies: AntiGamingAnomaly[],
  config: AntiGamingConfig
): number {
  if (!config.enabled || anomalies.length === 0) return 0;

  let totalPenalty = 0;

  for (const anomaly of anomalies) {
    let penaltyWeight = 0;

    switch (anomaly.type) {
      case 'burst_likes':
        penaltyWeight = config.velocityCaps.postLikes.penaltyWeight;
        break;
      case 'burst_comments':
        penaltyWeight = config.velocityCaps.postComments.penaltyWeight;
        break;
      case 'coordinated_follows':
        penaltyWeight = config.velocityCaps.repoFollows.penaltyWeight;
        break;
      case 'velocity_spike':
        penaltyWeight = config.velocityCaps.postLikes.penaltyWeight;
        break;
      case 'new_account_engagement':
        penaltyWeight = config.suspiciousPatterns.newAccountPenaltyWeight;
        break;
      case 'low_activity_engagers':
        penaltyWeight = config.suspiciousPatterns.lowActivityPenaltyWeight;
        break;
      case 'comment_spam':
        penaltyWeight = config.suspiciousPatterns.commentSpamPenaltyWeight;
        break;
      case 'ip_cluster':
        penaltyWeight = config.suspiciousPatterns.ipClusterPenaltyWeight;
        break;
      case 'fake_followers':
        penaltyWeight = config.velocityCaps.userFollows.penaltyWeight;
        break;
      default:
        penaltyWeight = 0.2; // Default penalty weight for unknown anomaly types
    }

    totalPenalty += anomaly.severity * penaltyWeight;
  }

  return Math.min(config.maxTotalPenalty, totalPenalty);
}

/**
 * Apply flagged-entity dampening based on historical anomaly count.
 */
export function computeFlaggedDampening(
  recentAnomalyCount: number,
  config: AntiGamingConfig['flaggedEntityDampening']
): number {
  if (recentAnomalyCount < config.anomalyCountThreshold) return 1;
  return config.dampeningMultiplier;
}

/**
 * Compute the final score after anti-gaming and dampening.
 */
export function computeFinalScore(
  rawScore: number,
  antiGamingPenalty: number,
  flaggedDampeningMultiplier: number
): number {
  return rawScore * (1 - antiGamingPenalty) * flaggedDampeningMultiplier;
}
