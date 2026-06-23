import { prisma } from '../utils/prisma';
import { computeFileHash } from '../middleware/mediaValidation';
import { detectNSFW } from './nsfwDetectionService';
import logger from '../utils/logger';

// ============================================
// Configuration
// ============================================

const DAILY_UPLOAD_LIMITS = {
  images: parseInt(process.env.MAX_DAILY_IMAGE_UPLOADS || '50', 10),
  videos: parseInt(process.env.MAX_DAILY_VIDEO_UPLOADS || '10', 10),
};

const MAX_STORAGE_PER_USER_MB = parseInt(process.env.MAX_STORAGE_PER_USER_MB || '5120', 10); // 5GB default
const NSFW_THRESHOLD = parseFloat(process.env.NSFW_THRESHOLD || '0.6');

// ============================================
// Upload Rate Limiting (per-user daily quotas)
// ============================================

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
  currentCount: number;
  maxCount: number;
}

/**
 * Check if a user has exceeded their daily upload quota.
 */
export async function checkUploadQuota(
  userId: string,
  mediaType: 'image' | 'video'
): Promise<QuotaCheckResult> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    let quota = await prisma.mediaUploadQuota.findUnique({
      where: { userId_date: { userId, date: today } },
    });

    if (!quota) {
      // Create fresh quota entry for today
      quota = await prisma.mediaUploadQuota.create({
        data: { userId, date: today, imageCount: 0, videoCount: 0, totalBytes: BigInt(0) },
      });
    }

    const currentCount = mediaType === 'image' ? quota.imageCount : quota.videoCount;
    const maxCount = mediaType === 'image' ? DAILY_UPLOAD_LIMITS.images : DAILY_UPLOAD_LIMITS.videos;

    if (currentCount >= maxCount) {
      logger.warn('Upload quota exceeded', { userId, mediaType, currentCount, maxCount });
      return {
        allowed: false,
        reason: `Daily ${mediaType} upload limit reached (${maxCount}/${mediaType === 'image' ? 'images' : 'videos'} per day)`,
        currentCount,
        maxCount,
      };
    }

    return { allowed: true, currentCount, maxCount };
  } catch (error: any) {
    logger.error('Error checking upload quota:', error);
    // Fail open to avoid blocking uploads due to DB issues
    return { allowed: true, currentCount: 0, maxCount: DAILY_UPLOAD_LIMITS[mediaType === 'image' ? 'images' : 'videos'] };
  }
}

/**
 * Increment the upload quota for a user after a successful upload.
 */
export async function incrementUploadQuota(
  userId: string,
  mediaType: 'image' | 'video',
  fileSize: number
): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    await prisma.mediaUploadQuota.upsert({
      where: { userId_date: { userId, date: today } },
      update: {
        ...(mediaType === 'image' ? { imageCount: { increment: 1 } } : { videoCount: { increment: 1 } }),
        totalBytes: { increment: BigInt(fileSize) },
      },
      create: {
        userId,
        date: today,
        imageCount: mediaType === 'image' ? 1 : 0,
        videoCount: mediaType === 'video' ? 1 : 0,
        totalBytes: BigInt(fileSize),
      },
    });
  } catch (error: any) {
    logger.error('Error incrementing upload quota:', error);
  }
}

// ============================================
// NSFW Scanning
// ============================================

export interface NSFWScanResult {
  isNSFW: boolean;
  score: number;
  predictions: any[];
}

/**
 * Scan an image buffer for NSFW content.
 * Returns scan result; does not block on failure (logs error and allows).
 */
export async function scanForNSFW(imageBuffer: Buffer): Promise<NSFWScanResult> {
  try {
    const result = await detectNSFW(imageBuffer);
    const nsfwScore = result.predictions
      .filter((p: any) => ['Porn', 'Hentai', 'Sexy'].includes(p.className))
      .reduce((max: number, p: any) => Math.max(max, p.probability), 0);

    return {
      isNSFW: result.isNSFW || nsfwScore > NSFW_THRESHOLD,
      score: nsfwScore,
      predictions: result.predictions,
    };
  } catch (error: any) {
    logger.error('NSFW scan failed, allowing upload:', error);
    return { isNSFW: false, score: 0, predictions: [] };
  }
}

// ============================================
// Hash-based Duplicate Detection
// ============================================

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingMediaId?: string;
  existingUrl?: string;
}

/**
 * Check if a file with the same hash has already been uploaded by this user.
 */
export async function checkDuplicate(
  userId: string,
  fileHash: string
): Promise<DuplicateCheckResult> {
  try {
    const existing = await prisma.media.findFirst({
      where: {
        userId,
        fileHash,
        status: { not: 'SOFT_DELETED' },
      },
      select: { id: true, processedUrl: true, originalUrl: true },
    });

    if (existing) {
      logger.info('Duplicate media detected', { userId, fileHash: fileHash.substring(0, 16) });
      return {
        isDuplicate: true,
        existingMediaId: existing.id,
        existingUrl: existing.processedUrl || existing.originalUrl,
      };
    }

    return { isDuplicate: false };
  } catch (error: any) {
    logger.error('Error checking for duplicate:', error);
    return { isDuplicate: false };
  }
}

// ============================================
// Content Fingerprinting (known-bad media)
// ============================================

