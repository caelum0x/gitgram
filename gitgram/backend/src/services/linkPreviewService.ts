import axios, { AxiosError } from 'axios';
import * as cheerio from 'cheerio';
import { cache } from './redisService';
import logger from '../utils/logger';
import prisma from '../utils/prisma';

// Constants
const CACHE_TTL = 24 * 60 * 60; // 24 hours in seconds
const CACHE_PREFIX = 'link_preview:';
const REQUEST_TIMEOUT = 10000; // 10 seconds
const MAX_CONTENT_LENGTH = 5 * 1024 * 1024; // 5MB max
const USER_AGENT = 'Gitgram-LinkPreview/1.0 (compatible; +https://gitgram.com/bot)';

// URL regex pattern for extracting URLs from text
const URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;

// Blocked domains (for security/privacy)
const BLOCKED_DOMAINS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '10.',
  '172.16.',
  '172.17.',
  '172.18.',
  '172.19.',
  '172.20.',
  '172.21.',
  '172.22.',
  '172.23.',
  '172.24.',
  '172.25.',
  '172.26.',
  '172.27.',
  '172.28.',
  '172.29.',
  '172.30.',
  '172.31.',
  '192.168.',
  'internal',
];

export interface LinkPreviewData {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  favicon: string | null;
  domain: string;
}

/**
 * Extract URLs from text content
 */
export function extractUrls(content: string): string[] {
  const matches = content.match(URL_REGEX);
  if (!matches) return [];

  // Remove duplicates and return
  return [...new Set(matches)];
}

/**
 * Check if a URL is allowed (not blocked/internal)
 */
function isUrlAllowed(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Check against blocked domains/patterns
    for (const blocked of BLOCKED_DOMAINS) {
      if (hostname === blocked || hostname.startsWith(blocked) || hostname.includes(blocked)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Get domain from URL
 */
function getDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace('www.', '');
  } catch {
    return '';
  }
}

/**
 * Resolve relative URLs to absolute URLs
 */
function resolveUrl(baseUrl: string, relativeUrl: string | undefined): string | null {
  if (!relativeUrl) return null;

  try {
    // Already absolute
    if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
      return relativeUrl;
    }

    // Protocol-relative
    if (relativeUrl.startsWith('//')) {
      const base = new URL(baseUrl);
      return `${base.protocol}${relativeUrl}`;
    }

    // Relative URL
    return new URL(relativeUrl, baseUrl).href;
  } catch {
    return null;
  }
}

/**
 * Generate cache key for a URL
 */
function getCacheKey(url: string): string {
  // Normalize URL for consistent caching
  const normalized = url.toLowerCase().trim();
  return `${CACHE_PREFIX}${Buffer.from(normalized).toString('base64').substring(0, 100)}`;
}

/**
 * Fetch and parse link preview data from a URL
 */
