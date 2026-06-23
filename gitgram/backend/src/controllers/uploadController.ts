import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  uploadPostImage,
  uploadStoryImage,
  uploadAvatarImage,
  uploadReelImage,
  uploadMedia,
  uploadMultipleImages,
} from '../services/storageService';
import logger from '../utils/logger';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

/**
 * Upload a single image for posts (with optimization)
 */
export const uploadImage = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw Errors.badRequest('No file uploaded');
  }

  const isImage = req.file.mimetype.startsWith('image/');

  if (isImage) {
    const result = await uploadPostImage(req.file);

    res.json({
      url: result.url,
      thumbnail: result.thumbnailUrl,
      webp: result.webpUrl,
      thumbnailWebp: result.thumbnailWebpUrl,
      width: result.width,
      height: result.height,
      size: result.size,
      originalSize: result.originalSize,
      format: result.format,
      compressionRatio: result.compressionRatio,
    });
  } else {
    // Non-image file (video) - upload without optimization
    const url = await uploadMedia(req.file, 'media');
    res.json({
      url,
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  }
});

/**
 * Upload multiple images/files
 */
export const uploadMultiple = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
    throw Errors.badRequest('No files uploaded');
  }

  const type = (req.query.type as 'post' | 'story' | 'reel') || 'post';
  const imageFiles = req.files.filter((f) => f.mimetype.startsWith('image/'));
  const videoFiles = req.files.filter((f) => !f.mimetype.startsWith('image/'));

  const results: any[] = [];

  // Process images with optimization
  if (imageFiles.length > 0) {
    const optimizedImages = await uploadMultipleImages(imageFiles, type);
    results.push(
      ...optimizedImages.map((r) => ({
        url: r.url,
        thumbnail: r.thumbnailUrl,
        webp: r.webpUrl,
        thumbnailWebp: r.thumbnailWebpUrl,
        width: r.width,
        height: r.height,
        size: r.size,
        originalSize: r.originalSize,
        format: r.format,
        compressionRatio: r.compressionRatio,
        type: 'image',
      }))
    );
  }

  // Process videos without optimization
  for (const file of videoFiles) {
    const url = await uploadMedia(file, `${type}s`);
    results.push({
      url,
      filename: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      type: 'video',
    });
  }

  res.json({ files: results });
});

/**
 * Upload avatar image with optimization
 */
export const uploadAvatar = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw Errors.badRequest('No file uploaded');
  }

  if (!req.file.mimetype.startsWith('image/')) {
    throw Errors.badRequest('Avatar must be an image');
  }

  const result = await uploadAvatarImage(req.file);

  res.json({
    url: result.url,
    thumbnail: result.thumbnailUrl,
    webp: result.webpUrl,
    thumbnailWebp: result.thumbnailWebpUrl,
    width: result.width,
    height: result.height,
    size: result.size,
    originalSize: result.originalSize,
    compressionRatio: result.compressionRatio,
  });
});

/**
 * Upload story image with mobile-first optimization
 */
export const uploadStory = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw Errors.badRequest('No file uploaded');
  }

  const isImage = req.file.mimetype.startsWith('image/');

  if (isImage) {
    const result = await uploadStoryImage(req.file);

    res.json({
      url: result.url,
      thumbnail: result.thumbnailUrl,
      webp: result.webpUrl,
      thumbnailWebp: result.thumbnailWebpUrl,
      width: result.width,
      height: result.height,
      size: result.size,
      originalSize: result.originalSize,
      format: result.format,
      compressionRatio: result.compressionRatio,
      mediaType: 'image',
    });
  } else {
    // Video story - upload without optimization
    const url = await uploadMedia(req.file, 'stories');
    res.json({
      url,
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      mediaType: 'video',
    });
  }
});

/**
 * Upload reel cover/thumbnail image
 */
export const uploadReelCover = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw Errors.badRequest('No file uploaded');
  }

  if (!req.file.mimetype.startsWith('image/')) {
    throw Errors.badRequest('Reel cover must be an image');
  }

  const result = await uploadReelImage(req.file);

  res.json({
    url: result.url,
    thumbnail: result.thumbnailUrl,
    webp: result.webpUrl,
    thumbnailWebp: result.thumbnailWebpUrl,
    width: result.width,
    height: result.height,
    size: result.size,
    originalSize: result.originalSize,
    compressionRatio: result.compressionRatio,
  });
});
