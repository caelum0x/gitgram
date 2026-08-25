import { Router, type NextFunction, type Request, type Response } from 'express';
import { authenticate, optionalAuth } from '../middleware/auth';
import { talentGraphController } from '../controllers/talentGraphController';
import { interactionLimiter } from '../middleware/rateLimiter';
import { Errors } from '../middleware/errorHandler';

const router = Router();

function requireMutationOrigin(req: Request, _res: Response, next: NextFunction) {
  if (req.headers.authorization?.startsWith('Bearer ')) return next();
  const origin = req.get('origin');
  const configured = (process.env.CORS_ORIGIN || '').split(',').map((value) => value.trim()).filter(Boolean);
  const allowed = new Set(configured);
  if (process.env.NODE_ENV !== 'production') {
    allowed.add('http://localhost:3000');
    allowed.add('http://localhost:3001');
    allowed.add('http://127.0.0.1:3000');
    allowed.add('http://127.0.0.1:3001');
  }
  if (allowed.size === 0) return next(Errors.serviceUnavailable('Talent Graph origin policy'));
  if (!origin || !allowed.has(origin)) return next(Errors.forbidden('Cross-origin Talent Graph mutation refused'));
  const fetchSite = req.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'same-site') {
    return next(Errors.forbidden('Cross-site Talent Graph mutation refused'));
  }
  return next();
}

router.get('/me', authenticate, talentGraphController.getMine);
router.get('/public/:username', talentGraphController.getPublic);
router.get('/opportunities', optionalAuth, talentGraphController.listOpportunities);
router.post('/opportunities', authenticate, requireMutationOrigin, interactionLimiter, talentGraphController.createOpportunity);
router.get('/opportunities/:id/matches', optionalAuth, talentGraphController.getOpportunityMatches);
router.get('/opportunities/:id/coverage', optionalAuth, talentGraphController.getOpportunityCoverage);
router.post('/opportunities/:id/pilots', authenticate, requireMutationOrigin, interactionLimiter, talentGraphController.startPilot);
router.post('/opportunities/:id/referrals', authenticate, requireMutationOrigin, interactionLimiter, talentGraphController.createReferral);
router.get('/referrals/mine', authenticate, talentGraphController.listMyReferrals);
router.patch('/referrals/:referralId', authenticate, requireMutationOrigin, interactionLimiter, talentGraphController.updateReferral);
router.get('/pilots/mine', authenticate, talentGraphController.listMyPilots);
router.patch('/pilots/:pilotId', authenticate, requireMutationOrigin, interactionLimiter, talentGraphController.updatePilot);

export default router;