export interface FingerprintCheckResult {
  isBlocked: boolean;
  reason?: string;
}

/**
 * Check if a file hash matches known-bad content fingerprints.
 */
export async function checkFingerprint(fileHash: string): Promise<FingerprintCheckResult> {
  try {
    const fingerprint = await prisma.mediaFingerprint.findUnique({
      where: { hash: fileHash },
    });

    if (fingerprint && fingerprint.isBlocked) {
      logger.warn('Blocked media fingerprint detected', {
        hash: fileHash.substring(0, 16),
        reason: fingerprint.reason,
      });
      return { isBlocked: true, reason: fingerprint.reason || 'Content blocked by policy' };
    }

    // Record the fingerprint for tracking (upsert to update lastSeenAt)
    await prisma.mediaFingerprint.upsert({
      where: { hash: fileHash },
      update: { lastSeenAt: new Date(), reportCount: { increment: 0 } },
      create: { hash: fileHash, hashType: 'sha256' },
    });

    return { isBlocked: false };
  } catch (error: any) {
    logger.error('Error checking fingerprint:', error);
    return { isBlocked: false };
  }
}

/**
 * Block a content fingerprint (used by moderation).
 */
export async function blockFingerprint(
  fileHash: string,
  reason: string
): Promise<void> {
  try {
    await prisma.mediaFingerprint.upsert({
      where: { hash: fileHash },
      update: { isBlocked: true, reason },
      create: { hash: fileHash, hashType: 'sha256', isBlocked: true, reason },
    });
    logger.info('Media fingerprint blocked', { hash: fileHash.substring(0, 16), reason });
  } catch (error: any) {
    logger.error('Error blocking fingerprint:', error);
  }
}

// ============================================
// Suspended Account Check
// ============================================

/**
 * Check if a user account is banned/suspended.
 */
export async function isAccountSuspended(userId: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isBanned: true, bannedAt: true },
    });

    if (!user) return true; // Non-existent user treated as suspended
    return user.isBanned;
  } catch (error: any) {
    logger.error('Error checking account suspension:', error);
    return false; // Fail open
  }
}

// ============================================
// User Storage Tracking
// ============================================

export interface StorageUsage {
  totalBytes: number;
  totalMB: number;
  imageCount: number;
  videoCount: number;
  limitMB: number;
  percentUsed: number;
}

/**
 * Get total media storage usage for a user.
 */
export async function getUserStorageUsage(userId: string): Promise<StorageUsage> {
  try {
    const stats = await prisma.media.aggregate({
      where: {
        userId,
        status: { notIn: ['SOFT_DELETED', 'EXPIRED'] },
      },
      _sum: { fileSize: true },
      _count: true,
    });

    const imageCount = await prisma.media.count({
      where: { userId, type: 'IMAGE', status: { notIn: ['SOFT_DELETED', 'EXPIRED'] } },
    });

    const videoCount = await prisma.media.count({
      where: { userId, type: 'VIDEO', status: { notIn: ['SOFT_DELETED', 'EXPIRED'] } },
    });

    const totalBytes = stats._sum.fileSize || 0;
    const totalMB = Math.round(totalBytes / (1024 * 1024));

    return {
      totalBytes,
      totalMB,
      imageCount,
      videoCount,
      limitMB: MAX_STORAGE_PER_USER_MB,
      percentUsed: Math.round((totalMB / MAX_STORAGE_PER_USER_MB) * 100),
    };
  } catch (error: any) {
    logger.error('Error getting user storage usage:', error);
    return {
      totalBytes: 0,
      totalMB: 0,
      imageCount: 0,
      videoCount: 0,
      limitMB: MAX_STORAGE_PER_USER_MB,
      percentUsed: 0,
    };
  }
}

// ============================================
// Combined Pre-Upload Validation
// ============================================

export interface PreUploadCheckResult {
  allowed: boolean;
  reason?: string;
  existingMediaId?: string;
  existingUrl?: string;
}

/**
 * Run all abuse control checks before processing an upload.
 */
export async function runPreUploadChecks(
  userId: string,
  fileBuffer: Buffer,
  fileHash: string,
  mediaType: 'image' | 'video'
): Promise<PreUploadCheckResult> {
  // 1. Check if account is suspended
  const suspended = await isAccountSuspended(userId);
  if (suspended) {
    return { allowed: false, reason: 'Your account is suspended. Uploads are disabled.' };
  }

  // 2. Check daily upload quota
  const quotaCheck = await checkUploadQuota(userId, mediaType);
  if (!quotaCheck.allowed) {
    return { allowed: false, reason: quotaCheck.reason };
  }

  // 3. Check content fingerprint (known-bad media)
  const fingerprintCheck = await checkFingerprint(fileHash);
  if (fingerprintCheck.isBlocked) {
    return { allowed: false, reason: fingerprintCheck.reason };
  }

  // 4. Check for duplicate uploads by same user
  const dupCheck = await checkDuplicate(userId, fileHash);
  if (dupCheck.isDuplicate) {
    return {
      allowed: true, // Allow but return existing URL
      existingMediaId: dupCheck.existingMediaId,
      existingUrl: dupCheck.existingUrl,
    };
  }

  return { allowed: true };
}
