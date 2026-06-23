import { Router, Request, Response } from 'express';
import { param, query } from 'express-validator';
import { optionalAuth } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { asyncHandler, Errors } from '../middleware/errorHandler';
import prisma from '../utils/prisma';
import {
  getContributions,
  getContributionStats,
} from '../services/contributionService';

const router = Router();

const MIN_YEAR = 2008; // GitHub's launch year — no contributions predate it.

/**
 * Ensure the target user exists before delegating to the service so the
 * client receives a proper 404 instead of a generic 500.
 */
async function assertUserExists(username: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (!user) {
    throw Errors.notFound('User', username);
  }
}

const usernameValidator = param('username')
  .isString()
  .trim()
  .notEmpty()
  .withMessage('username is required');

const yearValidator = query('year')
  .optional()
  .isInt({ min: MIN_YEAR, max: new Date().getUTCFullYear() })
  .withMessage(`year must be between ${MIN_YEAR} and the current year`)
  .toInt();

/**
 * GET /api/v1/users/:username/contributions?year=YYYY
 * Returns a GitHub-style contribution grid for the given user and year.
 * Defaults to the current year when `year` is omitted.
 */
router.get(
  '/:username/contributions',
  optionalAuth,
  validate([usernameValidator, yearValidator]),
  asyncHandler(async (req: Request, res: Response) => {
    const { username } = req.params;
    const year =
      req.query.year !== undefined
        ? Number(req.query.year)
        : new Date().getUTCFullYear();

    await assertUserExists(username);

    const data = await getContributions(username, year);
    res.json(data);
  }),
);

/**
 * GET /api/v1/users/:username/contributions/stats
 * Returns streak and aggregate contribution statistics for the user
 * across a rolling 365-day window.
 */
router.get(
  '/:username/contributions/stats',
  optionalAuth,
  validate([usernameValidator]),
  asyncHandler(async (req: Request, res: Response) => {
    const { username } = req.params;

    await assertUserExists(username);

    const data = await getContributionStats(username);
    res.json(data);
  }),
);

export default router;
