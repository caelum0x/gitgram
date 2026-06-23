import { Router } from 'express';
import { accountController } from '../controllers/accountController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { usernameParamValidator, accountPostsValidator } from '../validators/accountValidator';

const router = Router();

// Public routes
router.get('/:owner/:repo', accountController.getRepositoryAccount);
router.get('/:owner/:repo/posts', accountController.getRepositoryPosts);
router.get('/:username', validate(usernameParamValidator), accountController.getAccount);
router.get('/:username/posts', validate(accountPostsValidator), accountController.getPosts);

// Protected routes
router.post('/:owner/:repo/follow', authenticate, accountController.followRepositoryAccount);
router.post('/:username/follow', authenticate, validate(usernameParamValidator), accountController.follow);
router.delete('/:username/follow', authenticate, validate(usernameParamValidator), accountController.unfollow);

export default router;
