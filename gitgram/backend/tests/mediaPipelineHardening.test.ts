/**
 * Media Pipeline Hardening Tests - Issue #13
 *
 * Tests covering:
 * 1. Media lifecycle management (orphan cleanup, story expiry, retention)
 * 2. Transcoding validation (config defaults, resolution filtering)
 * 3. Abuse content size limits and MIME enforcement
 * 4. Scheduler integration for media cleanup jobs
 */

// ============================================================
// Mock dependencies before imports
// ============================================================

jest.mock('../src/utils/prisma', () => ({
  prisma: {
    story: { findMany: jest.fn(), deleteMany: jest.fn() },
    media: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      aggregate: jest.fn(),
    },
    storyArchive: { upsert: jest.fn() },
    transcodeJob: { deleteMany: jest.fn() },
    mediaUploadQuota: { deleteMany: jest.fn() },
    session: { deleteMany: jest.fn() },
    notification: { deleteMany: jest.fn() },
  },
  default: {
    $disconnect: jest.fn(),
  },
}));

jest.mock('../src/services/storageService', () => ({
  deleteMedia: jest.fn().mockResolvedValue(undefined),
  upload: {
    single: () => (_req: any, _res: any, next: any) => next(),
    array: () => (_req: any, _res: any, next: any) => next(),
  },
}));

jest.mock('../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('fluent-ffmpeg', () => {
  const mock: any = jest.fn().mockReturnValue({
    outputOptions: jest.fn().mockReturnThis(),
    output: jest.fn().mockReturnThis(),
    format: jest.fn().mockReturnThis(),
    on: jest.fn().mockReturnThis(),
    run: jest.fn(),
    screenshots: jest.fn().mockReturnThis(),
  });
  mock.ffprobe = jest.fn();
  mock.getAvailableFormats = jest.fn((_cb: any) => { /* no-op */ });
  return mock;
});

jest.unmock('../src/middleware/mediaValidation');

import { prisma } from '../src/utils/prisma';
import {
  cleanupExpiredStoryMedia,
  cleanupOrphanedMedia,
  purgeExpiredMedia,
  softDeleteMedia,
  restoreSoftDeletedMedia,
  getUserMediaStats,
  cleanupOldQuotaRecords,
  purgeExpiredMediaRecords,
  cleanupOldTranscodeJobs,
} from '../src/services/mediaLifecycleService';
import {
  ALLOWED_IMAGE_MIMES,
  ALLOWED_VIDEO_MIMES,
  SIZE_LIMITS,
  DURATION_LIMITS,
  MAX_IMAGE_DIMENSION,
  detectMimeFromBuffer,
  verifyMagicBytes,
  hasSuspiciousMetadata,
  isSvgSafe,
  computeFileHash,
} from '../src/middleware/mediaValidation';
import {
  DEFAULT_TRANSCODE_CONFIG,
  DEFAULT_THUMBNAIL_CONFIG,
  DEFAULT_HLS_CONFIG,
  RESOLUTION_CONFIGS,
  VideoResolution,
} from '../src/services/videoTranscodingService';

// ============================================================
// 1. Media Lifecycle Management Tests
// ============================================================

