import ffmpeg, { FfprobeData, FfprobeStream } from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import crypto from 'crypto';
import logger from '../utils/logger';

const mkdir = promisify(fs.mkdir);
const unlink = promisify(fs.unlink);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const access = promisify(fs.access);
const rmdir = promisify(fs.rmdir);

// Video resolution presets
export type VideoResolution = '1080p' | '720p' | '480p' | '360p';

export interface ResolutionConfig {
  width: number;
  height: number;
  videoBitrate: string;
  audioBitrate: string;
}

export const RESOLUTION_CONFIGS: Record<VideoResolution, ResolutionConfig> = {
  '1080p': { width: 1920, height: 1080, videoBitrate: '5000k', audioBitrate: '192k' },
  '720p': { width: 1280, height: 720, videoBitrate: '2500k', audioBitrate: '128k' },
  '480p': { width: 854, height: 480, videoBitrate: '1000k', audioBitrate: '96k' },
  '360p': { width: 640, height: 360, videoBitrate: '600k', audioBitrate: '64k' },
};

// Transcoding configuration
export interface TranscodeConfig {
  resolution: VideoResolution;
  format: 'mp4' | 'webm';
  codec: 'h264' | 'h265' | 'vp9';
  preset: 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow' | 'slower' | 'veryslow';
  crf: number; // Constant Rate Factor (18-28 is good, lower = better quality)
  twoPass: boolean;
  audioCodec: 'aac' | 'opus' | 'mp3';
}

export interface ThumbnailConfig {
  timestamps: string[]; // e.g., ['00:00:01', '00:00:05', '00:00:10']
  size: string; // e.g., '320x180'
  format: 'jpg' | 'png';
  quality: number; // 1-31 for jpg, lower is better
}

export interface HLSConfig {
  segmentDuration: number; // in seconds
  playlistType: 'vod' | 'event';
  resolutions: VideoResolution[];
  hlsTime: number;
  hlsListSize: number;
}

export interface VideoMetadata {
  duration: number; // in seconds
  width: number;
  height: number;
  codec: string;
  codecLong: string;
  bitrate: number; // in bits per second
  fps: number;
  aspectRatio: string;
  audioCodec?: string;
  audioChannels?: number;
  audioSampleRate?: number;
  format: string;
  size: number; // file size in bytes
}

export interface TranscodeResult {
  outputPath: string;
  resolution: VideoResolution;
  format: string;
  size: number;
  duration: number;
}

export interface ThumbnailResult {
  paths: string[];
  timestamps: string[];
  size: string;
  format: string;
}

export interface HLSResult {
  masterPlaylistPath: string;
  variantPlaylists: {
    resolution: VideoResolution;
    playlistPath: string;
    segmentDirectory: string;
  }[];
  totalSegments: number;
}

export interface CompressionResult {
  outputPath: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  quality: number;
}

// Default configurations
export const DEFAULT_TRANSCODE_CONFIG: TranscodeConfig = {
  resolution: '720p',
  format: 'mp4',
  codec: 'h264',
  preset: 'medium',
  crf: 23,
  twoPass: false,
  audioCodec: 'aac',
};

export const DEFAULT_THUMBNAIL_CONFIG: ThumbnailConfig = {
  timestamps: ['00:00:01'],
  size: '320x180',
  format: 'jpg',
  quality: 2,
};

export const DEFAULT_HLS_CONFIG: HLSConfig = {
  segmentDuration: 10,
  playlistType: 'vod',
  resolutions: ['1080p', '720p', '480p'],
  hlsTime: 10,
  hlsListSize: 0, // 0 means include all segments
};

class VideoTranscodingService {
  private static instance: VideoTranscodingService;
  private tempDir: string;
  private ffmpegAvailable: boolean | null = null;

  private constructor() {
    this.tempDir = process.env.VIDEO_TEMP_DIR || path.join(__dirname, '../../temp/videos');
    this.ensureTempDir();
  }

