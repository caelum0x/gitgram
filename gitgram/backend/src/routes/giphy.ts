import { Router, Request, Response } from 'express';
import { query, param } from 'express-validator';
import { giphyService } from '../services/giphyService';
import { validate } from '../middleware/validation';
import logger from '../utils/logger';

const router = Router();

// Constants for pagination limits
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 25;
const MAX_OFFSET = 5000;

/**
 * Search GIFs
 * GET /api/giphy/search?q=funny&limit=25&offset=0
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
      const q = req.query.q as string;
      const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
      const offset = Math.min(Number(req.query.offset) || 0, MAX_OFFSET);

      const gifs = await giphyService.searchGifs(q, limit, offset);

      res.json({ gifs });
    } catch (error) {
      logger.error('Failed to search GIFs:', error);
      res.status(500).json({ message: 'Failed to search GIFs' });
    }
  }
);

/**
 * Get trending GIFs
 * GET /api/giphy/trending?limit=25&offset=0
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
      const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
      const offset = Math.min(Number(req.query.offset) || 0, MAX_OFFSET);

      const gifs = await giphyService.getTrendingGifs(limit, offset);

      res.json({ gifs });
    } catch (error) {
      logger.error('Failed to get trending GIFs:', error);
      res.status(500).json({ message: 'Failed to get trending GIFs' });
    }
  }
);

/**
 * Get GIF by ID
 * GET /api/giphy/:id
 */
router.get(
  '/:id',
  [
    param('id')
      .isString()
      .isLength({ min: 1, max: 50 })
      .withMessage('Invalid GIF ID'),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const gif = await giphyService.getGifById(id);

      if (!gif) {
        return res.status(404).json({ message: 'GIF not found' });
      }

      res.json({ gif });
    } catch (error) {
      logger.error('Failed to get GIF:', error);
      res.status(404).json({ message: 'GIF not found' });
    }
  }
);

export default router;