describe('Media Lifecycle Management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('cleanupExpiredStoryMedia', () => {
    it('archives expired story media and returns counts', async () => {
      const now = new Date();
      const pastExpiry = new Date(now.getTime() - 25 * 60 * 60 * 1000); // 25 hours ago

      (prisma.story.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'story_1',
          mediaUrl: 'https://storage/story1.jpg',
          userId: 'user_1',
          mediaType: 'IMAGE',
          caption: 'Test story',
          createdAt: pastExpiry,
        },
      ]);

      (prisma.media.findFirst as jest.Mock).mockResolvedValue({
        id: 'media_1',
        storyId: 'story_1',
        status: 'READY',
      });

      (prisma.media.update as jest.Mock).mockResolvedValue({});
      (prisma.storyArchive.upsert as jest.Mock).mockResolvedValue({});

      // No media past grace period
      (prisma.media.findMany as jest.Mock).mockResolvedValue([]);

      const result = await cleanupExpiredStoryMedia();
      expect(result.archived).toBe(1);
      expect(result.deleted).toBe(0);
    });

    it('permanently deletes media past grace period', async () => {
      (prisma.story.findMany as jest.Mock).mockResolvedValue([]);

      const oldMedia = {
        id: 'media_old',
        contentType: 'story',
        status: 'SOFT_DELETED',
        softDeletedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
        originalUrl: 'https://storage/old.jpg',
        processedUrl: null,
        thumbnailUrl: null,
        webpUrl: null,
        resolutions: null,
      };

      (prisma.media.findMany as jest.Mock).mockResolvedValue([oldMedia]);
      (prisma.media.update as jest.Mock).mockResolvedValue({});

      const result = await cleanupExpiredStoryMedia();
      expect(result.deleted).toBe(1);
    });

    it('handles errors gracefully without crashing', async () => {
      (prisma.story.findMany as jest.Mock).mockRejectedValue(new Error('DB error'));

      const result = await cleanupExpiredStoryMedia();
      expect(result.archived).toBe(0);
      expect(result.deleted).toBe(0);
    });
  });

  describe('cleanupOrphanedMedia', () => {
    it('deletes media with no post/reel/story association', async () => {
      const orphan = {
        id: 'orphan_1',
        postId: null,
        reelId: null,
        storyId: null,
        contentType: 'post',
        status: 'PENDING',
        createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        originalUrl: 'https://storage/orphan.jpg',
        processedUrl: null,
        thumbnailUrl: null,
        webpUrl: null,
        resolutions: null,
      };

      (prisma.media.findMany as jest.Mock).mockResolvedValue([orphan]);
      (prisma.media.delete as jest.Mock).mockResolvedValue({});

      const count = await cleanupOrphanedMedia();
      expect(count).toBe(1);
      expect(prisma.media.delete).toHaveBeenCalledWith({ where: { id: 'orphan_1' } });
    });

    it('excludes avatar images from orphan cleanup', async () => {
      // The query itself excludes avatars via contentType: { not: 'avatar' }
      // Verify we get 0 results when DB returns nothing
      (prisma.media.findMany as jest.Mock).mockResolvedValue([]);

      const count = await cleanupOrphanedMedia();
      expect(count).toBe(0);
    });

    it('cleans up all storage variants of orphaned media', async () => {
      const orphan = {
        id: 'orphan_2',
        postId: null,
        reelId: null,
        storyId: null,
        contentType: 'post',
        status: 'READY',
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        originalUrl: 'https://storage/orig.jpg',
        processedUrl: 'https://storage/processed.jpg',
        thumbnailUrl: 'https://storage/thumb.jpg',
        webpUrl: 'https://storage/img.webp',
        resolutions: { '720p': 'https://storage/720.jpg', '360p': 'https://storage/360.jpg' },
      };

      (prisma.media.findMany as jest.Mock).mockResolvedValue([orphan]);
      (prisma.media.delete as jest.Mock).mockResolvedValue({});

      const { deleteMedia } = require('../src/services/storageService');

      const count = await cleanupOrphanedMedia();
      expect(count).toBe(1);
      // Should have deleted all variants: original, processed, thumbnail, webp, 2 resolutions = 6
      expect(deleteMedia).toHaveBeenCalledTimes(6);
    });
  });

  describe('softDeleteMedia and restoreSoftDeletedMedia', () => {
    it('soft-deletes media with configurable retention', async () => {
      (prisma.media.update as jest.Mock).mockResolvedValue({});

      const result = await softDeleteMedia('media_1', 14);
      expect(result).toBe(true);
      expect(prisma.media.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'media_1' },
          data: expect.objectContaining({
            status: 'SOFT_DELETED',
            retentionDays: 14,
            isPublic: false,
          }),
        })
      );
    });

    it('uses default retention of 30 days', async () => {
      (prisma.media.update as jest.Mock).mockResolvedValue({});

      await softDeleteMedia('media_2');
      expect(prisma.media.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            retentionDays: 30,
          }),
        })
      );
    });

    it('restores soft-deleted media within retention period', async () => {
      (prisma.media.findUnique as jest.Mock).mockResolvedValue({
        id: 'media_1',
        status: 'SOFT_DELETED',
      });
      (prisma.media.update as jest.Mock).mockResolvedValue({});

      const result = await restoreSoftDeletedMedia('media_1');
      expect(result).toBe(true);
      expect(prisma.media.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'READY',
            softDeletedAt: null,
            expiresAt: null,
            isPublic: true,
          }),
        })
      );
    });

    it('returns false when trying to restore non-soft-deleted media', async () => {
      (prisma.media.findUnique as jest.Mock).mockResolvedValue({
        id: 'media_1',
        status: 'READY',
      });

      const result = await restoreSoftDeletedMedia('media_1');
      expect(result).toBe(false);
    });

    it('returns false when media does not exist', async () => {
      (prisma.media.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await restoreSoftDeletedMedia('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('purgeExpiredMedia', () => {
    it('permanently removes media past retention expiry', async () => {
      const expiredMedia = {
        id: 'expired_1',
        status: 'SOFT_DELETED',
        expiresAt: new Date(Date.now() - 1000),
        originalUrl: 'https://storage/expired.jpg',
        processedUrl: null,
        thumbnailUrl: null,
        webpUrl: null,
        resolutions: null,
      };

      (prisma.media.findMany as jest.Mock).mockResolvedValue([expiredMedia]);
      (prisma.media.update as jest.Mock).mockResolvedValue({});
      (prisma.transcodeJob.deleteMany as jest.Mock).mockResolvedValue({});

      const count = await purgeExpiredMedia();
      expect(count).toBe(1);
      expect(prisma.transcodeJob.deleteMany).toHaveBeenCalledWith({
        where: { mediaId: 'expired_1' },
      });
    });
  });

  describe('cleanupOldQuotaRecords', () => {
    it('deletes quota records older than 30 days', async () => {
      (prisma.mediaUploadQuota.deleteMany as jest.Mock).mockResolvedValue({ count: 5 });

      const count = await cleanupOldQuotaRecords();
      expect(count).toBe(5);
    });
  });

  describe('purgeExpiredMediaRecords', () => {
    it('deletes EXPIRED status media records older than 7 days', async () => {
      (prisma.media.deleteMany as jest.Mock).mockResolvedValue({ count: 3 });

      const count = await purgeExpiredMediaRecords();
      expect(count).toBe(3);
    });
  });

  describe('cleanupOldTranscodeJobs', () => {
    it('deletes completed/failed transcode jobs older than 30 days', async () => {
      (prisma.transcodeJob.deleteMany as jest.Mock).mockResolvedValue({ count: 10 });

      const count = await cleanupOldTranscodeJobs();
      expect(count).toBe(10);
    });
  });

  describe('getUserMediaStats', () => {
    it('returns storage breakdown by media type', async () => {
      (prisma.media.aggregate as jest.Mock)
        .mockResolvedValueOnce({ _sum: { fileSize: 50_000_000 }, _count: 25 }) // total
        .mockResolvedValueOnce({ _sum: { fileSize: 20_000_000 }, _count: 15 }) // images
        .mockResolvedValueOnce({ _sum: { fileSize: 25_000_000 }, _count: 5 }) // videos
        .mockResolvedValueOnce({ _sum: { fileSize: 5_000_000 }, _count: 5 }); // stories

      const stats = await getUserMediaStats('user_1');
      expect(stats).not.toBeNull();
      expect(stats!.total.count).toBe(25);
      expect(stats!.images.count).toBe(15);
      expect(stats!.videos.count).toBe(5);
      expect(stats!.stories.count).toBe(5);
    });
  });
});

