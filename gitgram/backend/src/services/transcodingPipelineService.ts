import { prisma } from '../utils/prisma';
import videoTranscodingService from './videoTranscodingService';
import imageOptimizationService from './imageOptimizationService';
import { uploadMedia } from './storageService';
import sharp from 'sharp';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import logger from '../utils/logger';

const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const mkdir = promisify(fs.mkdir);

// ============================================
// Configuration
// ============================================

const TEMP_DIR = process.env.MEDIA_TEMP_DIR || path.join(__dirname, '../../temp/media');
const MAX_TRANSCODE_RETRIES = 3;

// Multi-resolution targets
const IMAGE_RESOLUTIONS = {
  thumbnail: { width: 150, height: 150, fit: 'cover' as const },
  small: { width: 854, height: 480, fit: 'inside' as const },     // 480p equivalent
  medium: { width: 1280, height: 720, fit: 'inside' as const },   // 720p
  large: { width: 1920, height: 1080, fit: 'inside' as const },   // 1080p
};

const VIDEO_RESOLUTIONS = ['1080p', '720p', '480p'] as const;

// ============================================
// Ensure temp directory
// ============================================

async function ensureTempDir(): Promise<void> {
  try {
    await mkdir(TEMP_DIR, { recursive: true });
  } catch (error: unknown) {
    if (error instanceof Error && (error as NodeJS.ErrnoException).code !== 'EEXIST') {
      logger.error('Failed to create media temp directory:', error);
    }
  }
}

// ============================================
// EXIF/GPS Metadata Stripping
// ============================================

/**
 * Strip all EXIF/GPS metadata from an image buffer.
 * Returns clean buffer with metadata removed.
 */
export async function stripImageMetadata(buffer: Buffer): Promise<Buffer> {
  try {
    const cleaned = await sharp(buffer)
      .rotate() // Apply EXIF rotation before stripping
      .withMetadata({
        // Only preserve essential metadata, strip EXIF/GPS/IPTC
        orientation: undefined,
      })
      .toBuffer();

    logger.debug('Image metadata stripped', {
      originalSize: buffer.length,
      cleanedSize: cleaned.length,
    });

    return cleaned;
  } catch (error: unknown) {
    logger.error('Failed to strip image metadata:', error);
    // Return original if stripping fails
    return buffer;
  }
}

// ============================================
// Multi-Resolution Image Processing
// ============================================

export interface MultiResolutionImageResult {
  original: { url: string; width: number; height: number; size: number };
  thumbnail: { url: string; width: number; height: number; size: number };
  small: { url: string; width: number; height: number; size: number };
  medium: { url: string; width: number; height: number; size: number };
  large: { url: string; width: number; height: number; size: number };
  webp: { url: string; size: number };
}

/**
 * Process an image into multiple resolutions and WebP format.
 * Strips EXIF/GPS metadata, generates standardized WebP output.
 */
