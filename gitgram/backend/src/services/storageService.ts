import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import imageOptimizationService, { ProcessedImageSet } from './imageOptimizationService';
import logger from '../utils/logger';

// Storage configuration
const STORAGE_TYPE = process.env.STORAGE_TYPE || 'local'; // 'local' or 's3'
const S3_BUCKET = process.env.AWS_S3_BUCKET || '';
const S3_REGION = process.env.AWS_REGION || 'us-east-1';
const CDN_URL = process.env.CDN_URL || '';
const ENABLE_IMAGE_OPTIMIZATION = process.env.ENABLE_IMAGE_OPTIMIZATION !== 'false';
const ENABLE_WEBP = process.env.ENABLE_WEBP !== 'false';

// Initialize S3 client if using S3
let s3Client: S3Client | null = null;
if (STORAGE_TYPE === 's3') {
  s3Client = new S3Client({
    region: S3_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });
}

// Local storage directory
const uploadDir = path.join(__dirname, '../../uploads');
if (STORAGE_TYPE === 'local' && !fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Generate unique filename
const generateFileName = (originalName: string): string => {
  const ext = path.extname(originalName);
  const randomName = crypto.randomBytes(16).toString('hex');
  return `${randomName}${ext}`;
};

// Multer configuration
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|webm|code/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || file.mimetype.startsWith('text/');
    
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
});

// Helper to save buffer to storage
const saveBuffer = async (
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> => {
  if (STORAGE_TYPE === 's3' && s3Client) {
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: 'public-read',
      CacheControl: 'max-age=31536000', // 1 year cache for optimized images
    });

    await s3Client.send(command);

    if (CDN_URL) {
      return `${CDN_URL}/${key}`;
    }
    return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
  } else {
    const filePath = path.join(uploadDir, key);
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, buffer);
    return `/uploads/${key}`;
  }
};

// Upload file to storage (legacy, without optimization)
export const uploadMedia = async (file: Express.Multer.File, folder: string = 'media'): Promise<string> => {
  const fileName = generateFileName(file.originalname);
  const key = `${folder}/${fileName}`;

  if (STORAGE_TYPE === 's3' && s3Client) {
    // Upload to S3
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: 'public-read',
    });

    await s3Client.send(command);

    // Return CDN URL or S3 URL
    if (CDN_URL) {
      return `${CDN_URL}/${key}`;
    }
    return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
  } else {
    // Local storage
    const filePath = path.join(uploadDir, key);
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, file.buffer);
    return `/uploads/${key}`;
  }
};

// Image upload result interface
export interface OptimizedUploadResult {
  url: string;
  thumbnailUrl?: string;
  webpUrl?: string;
  thumbnailWebpUrl?: string;
  width: number;
  height: number;
  size: number;
  originalSize: number;
  format: string;
  compressionRatio: number;
}

/**
 * Upload and optimize an image for posts
 */
export const uploadPostImage = async (
  file: Express.Multer.File,
  folder: string = 'posts'
): Promise<OptimizedUploadResult> => {
  const isImage = file.mimetype.startsWith('image/');

  if (!isImage || !ENABLE_IMAGE_OPTIMIZATION) {
    // Non-image or optimization disabled - upload as-is
    const url = await uploadMedia(file, folder);
    return {
      url,
      width: 0,
      height: 0,
      size: file.buffer.length,
      originalSize: file.buffer.length,
      format: path.extname(file.originalname).slice(1),
      compressionRatio: 0,
    };
  }

  try {
    const processed = await imageOptimizationService.processPost(file.buffer);
    return await saveProcessedImages(processed, folder, 'post');
  } catch (error) {
    logger.error('Post image optimization failed, uploading original:', error);
    const url = await uploadMedia(file, folder);
    return {
      url,
      width: 0,
      height: 0,
      size: file.buffer.length,
      originalSize: file.buffer.length,
      format: path.extname(file.originalname).slice(1),
      compressionRatio: 0,
    };
  }
};