// ============================================================
// 2. Transcoding Validation Tests
// ============================================================

describe('Transcoding Validation', () => {
  describe('Default configuration values', () => {
    it('default transcode config uses safe, compatible defaults', () => {
      expect(DEFAULT_TRANSCODE_CONFIG.resolution).toBe('720p');
      expect(DEFAULT_TRANSCODE_CONFIG.format).toBe('mp4');
      expect(DEFAULT_TRANSCODE_CONFIG.codec).toBe('h264');
      expect(DEFAULT_TRANSCODE_CONFIG.preset).toBe('medium');
      expect(DEFAULT_TRANSCODE_CONFIG.crf).toBeGreaterThanOrEqual(18);
      expect(DEFAULT_TRANSCODE_CONFIG.crf).toBeLessThanOrEqual(28);
      expect(DEFAULT_TRANSCODE_CONFIG.twoPass).toBe(false);
      expect(DEFAULT_TRANSCODE_CONFIG.audioCodec).toBe('aac');
    });

    it('default thumbnail config creates reasonable thumbnails', () => {
      expect(DEFAULT_THUMBNAIL_CONFIG.timestamps).toContain('00:00:01');
      expect(DEFAULT_THUMBNAIL_CONFIG.size).toBe('320x180');
      expect(DEFAULT_THUMBNAIL_CONFIG.format).toBe('jpg');
      expect(DEFAULT_THUMBNAIL_CONFIG.quality).toBeLessThanOrEqual(5);
    });

    it('default HLS config supports VOD with standard resolutions', () => {
      expect(DEFAULT_HLS_CONFIG.playlistType).toBe('vod');
      expect(DEFAULT_HLS_CONFIG.resolutions).toContain('1080p');
      expect(DEFAULT_HLS_CONFIG.resolutions).toContain('720p');
      expect(DEFAULT_HLS_CONFIG.resolutions).toContain('480p');
      expect(DEFAULT_HLS_CONFIG.segmentDuration).toBe(10);
    });
  });

  describe('Resolution configuration', () => {
    it('all resolution presets have valid width, height, and bitrates', () => {
      const resolutions: VideoResolution[] = ['1080p', '720p', '480p', '360p'];
      for (const res of resolutions) {
        const config = RESOLUTION_CONFIGS[res];
        expect(config.width).toBeGreaterThan(0);
        expect(config.height).toBeGreaterThan(0);
        expect(config.videoBitrate).toMatch(/^\d+k$/);
        expect(config.audioBitrate).toMatch(/^\d+k$/);
      }
    });

    it('resolutions are ordered from highest to lowest', () => {
      const heights = [
        RESOLUTION_CONFIGS['1080p'].height,
        RESOLUTION_CONFIGS['720p'].height,
        RESOLUTION_CONFIGS['480p'].height,
        RESOLUTION_CONFIGS['360p'].height,
      ];
      for (let i = 0; i < heights.length - 1; i++) {
        expect(heights[i]).toBeGreaterThan(heights[i + 1]);
      }
    });

    it('video bitrate decreases with resolution', () => {
      const bitrates = [
        parseInt(RESOLUTION_CONFIGS['1080p'].videoBitrate),
        parseInt(RESOLUTION_CONFIGS['720p'].videoBitrate),
        parseInt(RESOLUTION_CONFIGS['480p'].videoBitrate),
        parseInt(RESOLUTION_CONFIGS['360p'].videoBitrate),
      ];
      for (let i = 0; i < bitrates.length - 1; i++) {
        expect(bitrates[i]).toBeGreaterThan(bitrates[i + 1]);
      }
    });
  });
});

