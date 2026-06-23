import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import sharp from 'sharp';
import crypto from 'crypto';
import logger from '../utils/logger';

const MB = 1024 * 1024;

// ============================================
// Magic byte signatures for file type verification
// ============================================

const MAGIC_BYTES: Record<string, { offset: number; bytes: number[] }[]> = {
  // Images
  'image/jpeg': [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  'image/png': [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  'image/gif': [
    { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] }, // GIF87a
    { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] }, // GIF89a
  ],
  'image/webp': [
    { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF header (WebP starts with RIFF....WEBP)
  ],
  // Videos
  'video/mp4': [
    { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }, // ftyp
  ],
  'video/quicktime': [
    { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }, // ftyp (MOV uses same container)
  ],
  'video/webm': [
    { offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] }, // EBML header
  ],
};

// Strict allowed MIME types
const ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

const ALLOWED_VIDEO_MIMES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
];

const ALLOWED_ALL_MIMES = [...ALLOWED_IMAGE_MIMES, ...ALLOWED_VIDEO_MIMES];

// ============================================
// Size limits
// ============================================

const SIZE_LIMITS = {
  image: 10 * MB,    // 10MB for images
  video: 100 * MB,   // 100MB for videos
  story: 50 * MB,    // 50MB for story media
};

// ============================================
// Dimension & duration limits
// ============================================

const MAX_IMAGE_DIMENSION = 8192; // 8192x8192

const DURATION_LIMITS = {
  reel: 90,      // 90 seconds
  story: 30,     // 30 seconds
  post: 600,     // 10 minutes
};

// ============================================
// SVG sanitization patterns
// ============================================

