import sharp from 'sharp';
import logger from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

interface ImageOptimizationOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
  generateThumbnail?: boolean;
  thumbnailSize?: number;
}

export async function optimizeImage(
  inputPath: string,
  outputPath: string,
  options: ImageOptimizationOptions = {}
): Promise<string> {
  const {
    width = 1920,
    height = 1920,
    quality = 85,
    format = 'jpeg',
    generateThumbnail = false,
    thumbnailSize = 300,
  } = options;

  try {
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Optimize main image
    const image = sharp(inputPath);
    const metadata = await image.metadata();

    // Resize if needed
    if (metadata.width && metadata.width > width) {
      image.resize(width, height, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    // Convert and optimize
    let optimizedImage = image;
    if (format === 'webp') {
      optimizedImage = image.webp({ quality });
    } else if (format === 'png') {
      optimizedImage = image.png({ quality, compressionLevel: 9 });
    } else {
      optimizedImage = image.jpeg({ quality, mozjpeg: true });
    }

    await optimizedImage.toFile(outputPath);

    // Generate thumbnail if requested
    if (generateThumbnail) {
      const thumbnailPath = outputPath.replace(
        path.extname(outputPath),
        `_thumb${path.extname(outputPath)}`
      );
      
      await sharp(inputPath)
        .resize(thumbnailSize, thumbnailSize, {
          fit: 'cover',
          position: 'center',
        })
        .jpeg({ quality: 75, mozjpeg: true })
        .toFile(thumbnailPath);

      logger.info('Thumbnail generated', { thumbnailPath });
    }

    logger.info('Image optimized', {
      input: inputPath,
      output: outputPath,
      format,
      quality,
    });

    return outputPath;
  } catch (error: any) {
    logger.error('Image optimization failed:', error);
    throw new Error(`Image optimization failed: ${error.message}`);
  }
}

export async function generateThumbnail(
  inputPath: string,
  outputPath: string,
  size: number = 300
): Promise<string> {
  try {
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    await sharp(inputPath)
      .resize(size, size, {
        fit: 'cover',
        position: 'center',
      })
      .jpeg({ quality: 75, mozjpeg: true })
      .toFile(outputPath);

    return outputPath;
  } catch (error: any) {
    logger.error('Thumbnail generation failed:', error);
    throw new Error(`Thumbnail generation failed: ${error.message}`);
  }
}

export async function compressImage(
  inputPath: string,
  outputPath: string,
  quality: number = 85
): Promise<string> {
  try {
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    await sharp(inputPath)
      .jpeg({ quality, mozjpeg: true })
      .toFile(outputPath);

    return outputPath;
  } catch (error: any) {
    logger.error('Image compression failed:', error);
    throw new Error(`Image compression failed: ${error.message}`);
  }
}