export async function fetchLinkPreview(url: string): Promise<LinkPreviewData | null> {
  // Validate URL
  if (!url || !isUrlAllowed(url)) {
    logger.warn('Invalid or blocked URL for link preview:', { url });
    return null;
  }

  // Check cache first
  const cacheKey = getCacheKey(url);
  try {
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug('Link preview cache hit:', { url });
      return cached as LinkPreviewData;
    }
  } catch (cacheError) {
    logger.warn('Cache read error for link preview:', cacheError);
  }

  try {
    // Fetch the URL
    const response = await axios.get(url, {
      timeout: REQUEST_TIMEOUT,
      maxContentLength: MAX_CONTENT_LENGTH,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
      },
      // Follow redirects
      maxRedirects: 5,
      // Only accept HTML content
      validateStatus: (status) => status >= 200 && status < 300,
    });

    // Check content type
    const contentType = response.headers['content-type'] || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      logger.debug('Non-HTML content type for link preview:', { url, contentType });
      return null;
    }

    const html = response.data;
    const $ = cheerio.load(html);
    const domain = getDomain(url);

    // Extract Open Graph metadata
    const ogTitle = $('meta[property="og:title"]').attr('content');
    const ogDescription = $('meta[property="og:description"]').attr('content');
    const ogImage = $('meta[property="og:image"]').attr('content');
    const ogSiteName = $('meta[property="og:site_name"]').attr('content');

    // Fallback to Twitter Card metadata
    const twitterTitle = $('meta[name="twitter:title"]').attr('content');
    const twitterDescription = $('meta[name="twitter:description"]').attr('content');
    const twitterImage = $('meta[name="twitter:image"]').attr('content');

    // Fallback to standard meta tags
    const metaTitle = $('title').text();
    const metaDescription = $('meta[name="description"]').attr('content');

    // Extract favicon
    let favicon = $('link[rel="icon"]').attr('href')
      || $('link[rel="shortcut icon"]').attr('href')
      || $('link[rel="apple-touch-icon"]').attr('href');

    // Build the preview data with fallbacks
    const previewData: LinkPreviewData = {
      url,
      title: ogTitle || twitterTitle || metaTitle || null,
      description: ogDescription || twitterDescription || metaDescription || null,
      image: resolveUrl(url, ogImage || twitterImage),
      siteName: ogSiteName || domain,
      favicon: resolveUrl(url, favicon) || `https://${domain}/favicon.ico`,
      domain,
    };

    // Truncate long values
    if (previewData.title && previewData.title.length > 200) {
      previewData.title = previewData.title.substring(0, 197) + '...';
    }
    if (previewData.description && previewData.description.length > 500) {
      previewData.description = previewData.description.substring(0, 497) + '...';
    }

    // Cache the result
    try {
      await cache.set(cacheKey, previewData, CACHE_TTL);
      logger.debug('Link preview cached:', { url, domain });
    } catch (cacheError) {
      logger.warn('Cache write error for link preview:', cacheError);
    }

    return previewData;
  } catch (error) {
    if (error instanceof AxiosError) {
      if (error.code === 'ECONNABORTED') {
        logger.warn('Link preview timeout:', { url });
      } else if (error.response) {
        logger.warn('Link preview HTTP error:', {
          url,
          status: error.response.status
        });
      } else {
        logger.warn('Link preview network error:', {
          url,
          message: error.message
        });
      }
    } else {
      logger.error('Link preview unexpected error:', { url, error });
    }
    return null;
  }
}

/**
 * Generate link previews for all URLs in content
 */
export async function generatePreviewsForContent(content: string): Promise<LinkPreviewData[]> {
  const urls = extractUrls(content);

  if (urls.length === 0) {
    return [];
  }

  // Limit to first 5 URLs to prevent abuse
  const urlsToProcess = urls.slice(0, 5);

  // Fetch all previews in parallel
  const previews = await Promise.all(
    urlsToProcess.map(url => fetchLinkPreview(url))
  );

  // Filter out null results
  return previews.filter((preview): preview is LinkPreviewData => preview !== null);
}

/**
 * Store link preview in database for a post
 */
export async function storeLinkPreviewForPost(
  postId: string,
  preview: LinkPreviewData
): Promise<void> {
  try {
    await prisma.linkPreview.upsert({
      where: {
        postId_url: { postId, url: preview.url }
      },
      create: {
        postId,
        url: preview.url,
        title: preview.title,
        description: preview.description,
        image: preview.image,
        siteName: preview.siteName,
        favicon: preview.favicon,
        domain: preview.domain,
      },
      update: {
        title: preview.title,
        description: preview.description,
        image: preview.image,
        siteName: preview.siteName,
        favicon: preview.favicon,
        domain: preview.domain,
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    logger.error('Failed to store link preview:', { postId, url: preview.url, error });
  }
}

/**
 * Generate and store link previews for a post
 */
export async function processLinkPreviewsForPost(
  postId: string,
  content: string
): Promise<LinkPreviewData[]> {
  const previews = await generatePreviewsForContent(content);

  // Store each preview in the database
  await Promise.all(
    previews.map(preview => storeLinkPreviewForPost(postId, preview))
  );

  return previews;
}

/**
 * Get link previews for a post from database
 */
export async function getLinkPreviewsForPost(postId: string): Promise<LinkPreviewData[]> {
  try {
    const previews = await prisma.linkPreview.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
    });

    return previews.map(p => ({
      url: p.url,
      title: p.title,
      description: p.description,
      image: p.image,
      siteName: p.siteName,
      favicon: p.favicon,
      domain: p.domain,
    }));
  } catch (error) {
    logger.error('Failed to get link previews for post:', { postId, error });
    return [];
  }
}

/**
 * Delete link previews for a post
 */
export async function deleteLinkPreviewsForPost(postId: string): Promise<void> {
  try {
    await prisma.linkPreview.deleteMany({
      where: { postId },
    });
  } catch (error) {
    logger.error('Failed to delete link previews:', { postId, error });
  }
}

export default {
  extractUrls,
  fetchLinkPreview,
  generatePreviewsForContent,
  processLinkPreviewsForPost,
  getLinkPreviewsForPost,
  deleteLinkPreviewsForPost,
};