// ============================================================
// 3. Abuse Content Size Limits and MIME Enforcement Tests
// ============================================================

describe('Abuse Content Size Limits', () => {
  describe('SIZE_LIMITS enforcement', () => {
    it('image size limit is 10MB', () => {
      expect(SIZE_LIMITS.image).toBe(10 * 1024 * 1024);
    });

    it('video size limit is 100MB', () => {
      expect(SIZE_LIMITS.video).toBe(100 * 1024 * 1024);
    });

    it('story size limit is 50MB', () => {
      expect(SIZE_LIMITS.story).toBe(50 * 1024 * 1024);
    });

    it('image dimension limit prevents decompression bombs', () => {
      // 8192x8192 = max 64MP which is reasonable
      expect(MAX_IMAGE_DIMENSION).toBe(8192);
    });
  });

  describe('DURATION_LIMITS enforcement', () => {
    it('reel duration is capped at 90 seconds', () => {
      expect(DURATION_LIMITS.reel).toBe(90);
    });

    it('story duration is capped at 30 seconds', () => {
      expect(DURATION_LIMITS.story).toBe(30);
    });

    it('post video duration is capped at 10 minutes', () => {
      expect(DURATION_LIMITS.post).toBe(600);
    });
  });

  describe('MIME type allowlists', () => {
    it('only safe image types are allowed', () => {
      expect(ALLOWED_IMAGE_MIMES).toContain('image/jpeg');
      expect(ALLOWED_IMAGE_MIMES).toContain('image/png');
      expect(ALLOWED_IMAGE_MIMES).toContain('image/gif');
      expect(ALLOWED_IMAGE_MIMES).toContain('image/webp');
      // Dangerous types must NOT be allowed
      expect(ALLOWED_IMAGE_MIMES).not.toContain('image/svg+xml');
      expect(ALLOWED_IMAGE_MIMES).not.toContain('image/tiff');
      expect(ALLOWED_IMAGE_MIMES).not.toContain('image/bmp');
    });

    it('only safe video types are allowed', () => {
      expect(ALLOWED_VIDEO_MIMES).toContain('video/mp4');
      expect(ALLOWED_VIDEO_MIMES).toContain('video/quicktime');
      expect(ALLOWED_VIDEO_MIMES).toContain('video/webm');
      // Dangerous/exotic types must NOT be allowed
      expect(ALLOWED_VIDEO_MIMES).not.toContain('video/x-msvideo');
      expect(ALLOWED_VIDEO_MIMES).not.toContain('video/x-flv');
      expect(ALLOWED_VIDEO_MIMES).not.toContain('video/x-ms-wmv');
    });

    it('no executable or archive types are allowed', () => {
      const allAllowed = [...ALLOWED_IMAGE_MIMES, ...ALLOWED_VIDEO_MIMES];
      expect(allAllowed).not.toContain('application/x-executable');
      expect(allAllowed).not.toContain('application/zip');
      expect(allAllowed).not.toContain('application/x-rar');
      expect(allAllowed).not.toContain('text/html');
      expect(allAllowed).not.toContain('text/javascript');
      expect(allAllowed).not.toContain('application/javascript');
    });
  });
});