const SVG_DANGEROUS_PATTERNS = [
  /<script[\s>]/i,
  /on\w+\s*=/i, // onclick=, onload=, onerror=, etc.
  /javascript:/i,
  /data:text\/html/i,
  /data:application/i,
  /<iframe/i,
  /<object/i,
  /<embed/i,
  /<applet/i,
  /<meta/i,
  /<link/i,
  /<import/i,
  /xlink:href\s*=\s*["'](?!#)/i, // External xlink references
  /xmlns:xlink/i, // Allow xlink namespace but check for suspicious patterns below
  /eval\s*\(/i,
  /expression\s*\(/i,
  /url\s*\(\s*["']?\s*javascript:/i,
  /-moz-binding/i,
  /behavior\s*:/i,
];

// Suspicious metadata patterns (embedded scripts in EXIF, etc.)
const SUSPICIOUS_METADATA_PATTERNS = [
  /<script/i,
  /javascript:/i,
  /<\?php/i,
  /<%/,   // ASP tags
  /eval\s*\(/i,
  /document\./i,
  /window\./i,
  /\.constructor/i,
];

// ============================================
// Core validation functions
// ============================================

/**
 * Verify file content matches its claimed MIME type using magic bytes.
 */
function verifyMagicBytes(buffer: Buffer, claimedMime: string): boolean {
  const signatures = MAGIC_BYTES[claimedMime];
  if (!signatures) {
    // No signature to verify (e.g., text/plain)
    return false;
  }

  return signatures.some((sig) => {
    if (buffer.length < sig.offset + sig.bytes.length) return false;
    return sig.bytes.every((byte, i) => buffer[sig.offset + i] === byte);
  });
}

/**
 * Detect actual MIME type from buffer magic bytes.
 */
function detectMimeFromBuffer(buffer: Buffer): string | null {
  for (const [mime, signatures] of Object.entries(MAGIC_BYTES)) {
    const match = signatures.some((sig) => {
      if (buffer.length < sig.offset + sig.bytes.length) return false;
      return sig.bytes.every((byte, i) => buffer[sig.offset + i] === byte);
    });
    if (match) return mime;
  }
  return null;
}

/**
 * Check buffer for suspicious embedded content.
 */
function hasSuspiciousMetadata(buffer: Buffer): boolean {
  // Convert first 64KB to string to check for embedded scripts
  const headerStr = buffer.subarray(0, Math.min(buffer.length, 65536)).toString('latin1');
  return SUSPICIOUS_METADATA_PATTERNS.some((pattern) => pattern.test(headerStr));
}

/**
 * Sanitize SVG content by stripping dangerous elements.
 */
function isSvgSafe(buffer: Buffer): { safe: boolean; reason?: string } {
  const svgContent = buffer.toString('utf-8');

  for (const pattern of SVG_DANGEROUS_PATTERNS) {
    if (pattern.test(svgContent)) {
      return { safe: false, reason: `SVG contains dangerous pattern: ${pattern.source}` };
    }
  }

  return { safe: true };
}

/**
 * Compute SHA-256 hash of a buffer.
 */
export function computeFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Validate image dimensions using sharp.
 */
async function validateImageDimensions(
  buffer: Buffer,
  maxWidth: number = MAX_IMAGE_DIMENSION,
  maxHeight: number = MAX_IMAGE_DIMENSION
): Promise<{ valid: boolean; width?: number; height?: number; reason?: string }> {
  try {
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    if (width > maxWidth || height > maxHeight) {
      return {
        valid: false,
        width,
        height,
        reason: `Image dimensions ${width}x${height} exceed maximum ${maxWidth}x${maxHeight}`,
      };
    }

    if (width === 0 || height === 0) {
      return { valid: false, reason: 'Could not determine image dimensions' };
    }

    return { valid: true, width, height };
  } catch (error: any) {
    return { valid: false, reason: `Failed to read image metadata: ${error.message}` };
  }
}

// ============================================
// Hardened validation middleware
// ============================================

interface HardenedValidationOptions {
  required?: boolean;
  allowedMimes: string[];
  maxBytes: number;
  mediaCategory: 'image' | 'video' | 'any';
  contentType?: 'post' | 'reel' | 'story'; // For duration limits
  maxDuration?: number; // Override duration limit in seconds
}

interface ValidationSuccess {
  metadata?: Record<string, unknown>;
  fileHash: string;
}

function validateSingleFileBuffer(
  file: Express.Multer.File,
  options: HardenedValidationOptions,
  userId?: string
): { ok: true; value: ValidationSuccess } | { ok: false; message: string } {
  const buffer = file.buffer;
  if (!buffer || buffer.length === 0) {
    return { ok: false, message: 'Empty file uploaded' };
  }

  // 1. Strict MIME type validation
  const isAllowedMime = options.allowedMimes.includes(file.mimetype);
  if (!isAllowedMime) {
    logger.warn('Upload rejected: disallowed MIME type', {
      mimetype: file.mimetype,
      allowed: options.allowedMimes,
      userId,
    });
    return {
      ok: false,
      message: `File type '${file.mimetype}' is not allowed. Accepted types: ${options.allowedMimes.join(', ')}`,
    };
  }

  // 2. Magic byte verification
  const detectedMime = detectMimeFromBuffer(buffer);
  if (!detectedMime) {
    // Allow SVGs through since they're text-based (but they must pass sanitization)
    if (file.mimetype === 'image/svg+xml') {
      const svgCheck = isSvgSafe(buffer);
      if (!svgCheck.safe) {
        logger.warn('Upload rejected: unsafe SVG', {
          reason: svgCheck.reason,
          userId,
        });
        return { ok: false, message: `SVG rejected: ${svgCheck.reason}` };
      }
    } else {
      logger.warn('Upload rejected: unrecognized file content', {
        claimedMime: file.mimetype,
        userId,
      });
      return {
        ok: false,
        message: 'File content does not match any recognized media format',
      };
    }
  } else {
    // Check that detected MIME matches claimed (allow mp4/quicktime interchangeability)
    const mimeCompatible =
      detectedMime === file.mimetype ||
      (detectedMime === 'video/mp4' && file.mimetype === 'video/quicktime') ||
      (detectedMime === 'video/quicktime' && file.mimetype === 'video/mp4');

    if (!mimeCompatible) {
      logger.warn('Upload rejected: MIME mismatch', {
        claimed: file.mimetype,
        detected: detectedMime,
        userId,
      });
      return {
        ok: false,
        message: `File content (${detectedMime}) does not match declared type (${file.mimetype})`,
      };
    }
  }

  // 3. File size enforcement with category-specific limits
  const isImage = file.mimetype.startsWith('image/');
  const isVideo = file.mimetype.startsWith('video/');

  let effectiveMaxBytes = options.maxBytes;
  if (isImage) {
    effectiveMaxBytes = Math.min(effectiveMaxBytes, SIZE_LIMITS.image);
  } else if (isVideo && options.contentType === 'story') {
    effectiveMaxBytes = Math.min(effectiveMaxBytes, SIZE_LIMITS.story);
  } else if (isVideo) {
    effectiveMaxBytes = Math.min(effectiveMaxBytes, SIZE_LIMITS.video);
  }

  if (file.size > effectiveMaxBytes) {
    return {
      ok: false,
      message: `File exceeds maximum size of ${Math.floor(effectiveMaxBytes / MB)}MB`,
    };
  }

  // 4. Check for suspicious metadata (embedded scripts)
  if (hasSuspiciousMetadata(buffer)) {
    logger.warn('Upload rejected: suspicious metadata detected', {
      filename: file.originalname,
      userId,
    });
    return {
      ok: false,
      message: 'File contains suspicious embedded content and has been rejected',
    };
  }

  // 5. Image-specific validations
  let metadata: Record<string, unknown> | undefined;
  if (isImage && file.mimetype !== 'image/svg+xml') {
    metadata = {
      type: 'image',
    };
  }

  // 6. Compute file hash for dedup / fingerprinting
  const fileHash = computeFileHash(buffer);
  logger.debug('File validation passed', {
    mimetype: file.mimetype,
    size: file.size,
    hash: fileHash.substring(0, 16) + '...',
    userId,
  });

  return {
    ok: true,
    value: {
      metadata,
      fileHash,
    },
  };
}

async function validateFileHardened(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
  options: HardenedValidationOptions
) {
  const file = req.file;

  if (!file) {
    if (options.required) {
      return res.status(400).json({ message: 'Media file is required' });
    }
    return next();
  }

  const singleCheck = validateSingleFileBuffer(file, options, req.userId);
  if ('message' in singleCheck) {
    return res.status(400).json({ message: singleCheck.message });
  }

  // Async image dimension validation
  const isImage = file.mimetype.startsWith('image/');
  if (isImage && file.mimetype !== 'image/svg+xml') {
    const buffer = file.buffer;
    const dimCheck = await validateImageDimensions(buffer);
    if (!dimCheck.valid) {
      return res.status(400).json({ message: dimCheck.reason });
    }

    // Attach dimensions to request for downstream use
    (req as any).mediaMetadata = {
      width: dimCheck.width,
      height: dimCheck.height,
      type: 'image',
    };
  } else if (singleCheck.value.metadata) {
    (req as any).mediaMetadata = singleCheck.value.metadata;
  }

  (req as any).fileHash = singleCheck.value.fileHash;

  return next();
}

export const validateMultiUpload = (options: {
  maxFiles: number;
  maxTotalBytes: number;
  allowedMimes: string[];
  contentType?: 'post' | 'reel' | 'story';
}): ((req: AuthRequest, res: Response, next: NextFunction) => Promise<Response | void>) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const files = (req.files as Express.Multer.File[]) || [];
    if (!Array.isArray(files) || files.length === 0) {
      return next();
    }

    if (files.length > options.maxFiles) {
      return res.status(400).json({
        message: `Too many files. Maximum ${options.maxFiles} files are allowed per upload.`,
      });
    }

    const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
    if (totalBytes > options.maxTotalBytes) {
      return res.status(400).json({
        message: `Total upload size exceeds ${Math.floor(options.maxTotalBytes / MB)}MB limit.`,
      });
    }

    const fileHashes: string[] = [];
    for (const file of files) {
      const check = validateSingleFileBuffer(
        file,
        {
          required: false,
          allowedMimes: options.allowedMimes,
          maxBytes: SIZE_LIMITS.video,
          mediaCategory: 'any',
          contentType: options.contentType,
        },
        req.userId
      );

      if ('message' in check) {
        return res.status(400).json({ message: check.message });
      }

      if (file.mimetype.startsWith('image/') && file.mimetype !== 'image/svg+xml') {
        const dimCheck = await validateImageDimensions(file.buffer);
        if (!dimCheck.valid) {
          return res.status(400).json({ message: dimCheck.reason });
        }
      }

      fileHashes.push(check.value.fileHash);
    }

    (req as any).fileHashes = fileHashes;
    return next();
  };
};

// ============================================
// Exported middleware functions
// ============================================

export const validatePostUpload = (req: AuthRequest, res: Response, next: NextFunction) => {
  return validateFileHardened(req, res, next, {
    required: false,
    allowedMimes: [...ALLOWED_IMAGE_MIMES, ...ALLOWED_VIDEO_MIMES],
    maxBytes: 100 * MB,
    mediaCategory: 'any',
    contentType: 'post',
  });
};

export const validateReelUpload = (req: AuthRequest, res: Response, next: NextFunction) => {
  return validateFileHardened(req, res, next, {
    required: false,
    allowedMimes: ALLOWED_VIDEO_MIMES,
    maxBytes: SIZE_LIMITS.video,
    mediaCategory: 'video',
    contentType: 'reel',
  });
};

export const validateStoryUpload = (req: AuthRequest, res: Response, next: NextFunction) => {
  return validateFileHardened(req, res, next, {
    required: false,
    allowedMimes: ALLOWED_ALL_MIMES,
    maxBytes: SIZE_LIMITS.story,
    mediaCategory: 'any',
    contentType: 'story',
  });
};

export const validateAvatarUpload = (req: AuthRequest, res: Response, next: NextFunction) => {
  return validateFileHardened(req, res, next, {
    required: true,
    allowedMimes: ALLOWED_IMAGE_MIMES,
    maxBytes: 5 * MB,
    mediaCategory: 'image',
  });
};

export const validateReelCoverUpload = (req: AuthRequest, res: Response, next: NextFunction) => {
  return validateFileHardened(req, res, next, {
    required: true,
    allowedMimes: ALLOWED_IMAGE_MIMES,
    maxBytes: SIZE_LIMITS.image,
    mediaCategory: 'image',
    contentType: 'reel',
  });
};

// ============================================
// Utility exports for other services
// ============================================

export {
  verifyMagicBytes,
  detectMimeFromBuffer,
  hasSuspiciousMetadata,
  isSvgSafe,
  validateImageDimensions,
  ALLOWED_IMAGE_MIMES,
  ALLOWED_VIDEO_MIMES,
  SIZE_LIMITS,
  DURATION_LIMITS,
  MAX_IMAGE_DIMENSION,
};
