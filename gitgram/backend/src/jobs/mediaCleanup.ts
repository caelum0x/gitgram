import {
  cleanupExpiredStoryMedia,
  cleanupOrphanedMedia,
  purgeExpiredMedia,
  cleanupOldQuotaRecords,
  purgeExpiredMediaRecords,
  cleanupOldTranscodeJobs,
} from '../services/mediaLifecycleService';
import videoTranscodingService from '../services/videoTranscodingService';
import logger from '../utils/logger';

/**
 * Run all media cleanup tasks.
 * This is called by the scheduler on a regular cadence.
 */
export async function runMediaCleanup(): Promise<void> {
  logger.info('Starting media cleanup job...');

  try {
    // 1. Archive and clean expired story media (24h + 7 day grace)
    const storyResult = await cleanupExpiredStoryMedia();
    logger.info('Story media cleanup:', storyResult);

    // 2. Clean up orphaned media (uploaded but never attached)
    const orphanedCount = await cleanupOrphanedMedia();
    logger.info(`Orphaned media cleaned: ${orphanedCount}`);

    // 3. Permanently delete soft-deleted media past retention period
    const purgedCount = await purgeExpiredMedia();
    logger.info(`Expired media purged: ${purgedCount}`);

    // 4. Clean up old quota records
    const quotasCleaned = await cleanupOldQuotaRecords();
    logger.info(`Old quota records cleaned: ${quotasCleaned}`);

    // 5. Clean up video temp files
    const tempFilesCleaned = await videoTranscodingService.cleanupTempFiles(24);
    logger.info(`Temp video files cleaned: ${tempFilesCleaned}`);

    logger.info('Media cleanup job completed successfully');
  } catch (error: any) {
    logger.error('Media cleanup job failed:', error);
  }
}

/**
 * Run weekly deep cleanup tasks.
 */
export async function runMediaDeepCleanup(): Promise<void> {
  logger.info('Starting media deep cleanup job...');

  try {
    // 1. Purge old expired media records from database
    const recordsPurged = await purgeExpiredMediaRecords();
    logger.info(`Expired media records purged: ${recordsPurged}`);

    // 2. Clean up old transcode job records
    const jobsCleaned = await cleanupOldTranscodeJobs();
    logger.info(`Old transcode jobs cleaned: ${jobsCleaned}`);

    // 3. Clean up old temp files (more aggressive - 6 hours)
    const tempFilesCleaned = await videoTranscodingService.cleanupTempFiles(6);
    logger.info(`Deep cleanup temp files: ${tempFilesCleaned}`);

    logger.info('Media deep cleanup job completed successfully');
  } catch (error: any) {
    logger.error('Media deep cleanup job failed:', error);
  }
}
