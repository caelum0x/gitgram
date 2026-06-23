import { Router } from 'express';
import { popularController } from '../controllers/popularController';
import { validate } from '../middleware/validation';
import { popularPaginationValidator } from '../validators/popularValidator';

const router = Router();

// Get popular posts
router.get('/posts', validate(popularPaginationValidator), popularController.getPopularPosts);

// Get trending hashtags
router.get('/hashtags', validate(popularPaginationValidator), popularController.getTrendingHashtags);

// Get popular users
router.get('/users', validate(popularPaginationValidator), popularController.getPopularUsers);

export default router;
