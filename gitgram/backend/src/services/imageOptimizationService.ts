import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import logger from '../utils/logger';

// Image optimization configuration
export interface ImageOptimizationConfig {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  format: 'jpeg' | 'png' | 'webp' | 'original';
  progressive: boolean;
}

export interface ThumbnailConfig {
  width: number;
  height: number;
  quality: number;
  fit: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
}

export interface OptimizedImageResult {
  buffer: Buffer;
  width: number;
  height: number;
  format: string;
  size: number;
  originalSize: number;
  compressionRatio: number;
}

export interface ProcessedImageSet {
  original: OptimizedImageResult;
  thumbnail?: OptimizedImageResult;
  webp?: OptimizedImageResult;
  thumbnailWebp?: OptimizedImageResult;
}

// Default configurations for different use cases
export const IMAGE_CONFIGS = {
  // Post images - high quality, larger size
  post: {
    maxWidth: 1920,
    maxHeight: 1920,
    quality: 85,
    format: 'jpeg' as const,
    progressive: true,
  },
  // Story images - optimized for mobile, vertical
  story: {
    maxWidth: 1080,
    maxHeight: 1920,
    quality: 80,
    format: 'jpeg' as const,
    progressive: true,
  },
  // Avatar/profile images - small, square
  avatar: {
    maxWidth: 400,
    maxHeight: 400,
    quality: 85,
    format: 'jpeg' as const,
    progressive: true,
  },
  // Reel cover images
  reel: {
    maxWidth: 1080,
    maxHeight: 1920,
    quality: 80,
    format: 'jpeg' as const,
    progressive: true,
  },
};

// Thumbnail configurations
export const THUMBNAIL_CONFIGS = {
  // Feed thumbnail - square for grid view
  feed: {
    width: 400,
    height: 400,
    quality: 75,
    fit: 'cover' as const,
  },
  // Small thumbnail for lists/previews
  small: {
    width: 150,
    height: 150,
    quality: 70,
    fit: 'cover' as const,
  },
  // Medium thumbnail for cards
  medium: {
    width: 300,
    height: 300,
    quality: 75,
    fit: 'cover' as const,
  },
  // Avatar thumbnail
  avatar: {
    width: 100,
    height: 100,
    quality: 80,
    fit: 'cover' as const,
  },
};

class ImageOptimizationService {
  private static instance: ImageOptimizationService;

  private constructor() {}

  public static getInstance(): ImageOptimizationService {
    if (!ImageOptimizationService.instance) {
      ImageOptimizationService.instance = new ImageOptimizationService();
    }
    return ImageOptimizationService.instance;
  }

  /**
   * Check if a file is an image based on mimetype
   */
  public isImage(mimetype: string): boolean {
    return mimetype.startsWith('image/');
  }

  /**
   * Check if browser supports WebP (based on Accept header)
   */
  public supportsWebP(acceptHeader?: string): boolean {
    if (!acceptHeader) return false;
    return acceptHeader.includes('image/webp');
  }

  /**
   * Get image metadata
   */
  public async getMetadata(input: Buffer | string): Promise<sharp.Metadata> {
    try {
      return await sharp(input).metadata();
    } catch (error: any) {
      logger.error('Failed to get image metadata:', error);
      throw new Error(`Failed to read image metadata: ${error.message}`);
    }
  }