  public static getInstance(): VideoTranscodingService {
    if (!VideoTranscodingService.instance) {
      VideoTranscodingService.instance = new VideoTranscodingService();
    }
    return VideoTranscodingService.instance;
  }

  /**
   * Ensure the temp directory exists
   */
  private async ensureTempDir(): Promise<void> {
    try {
      await mkdir(this.tempDir, { recursive: true });
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        logger.error('Failed to create video temp directory:', error);
      }
    }
  }

  /**
   * Generate a unique filename
   */
  private generateUniqueFilename(extension: string): string {
    const uuid = crypto.randomUUID();
    return `${uuid}.${extension}`;
  }

  /**
   * Check if ffmpeg is available on the system
   */
  public async checkFfmpegAvailable(): Promise<boolean> {
    if (this.ffmpegAvailable !== null) {
      return this.ffmpegAvailable;
    }

    return new Promise((resolve) => {
      ffmpeg.getAvailableFormats((err) => {
        if (err) {
          this.ffmpegAvailable = false;
          logger.warn('FFmpeg is not available:', err.message);
          resolve(false);
        } else {
          this.ffmpegAvailable = true;
          logger.info('FFmpeg is available for video processing');
          resolve(true);
        }
      });
    });
  }

  /**
   * Extract video metadata using ffprobe
   */
  public async getMetadata(inputPath: string): Promise<VideoMetadata> {
    const available = await this.checkFfmpegAvailable();
    if (!available) {
      throw new Error('FFmpeg is not available on this system');
    }

    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err: Error | null, data: FfprobeData) => {
        if (err) {
          logger.error('Failed to get video metadata:', err);
          reject(new Error(`Failed to extract video metadata: ${err.message}`));
          return;
        }

        const videoStream = data.streams.find((s: FfprobeStream) => s.codec_type === 'video');
        const audioStream = data.streams.find((s: FfprobeStream) => s.codec_type === 'audio');

        if (!videoStream) {
          reject(new Error('No video stream found in file'));
          return;
        }

        // Calculate FPS from r_frame_rate (e.g., "30/1" or "30000/1001")
        let fps = 0;
        if (videoStream.r_frame_rate) {
          const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
          fps = den ? num / den : num;
        }

        // Get file size
        let fileSize = 0;
        try {
          const stats = fs.statSync(inputPath);
          fileSize = stats.size;
        } catch {
          // Ignore file size errors
        }

        const metadata: VideoMetadata = {
          duration: data.format.duration || 0,
          width: videoStream.width || 0,
          height: videoStream.height || 0,
          codec: videoStream.codec_name || 'unknown',
          codecLong: videoStream.codec_long_name || 'unknown',
          bitrate: parseInt(String(data.format.bit_rate || '0'), 10),
          fps: Math.round(fps * 100) / 100,
          aspectRatio: videoStream.display_aspect_ratio || `${videoStream.width}:${videoStream.height}`,
          audioCodec: audioStream?.codec_name,
          audioChannels: audioStream?.channels,
          audioSampleRate: audioStream?.sample_rate ? parseInt(String(audioStream.sample_rate), 10) : undefined,
          format: data.format.format_name || 'unknown',
          size: fileSize,
        };

        logger.debug('Video metadata extracted', {
          inputPath,
          duration: metadata.duration,
          resolution: `${metadata.width}x${metadata.height}`,
          codec: metadata.codec,
          fps: metadata.fps,
        });

        resolve(metadata);
      });
    });
  }

  /**
   * Transcode video to a specific resolution and format
   */
  public async transcodeVideo(
    inputPath: string,
    config: Partial<TranscodeConfig> = {}
  ): Promise<TranscodeResult> {
    const available = await this.checkFfmpegAvailable();
    if (!available) {
      throw new Error('FFmpeg is not available on this system');
    }

    const options: TranscodeConfig = { ...DEFAULT_TRANSCODE_CONFIG, ...config };
    const resConfig = RESOLUTION_CONFIGS[options.resolution];
    const outputFilename = this.generateUniqueFilename(options.format);
    const outputPath = path.join(this.tempDir, outputFilename);

    await this.ensureTempDir();

    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath)
        .outputOptions([
          // Video settings
          `-c:v ${options.codec === 'h264' ? 'libx264' : options.codec === 'h265' ? 'libx265' : 'libvpx-vp9'}`,
          `-preset ${options.preset}`,
          `-crf ${options.crf}`,
          `-maxrate ${resConfig.videoBitrate}`,
          `-bufsize ${parseInt(resConfig.videoBitrate) * 2}k`,
          // Scale filter - maintains aspect ratio, scales to fit within resolution
          `-vf scale='min(${resConfig.width},iw)':min'(${resConfig.height},ih)':force_original_aspect_ratio=decrease,pad=${resConfig.width}:${resConfig.height}:(ow-iw)/2:(oh-ih)/2:black`,
          // Audio settings
          `-c:a ${options.audioCodec === 'aac' ? 'aac' : options.audioCodec === 'opus' ? 'libopus' : 'libmp3lame'}`,
          `-b:a ${resConfig.audioBitrate}`,
          // Additional settings for compatibility
          '-movflags +faststart', // Enables progressive download
          '-pix_fmt yuv420p', // Maximum compatibility
        ])
        .output(outputPath);

      // Add format-specific options
      if (options.format === 'mp4') {
        command = command.format('mp4');
      } else if (options.format === 'webm') {
        command = command.format('webm');
      }

      command
        .on('start', (commandLine: string) => {
          logger.debug('Transcoding started', { commandLine });
        })
        .on('progress', (progress: { percent?: number; timemark?: string }) => {
          if (progress.percent) {
            logger.debug(`Transcoding progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', async () => {
          try {
            const stats = await stat(outputPath);
            const metadata = await this.getMetadata(outputPath);

            const result: TranscodeResult = {
              outputPath,
              resolution: options.resolution,
              format: options.format,
              size: stats.size,
              duration: metadata.duration,
            };

            logger.info('Video transcoded successfully', {
              inputPath,
              outputPath,
              resolution: options.resolution,
              format: options.format,
              size: stats.size,
            });

            resolve(result);
          } catch (error: any) {
            reject(new Error(`Failed to get transcoded file info: ${error.message}`));
          }
        })
        .on('error', (err: Error) => {
          logger.error('Transcoding failed:', err);
          reject(new Error(`Transcoding failed: ${err.message}`));
        })
        .run();
    });
  }

  /**
   * Transcode video to multiple resolutions
   */
  public async transcodeToMultipleResolutions(
    inputPath: string,
    resolutions: VideoResolution[] = ['1080p', '720p', '480p'],
    config: Partial<Omit<TranscodeConfig, 'resolution'>> = {}
  ): Promise<TranscodeResult[]> {
    const available = await this.checkFfmpegAvailable();
    if (!available) {
      throw new Error('FFmpeg is not available on this system');
    }

    // Get input metadata to determine valid resolutions
    const metadata = await this.getMetadata(inputPath);

    // Filter out resolutions higher than the source
    const validResolutions = resolutions.filter((res) => {
      const resConfig = RESOLUTION_CONFIGS[res];
      return resConfig.height <= metadata.height;
    });

    if (validResolutions.length === 0) {
      // If source is lower than all requested resolutions, use lowest requested
      const lowestResolution = resolutions.sort((a, b) =>
        RESOLUTION_CONFIGS[a].height - RESOLUTION_CONFIGS[b].height
      )[0];
      validResolutions.push(lowestResolution);
    }

    logger.info('Starting multi-resolution transcoding', {
      inputPath,
      requestedResolutions: resolutions,
      validResolutions,
      sourceResolution: `${metadata.width}x${metadata.height}`,
    });

    const results: TranscodeResult[] = [];

    // Process sequentially to avoid overwhelming the system
    for (const resolution of validResolutions) {
      const result = await this.transcodeVideo(inputPath, { ...config, resolution });
      results.push(result);
    }

    logger.info('Multi-resolution transcoding completed', {
      inputPath,
      transcoded: results.length,
    });

    return results;
  }

  /**
   * Generate video thumbnails at specific timestamps
   */
  public async generateThumbnails(
    inputPath: string,
    config: Partial<ThumbnailConfig> = {}
  ): Promise<ThumbnailResult> {
    const available = await this.checkFfmpegAvailable();
    if (!available) {
      throw new Error('FFmpeg is not available on this system');
    }

    const options: ThumbnailConfig = { ...DEFAULT_THUMBNAIL_CONFIG, ...config };
    const thumbnailDir = path.join(this.tempDir, 'thumbnails', crypto.randomUUID());
    await mkdir(thumbnailDir, { recursive: true });

    const generatedPaths: string[] = [];

    for (let i = 0; i < options.timestamps.length; i++) {
      const timestamp = options.timestamps[i];
      const outputFilename = `thumbnail_${i + 1}.${options.format}`;
      const outputPath = path.join(thumbnailDir, outputFilename);

      await new Promise<void>((resolve, reject) => {
        let command = ffmpeg(inputPath)
          .seekInput(timestamp)
          .outputOptions([
            '-vframes 1',
            `-s ${options.size}`,
          ]);

        if (options.format === 'jpg') {
          command = command.outputOptions([`-q:v ${options.quality}`]);
        }

        command
          .output(outputPath)
          .on('end', () => {
            generatedPaths.push(outputPath);
            resolve();
          })
          .on('error', (err: Error) => {
            logger.error(`Failed to generate thumbnail at ${timestamp}:`, err);
            reject(new Error(`Thumbnail generation failed at ${timestamp}: ${err.message}`));
          })
          .run();
      });
    }

    const result: ThumbnailResult = {
      paths: generatedPaths,
      timestamps: options.timestamps,
      size: options.size,
      format: options.format,
    };

    logger.info('Thumbnails generated', {
      inputPath,
      count: generatedPaths.length,
      timestamps: options.timestamps,
    });

    return result;
  }

  /**
   * Generate a single thumbnail at a specific timestamp or percentage
   */
  public async generateSingleThumbnail(
    inputPath: string,
    options: {
      timestamp?: string; // e.g., '00:00:05'
      percentage?: number; // e.g., 10 for 10% into the video
      width?: number;
      height?: number;
      quality?: number;
    } = {}
  ): Promise<string> {
    const available = await this.checkFfmpegAvailable();
    if (!available) {
      throw new Error('FFmpeg is not available on this system');
    }

    let seekTime = options.timestamp || '00:00:01';

    // Calculate timestamp from percentage if provided
    if (options.percentage !== undefined) {
      const metadata = await this.getMetadata(inputPath);
      const seekSeconds = (options.percentage / 100) * metadata.duration;
      const hours = Math.floor(seekSeconds / 3600);
      const minutes = Math.floor((seekSeconds % 3600) / 60);
      const seconds = Math.floor(seekSeconds % 60);
      seekTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    const width = options.width || 640;
    const height = options.height || -1; // -1 maintains aspect ratio
    const quality = options.quality || 2;

    const outputFilename = this.generateUniqueFilename('jpg');
    const outputPath = path.join(this.tempDir, outputFilename);

    await this.ensureTempDir();

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .seekInput(seekTime)
        .outputOptions([
          '-vframes 1',
          `-vf scale=${width}:${height}`,
          `-q:v ${quality}`,
        ])
        .output(outputPath)
        .on('end', () => {
          logger.debug('Single thumbnail generated', { inputPath, outputPath, seekTime });
          resolve(outputPath);
        })
        .on('error', (err: Error) => {
          logger.error('Single thumbnail generation failed:', err);
          reject(new Error(`Thumbnail generation failed: ${err.message}`));
        })
        .run();
    });
  }

  /**
   * Compress video while maintaining acceptable quality
   */
  public async compressVideo(
    inputPath: string,
    options: {
      targetSizeMB?: number; // Target file size in MB
      quality?: 'low' | 'medium' | 'high' | 'auto';
      maxDuration?: number; // Maximum duration in seconds (truncate if longer)
    } = {}
  ): Promise<CompressionResult> {
    const available = await this.checkFfmpegAvailable();
    if (!available) {
      throw new Error('FFmpeg is not available on this system');
    }

    const metadata = await this.getMetadata(inputPath);
    const originalSize = metadata.size;

    // Determine CRF based on quality setting
    let crf: number;
    switch (options.quality) {
      case 'low':
        crf = 28;
        break;
      case 'medium':
        crf = 23;
        break;
      case 'high':
        crf = 18;
        break;
      case 'auto':
      default:
        // Auto-adjust based on target size if provided
        if (options.targetSizeMB) {
          const targetBits = options.targetSizeMB * 8 * 1024 * 1024;
          const targetBitrate = targetBits / metadata.duration;
          const currentBitrate = metadata.bitrate;
          // Higher CRF for more compression
          if (targetBitrate < currentBitrate * 0.3) {
            crf = 28;
          } else if (targetBitrate < currentBitrate * 0.5) {
            crf = 25;
          } else if (targetBitrate < currentBitrate * 0.7) {
            crf = 23;
          } else {
            crf = 21;
          }
        } else {
          crf = 23; // Default medium quality
        }
        break;
    }

    const outputFilename = this.generateUniqueFilename('mp4');
    const outputPath = path.join(this.tempDir, outputFilename);

    await this.ensureTempDir();

    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath)
        .outputOptions([
          '-c:v libx264',
          `-crf ${crf}`,
          '-preset medium',
          '-c:a aac',
          '-b:a 128k',
          '-movflags +faststart',
          '-pix_fmt yuv420p',
        ]);

      // Truncate if maxDuration is specified
      if (options.maxDuration && metadata.duration > options.maxDuration) {
        command = command.duration(options.maxDuration);
      }

      command
        .output(outputPath)
        .on('end', async () => {
          try {
            const stats = await stat(outputPath);
            const compressionRatio = Math.round((1 - stats.size / originalSize) * 100);

            const result: CompressionResult = {
              outputPath,
              originalSize,
              compressedSize: stats.size,
              compressionRatio,
              quality: crf,
            };

            logger.info('Video compressed', {
              inputPath,
              outputPath,
              originalSize,
              compressedSize: stats.size,
              compressionRatio: `${compressionRatio}%`,
              crf,
            });

            resolve(result);
          } catch (error: any) {
            reject(new Error(`Failed to get compressed file info: ${error.message}`));
          }
        })
        .on('error', (err: Error) => {
          logger.error('Video compression failed:', err);
          reject(new Error(`Video compression failed: ${err.message}`));
        })
        .run();
    });
  }

  /**
   * Generate HLS (HTTP Live Streaming) output for adaptive streaming
   */
  public async generateHLS(
    inputPath: string,
    config: Partial<HLSConfig> = {}
  ): Promise<HLSResult> {
    const available = await this.checkFfmpegAvailable();
    if (!available) {
      throw new Error('FFmpeg is not available on this system');
    }

    const options: HLSConfig = { ...DEFAULT_HLS_CONFIG, ...config };
    const metadata = await this.getMetadata(inputPath);

    // Filter resolutions that are <= source resolution
    const validResolutions = options.resolutions.filter((res) => {
      const resConfig = RESOLUTION_CONFIGS[res];
      return resConfig.height <= metadata.height;
    });

    if (validResolutions.length === 0) {
      validResolutions.push(options.resolutions[options.resolutions.length - 1]);
    }

    const hlsDir = path.join(this.tempDir, 'hls', crypto.randomUUID());
    await mkdir(hlsDir, { recursive: true });

    const variantPlaylists: HLSResult['variantPlaylists'] = [];
    let totalSegments = 0;

    // Generate variant playlists for each resolution
    for (const resolution of validResolutions) {
      const resConfig = RESOLUTION_CONFIGS[resolution];
      const variantDir = path.join(hlsDir, resolution);
      await mkdir(variantDir, { recursive: true });

      const playlistPath = path.join(variantDir, 'playlist.m3u8');
      const segmentPattern = path.join(variantDir, 'segment_%03d.ts');

      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .outputOptions([
            '-c:v libx264',
            '-preset fast',
            '-crf 22',
            `-maxrate ${resConfig.videoBitrate}`,
            `-bufsize ${parseInt(resConfig.videoBitrate) * 2}k`,
            `-vf scale=w=${resConfig.width}:h=${resConfig.height}:force_original_aspect_ratio=decrease`,
            '-c:a aac',
            `-b:a ${resConfig.audioBitrate}`,
            '-ac 2',
            '-f hls',
            `-hls_time ${options.hlsTime}`,
            `-hls_list_size ${options.hlsListSize}`,
            `-hls_playlist_type ${options.playlistType}`,
            `-hls_segment_filename ${segmentPattern}`,
          ])
          .output(playlistPath)
          .on('end', async () => {
            // Count segments
            const files = await readdir(variantDir);
            const segmentCount = files.filter((f) => f.endsWith('.ts')).length;
            totalSegments += segmentCount;

            variantPlaylists.push({
              resolution,
              playlistPath,
              segmentDirectory: variantDir,
            });

            logger.debug(`HLS variant created: ${resolution}`, {
              playlistPath,
              segments: segmentCount,
            });

            resolve();
          })
          .on('error', (err: Error) => {
            logger.error(`HLS generation failed for ${resolution}:`, err);
            reject(new Error(`HLS generation failed for ${resolution}: ${err.message}`));
          })
          .run();
      });
    }

    // Generate master playlist
    const masterPlaylistPath = path.join(hlsDir, 'master.m3u8');
    let masterContent = '#EXTM3U\n#EXT-X-VERSION:3\n';

    for (const variant of variantPlaylists) {
      const resConfig = RESOLUTION_CONFIGS[variant.resolution];
      const bandwidth = parseInt(resConfig.videoBitrate) * 1000 + parseInt(resConfig.audioBitrate) * 1000;
      masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${resConfig.width}x${resConfig.height}\n`;
      masterContent += `${variant.resolution}/playlist.m3u8\n`;
    }

    fs.writeFileSync(masterPlaylistPath, masterContent);

    const result: HLSResult = {
      masterPlaylistPath,
      variantPlaylists,
      totalSegments,
    };

    logger.info('HLS generation completed', {
      inputPath,
      masterPlaylistPath,
      variants: variantPlaylists.length,
      totalSegments,
    });

    return result;
  }

  /**
   * Extract audio from video
   */
  public async extractAudio(
    inputPath: string,
    options: {
      format?: 'mp3' | 'aac' | 'm4a' | 'wav';
      bitrate?: string;
    } = {}
  ): Promise<string> {
    const available = await this.checkFfmpegAvailable();
    if (!available) {
      throw new Error('FFmpeg is not available on this system');
    }

    const format = options.format || 'mp3';
    const bitrate = options.bitrate || '192k';
    const outputFilename = this.generateUniqueFilename(format);
    const outputPath = path.join(this.tempDir, outputFilename);

    await this.ensureTempDir();

    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath)
        .noVideo()
        .audioCodec(format === 'mp3' ? 'libmp3lame' : format === 'aac' ? 'aac' : format === 'wav' ? 'pcm_s16le' : 'aac')
        .audioBitrate(bitrate);

      command
        .output(outputPath)
        .on('end', () => {
          logger.info('Audio extracted', { inputPath, outputPath, format, bitrate });
          resolve(outputPath);
        })
        .on('error', (err: Error) => {
          logger.error('Audio extraction failed:', err);
          reject(new Error(`Audio extraction failed: ${err.message}`));
        })
        .run();
    });
  }

  /**
   * Add watermark to video
   */
  public async addWatermark(
    inputPath: string,
    watermarkPath: string,
    options: {
      position?: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'center';
      opacity?: number; // 0-1
      scale?: number; // Scale factor for watermark
      margin?: number; // Margin from edges in pixels
    } = {}
  ): Promise<string> {
    const available = await this.checkFfmpegAvailable();
    if (!available) {
      throw new Error('FFmpeg is not available on this system');
    }

    const position = options.position || 'bottomRight';
    const opacity = options.opacity || 0.5;
    const scale = options.scale || 0.1;
    const margin = options.margin || 10;

    const outputFilename = this.generateUniqueFilename('mp4');
    const outputPath = path.join(this.tempDir, outputFilename);

    await this.ensureTempDir();

    // Build overlay position
    let overlayPosition: string;
    switch (position) {
      case 'topLeft':
        overlayPosition = `${margin}:${margin}`;
        break;
      case 'topRight':
        overlayPosition = `main_w-overlay_w-${margin}:${margin}`;
        break;
      case 'bottomLeft':
        overlayPosition = `${margin}:main_h-overlay_h-${margin}`;
        break;
      case 'bottomRight':
        overlayPosition = `main_w-overlay_w-${margin}:main_h-overlay_h-${margin}`;
        break;
      case 'center':
        overlayPosition = '(main_w-overlay_w)/2:(main_h-overlay_h)/2';
        break;
      default:
        overlayPosition = `main_w-overlay_w-${margin}:main_h-overlay_h-${margin}`;
    }

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .input(watermarkPath)
        .complexFilter([
          `[1:v]scale=iw*${scale}:-1,format=rgba,colorchannelmixer=aa=${opacity}[watermark]`,
          `[0:v][watermark]overlay=${overlayPosition}[out]`,
        ])
        .outputOptions(['-map [out]', '-map 0:a?', '-c:v libx264', '-c:a copy'])
        .output(outputPath)
        .on('end', () => {
          logger.info('Watermark added', { inputPath, outputPath, position });
          resolve(outputPath);
        })
        .on('error', (err: Error) => {
          logger.error('Adding watermark failed:', err);
          reject(new Error(`Adding watermark failed: ${err.message}`));
        })
        .run();
    });
  }

  /**
   * Trim video to specified duration
   */
  public async trimVideo(
    inputPath: string,
    startTime: string, // e.g., '00:00:10'
    duration: number // in seconds
  ): Promise<string> {
    const available = await this.checkFfmpegAvailable();
    if (!available) {
      throw new Error('FFmpeg is not available on this system');
    }

    const outputFilename = this.generateUniqueFilename('mp4');
    const outputPath = path.join(this.tempDir, outputFilename);

    await this.ensureTempDir();

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(duration)
        .outputOptions(['-c copy']) // Copy streams without re-encoding for speed
        .output(outputPath)
        .on('end', () => {
          logger.info('Video trimmed', { inputPath, outputPath, startTime, duration });
          resolve(outputPath);
        })
        .on('error', (err: Error) => {
          logger.error('Video trimming failed:', err);
          reject(new Error(`Video trimming failed: ${err.message}`));
        })
        .run();
    });
  }

  /**
   * Concatenate multiple videos
   */
  public async concatenateVideos(inputPaths: string[]): Promise<string> {
    const available = await this.checkFfmpegAvailable();
    if (!available) {
      throw new Error('FFmpeg is not available on this system');
    }

    if (inputPaths.length < 2) {
      throw new Error('At least 2 videos are required for concatenation');
    }

    const outputFilename = this.generateUniqueFilename('mp4');
    const outputPath = path.join(this.tempDir, outputFilename);

    // Create concat file list
    const concatListPath = path.join(this.tempDir, `concat_${crypto.randomUUID()}.txt`);
    const concatContent = inputPaths.map((p) => `file '${p}'`).join('\n');
    fs.writeFileSync(concatListPath, concatContent);

    await this.ensureTempDir();

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(concatListPath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions(['-c copy'])
        .output(outputPath)
        .on('end', async () => {
          // Clean up concat list file
          try {
            await unlink(concatListPath);
          } catch {
            // Ignore cleanup errors
          }
          logger.info('Videos concatenated', { inputPaths, outputPath });
          resolve(outputPath);
        })
        .on('error', async (err: Error) => {
          // Clean up concat list file
          try {
            await unlink(concatListPath);
          } catch {
            // Ignore cleanup errors
          }
          logger.error('Video concatenation failed:', err);
          reject(new Error(`Video concatenation failed: ${err.message}`));
        })
        .run();
    });
  }

  /**
   * Convert video format
   */
  public async convertFormat(
    inputPath: string,
    targetFormat: 'mp4' | 'webm' | 'mov' | 'avi' | 'mkv'
  ): Promise<string> {
    const available = await this.checkFfmpegAvailable();
    if (!available) {
      throw new Error('FFmpeg is not available on this system');
    }

    const outputFilename = this.generateUniqueFilename(targetFormat);
    const outputPath = path.join(this.tempDir, outputFilename);

    await this.ensureTempDir();

    // Codec mappings for each format
    const formatSettings: Record<string, string[]> = {
      mp4: ['-c:v libx264', '-c:a aac', '-movflags +faststart'],
      webm: ['-c:v libvpx-vp9', '-c:a libopus'],
      mov: ['-c:v libx264', '-c:a aac'],
      avi: ['-c:v libx264', '-c:a mp3'],
      mkv: ['-c:v libx264', '-c:a aac'],
    };

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions(formatSettings[targetFormat] || ['-c copy'])
        .output(outputPath)
        .on('end', () => {
          logger.info('Video format converted', { inputPath, outputPath, targetFormat });
          resolve(outputPath);
        })
        .on('error', (err: Error) => {
          logger.error('Format conversion failed:', err);
          reject(new Error(`Format conversion failed: ${err.message}`));
        })
        .run();
    });
  }

  /**
   * Clean up temporary files
   */
  public async cleanupTempFiles(olderThanHours: number = 24): Promise<number> {
    let cleanedCount = 0;

    try {
      const files = await readdir(this.tempDir);
      const now = Date.now();
      const maxAge = olderThanHours * 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        try {
          const stats = await stat(filePath);
          if (stats.isFile() && now - stats.mtime.getTime() > maxAge) {
            await unlink(filePath);
            cleanedCount++;
          } else if (stats.isDirectory()) {
            // Recursively clean directories
            const dirFiles = await readdir(filePath);
            let dirEmpty = true;
            for (const dirFile of dirFiles) {
              const dirFilePath = path.join(filePath, dirFile);
              const dirFileStats = await stat(dirFilePath);
              if (now - dirFileStats.mtime.getTime() > maxAge) {
                await unlink(dirFilePath);
                cleanedCount++;
              } else {
                dirEmpty = false;
              }
            }
            // Remove empty directories
            if (dirEmpty && dirFiles.length > 0) {
              await rmdir(filePath);
            }
          }
        } catch (error) {
          // Ignore individual file errors
        }
      }

      logger.info('Temporary files cleaned', { cleanedCount, olderThanHours });
    } catch (error: any) {
      logger.error('Cleanup failed:', error);
    }

    return cleanedCount;
  }

  /**
   * Check if a file is a valid video
   */
  public async isValidVideo(inputPath: string): Promise<boolean> {
    try {
      const metadata = await this.getMetadata(inputPath);
      return metadata.duration > 0 && metadata.width > 0 && metadata.height > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get video duration in seconds
   */
  public async getDuration(inputPath: string): Promise<number> {
    const metadata = await this.getMetadata(inputPath);
    return metadata.duration;
  }

  /**
   * Check if video has audio
   */
  public async hasAudio(inputPath: string): Promise<boolean> {
    const metadata = await this.getMetadata(inputPath);
    return metadata.audioCodec !== undefined;
  }
}

export const videoTranscodingService = VideoTranscodingService.getInstance();
export default videoTranscodingService;