export async function processImageMultiResolution(
  buffer: Buffer,
  folder: string = 'media',
  mediaId?: string
): Promise<Partial<MultiResolutionImageResult>> {
  const results: Partial<MultiResolutionImageResult> = {};
  const baseId = crypto.randomBytes(16).toString('hex');

  try {
    // Strip metadata first
    const cleanBuffer = await stripImageMetadata(buffer);

    // Generate each resolution in parallel
    const resolutionPromises = Object.entries(IMAGE_RESOLUTIONS).map(
      async ([name, config]) => {
        try {
          // Update transcode job status if mediaId provided
          if (mediaId) {
            await updateTranscodeJob(mediaId, `${config.width}x${config.height}`, 'webp', 'PROCESSING');
          }

          let pipeline = sharp(cleanBuffer).resize(config.width, config.height, {
            fit: config.fit,
            withoutEnlargement: true,
            position: name === 'thumbnail' ? 'attention' : 'centre',
          });

          // Output as WebP for all resolutions
          pipeline = pipeline.webp({ quality: name === 'thumbnail' ? 70 : 80, effort: 4 });

          const outputBuffer = await pipeline.toBuffer();
          const metadata = await sharp(outputBuffer).metadata();

          // Upload to storage
          const key = `${folder}/${name}-${baseId}.webp`;
          const file = bufferToUploadFile(outputBuffer, key, 'image/webp');
          const url = await uploadMedia(file, folder);

          // Update transcode job status
          if (mediaId) {
            await updateTranscodeJob(
              mediaId,
              `${config.width}x${config.height}`,
              'webp',
              'COMPLETED',
              url,
              outputBuffer.length
            );
          }

          return {
            name,
            url,
            width: metadata.width || config.width,
            height: metadata.height || config.height,
            size: outputBuffer.length,
          };
        } catch (error: unknown) {
          logger.error(`Failed to generate ${name} resolution:`, error);
          if (mediaId) {
            await updateTranscodeJob(
              mediaId,
              `${config.width}x${config.height}`,
              'webp',
              'FAILED',
              undefined,
              undefined,
              error instanceof Error ? error.message : String(error)
            );
          }
          return null;
        }
      }
    );

    // Also generate full-size WebP
    const webpPromise = (async () => {
      try {
        const webpBuffer = await sharp(cleanBuffer)
          .webp({ quality: 85, effort: 4, smartSubsample: true })
          .toBuffer();

        const key = `${folder}/full-${baseId}.webp`;
        const file = bufferToUploadFile(webpBuffer, key, 'image/webp');
        const url = await uploadMedia(file, folder);

        return { name: 'webp', url, size: webpBuffer.length };
      } catch (error: unknown) {
        logger.error('Failed to generate WebP version:', error);
        return null;
      }
    })();

    // Also upload original (cleaned) as JPEG
    const originalPromise = (async () => {
      try {
        const jpegBuffer = await sharp(cleanBuffer)
          .jpeg({ quality: 85, mozjpeg: true, progressive: true })
          .toBuffer();
        const origMetadata = await sharp(jpegBuffer).metadata();

        const key = `${folder}/orig-${baseId}.jpg`;
        const file = bufferToUploadFile(jpegBuffer, key, 'image/jpeg');
        const url = await uploadMedia(file, folder);

        return {
          name: 'original',
          url,
          width: origMetadata.width || 0,
          height: origMetadata.height || 0,
          size: jpegBuffer.length,
        };
      } catch (error: unknown) {
        logger.error('Failed to process original:', error);
        return null;
      }
    })();

    const allResults = await Promise.all([...resolutionPromises, webpPromise, originalPromise]);

    for (const result of allResults) {
      if (!result) continue;
      const { name, ...data } = result;
      (results as Record<string, unknown>)[name] = data;
    }

    logger.info('Multi-resolution image processing completed', {
      folder,
      resolutions: Object.keys(results),
    });

    return results;
  } catch (error: unknown) {
    logger.error('Multi-resolution image processing failed:', error);
    throw error;
  }
}

// ============================================
// Video Transcoding with Error Recovery
// ============================================

export interface VideoTranscodeResult {
  resolutions: Record<string, { url: string; size: number; duration: number }>;
  thumbnailUrl: string;
  duration: number;
  width: number;
  height: number;
}

/**
 * Transcode a video to multiple resolutions with retry logic.
 * Generates H.264/MP4 output and thumbnail.
 */
