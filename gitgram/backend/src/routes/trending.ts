import { Router } from 'express';
import { trendingController } from '../controllers/trendingController';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/authorization';
import { validate } from '../middleware/validation';
import { trendingQueryValidator, updateSignalConfigValidator } from '../validators/trendingValidator';

const router = Router();

// Public trending endpoints (optional auth for personalization)

// GET /api/v1/trending?tier=hot|today|week|rising&language=&topic=&type=post|repository|user
router.get('/', validate(trendingQueryValidator), trendingController.getTrending);

// GET /api/v1/trending/posts?tier=hot|today|week|rising&language=&topic=
router.get('/posts', validate(trendingQueryValidator), trendingController.getTrendingPosts);

// GET /api/v1/trending/repos?tier=hot|today|week|rising&language=&topic=
router.get('/repos', validate(trendingQueryValidator), trendingController.getTrendingRepos);

// GET /api/v1/trending/creators?tier=hot|today|week|rising
router.get('/creators', validate(trendingQueryValidator), trendingController.getTrendingCreators);

// GET /api/v1/trending/repositories — trending repos with star count + language (merges GitHub trending)
router.get('/repositories', validate(trendingQueryValidator), trendingController.getTrendingRepositories);

// GET /api/v1/trending/users — trending developers by follower growth and post engagement
router.get('/users', validate(trendingQueryValidator), trendingController.getTrendingUsers);

// GET /api/v1/trending/tags — trending hashtags with post count
router.get('/tags', trendingController.getTrendingTags);

// GET /api/v1/trending/hashtags — top 20 trending hashtags (alias for /tags with limit=20)
router.get('/hashtags', trendingController.getTrendingHashtags);

// GET /api/v1/trending/developers — trending developers by follower growth this week
router.get('/developers', trendingController.getTrendingDevelopers);

// GET /api/v1/trending/snippets — trending code snippets
router.get('/snippets', trendingController.getTrendingSnippets);

// Admin: Signal weight configuration
router.get('/config', authenticate, requireRole('ADMIN', 'SUPER_ADMIN'), trendingController.getSignalConfig);
router.put('/config/:signalName', authenticate, requireRole('ADMIN', 'SUPER_ADMIN'), validate(updateSignalConfigValidator), trendingController.updateSignalConfig);

export default router;