/**
 * Upload and optimize an image for stories
 */
export const uploadStoryImage = async (
  file: Express.Multer.File,
  folder: string = 'stories'
): Promise<OptimizedUploadResult> => {
  const isImage = file.mimetype.startsWith('image/');

  if (!isImage || !ENABLE_IMAGE_OPTIMIZATION) {
    const url = await uploadMedia(file, folder);
    return {
      url,
      width: 0,
      height: 0,
      size: file.buffer.length,
      originalSize: file.buffer.length,
      format: path.extname(file.originalname).slice(1),
      compressionRatio: 0,
    };
  }

  try {
    const processed = await imageOptimizationService.processStory(file.buffer);
    return await saveProcessedImages(processed, folder, 'story');
  } catch (error) {
    logger.error('Story image optimization failed, uploading original:', error);
    const url = await uploadMedia(file, folder);
    return {
      url,
      width: 0,
      height: 0,
      size: file.buffer.length,
      originalSize: file.buffer.length,
      format: path.extname(file.originalname).slice(1),
      compressionRatio: 0,
    };
  }
};

/**
 * Upload and optimize an avatar image
 */
export const uploadAvatarImage = async (
  file: Express.Multer.File,
  folder: string = 'avatars'
): Promise<OptimizedUploadResult> => {
  const isImage = file.mimetype.startsWith('image/');

  if (!isImage || !ENABLE_IMAGE_OPTIMIZATION) {
    const url = await uploadMedia(file, folder);
    return {
      url,
      width: 0,
      height: 0,
      size: file.buffer.length,
      originalSize: file.buffer.length,
      format: path.extname(file.originalname).slice(1),
      compressionRatio: 0,
    };
  }

  try {
    const processed = await imageOptimizationService.processAvatar(file.buffer);
    return await saveProcessedImages(processed, folder, 'avatar');
  } catch (error) {
    logger.error('Avatar image optimization failed, uploading original:', error);
    const url = await uploadMedia(file, folder);
    return {
      url,
      width: 0,
      height: 0,
      size: file.buffer.length,
      originalSize: file.buffer.length,
      format: path.extname(file.originalname).slice(1),
      compressionRatio: 0,
    };
  }
};

/**
 * Upload and optimize a reel cover image
 */
export const uploadReelImage = async (
  file: Express.Multer.File,
  folder: string = 'reels'
): Promise<OptimizedUploadResult> => {
  const isImage = file.mimetype.startsWith('image/');

  if (!isImage || !ENABLE_IMAGE_OPTIMIZATION) {
    const url = await uploadMedia(file, folder);
    return {
      url,
      width: 0,
      height: 0,
      size: file.buffer.length,
      originalSize: file.buffer.length,
      format: path.extname(file.originalname).slice(1),
      compressionRatio: 0,
    };
  }

  try {
    const processed = await imageOptimizationService.processReel(file.buffer);
    return await saveProcessedImages(processed, folder, 'reel');
  } catch (error) {
    logger.error('Reel image optimization failed, uploading original:', error);
    const url = await uploadMedia(file, folder);
    return {
      url,
      width: 0,
      height: 0,
      size: file.buffer.length,
      originalSize: file.buffer.length,
      format: path.extname(file.originalname).slice(1),
      compressionRatio: 0,
    };
  }
};

/**
 * Save processed images (original, thumbnail, WebP variants) to storage
 */
