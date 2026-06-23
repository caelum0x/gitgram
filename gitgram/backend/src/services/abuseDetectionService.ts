/**
 * Abuse Detection & Scoring Service
 *
 * Tracks abuse scores per user and enforces automatic restrictions
 * when thresholds are exceeded. Scores decay over time.
 *
 * Uses an in-memory store (can be swapped for Redis later).
 */

import { ABUSE_CONFIG, SPAM_CONFIG } from '../config/rateLimitConfig';
import logger from '../utils/logger';
import { logAbuseEvent } from './abuseTelemetryService';
import { RedisHashStore } from '../utils/redisStores';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ViolationType = keyof typeof ABUSE_CONFIG.VIOLATION_POINTS;

export type RestrictionLevel = 'none' | 'soft' | 'hard';

export interface AbuseRecord {
  score: number;
  violations: Array<{
    type: ViolationType;
    points: number;
    timestamp: number;
    detail?: string;
  }>;
  restrictionLevel: RestrictionLevel;
  restrictedUntil: number | null;
  lastUpdated: number;
}

export interface AbuseStatus {
  score: number;
  restrictionLevel: RestrictionLevel;
  restrictedUntil: number | null;
  isRestricted: boolean;
  violationCount: number;
}

// ---------------------------------------------------------------------------
// Store (Redis-backed with in-memory fallback)
// ---------------------------------------------------------------------------

const abuseStore = new RedisHashStore<AbuseRecord>('abuse:record', 24 * 60 * 60 * 1000);

export interface AbuseRuntimeConfig {
  softRestrictThreshold: number;
  hardRestrictThreshold: number;
  softRestrictDurationMin: number;
  hardRestrictDurationMin: number;
  scoreDecayPerHour: number;
  violationPoints: Record<ViolationType, number>;
}

const runtimeConfig: AbuseRuntimeConfig = {
  softRestrictThreshold: ABUSE_CONFIG.SOFT_RESTRICT_THRESHOLD,
  hardRestrictThreshold: ABUSE_CONFIG.HARD_RESTRICT_THRESHOLD,
  softRestrictDurationMin: ABUSE_CONFIG.SOFT_RESTRICT_DURATION_MIN,
  hardRestrictDurationMin: ABUSE_CONFIG.HARD_RESTRICT_DURATION_MIN,
  scoreDecayPerHour: ABUSE_CONFIG.SCORE_DECAY_PER_HOUR,
  violationPoints: { ...ABUSE_CONFIG.VIOLATION_POINTS },
};

// Periodic cleanup every 10 minutes (in-memory fallback only)
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [userId, record] of abuseStore.entries()) {
    applyDecay(record, now);
    if (record.score <= 0 && (!record.restrictedUntil || record.restrictedUntil < now)) {
      void abuseStore.delete(userId);
    }
  }
}, 10 * 60 * 1000);

