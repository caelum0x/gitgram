import logger from '../utils/logger';
import { uploadMedia } from './storageService';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
      // Use ffmpeg to extract frame at 1 second (or 0 if video is shorter)
      try {
        await execAsync(
          `ffmpeg -i "${videoFile.path}" -ss 00:00:01 -vframes 1 -vf "scale=640:-1" -y "${tempPath}" 2>/dev/null || ` +
          `ffmpeg -i "${videoFile.path}" -ss 00:00:00 -vframes 1 -vf "scale=640:-1" -y "${tempPath}" 2>/dev/null`
        );

        // Check if thumbnail was created
        await fs.access(tempPath);
        logger.debug('Thumbnail generated using ffmpeg');
      } catch (ffmpegError) {
        logger.warn('FFmpeg thumbnail generation failed, using fallback');
        await generatePlaceholderThumbnail(tempPath);
      }
    } else {
      // Fallback: create a placeholder thumbnail
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
    // Return a placeholder thumbnail URL instead of empty string
    return '/api/v1/static/placeholder-video-thumbnail.jpg';
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

export async function getVideoMetadata(videoUrl: string): Promise<{
  duration?: number;
  width?: number;
  height?: number;
  format?: string;
  size?: number;
}> {
  try {
    logger.info('Video metadata requested', { videoUrl });

    // For remote URLs, we would need to download or stream the file first
    // For now, return basic format info
    const extension = videoUrl.split('.').pop()?.toLowerCase();
    const formatMap: Record<string, string> = {
      mp4: 'mp4',
      webm: 'webm',
      mov: 'quicktime',
      avi: 'avi',
      mkv: 'matroska',
    };

    return {
      format: formatMap[extension || ''] || 'mp4',
    };
  } catch (error: any) {
    logger.error('Get video metadata error:', error);
    return {};
  }
}

