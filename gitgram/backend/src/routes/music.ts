import { Router, Request, Response } from 'express';
import { query, param } from 'express-validator';
import { musicService } from '../services/musicService';
import { validate } from '../middleware/validation';
import logger from '../utils/logger';

const router = Router();

// Constants for pagination limits
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const MAX_OFFSET = 5000;

/**
 * Search music tracks
 * GET /api/v1/music/search?q=query&limit=20&offset=0
 */
router.get(
  '/search',
  [
    query('q')
      .notEmpty()
      .withMessage('Query parameter required')
      .isString()
      .isLength({ min: 1, max: 100 })
      .withMessage('Query must be between 1 and 100 characters')
      .trim(),
    query('limit')
      .optional()
      .isInt({ min: 1, max: MAX_LIMIT })
      .withMessage(`Limit must be between 1 and ${MAX_LIMIT}`)
      .toInt(),
    query('offset')
      .optional()
      .isInt({ min: 0, max: MAX_OFFSET })
      .withMessage(`Offset must be between 0 and ${MAX_OFFSET}`)
      .toInt(),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      if (!musicService.isConfigured()) {
        return res.status(503).json({
          message: 'Music service not configured',
          error: 'JAMENDO_CLIENT_ID environment variable is not set',
        });
      }

      const q = req.query.q as string;
      const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
      const offset = Math.min(Number(req.query.offset) || 0, MAX_OFFSET);

      const result = await musicService.searchTracks(q, limit, offset);

      res.json(result);
    } catch (error: any) {
      logger.error('Failed to search music:', error);
      res.status(500).json({ message: error.message || 'Failed to search music' });
    }
  }
);

/**
 * Get trending music tracks
 * GET /api/v1/music/trending?limit=20&offset=0
 */
router.get(
  '/trending',
  [
    query('limit')
      .optional()
      .isInt({ min: 1, max: MAX_LIMIT })
      .withMessage(`Limit must be between 1 and ${MAX_LIMIT}`)
      .toInt(),
    query('offset')
      .optional()
      .isInt({ min: 0, max: MAX_OFFSET })
      .withMessage(`Offset must be between 0 and ${MAX_OFFSET}`)
      .toInt(),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      if (!musicService.isConfigured()) {
        return res.status(503).json({
          message: 'Music service not configured',
          error: 'JAMENDO_CLIENT_ID environment variable is not set',
        });
      }

      const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
      const offset = Math.min(Number(req.query.offset) || 0, MAX_OFFSET);

      const result = await musicService.getTrendingTracks(limit, offset);

      res.json(result);
    } catch (error: any) {
      logger.error('Failed to get trending music:', error);
      res.status(500).json({ message: error.message || 'Failed to get trending music' });
    }
  }
);

/**
 * Get available music genres
 * GET /api/v1/music/genres
 */
router.get('/genres', async (req: Request, res: Response) => {
  try {
    const genres = await musicService.getGenres();

    res.json({ genres });
  } catch (error: any) {
    logger.error('Failed to get music genres:', error);
    res.status(500).json({ message: error.message || 'Failed to get music genres' });
  }
});

/**
 * Get new music releases
 * GET /api/v1/music/new?limit=20&offset=0
 */
router.get(
  '/new',
  [
    query('limit')
      .optional()
      .isInt({ min: 1, max: MAX_LIMIT })
      .withMessage(`Limit must be between 1 and ${MAX_LIMIT}`)
      .toInt(),
    query('offset')
      .optional()
      .isInt({ min: 0, max: MAX_OFFSET })
      .withMessage(`Offset must be between 0 and ${MAX_OFFSET}`)
      .toInt(),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      if (!musicService.isConfigured()) {
        return res.status(503).json({
          message: 'Music service not configured',
          error: 'JAMENDO_CLIENT_ID environment variable is not set',
        });
      }

      const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
      const offset = Math.min(Number(req.query.offset) || 0, MAX_OFFSET);

      const result = await musicService.getNewReleases(limit, offset);

      res.json(result);
    } catch (error: any) {
      logger.error('Failed to get new releases:', error);
      res.status(500).json({ message: error.message || 'Failed to get new releases' });
    }
  }
);

/**
 * Get tracks by genre
 * GET /api/v1/music/genres/:genre?limit=20&offset=0
 */
router.get(
  '/genres/:genre',
  [
    param('genre')
      .isString()
      .isLength({ min: 1, max: 50 })
      .withMessage('Invalid genre')
      .trim(),
    query('limit')
      .optional()
      .isInt({ min: 1, max: MAX_LIMIT })
      .withMessage(`Limit must be between 1 and ${MAX_LIMIT}`)
      .toInt(),
    query('offset')
      .optional()
      .isInt({ min: 0, max: MAX_OFFSET })
      .withMessage(`Offset must be between 0 and ${MAX_OFFSET}`)
      .toInt(),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      if (!musicService.isConfigured()) {
        return res.status(503).json({
          message: 'Music service not configured',
          error: 'JAMENDO_CLIENT_ID environment variable is not set',
        });
      }

      const { genre } = req.params;
      const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
      const offset = Math.min(Number(req.query.offset) || 0, MAX_OFFSET);

      const result = await musicService.getTracksByGenre(genre, limit, offset);

      res.json(result);
    } catch (error: any) {
      logger.error(`Failed to get tracks by genre ${req.params.genre}:`, error);
      res.status(500).json({ message: error.message || 'Failed to get tracks by genre' });
    }
  }
);

/**
 * Get tracks by artist
 * GET /api/v1/music/artists/:artistId?limit=20&offset=0
 */
router.get(
  '/artists/:artistId',
  [
    param('artistId')
      .isString()
      .isLength({ min: 1, max: 50 })
      .withMessage('Invalid artist ID'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: MAX_LIMIT })
      .withMessage(`Limit must be between 1 and ${MAX_LIMIT}`)
      .toInt(),
    query('offset')
      .optional()
      .isInt({ min: 0, max: MAX_OFFSET })
      .withMessage(`Offset must be between 0 and ${MAX_OFFSET}`)
      .toInt(),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      if (!musicService.isConfigured()) {
        return res.status(503).json({
          message: 'Music service not configured',
          error: 'JAMENDO_CLIENT_ID environment variable is not set',
        });
      }

      const { artistId } = req.params;
      const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
      const offset = Math.min(Number(req.query.offset) || 0, MAX_OFFSET);

      const result = await musicService.getTracksByArtist(artistId, limit, offset);

      res.json(result);
    } catch (error: any) {
      logger.error(`Failed to get tracks by artist ${req.params.artistId}:`, error);
      res.status(500).json({ message: error.message || 'Failed to get tracks by artist' });
    }
  }
);

/**
 * Get a specific track by ID
 * GET /api/v1/music/tracks/:id
 */
router.get(
  '/tracks/:id',
  [
    param('id')
      .isString()
      .isLength({ min: 1, max: 50 })
      .withMessage('Invalid track ID'),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      if (!musicService.isConfigured()) {
        return res.status(503).json({
          message: 'Music service not configured',
          error: 'JAMENDO_CLIENT_ID environment variable is not set',
        });
      }

      const { id } = req.params;

      const track = await musicService.getTrackById(id);

      if (!track) {
        return res.status(404).json({ message: 'Track not found' });
      }

      res.json({ track });
    } catch (error: any) {
      logger.error(`Failed to get track ${req.params.id}:`, error);
      res.status(500).json({ message: error.message || 'Failed to get track' });
    }
  }
);

export default router;