if (cleanupTimer.unref) {
  cleanupTimer.unref();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getOrCreate(userId: string): Promise<AbuseRecord> {
  let record = await abuseStore.get(userId);
  if (!record) {
    record = {
      score: 0,
      violations: [],
      restrictionLevel: 'none',
      restrictedUntil: null,
      lastUpdated: Date.now(),
    };
    await abuseStore.set(userId, record);
  }
  return record;
}

function applyDecay(record: AbuseRecord, now: number): void {
  const hoursSinceUpdate = (now - record.lastUpdated) / (60 * 60 * 1000);
  if (hoursSinceUpdate >= 1) {
    const decay = Math.floor(hoursSinceUpdate) * runtimeConfig.scoreDecayPerHour;
    record.score = Math.max(0, record.score - decay);
    record.lastUpdated = now;
  }
}

function evaluateRestriction(record: AbuseRecord, userId?: string): void {
  const now = Date.now();

  // Check if current restriction has expired
  if (record.restrictedUntil && record.restrictedUntil < now) {
    record.restrictionLevel = 'none';
    record.restrictedUntil = null;
  }

  // Escalate restriction based on score
  if (record.score >= runtimeConfig.hardRestrictThreshold && record.restrictionLevel !== 'hard') {
    record.restrictionLevel = 'hard';
    record.restrictedUntil = now + runtimeConfig.hardRestrictDurationMin * 60 * 1000;
    logger.warn(`Abuse: HARD restriction applied for user. Score=${record.score}`);
    if (userId) {
      void logAbuseEvent(userId, 'HARD_RESTRICT_APPLIED', 'Hard restriction threshold crossed', {
        score: record.score,
        restrictedUntil: record.restrictedUntil,
      });
    }
  } else if (
    record.score >= runtimeConfig.softRestrictThreshold &&
    record.restrictionLevel === 'none'
  ) {
    record.restrictionLevel = 'soft';
    record.restrictedUntil = now + runtimeConfig.softRestrictDurationMin * 60 * 1000;
    logger.warn(`Abuse: SOFT restriction applied for user. Score=${record.score}`);
    if (userId) {
      void logAbuseEvent(userId, 'SOFT_RESTRICT_APPLIED', 'Soft restriction threshold crossed', {
        score: record.score,
        restrictedUntil: record.restrictedUntil,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record a violation and potentially apply restrictions.
 */
export async function recordViolation(
  userId: string,
  type: ViolationType,
  detail?: string
): Promise<AbuseStatus> {
  const record = await getOrCreate(userId);
  const now = Date.now();

  applyDecay(record, now);

  const points = runtimeConfig.violationPoints[type];

  // Check for repeated offense (more than 3 violations in the last hour)
  const recentViolations = record.violations.filter(
    v => v.timestamp > now - 60 * 60 * 1000
  );
  let effectivePoints = points;
  if (recentViolations.length >= 3) {
    effectivePoints += runtimeConfig.violationPoints.REPEATED_OFFENSE;
  }

  record.violations.push({
    type,
    points: effectivePoints,
    timestamp: now,
    detail,
  });

  // Keep only last 100 violations
  if (record.violations.length > 100) {
    record.violations = record.violations.slice(-100);
  }

  record.score += effectivePoints;
  record.lastUpdated = now;

  evaluateRestriction(record, userId);

  logger.info(
    `Abuse violation recorded: userId=${userId} type=${type} points=${effectivePoints} totalScore=${record.score} restriction=${record.restrictionLevel}`
  );

  const eventByViolation: Record<ViolationType, Parameters<typeof logAbuseEvent>[1]> = {
    RATE_LIMIT_HIT: 'VIOLATION_RATE_LIMIT_HIT',
    DUPLICATE_CONTENT: 'VIOLATION_DUPLICATE_CONTENT',
    RAPID_FIRE_ACTION: 'VIOLATION_RAPID_FIRE_ACTION',
    SPAM_CONTENT: 'VIOLATION_SPAM_CONTENT',
    REPEATED_OFFENSE: 'VIOLATION_REPEATED_OFFENSE',
  };
  void logAbuseEvent(userId, eventByViolation[type], detail || undefined, {
    points: effectivePoints,
    totalScore: record.score,
  });

  await abuseStore.set(userId, record);
  return getStatus(userId);
}

/**
 * Get the current abuse status for a user.
 */
export async function getStatus(userId: string): Promise<AbuseStatus> {
  const record = await abuseStore.get(userId);
  if (!record) {
    return {
      score: 0,
      restrictionLevel: 'none',
      restrictedUntil: null,
      isRestricted: false,
      violationCount: 0,
    };
  }

  const now = Date.now();
  applyDecay(record, now);

  // Check if restriction expired
  if (record.restrictedUntil && record.restrictedUntil < now) {
    record.restrictionLevel = 'none';
    record.restrictedUntil = null;
  }

  return {
    score: record.score,
    restrictionLevel: record.restrictionLevel,
    restrictedUntil: record.restrictedUntil,
    isRestricted: record.restrictionLevel !== 'none',
    violationCount: record.violations.length,
  };
}

/**
 * Admin: Reset a user's abuse score and lift restrictions.
 */
export async function adminReset(userId: string): Promise<AbuseStatus> {
  await abuseStore.delete(userId);
  logger.info(`Abuse: Admin reset for userId=${userId}`);
  return getStatus(userId);
}

/**
 * Admin: Override restriction level for a user.
 */
export async function adminOverride(
  userId: string,
  level: RestrictionLevel,
  durationMinutes?: number
): Promise<AbuseStatus> {
  const record = await getOrCreate(userId);
  const now = Date.now();

  record.restrictionLevel = level;
  if (level === 'none') {
    record.restrictedUntil = null;
  } else {
    const duration = durationMinutes || (level === 'hard'
      ? runtimeConfig.hardRestrictDurationMin
      : runtimeConfig.softRestrictDurationMin);
    record.restrictedUntil = now + duration * 60 * 1000;
  }

  record.lastUpdated = now;
  await abuseStore.set(userId, record);
  logger.info(`Abuse: Admin override for userId=${userId} level=${level}`);

  return getStatus(userId);
}

/**
 * Get the full abuse record for admin inspection.
 */
export async function getFullRecord(userId: string): Promise<AbuseRecord | null> {
  return (await abuseStore.get(userId)) || null;
}

export function getRuntimeConfig(): AbuseRuntimeConfig {
  return {
    ...runtimeConfig,
    violationPoints: { ...runtimeConfig.violationPoints },
  };
}

export function updateRuntimeConfig(
  patch: Partial<Omit<AbuseRuntimeConfig, 'violationPoints'>> & {
    violationPoints?: Partial<Record<ViolationType, number>>;
  }
): AbuseRuntimeConfig {
  if (typeof patch.softRestrictThreshold === 'number') runtimeConfig.softRestrictThreshold = patch.softRestrictThreshold;
  if (typeof patch.hardRestrictThreshold === 'number') runtimeConfig.hardRestrictThreshold = patch.hardRestrictThreshold;
  if (typeof patch.softRestrictDurationMin === 'number') runtimeConfig.softRestrictDurationMin = patch.softRestrictDurationMin;
  if (typeof patch.hardRestrictDurationMin === 'number') runtimeConfig.hardRestrictDurationMin = patch.hardRestrictDurationMin;
  if (typeof patch.scoreDecayPerHour === 'number') runtimeConfig.scoreDecayPerHour = patch.scoreDecayPerHour;
  if (patch.violationPoints) {
    for (const [key, value] of Object.entries(patch.violationPoints)) {
      if (typeof value === 'number') {
        runtimeConfig.violationPoints[key as ViolationType] = value;
      }
    }
  }
  return getRuntimeConfig();
}

export function resetRuntimeConfig(): AbuseRuntimeConfig {
  runtimeConfig.softRestrictThreshold = ABUSE_CONFIG.SOFT_RESTRICT_THRESHOLD;
  runtimeConfig.hardRestrictThreshold = ABUSE_CONFIG.HARD_RESTRICT_THRESHOLD;
  runtimeConfig.softRestrictDurationMin = ABUSE_CONFIG.SOFT_RESTRICT_DURATION_MIN;
  runtimeConfig.hardRestrictDurationMin = ABUSE_CONFIG.HARD_RESTRICT_DURATION_MIN;
  runtimeConfig.scoreDecayPerHour = ABUSE_CONFIG.SCORE_DECAY_PER_HOUR;
  runtimeConfig.violationPoints = { ...ABUSE_CONFIG.VIOLATION_POINTS };
  return getRuntimeConfig();
}

/**
 * Clear all data (for testing).
 */
export function _clearAll(): void {
  abuseStore.clear();
}