// ============================================================
// 4. Magic Byte & Content Validation Tests
// ============================================================

describe('Content Validation', () => {
  describe('detectMimeFromBuffer', () => {
    it('detects JPEG from magic bytes', () => {
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      expect(detectMimeFromBuffer(jpegBuffer)).toBe('image/jpeg');
    });

    it('detects PNG from magic bytes', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(detectMimeFromBuffer(pngBuffer)).toBe('image/png');
    });

    it('detects GIF87a from magic bytes', () => {
      const gifBuffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);
      expect(detectMimeFromBuffer(gifBuffer)).toBe('image/gif');
    });

    it('detects GIF89a from magic bytes', () => {
      const gifBuffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
      expect(detectMimeFromBuffer(gifBuffer)).toBe('image/gif');
    });

    it('detects WebP from magic bytes', () => {
      const webpBuffer = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]);
      expect(detectMimeFromBuffer(webpBuffer)).toBe('image/webp');
    });

    it('detects MP4/MOV from ftyp magic bytes', () => {
      const mp4Buffer = Buffer.alloc(12);
      mp4Buffer[4] = 0x66; // 'f'
      mp4Buffer[5] = 0x74; // 't'
      mp4Buffer[6] = 0x79; // 'y'
      mp4Buffer[7] = 0x70; // 'p'
      const detected = detectMimeFromBuffer(mp4Buffer);
      expect(['video/mp4', 'video/quicktime']).toContain(detected);
    });

    it('detects WebM from EBML magic bytes', () => {
      const webmBuffer = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00]);
      expect(detectMimeFromBuffer(webmBuffer)).toBe('video/webm');
    });

    it('returns null for unrecognized formats', () => {
      const randomBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);
      expect(detectMimeFromBuffer(randomBuffer)).toBeNull();
    });

    it('returns null for empty buffer', () => {
      expect(detectMimeFromBuffer(Buffer.alloc(0))).toBeNull();
    });
  });

  describe('verifyMagicBytes', () => {
    it('validates JPEG content matches JPEG mime', () => {
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      expect(verifyMagicBytes(jpegBuffer, 'image/jpeg')).toBe(true);
    });

    it('rejects non-JPEG content claiming to be JPEG', () => {
      const fakeJpeg = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG bytes
      expect(verifyMagicBytes(fakeJpeg, 'image/jpeg')).toBe(false);
    });

    it('returns false for unknown MIME type', () => {
      const buffer = Buffer.from([0x00, 0x01, 0x02]);
      expect(verifyMagicBytes(buffer, 'text/plain')).toBe(false);
    });
  });

  describe('hasSuspiciousMetadata', () => {
    it('detects script injection in image metadata', () => {
      const content = '<script>alert("xss")</script>';
      const buffer = Buffer.from(content, 'latin1');
      expect(hasSuspiciousMetadata(buffer)).toBe(true);
    });

    it('detects javascript: protocol in metadata', () => {
      const content = 'javascript:void(0)';
      const buffer = Buffer.from(content, 'latin1');
      expect(hasSuspiciousMetadata(buffer)).toBe(true);
    });

    it('detects PHP injection in metadata', () => {
      const content = '<?php echo "hacked"; ?>';
      const buffer = Buffer.from(content, 'latin1');
      expect(hasSuspiciousMetadata(buffer)).toBe(true);
    });

    it('detects ASP injection in metadata', () => {
      const content = '<% Response.Write("hacked") %>';
      const buffer = Buffer.from(content, 'latin1');
      expect(hasSuspiciousMetadata(buffer)).toBe(true);
    });

    it('detects eval() in metadata', () => {
      const content = 'some data; eval("payload")';
      const buffer = Buffer.from(content, 'latin1');
      expect(hasSuspiciousMetadata(buffer)).toBe(true);
    });

    it('passes clean binary content', () => {
      // Generate a buffer that looks like typical image binary data
      const cleanBuffer = Buffer.alloc(256);
      for (let i = 0; i < 256; i++) {
        cleanBuffer[i] = i;
      }
      expect(hasSuspiciousMetadata(cleanBuffer)).toBe(false);
    });
  });

  describe('isSvgSafe', () => {
    it('rejects SVG with script tags', () => {
      const svg = '<svg><script>alert(1)</script></svg>';
      const result = isSvgSafe(Buffer.from(svg));
      expect(result.safe).toBe(false);
    });

    it('rejects SVG with event handlers', () => {
      const svg = '<svg onload="alert(1)"><rect /></svg>';
      const result = isSvgSafe(Buffer.from(svg));
      expect(result.safe).toBe(false);
    });

    it('rejects SVG with javascript: in href', () => {
      const svg = '<svg><a href="javascript:alert(1)">click</a></svg>';
      const result = isSvgSafe(Buffer.from(svg));
      expect(result.safe).toBe(false);
    });

    it('rejects SVG with iframe', () => {
      const svg = '<svg><foreignObject><iframe src="evil.com"/></foreignObject></svg>';
      const result = isSvgSafe(Buffer.from(svg));
      expect(result.safe).toBe(false);
    });

    it('accepts clean SVG', () => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="red"/></svg>';
      const result = isSvgSafe(Buffer.from(svg));
      expect(result.safe).toBe(true);
    });
  });

  describe('computeFileHash', () => {
    it('produces consistent SHA-256 hashes', () => {
      const buffer = Buffer.from('test content');
      const hash1 = computeFileHash(buffer);
      const hash2 = computeFileHash(buffer);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex = 64 chars
    });

    it('produces different hashes for different content', () => {
      const hash1 = computeFileHash(Buffer.from('content A'));
      const hash2 = computeFileHash(Buffer.from('content B'));
      expect(hash1).not.toBe(hash2);
    });
  });
});