const saveProcessedImages = async (
  processed: ProcessedImageSet,
  folder: string,
  prefix: string
): Promise<OptimizedUploadResult> => {
  const baseId = crypto.randomBytes(16).toString('hex');

  // Determine content types
  const jpegType = 'image/jpeg';
  const webpType = 'image/webp';

  // Save all variants in parallel
  const savePromises: Promise<{ key: string; url: string }>[] = [];

  // Original (optimized)
  const originalKey = `${folder}/${prefix}-${baseId}.jpg`;
  savePromises.push(
    saveBuffer(processed.original.buffer, originalKey, jpegType).then((url) => ({
      key: 'original',
      url,
    }))
  );

  // Thumbnail
  if (processed.thumbnail) {
    const thumbKey = `${folder}/thumb-${prefix}-${baseId}.jpg`;
    savePromises.push(
      saveBuffer(processed.thumbnail.buffer, thumbKey, jpegType).then((url) => ({
        key: 'thumbnail',
        url,
      }))
    );
  }

  // WebP versions (if enabled and generated)
  if (ENABLE_WEBP && processed.webp) {
    const webpKey = `${folder}/${prefix}-${baseId}.webp`;
    savePromises.push(
      saveBuffer(processed.webp.buffer, webpKey, webpType).then((url) => ({
        key: 'webp',
        url,
      }))
    );
  }

  if (ENABLE_WEBP && processed.thumbnailWebp) {
    const thumbWebpKey = `${folder}/thumb-${prefix}-${baseId}.webp`;
    savePromises.push(
      saveBuffer(processed.thumbnailWebp.buffer, thumbWebpKey, webpType).then((url) => ({
        key: 'thumbnailWebp',
        url,
      }))
    );
  }

  const results = await Promise.all(savePromises);

  // Build result object
  const urlMap: Record<string, string> = {};
  results.forEach(({ key, url }) => {
    urlMap[key] = url;
  });

  logger.info('Processed images saved', {
    folder,
    prefix,
    variants: Object.keys(urlMap),
    originalSize: processed.original.originalSize,
    optimizedSize: processed.original.size,
    compressionRatio: processed.original.compressionRatio,
  });

  return {
    url: urlMap.original,
    thumbnailUrl: urlMap.thumbnail,
    webpUrl: urlMap.webp,
    thumbnailWebpUrl: urlMap.thumbnailWebp,
    width: processed.original.width,
    height: processed.original.height,
    size: processed.original.size,
    originalSize: processed.original.originalSize,
    format: processed.original.format,
    compressionRatio: processed.original.compressionRatio,
  };
};

/**
 * Upload multiple images with optimization
 */
export const uploadMultipleImages = async (
  files: Express.Multer.File[],
  type: 'post' | 'story' | 'avatar' | 'reel' = 'post',
  folder?: string
): Promise<OptimizedUploadResult[]> => {
  const uploadFn = {
    post: uploadPostImage,
    story: uploadStoryImage,
    avatar: uploadAvatarImage,
    reel: uploadReelImage,
  }[type];

  const folderName = folder || `${type}s`;

  const results = await Promise.all(
    files.map((file) => uploadFn(file, folderName))
  );

  return results;
};

// Delete file from storage
export const deleteMedia = async (fileUrl: string): Promise<void> => {
  if (STORAGE_TYPE === 's3' && s3Client) {
    // Extract key from URL
    let key = fileUrl;
    if (fileUrl.includes('.amazonaws.com/')) {
      key = fileUrl.split('.amazonaws.com/')[1];
    } else if (CDN_URL && fileUrl.startsWith(CDN_URL)) {
      key = fileUrl.replace(CDN_URL + '/', '');
    }

    const command = new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });

    await s3Client.send(command);
  } else {
    // Local storage
    const filePath = path.join(__dirname, '../../', fileUrl);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
};

// Get signed URL for private files (optional)
export const getSignedMediaUrl = async (key: string, expiresIn: number = 3600): Promise<string> => {
  if (STORAGE_TYPE === 's3' && s3Client) {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });

    return await getSignedUrl(s3Client, command, { expiresIn });
  }

  // For local storage, return public URL
  return `/uploads/${key}`;
};

// Get public URL
export const getMediaUrl = (key: string): string => {
  if (STORAGE_TYPE === 's3') {
    if (CDN_URL) {
      return `${CDN_URL}/${key}`;
    }
    return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
  }
  return `/uploads/${key}`;
};