  /**
   * Optimize a single image with the given configuration
   */
  public async optimizeImage(
    input: Buffer | string,
    config: Partial<ImageOptimizationConfig> = {}
  ): Promise<OptimizedImageResult> {
    const options: ImageOptimizationConfig = {
      maxWidth: config.maxWidth ?? 1920,
      maxHeight: config.maxHeight ?? 1920,
      quality: config.quality ?? 85,
      format: config.format ?? 'jpeg',
      progressive: config.progressive ?? true,
    };

    try {
      const inputBuffer = typeof input === 'string'
        ? fs.readFileSync(input)
        : input;
      const originalSize = inputBuffer.length;

      let pipeline = sharp(inputBuffer);
      const metadata = await pipeline.metadata();

      // Rotate based on EXIF orientation
      pipeline = pipeline.rotate();

      // Resize if image exceeds max dimensions
      if (
        (metadata.width && metadata.width > options.maxWidth) ||
        (metadata.height && metadata.height > options.maxHeight)
      ) {
        pipeline = pipeline.resize(options.maxWidth, options.maxHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      // Apply format-specific optimizations
      switch (options.format) {
        case 'webp':
          pipeline = pipeline.webp({
            quality: options.quality,
            effort: 4, // Balance between speed and compression
            smartSubsample: true,
          });
          break;
        case 'png':
          pipeline = pipeline.png({
            quality: options.quality,
            compressionLevel: 9,
            progressive: options.progressive,
          });
          break;
        case 'original':
          // Keep original format but still optimize
          if (metadata.format === 'png') {
            pipeline = pipeline.png({
              quality: options.quality,
              compressionLevel: 9,
            });
          } else if (metadata.format === 'webp') {
            pipeline = pipeline.webp({ quality: options.quality });
          } else {
            pipeline = pipeline.jpeg({
              quality: options.quality,
              mozjpeg: true,
              progressive: options.progressive,
            });
          }
          break;
        case 'jpeg':
        default:
          pipeline = pipeline.jpeg({
            quality: options.quality,
            mozjpeg: true, // Use MozJPEG encoder for better compression
            progressive: options.progressive,
          });
          break;
      }

      const outputBuffer = await pipeline.toBuffer();
      const outputMetadata = await sharp(outputBuffer).metadata();

      const result: OptimizedImageResult = {
        buffer: outputBuffer,
        width: outputMetadata.width || 0,
        height: outputMetadata.height || 0,
        format: outputMetadata.format || options.format,
        size: outputBuffer.length,
        originalSize,
        compressionRatio: originalSize > 0
          ? Math.round((1 - outputBuffer.length / originalSize) * 100)
          : 0,
      };

      logger.debug('Image optimized', {
        originalSize,
        optimizedSize: result.size,
        compressionRatio: `${result.compressionRatio}%`,
        dimensions: `${result.width}x${result.height}`,
        format: result.format,
      });

      return result;
    } catch (error: any) {
      logger.error('Image optimization failed:', error);
      throw new Error(`Image optimization failed: ${error.message}`);
    }
  }

  /**
   * Generate a thumbnail from an image
   */
  public async generateThumbnail(
    input: Buffer | string,
    config: Partial<ThumbnailConfig> = {}
  ): Promise<OptimizedImageResult> {
    const options: ThumbnailConfig = {
      width: config.width ?? 400,
      height: config.height ?? 400,
      quality: config.quality ?? 75,
      fit: config.fit ?? 'cover',
    };

    try {
      const inputBuffer = typeof input === 'string'
        ? fs.readFileSync(input)
        : input;
      const originalSize = inputBuffer.length;

      const pipeline = sharp(inputBuffer)
        .rotate() // Auto-rotate based on EXIF
        .resize(options.width, options.height, {
          fit: options.fit,
          position: 'attention', // Smart cropping using attention detection
        })
        .jpeg({
          quality: options.quality,
          mozjpeg: true,
          progressive: true,
        });

      const outputBuffer = await pipeline.toBuffer();
      const metadata = await sharp(outputBuffer).metadata();

      return {
        buffer: outputBuffer,
        width: metadata.width || options.width,
        height: metadata.height || options.height,
        format: 'jpeg',
        size: outputBuffer.length,
        originalSize,
        compressionRatio: Math.round((1 - outputBuffer.length / originalSize) * 100),
      };
    } catch (error: any) {
      logger.error('Thumbnail generation failed:', error);
      throw new Error(`Thumbnail generation failed: ${error.message}`);
    }
  }

  /**
   * Convert image to WebP format
   */
  public async convertToWebP(
    input: Buffer | string,
    quality: number = 80
  ): Promise<OptimizedImageResult> {
    try {
      const inputBuffer = typeof input === 'string'
        ? fs.readFileSync(input)
        : input;
      const originalSize = inputBuffer.length;

      const pipeline = sharp(inputBuffer)
        .rotate()
        .webp({
          quality,
          effort: 4,
          smartSubsample: true,
          nearLossless: quality > 90,
        });

      const outputBuffer = await pipeline.toBuffer();
      const metadata = await sharp(outputBuffer).metadata();

      return {
        buffer: outputBuffer,
        width: metadata.width || 0,
        height: metadata.height || 0,
        format: 'webp',
        size: outputBuffer.length,
        originalSize,
        compressionRatio: Math.round((1 - outputBuffer.length / originalSize) * 100),
      };
    } catch (error: any) {
      logger.error('WebP conversion failed:', error);
      throw new Error(`WebP conversion failed: ${error.message}`);
    }
  }

  /**
   * Process an image for a specific use case (post, story, avatar, reel)
   * Returns optimized original, thumbnail, and optional WebP versions
   */
  public async processImage(
    input: Buffer | string,
    type: 'post' | 'story' | 'avatar' | 'reel' = 'post',
    options: {
      generateThumbnail?: boolean;
      generateWebP?: boolean;
      thumbnailConfig?: Partial<ThumbnailConfig>;
    } = {}
  ): Promise<ProcessedImageSet> {
    const {
      generateThumbnail = true,
      generateWebP = true,
      thumbnailConfig,
    } = options;

    const imageConfig = IMAGE_CONFIGS[type];
    const thumbConfig = thumbnailConfig || THUMBNAIL_CONFIGS[type === 'avatar' ? 'avatar' : 'feed'];

    try {
      const inputBuffer = typeof input === 'string'
        ? fs.readFileSync(input)
        : input;

      // Process in parallel for better performance
      const promises: Promise<OptimizedImageResult>[] = [
        this.optimizeImage(inputBuffer, imageConfig),
      ];

      if (generateThumbnail) {
        promises.push(this.generateThumbnail(inputBuffer, thumbConfig));
      }

      const results = await Promise.all(promises);
      const [original, thumbnail] = results;

      const processedSet: ProcessedImageSet = {
        original,
        thumbnail,
      };

      // Generate WebP versions if requested
      if (generateWebP) {
        const webpPromises: Promise<OptimizedImageResult>[] = [
          this.convertToWebP(original.buffer, imageConfig.quality),
        ];

        if (thumbnail) {
          webpPromises.push(this.convertToWebP(thumbnail.buffer, thumbConfig.quality));
        }

        const webpResults = await Promise.all(webpPromises);
        processedSet.webp = webpResults[0];
        if (webpResults[1]) {
          processedSet.thumbnailWebp = webpResults[1];
        }
      }

      logger.info('Image processed successfully', {
        type,
        originalSize: processedSet.original.originalSize,
        optimizedSize: processedSet.original.size,
        thumbnailSize: processedSet.thumbnail?.size,
        webpSize: processedSet.webp?.size,
      });

      return processedSet;
    } catch (error: any) {
      logger.error('Image processing failed:', error);
      throw new Error(`Image processing failed: ${error.message}`);
    }
  }

  /**
   * Process avatar image with specific optimizations
   */
  public async processAvatar(input: Buffer | string): Promise<ProcessedImageSet> {
    return this.processImage(input, 'avatar', {
      generateThumbnail: true,
      generateWebP: true,
      thumbnailConfig: THUMBNAIL_CONFIGS.avatar,
    });
  }

  /**
   * Process story image with mobile-first optimizations
   */
  public async processStory(input: Buffer | string): Promise<ProcessedImageSet> {
    return this.processImage(input, 'story', {
      generateThumbnail: true,
      generateWebP: true,
      thumbnailConfig: THUMBNAIL_CONFIGS.small,
    });
  }

  /**
   * Process post image with high quality settings
   */
  public async processPost(input: Buffer | string): Promise<ProcessedImageSet> {
    return this.processImage(input, 'post', {
      generateThumbnail: true,
      generateWebP: true,
      thumbnailConfig: THUMBNAIL_CONFIGS.feed,
    });
  }

  /**
   * Process reel cover image
   */
  public async processReel(input: Buffer | string): Promise<ProcessedImageSet> {
    return this.processImage(input, 'reel', {
      generateThumbnail: true,
      generateWebP: true,
      thumbnailConfig: THUMBNAIL_CONFIGS.medium,
    });
  }

  /**
   * Batch process multiple images
   */
  public async batchProcess(
    inputs: (Buffer | string)[],
    type: 'post' | 'story' | 'avatar' | 'reel' = 'post',
    options?: {
      generateThumbnail?: boolean;
      generateWebP?: boolean;
    }
  ): Promise<ProcessedImageSet[]> {
    const results = await Promise.all(
      inputs.map((input) => this.processImage(input, type, options))
    );
    return results;
  }

  /**
   * Get optimized image dimensions maintaining aspect ratio
   */
  public calculateDimensions(
    originalWidth: number,
    originalHeight: number,
    maxWidth: number,
    maxHeight: number
  ): { width: number; height: number } {
    if (originalWidth <= maxWidth && originalHeight <= maxHeight) {
      return { width: originalWidth, height: originalHeight };
    }

    const widthRatio = maxWidth / originalWidth;
    const heightRatio = maxHeight / originalHeight;
    const ratio = Math.min(widthRatio, heightRatio);

    return {
      width: Math.round(originalWidth * ratio),
      height: Math.round(originalHeight * ratio),
    };
  }

  /**
   * Estimate file size after optimization (rough estimate)
   */
  public estimateOptimizedSize(
    originalSize: number,
    format: 'jpeg' | 'webp' | 'png',
    quality: number
  ): number {
    // Rough estimates based on format and quality
    const qualityFactor = quality / 100;

    switch (format) {
      case 'webp':
        // WebP typically achieves 25-35% smaller files than JPEG
        return Math.round(originalSize * qualityFactor * 0.3);
      case 'png':
        // PNG compression varies widely
        return Math.round(originalSize * 0.7);
      case 'jpeg':
      default:
        return Math.round(originalSize * qualityFactor * 0.4);
    }
  }
}

export const imageOptimizationService = ImageOptimizationService.getInstance();
export default imageOptimizationService;
