import logger from '../utils/logger';
import {
  computeTrendingForTier,
  checkAndNotifyTrending,
  cleanupOldTrendingData,
  TrendingTier,
} from '../services/trendingRankingService';

/**
 * Compute "Hot Now" trending - runs every 15 minutes
 * Short window (4h), high velocity focus
 */
export async function computeHotNow(): Promise<void> {
  logger.info('Running trending job: HOT_NOW (every 15 min)');
  try {
    await computeTrendingForTier('HOT_NOW');
    logger.info('HOT_NOW trending computation complete');
  } catch (error) {
    logger.error('HOT_NOW trending computation failed:', error);
  }
}

/**
 * Compute "Trending Today" - runs hourly
 * 24h window, balanced signals
 */
export async function computeTrendingToday(): Promise<void> {
  logger.info('Running trending job: TRENDING_TODAY (hourly)');
  try {
    await computeTrendingForTier('TRENDING_TODAY');
    // Also check notifications after daily trending update
    await checkAndNotifyTrending();
    logger.info('TRENDING_TODAY trending computation complete');
  } catch (error) {
    logger.error('TRENDING_TODAY trending computation failed:', error);
  }
}

/**
 * Compute "This Week" trending - runs daily
 * 7-day window, steady growth focus
 */
export async function computeThisWeek(): Promise<void> {
  logger.info('Running trending job: THIS_WEEK (daily)');
  try {
    await computeTrendingForTier('THIS_WEEK');
    logger.info('THIS_WEEK trending computation complete');
  } catch (error) {
    logger.error('THIS_WEEK trending computation failed:', error);
  }
}

/**
 * Compute "Rising Stars" trending - runs daily
 * New repos with high early engagement
 */
export async function computeRisingStars(): Promise<void> {
  logger.info('Running trending job: RISING_STARS (daily)');
  try {
    await computeTrendingForTier('RISING_STARS');
    logger.info('RISING_STARS trending computation complete');
  } catch (error) {
    logger.error('RISING_STARS trending computation failed:', error);
  }
}

/**
 * Full trending recomputation - for admin/manual trigger
 */
export async function computeAllTiers(): Promise<void> {
  logger.info('Running full trending recomputation for all tiers');
  const tiers: TrendingTier[] = ['HOT_NOW', 'TRENDING_TODAY', 'THIS_WEEK', 'RISING_STARS'];

  for (const tier of tiers) {
    try {
      await computeTrendingForTier(tier);
    } catch (error) {
      logger.error(`Failed to compute ${tier}:`, error);
    }
  }

  await checkAndNotifyTrending();
  logger.info('Full trending recomputation complete');
}

/**
 * Cleanup old trending data - runs weekly
 */
export async function cleanupTrendingData(): Promise<void> {
  logger.info('Running trending data cleanup');
  try {
    await cleanupOldTrendingData(30); // Keep 30 days of history
    logger.info('Trending data cleanup complete');
  } catch (error) {
    logger.error('Trending data cleanup failed:', error);
  }
}