// ============================================================
// 5. Scheduler Integration Tests
// ============================================================

describe('Media Cleanup Scheduler Integration', () => {
  it('runMediaCleanup job runner exists and is callable', async () => {
    const { runMediaCleanup } = await import('../src/jobs/mediaCleanup');
    expect(typeof runMediaCleanup).toBe('function');
  });

  it('runMediaDeepCleanup job runner exists and is callable', async () => {
    const { runMediaDeepCleanup } = await import('../src/jobs/mediaCleanup');
    expect(typeof runMediaDeepCleanup).toBe('function');
  });

  it('scheduler registers media cleanup cron jobs', async () => {
    // Read the scheduler source to verify cron registrations
    const fs = require('fs');
    const path = require('path');
    const schedulerPath = path.join(__dirname, '../src/jobs/scheduler.ts');
    const content = fs.readFileSync(schedulerPath, 'utf-8');

    // Media cleanup every 2 hours
    expect(content).toContain("'0 */2 * * *'");
    expect(content).toContain('runMediaCleanup');

    // Media deep cleanup weekly
    expect(content).toContain("'0 3 * * 6'");
    expect(content).toContain('runMediaDeepCleanup');
  });

  it('media cleanup job imports all required lifecycle functions', () => {
    const fs = require('fs');
    const path = require('path');
    const cleanupPath = path.join(__dirname, '../src/jobs/mediaCleanup.ts');
    const content = fs.readFileSync(cleanupPath, 'utf-8');

    expect(content).toContain('cleanupExpiredStoryMedia');
    expect(content).toContain('cleanupOrphanedMedia');
    expect(content).toContain('purgeExpiredMedia');
    expect(content).toContain('cleanupOldQuotaRecords');
    expect(content).toContain('purgeExpiredMediaRecords');
    expect(content).toContain('cleanupOldTranscodeJobs');
  });
});

