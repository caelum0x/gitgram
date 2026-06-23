import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');
const AVATARS_DIR = path.join(UPLOADS_ROOT, 'avatars');
const POSTS_DIR = path.join(UPLOADS_ROOT, 'posts');
const STORIES_DIR = path.join(UPLOADS_ROOT, 'stories');

const BASE_URL = process.env.MEDIA_BASE_URL ?? '/uploads';

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
]);

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.avi']);

const AVATAR_MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const POST_IMAGE_MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const STORY_IMAGE_MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const STORY_VIDEO_MAX_SIZE = 50 * 1024 * 1024; // 50 MB

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Multer file shape — mirrors Express.Multer.File without importing @types/multer globally. */
export interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  /** Path on disk when using DiskStorage. */
  path?: string;
  /** In-memory buffer when using MemoryStorage. */
  buffer?: Buffer;
  destination?: string;
  filename?: string;
}

export interface ValidateOptions {
  maxSize: number;
  allowedTypes: ReadonlySet<string>;
}

export interface MediaResult {
  url: string;
  mediaType: 'image' | 'video';
  mimeType: string;
  sizeBytes: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function safeJoin(root: string, relativePath: string): string {
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(path.resolve(root) + path.sep) && resolved !== path.resolve(root)) {
    throw new Error(`Path traversal detected: ${relativePath}`);
  }
  return resolved;
}

function generateFilename(originalname: string): string {
  const ext = path.extname(originalname).toLowerCase();
  const random = crypto.randomBytes(16).toString('hex');
  const ts = Date.now();
  return `${ts}-${random}${ext}`;
}

function fileExtension(file: MulterFile): string {
  return path.extname(file.originalname).toLowerCase();
}

function readFilePath(file: MulterFile): string {
  if (file.path) return file.path;
  throw new Error('File path not available; ensure multer DiskStorage is configured.');
}

// ---------------------------------------------------------------------------
// validateFile
// ---------------------------------------------------------------------------

/**
 * Validates a MulterFile against size and MIME-type constraints.
 * Throws a descriptive Error if validation fails.
 */
export function validateFile(file: MulterFile, options: ValidateOptions): void {
  if (file.size > options.maxSize) {
    const maxMB = (options.maxSize / (1024 * 1024)).toFixed(0);
    throw new Error(`File size ${(file.size / (1024 * 1024)).toFixed(2)} MB exceeds the ${maxMB} MB limit.`);
  }

  const mimeOk = options.allowedTypes.has(file.mimetype);
  const ext = fileExtension(file);
  const extOk = [...options.allowedTypes].some((t) => {
    // Allow e.g. 'image/jpeg' to match '.jpg' / '.jpeg'
    const subtype = t.split('/')[1] ?? '';
    return ext === `.${subtype}` || (subtype === 'jpeg' && ext === '.jpg') || (subtype === 'quicktime' && ext === '.mov');
  });

  if (!mimeOk && !extOk) {
    throw new Error(
      `File type "${file.mimetype}" (${ext}) is not allowed. Accepted types: ${[...options.allowedTypes].join(', ')}.`,
    );
  }
}

// ---------------------------------------------------------------------------
// uploadAvatar
// ---------------------------------------------------------------------------

/**
 * Validates, optimises, and saves a user avatar image.
 * Returns the public URL for the saved file.
 */
