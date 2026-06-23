import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { uploadLimiter } from '../middleware/rateLimiter';
import { upload } from '../services/storageService';
import {
  validateAvatarUpload,
  validateMultiUpload,
  validatePostUpload,
  validateReelCoverUpload,
  validateStoryUpload,
} from '../middleware/mediaValidation';
import * as uploadController from '../controllers/uploadController';

const router = Router();

// Single image upload (for posts)
router.post('/image', authenticate, uploadLimiter, upload.single('file'), validatePostUpload, uploadController.uploadImage);

// Multiple images upload
router.post(
  '/images',
  authenticate,
  uploadLimiter,
  upload.array('files', 10),
  validateMultiUpload({
    maxFiles: 10,
    maxTotalBytes: 50 * 1024 * 1024,
    allowedMimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    contentType: 'post',
  }),
  uploadController.uploadMultiple
);

// Avatar upload (square, smaller dimensions)
router.post('/avatar', authenticate, uploadLimiter, upload.single('file'), validateAvatarUpload, uploadController.uploadAvatar);

// Story upload (mobile-first, vertical optimization)
router.post('/story', authenticate, uploadLimiter, upload.single('file'), validateStoryUpload, uploadController.uploadStory);

// Reel cover upload
router.post(
  '/reel-cover',
  authenticate,
  uploadLimiter,
  upload.single('file'),
  validateReelCoverUpload,
  uploadController.uploadReelCover
);

export default router;