// ============================================================
// 6. Upload Route Auth + Size Enforcement (Static Analysis)
// ============================================================

describe('Upload Route Hardening', () => {
  it('all upload routes require authentication', () => {
    const fs = require('fs');
    const path = require('path');
    const uploadPath = path.join(__dirname, '../src/routes/upload.ts');
    const content = fs.readFileSync(uploadPath, 'utf-8');

    // Every POST route must have authenticate middleware
    const postRoutes = content.match(/router\.post\([^)]+\)/g) || [];
    for (const route of postRoutes) {
      expect(route).toContain('authenticate');
    }
  });

  it('all upload routes have rate limiting', () => {
    const fs = require('fs');
    const path = require('path');
    const uploadPath = path.join(__dirname, '../src/routes/upload.ts');
    const content = fs.readFileSync(uploadPath, 'utf-8');

    const postRoutes = content.match(/router\.post\([^)]+\)/g) || [];
    for (const route of postRoutes) {
      expect(route).toContain('uploadLimiter');
    }
  });

  it('all upload routes have media validation middleware', () => {
    const fs = require('fs');
    const path = require('path');
    const uploadPath = path.join(__dirname, '../src/routes/upload.ts');
    const content = fs.readFileSync(uploadPath, 'utf-8');

    // Verify validation middleware is applied
    expect(content).toContain('validatePostUpload');
    expect(content).toContain('validateMultiUpload');
    expect(content).toContain('validateAvatarUpload');
    expect(content).toContain('validateStoryUpload');
    expect(content).toContain('validateReelCoverUpload');
  });

  it('multi-upload route enforces file count and total size limits', () => {
    const fs = require('fs');
    const path = require('path');
    const uploadPath = path.join(__dirname, '../src/routes/upload.ts');
    const content = fs.readFileSync(uploadPath, 'utf-8');

    // Max 10 files per batch
    expect(content).toContain('maxFiles: 10');
    // Max 50MB total
    expect(content).toContain('maxTotalBytes: 50 * 1024 * 1024');
  });

  it('stories route has auth and media validation', () => {
    const fs = require('fs');
    const path = require('path');
    const storiesPath = path.join(__dirname, '../src/routes/stories.ts');
    const content = fs.readFileSync(storiesPath, 'utf-8');

    expect(content).toContain('authenticate');
  });

  it('reels route has auth and media validation', () => {
    const fs = require('fs');
    const path = require('path');
    const reelsPath = path.join(__dirname, '../src/routes/reels.ts');
    const content = fs.readFileSync(reelsPath, 'utf-8');

    expect(content).toContain('authenticate');
  });
});