export async function uploadAvatar(file: MulterFile, userId: string): Promise<string> {
  validateFile(file, {
    maxSize: AVATAR_MAX_SIZE,
    allowedTypes: IMAGE_MIME_TYPES,
  });

  ensureDir(AVATARS_DIR);

  const filename = generateFilename(file.originalname);
  const destPath = safeJoin(AVATARS_DIR, filename);
  const srcPath = readFilePath(file);

  try {
    await sharp(srcPath)
      .resize(400, 400, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 88, progressive: true })
      .toFile(destPath.replace(path.extname(destPath), '.jpg'));

    const finalFilename = filename.replace(path.extname(filename), '.jpg');
    const url = `${BASE_URL}/avatars/${finalFilename}`;

    logger.info('Avatar uploaded', { userId, url });
    return url;
  } catch (err: unknown) {
    logger.error('Avatar upload failed', { userId, error: err });
    throw new Error(`Failed to process avatar: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// uploadPostImage
// ---------------------------------------------------------------------------

/**
 * Validates and saves a post image (max 10 MB).
 * Returns the public URL.
 */
export async function uploadPostImage(file: MulterFile, userId: string): Promise<string> {
  validateFile(file, {
    maxSize: POST_IMAGE_MAX_SIZE,
    allowedTypes: IMAGE_MIME_TYPES,
  });

  ensureDir(POSTS_DIR);

  const filename = generateFilename(file.originalname);
  const srcPath = readFilePath(file);
  const destFilename = filename.replace(path.extname(filename), '.jpg');
  const destPath = safeJoin(POSTS_DIR, destFilename);

  try {
    await sharp(srcPath)
      .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, progressive: true })
      .toFile(destPath);

    const url = `${BASE_URL}/posts/${destFilename}`;

    logger.info('Post image uploaded', { userId, url });
    return url;
  } catch (err: unknown) {
    logger.error('Post image upload failed', { userId, error: err });
    throw new Error(`Failed to process post image: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// uploadStoryMedia
// ---------------------------------------------------------------------------

/**
 * Validates and saves story media (image or video).
 * Returns a MediaResult with the public URL and metadata.
 */
export async function uploadStoryMedia(file: MulterFile, userId: string): Promise<MediaResult> {
  const isImage = IMAGE_MIME_TYPES.has(file.mimetype) || IMAGE_EXTENSIONS.has(fileExtension(file));
  const isVideo = VIDEO_MIME_TYPES.has(file.mimetype) || VIDEO_EXTENSIONS.has(fileExtension(file));

  if (!isImage && !isVideo) {
    throw new Error(
      `Unsupported media type "${file.mimetype}". Stories accept images (JPEG, PNG, WebP, GIF) or videos (MP4, MOV, WebM).`,
    );
  }

  const maxSize = isImage ? STORY_IMAGE_MAX_SIZE : STORY_VIDEO_MAX_SIZE;
  validateFile(file, {
    maxSize,
    allowedTypes: isImage ? IMAGE_MIME_TYPES : VIDEO_MIME_TYPES,
  });

  ensureDir(STORIES_DIR);

  const filename = generateFilename(file.originalname);
  const srcPath = readFilePath(file);

  try {
    if (isImage) {
      const destFilename = filename.replace(path.extname(filename), '.jpg');
      const destPath = safeJoin(STORIES_DIR, destFilename);

      await sharp(srcPath)
        .resize(1080, 1920, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 87, progressive: true })
        .toFile(destPath);

      const url = `${BASE_URL}/stories/${destFilename}`;
      logger.info('Story image uploaded', { userId, url });

      return {
        url,
        mediaType: 'image',
        mimeType: 'image/jpeg',
        sizeBytes: fs.statSync(destPath).size,
      };
    }

    // Video: copy as-is (transcoding handled by transcodingPipelineService)
    const destPath = safeJoin(STORIES_DIR, filename);
    fs.copyFileSync(srcPath, destPath);

    const url = `${BASE_URL}/stories/${filename}`;
    logger.info('Story video uploaded', { userId, url });

    return {
      url,
      mediaType: 'video',
      mimeType: file.mimetype,
      sizeBytes: file.size,
    };
  } catch (err: unknown) {
    logger.error('Story media upload failed', { userId, error: err });
    throw new Error(`Failed to process story media: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// deleteMedia
// ---------------------------------------------------------------------------

/**
 * Deletes a media file identified by its public URL.
 * Safety guarantee: only files within the uploads/ directory are deleted.
 */
export async function deleteMedia(url: string): Promise<void> {
  // Strip base URL prefix to get relative path
  const prefix = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
  if (!url.startsWith(prefix) && !url.startsWith('/uploads/')) {
    throw new Error(`Refusing to delete: URL "${url}" is outside the managed uploads directory.`);
  }

  const relativePath = url.startsWith(prefix)
    ? url.slice(prefix.length)
    : url.slice('/uploads/'.length);

  // Resolve and verify containment
  const resolved = path.resolve(UPLOADS_ROOT, relativePath);
  if (!resolved.startsWith(path.resolve(UPLOADS_ROOT) + path.sep)) {
    throw new Error(`Path traversal detected for URL "${url}".`);
  }

  if (!fs.existsSync(resolved)) {
    logger.warn('deleteMedia: file not found, skipping', { url, resolved });
    return;
  }

  try {
    fs.unlinkSync(resolved);
    logger.info('Media deleted', { url, resolved });
  } catch (err: unknown) {
    logger.error('deleteMedia failed', { url, resolved, error: err });
    throw new Error(`Failed to delete media: ${err instanceof Error ? err.message : String(err)}`);
  }
}
