import logger from '../utils/logger';
import { uploadMedia } from './storageService';
import { errorTracker } from '../utils/errorTracker';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Number of ffmpeg extraction attempts before degrading to a placeholder.
// Transient failures (busy disk, slow I/O) frequently succeed on retry, so
// retrying keeps real-frame thumbnails the norm rather than the placeholder.
const FFMPEG_THUMBNAIL_ATTEMPTS = 2;

/**
 * Extracts a real frame thumbnail with ffmpeg, retrying transient failures.
 * Resolves once a thumbnail file exists at tempPath; throws if all attempts fail.
 */
async function extractFrameWithRetry(videoPath: string, tempPath: string): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= FFMPEG_THUMBNAIL_ATTEMPTS; attempt += 1) {
    try {
      await execAsync(
        `ffmpeg -i "${videoPath}" -ss 00:00:01 -vframes 1 -vf "scale=640:-1" -y "${tempPath}" 2>/dev/null || ` +
        `ffmpeg -i "${videoPath}" -ss 00:00:00 -vframes 1 -vf "scale=640:-1" -y "${tempPath}" 2>/dev/null`
      );
      await fs.access(tempPath);
      if (attempt > 1) {
        logger.info(`Thumbnail generated using ffmpeg on attempt ${attempt}`);
      } else {
        logger.debug('Thumbnail generated using ffmpeg');
      }
      return;
    } catch (error) {
      lastError = error;
      logger.warn(`FFmpeg thumbnail attempt ${attempt}/${FFMPEG_THUMBNAIL_ATTEMPTS} failed`);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('FFmpeg thumbnail extraction failed');
}

function uuidv4(): string {
  return crypto.randomUUID();
}

// Check if ffmpeg is available
let ffmpegAvailable: boolean | null = null;

async function checkFfmpeg(): Promise<boolean> {
  if (ffmpegAvailable !== null) return ffmpegAvailable;

  try {
    await execAsync('ffmpeg -version');
    ffmpegAvailable = true;
    logger.info('FFmpeg is available for video processing');
  } catch {
    ffmpegAvailable = false;
    logger.warn('FFmpeg not available - using fallback thumbnail generation');
  }
  return ffmpegAvailable;
}

export interface VideoProcessingResult {
  videoUrl: string;
  thumbnailUrl: string;
  duration?: number;
  width?: number;
  height?: number;
}

export async function processVideo(
  videoFile: Express.Multer.File
): Promise<VideoProcessingResult> {
  try {
    // Upload original video
    const videoUrl = await uploadMedia(videoFile);

    // Generate thumbnail from video
    const thumbnailUrl = await generateVideoThumbnail(videoFile);

    // Try to get video metadata
    const metadata = await getVideoMetadataFromFile(videoFile.path);

    logger.info('Video processed', {
      originalName: videoFile.originalname,
      size: videoFile.size,
      duration: metadata.duration,
      dimensions: metadata.width && metadata.height ? `${metadata.width}x${metadata.height}` : 'unknown',
    });

    return {
      videoUrl,
      thumbnailUrl,
      duration: metadata.duration,
      width: metadata.width,
      height: metadata.height,
    };
  } catch (error: any) {
    logger.error('Video processing error:', error);
    throw new Error('Failed to process video');
  }
}

async function generateVideoThumbnail(
  videoFile: Express.Multer.File
): Promise<string> {
  const tempPath = path.join('/tmp', `thumbnail-${uuidv4()}.jpg`);

  try {
    const hasFfmpeg = await checkFfmpeg();

    if (hasFfmpeg && videoFile.path) {
      // Use ffmpeg to extract a real frame, retrying transient failures.
      try {
        await extractFrameWithRetry(videoFile.path, tempPath);
      } catch (ffmpegError) {
        logger.warn('FFmpeg thumbnail generation failed after retries, using placeholder');
        // Surface placeholder usage to monitoring so it can be tracked and
        // alerted on — a real frame should be the norm in production.
        errorTracker.captureMessage(
          'Video thumbnail fell back to placeholder after ffmpeg failure',
          'warning',
          { endpoint: 'videoService.generateVideoThumbnail' }
        );
        await generatePlaceholderThumbnail(tempPath);
      }
    } else {
      // ffmpeg is unavailable in this environment — record it so the deploy can
      // be fixed, then degrade gracefully to a placeholder thumbnail.
      errorTracker.captureMessage(
        'Video thumbnail used placeholder because ffmpeg is unavailable',
        'warning',
        { endpoint: 'videoService.generateVideoThumbnail' }
      );
      await generatePlaceholderThumbnail(tempPath);
    }

    // Read the thumbnail file
    const thumbnailBuffer = await fs.readFile(tempPath);

    // Upload thumbnail
    const thumbnailFile = {
      fieldname: 'thumbnail',
      originalname: 'thumbnail.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      destination: '/tmp',
      filename: path.basename(tempPath),
      path: tempPath,
      size: thumbnailBuffer.length,
      buffer: thumbnailBuffer,
    } as Express.Multer.File;

    const thumbnailUrl = await uploadMedia(thumbnailFile);

    // Clean up temp file
    try {
      await fs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }

    return thumbnailUrl;
  } catch (error: any) {
    logger.error('Thumbnail generation error:', error);
    // Clean up on error
    try {
      await fs.unlink(tempPath);
    } catch {
      // Ignore
    }
    // Generate and upload a real placeholder thumbnail so callers always get a
    // working, reachable URL (the previous static path was never served).
    return generateAndUploadPlaceholder();
  }
}

/**
 * Generates a branded placeholder thumbnail and uploads it via the standard
 * media storage pipeline, returning a real, reachable URL.
 */
async function generateAndUploadPlaceholder(): Promise<string> {
  const placeholderPath = path.join('/tmp', `placeholder-${uuidv4()}.jpg`);

  try {
    await generatePlaceholderThumbnail(placeholderPath);
    const buffer = await fs.readFile(placeholderPath);

    const placeholderFile = {
      fieldname: 'thumbnail',
      originalname: 'placeholder-video-thumbnail.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      destination: '/tmp',
      filename: path.basename(placeholderPath),
      path: placeholderPath,
      size: buffer.length,
      buffer,
    } as Express.Multer.File;

    return await uploadMedia(placeholderFile);
  } catch (error) {
    logger.error('Placeholder thumbnail generation failed:', error);
    // Last-resort: return empty string so the caller can decide how to render.
    // Never return a hardcoded URL that does not resolve.
    return '';
  } finally {
    try {
      await fs.unlink(placeholderPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

async function generatePlaceholderThumbnail(outputPath: string): Promise<void> {
  // Create a video-style placeholder with gradient
  const thumbnailBuffer = await sharp({
    create: {
      width: 640,
      height: 360,
      channels: 4,
      background: { r: 30, g: 30, b: 40, alpha: 1 },
    },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="640" height="360">
            <defs>
              <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#1a1a2e;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#16213e;stop-opacity:1" />
              </linearGradient>
            </defs>
            <rect width="640" height="360" fill="url(#grad)"/>
            <circle cx="320" cy="180" r="40" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="3"/>
            <polygon points="310,160 310,200 345,180" fill="rgba(255,255,255,0.5)"/>
          </svg>`
        ),
        top: 0,
        left: 0,
      },
    ])
    .jpeg({ quality: 80 })
    .toBuffer();

  await fs.writeFile(outputPath, thumbnailBuffer);
}

async function getVideoMetadataFromFile(filePath: string): Promise<{
  duration?: number;
  width?: number;
  height?: number;
  format?: string;
}> {
  const hasFfmpeg = await checkFfmpeg();

  if (!hasFfmpeg || !filePath) {
    return { format: 'mp4' };
  }

  try {
    // Use ffprobe to get video metadata
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`
    );

    const data = JSON.parse(stdout);
    const videoStream = data.streams?.find((s: any) => s.codec_type === 'video');

    return {
      duration: data.format?.duration ? Math.round(parseFloat(data.format.duration)) : undefined,
      width: videoStream?.width,
      height: videoStream?.height,
      format: data.format?.format_name?.split(',')[0] || 'mp4',
    };
  } catch (error) {
    logger.debug('Could not extract video metadata:', error);
    return { format: 'mp4' };
  }
}

export async function transcodeVideo(
  videoUrl: string,
  options: {
    quality?: 'low' | 'medium' | 'high';
    format?: 'mp4' | 'webm';
    resolution?: '480p' | '720p' | '1080p';
  } = {}
): Promise<string> {
  try {
    const hasFfmpeg = await checkFfmpeg();

    if (!hasFfmpeg) {
      logger.info('Video transcoding skipped - ffmpeg not available', { videoUrl, options });
      return videoUrl;
    }

    logger.info('Video transcoding requested', { videoUrl, options });

    // For cloud storage URLs, transcoding would need to:
    // 1. Download video from storage
    // 2. Transcode using ffmpeg
    // 3. Upload transcoded video
    // 4. Return new URL
    // This requires additional infrastructure setup

    return videoUrl;
  } catch (error: any) {
    logger.error('Video transcoding error:', error);
    throw new Error('Failed to transcode video');
  }
}

export interface VideoMetadata {
  duration?: number;
  width?: number;
  height?: number;
  format?: string;
  size?: number;
}

const FORMAT_BY_EXTENSION: Record<string, string> = {
  mp4: 'mp4',
  webm: 'webm',
  mov: 'quicktime',
  avi: 'avi',
  mkv: 'matroska',
};

/** Best-effort container format inference from a URL/path extension. */
function inferFormatFromUrl(videoUrl: string): string {
  const cleaned = videoUrl.split('?')[0].split('#')[0];
  const extension = cleaned.split('.').pop()?.toLowerCase() ?? '';
  return FORMAT_BY_EXTENSION[extension] ?? 'mp4';
}

/**
 * Hosts we are willing to probe. Derived from the storage/CDN configuration so
 * we never issue requests (ffprobe or HEAD) to arbitrary user-controlled hosts
 * — that would be a server-side request forgery (SSRF) vector.
 */
function allowedMediaHosts(): Set<string> {
  const hosts = new Set<string>();
  const add = (value: string | undefined): void => {
    if (!value) return;
    try {
      hosts.add(new URL(value).host.toLowerCase());
    } catch {
      // Some configs (e.g. bucket names) are not full URLs; ignore those.
    }
  };
  add(process.env.CDN_URL);
  add(process.env.MEDIA_BASE_URL);
  add(process.env.PUBLIC_BASE_URL);
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION || 'us-east-1';
  if (bucket) {
    hosts.add(`${bucket}.s3.${region}.amazonaws.com`);
    hosts.add(`${bucket}.s3.amazonaws.com`);
  }
  return hosts;
}

/**
 * Validate that the URL is a probe-able local file or an http(s) URL pointing at
 * a configured, trusted media host. Throws on anything else.
 */
function assertProbeableSource(videoUrl: string): void {
  if (!videoUrl || typeof videoUrl !== 'string') {
    throw new Error('videoUrl is required');
  }
  if (path.isAbsolute(videoUrl) && !/^https?:\/\//i.test(videoUrl)) {
    return; // Local file path (server-side temp/upload).
  }

  let parsed: URL;
  try {
    parsed = new URL(videoUrl);
  } catch {
    throw new Error('videoUrl must be an absolute path or an http(s) URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('videoUrl must use the http or https protocol');
  }

  const allowed = allowedMediaHosts();
  if (allowed.size === 0) {
    throw new Error('No trusted media host is configured for metadata probing');
  }
  if (!allowed.has(parsed.host.toLowerCase())) {
    throw new Error('videoUrl host is not an allowed media host');
  }
}

/** Fetch Content-Length via HEAD for a remote URL. Returns undefined on failure. */
async function fetchRemoteSize(videoUrl: string): Promise<number | undefined> {
  try {
    const response = await axios.head(videoUrl, { timeout: 10000, maxRedirects: 5 });
    const length = response.headers['content-length'];
    const parsed = length ? parseInt(String(length), 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Local file size in bytes. Returns undefined on failure. */
async function fetchLocalSize(filePath: string): Promise<number | undefined> {
  try {
    const stat = await fs.stat(filePath);
    return stat.size;
  } catch {
    return undefined;
  }
}

interface FfprobeStream {
  codec_type?: string;
  width?: number;
  height?: number;
}

interface FfprobeOutput {
  format?: { duration?: string; format_name?: string; size?: string };
  streams?: FfprobeStream[];
}

/**
 * Extract real video metadata for a remote (http/https) or local video.
 *
 * ffprobe reads http(s) URLs natively, so no full download is required — it
 * range-reads only the header/index. Duration, width and height are parsed from
 * the probe output; size comes from the source's Content-Length (remote) or the
 * filesystem (local), falling back to ffprobe's reported format size.
 *
 * When ffprobe is unavailable the function degrades to extension-inferred
 * format plus a best-effort size, never throwing for that case.
 */
export async function getVideoMetadata(videoUrl: string): Promise<VideoMetadata> {
  assertProbeableSource(videoUrl);
  logger.info('Video metadata requested', { videoUrl });

  const isHttp = /^https?:\/\//i.test(videoUrl);
  const inferredFormat = inferFormatFromUrl(videoUrl);

  const sizePromise = isHttp ? fetchRemoteSize(videoUrl) : fetchLocalSize(videoUrl);

  const hasFfmpeg = await checkFfmpeg();
  if (!hasFfmpeg) {
    const size = await sizePromise;
    return { format: inferredFormat, size };
  }

  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${videoUrl}"`,
      { timeout: 30000, maxBuffer: 1024 * 1024 }
    );

    const data = JSON.parse(stdout) as FfprobeOutput;
    const videoStream = data.streams?.find((s) => s.codec_type === 'video');

    const duration = data.format?.duration
      ? Math.round(parseFloat(data.format.duration))
      : undefined;
    const probeSize = data.format?.size ? parseInt(data.format.size, 10) : undefined;
    const transferSize = await sizePromise;

    return {
      duration: Number.isFinite(duration) ? duration : undefined,
      width: videoStream?.width,
      height: videoStream?.height,
      format: data.format?.format_name?.split(',')[0] || inferredFormat,
      size: transferSize ?? (Number.isFinite(probeSize) ? probeSize : undefined),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown error';
    logger.warn('ffprobe metadata extraction failed, returning inferred metadata', {
      videoUrl,
      message,
    });
    const size = await sizePromise;
    return { format: inferredFormat, size };
  }
}