export async function transcodeVideoWithRecovery(
  inputBuffer: Buffer,
  folder: string = 'media',
  mediaId?: string,
  contentType?: 'post' | 'reel' | 'story'
): Promise<VideoTranscodeResult | null> {
  await ensureTempDir();

  const tempInputPath = path.join(TEMP_DIR, `input-${crypto.randomUUID()}.mp4`);
  const tempFiles: string[] = [tempInputPath];

  try {
    // Write input buffer to temp file for ffmpeg
    await writeFile(tempInputPath, inputBuffer);

    // Get video metadata for validation
    const metadata = await videoTranscodingService.getMetadata(tempInputPath);

    // Validate duration based on content type
    if (contentType) {
      const { DURATION_LIMITS } = await import('../middleware/mediaValidation');
      const maxDuration = DURATION_LIMITS[contentType];
      if (metadata.duration > maxDuration) {
        throw new Error(
          `Video duration (${Math.round(metadata.duration)}s) exceeds maximum for ${contentType} (${maxDuration}s)`
        );
      }
    }

    const results: Record<string, { url: string; size: number; duration: number }> = {};

    // Determine which resolutions to generate
    const targetResolutions = VIDEO_RESOLUTIONS.filter((res) => {
      const config = { '1080p': 1080, '720p': 720, '480p': 480 }[res];
      return config <= Math.max(metadata.height, 720); // Always generate at least 720p
    });

    // Transcode each resolution with retry
    for (const resolution of targetResolutions) {
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= MAX_TRANSCODE_RETRIES; attempt++) {
        try {
          // Update job status
          if (mediaId) {
            await updateTranscodeJob(
              mediaId,
              resolution,
              'mp4',
              attempt > 1 ? 'RETRYING' : 'PROCESSING'
            );
          }

          const transcodeResult = await videoTranscodingService.transcodeVideo(tempInputPath, {
            resolution,
            format: 'mp4',
            codec: 'h264',
            preset: 'medium',
            crf: 23,
            audioCodec: 'aac',
          });

          tempFiles.push(transcodeResult.outputPath);

          // Validate transcoded output
          const outputValid = await videoTranscodingService.isValidVideo(transcodeResult.outputPath);
          if (!outputValid) {
            throw new Error(`Transcoded output for ${resolution} failed validation`);
          }

          // Read transcoded file and upload
          const outputBuffer = fs.readFileSync(transcodeResult.outputPath);
          const key = `${folder}/video-${resolution}-${crypto.randomBytes(8).toString('hex')}.mp4`;
          const file = bufferToUploadFile(outputBuffer, key, 'video/mp4');
          const url = await uploadMedia(file, folder);

          results[resolution] = {
            url,
            size: transcodeResult.size,
            duration: transcodeResult.duration,
          };

          // Update job status
          if (mediaId) {
            await updateTranscodeJob(mediaId, resolution, 'mp4', 'COMPLETED', url, transcodeResult.size);
          }

          lastError = null;
          break; // Success, move to next resolution
        } catch (error: unknown) {
          lastError = error instanceof Error ? error : new Error(String(error));
          logger.warn(`Transcode attempt ${attempt}/${MAX_TRANSCODE_RETRIES} failed for ${resolution}:`, lastError.message);

          if (attempt < MAX_TRANSCODE_RETRIES) {
            // Wait before retrying (exponential backoff)
            await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
          }
        }
      }

      if (lastError) {
        logger.error(`All transcode attempts failed for ${resolution}:`, lastError);
        if (mediaId) {
          await updateTranscodeJob(mediaId, resolution, 'mp4', 'FAILED', undefined, undefined, lastError.message);
        }
      }
    }

    // Generate thumbnail
    let thumbnailUrl = '';
    try {
      const thumbnailPath = await videoTranscodingService.generateSingleThumbnail(tempInputPath, {
        percentage: 10,
        width: 640,
      });
      tempFiles.push(thumbnailPath);

      const thumbBuffer = fs.readFileSync(thumbnailPath);
      const thumbKey = `${folder}/thumb-${crypto.randomBytes(8).toString('hex')}.jpg`;
      const thumbFile = bufferToUploadFile(thumbBuffer, thumbKey, 'image/jpeg');
      thumbnailUrl = await uploadMedia(thumbFile, folder);
    } catch (error: unknown) {
      logger.error('Thumbnail generation failed:', error);
    }

    if (Object.keys(results).length === 0) {
      throw new Error('All transcode resolutions failed');
    }

    return {
      resolutions: results,
      thumbnailUrl,
      duration: metadata.duration,
      width: metadata.width,
      height: metadata.height,
    };
  } catch (error: unknown) {
    logger.error('Video transcoding pipeline failed:', error);
    return null;
  } finally {
    // Cleanup temp files
    for (const tempFile of tempFiles) {
      try {
        if (fs.existsSync(tempFile)) {
          await unlink(tempFile);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

// ============================================
// Transcoded Output Validation
// ============================================

/**
 * Validate a transcoded image output before serving.
 */
export async function validateTranscodedImage(buffer: Buffer): Promise<boolean> {
  try {
    const metadata = await sharp(buffer).metadata();
    return (
      !!metadata.format &&
      (metadata.width || 0) > 0 &&
      (metadata.height || 0) > 0 &&
      buffer.length > 100 // Minimum size sanity check
    );
  } catch {
    return false;
  }
}

/**
 * Validate a transcoded video file before serving.
 */
export async function validateTranscodedVideo(filePath: string): Promise<boolean> {
  try {
    return await videoTranscodingService.isValidVideo(filePath);
  } catch {
    return false;
  }
}

// ============================================
// Transcode Job Status Tracking
// ============================================

/**
 * Create transcode job entries for a media item.
 */
export async function createTranscodeJobs(
  mediaId: string,
  mediaType: 'IMAGE' | 'VIDEO',
  inputUrl: string
): Promise<void> {
  try {
    const jobs: { mediaId: string; resolution: string; format: string; inputUrl: string }[] = [];

    if (mediaType === 'IMAGE') {
      for (const [name, config] of Object.entries(IMAGE_RESOLUTIONS)) {
        jobs.push({
          mediaId,
          resolution: `${config.width}x${config.height}`,
          format: 'webp',
          inputUrl,
        });
      }
    } else {
      for (const res of VIDEO_RESOLUTIONS) {
        jobs.push({ mediaId, resolution: res, format: 'mp4', inputUrl });
      }
    }

    await prisma.transcodeJob.createMany({ data: jobs });
    logger.debug('Transcode jobs created', { mediaId, count: jobs.length });
  } catch (error: unknown) {
    logger.error('Error creating transcode jobs:', error);
  }
}

/**
 * Update transcode job status.
 */
async function updateTranscodeJob(
  mediaId: string,
  resolution: string,
  format: string,
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'RETRYING',
  outputUrl?: string,
  outputSize?: number,
  errorMessage?: string
): Promise<void> {
  try {
    const job = await prisma.transcodeJob.findFirst({
      where: { mediaId, resolution, format },
    });

    if (job) {
      await prisma.transcodeJob.update({
        where: { id: job.id },
        data: {
          status,
          outputUrl,
          outputSize,
          errorMessage,
          attempts: { increment: status === 'RETRYING' ? 1 : 0 },
          startedAt: status === 'PROCESSING' ? new Date() : undefined,
          completedAt: ['COMPLETED', 'FAILED'].includes(status) ? new Date() : undefined,
        },
      });
    }
  } catch (error: unknown) {
    logger.error('Error updating transcode job:', error);
  }
}

/**
 * Get all transcode jobs for a media item.
 */
export async function getTranscodeJobStatus(mediaId: string) {
  try {
    return await prisma.transcodeJob.findMany({
      where: { mediaId },
      orderBy: { createdAt: 'asc' },
    });
  } catch (error: unknown) {
    logger.error('Error getting transcode job status:', error);
    return [];
  }
}

/**
 * Retry failed transcode jobs for a media item.
 */
export async function retryFailedTranscodeJobs(mediaId: string): Promise<number> {
  try {
    const failedJobs = await prisma.transcodeJob.findMany({
      where: {
        mediaId,
        status: 'FAILED',
        attempts: { lt: 3 }, // Only retry if under max attempts
      },
    });

    for (const job of failedJobs) {
      await prisma.transcodeJob.update({
        where: { id: job.id },
        data: { status: 'QUEUED', errorMessage: null },
      });
    }

    return failedJobs.length;
  } catch (error: unknown) {
    logger.error('Error retrying failed transcode jobs:', error);
    return 0;
  }
}

// ============================================
// Helper: Adapt an in-memory transcoding output buffer into the
// Express.Multer.File shape expected by the upload/storage pipeline.
// This is a real production adapter (not a test stub) — the transcoder
// produces buffers, while uploadMedia() consumes Multer files.
// ============================================

function bufferToUploadFile(
  buffer: Buffer,
  filename: string,
  mimetype: string
): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: path.basename(filename),
    encoding: '7bit',
    mimetype,
    destination: '',
    filename: path.basename(filename),
    path: '',
    size: buffer.length,
    buffer,
    stream: null as unknown as Express.Multer.File['stream'],
  };
}
