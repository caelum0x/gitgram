import { Request, Response } from 'express';
import { fetchLinkPreview, getLinkPreviewsForPost } from '../services/linkPreviewService';
import { AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

/**
 * Generate a link preview for a URL
 * GET /api/v1/link-preview?url=
 */
export const generateLinkPreview = asyncHandler(async (req: Request, res: Response) => {
  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    throw Errors.badRequest('Missing or invalid URL parameter');
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    throw Errors.badRequest('Invalid URL format');
  }

  // Only allow http/https protocols
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    throw Errors.badRequest('URL must use http or https protocol');
  }

  const preview = await fetchLinkPreview(url);

  if (!preview) {
    throw Errors.notFound('Link preview');
  }

  res.json({
    success: true,
    preview
  });
});

/**
 * Get link previews for a specific post
 * GET /api/v1/link-preview/post/:postId
 */
export const getPostLinkPreviews = asyncHandler(async (req: Request, res: Response) => {
  const { postId } = req.params;

  if (!postId) {
    throw Errors.badRequest('Missing post ID');
  }

  const previews = await getLinkPreviewsForPost(postId);

  res.json({
    success: true,
    postId,
    previews
  });
});

/**
 * Bulk generate previews for multiple URLs
 * POST /api/v1/link-preview/bulk
 */
export const generateBulkLinkPreviews = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { urls } = req.body;

  if (!urls || !Array.isArray(urls)) {
    throw Errors.badRequest('Missing or invalid urls array');
  }

  // Limit to 10 URLs per request
  if (urls.length > 10) {
    throw Errors.badRequest('Maximum 10 URLs per request');
  }

  // Validate all URLs
  const validUrls: string[] = [];
  for (const url of urls) {
    if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
      try {
        new URL(url);
        validUrls.push(url);
      } catch {
        // Skip invalid URLs
      }
    }
  }

  // Generate previews in parallel
  const results = await Promise.all(
    validUrls.map(async (url) => {
      const preview = await fetchLinkPreview(url);
      return { url, preview };
    })
  );

  res.json({
    success: true,
    results: results.filter(r => r.preview !== null)
  });
});

export default {
  generateLinkPreview,
  getPostLinkPreviews,
  generateBulkLinkPreviews,
};
