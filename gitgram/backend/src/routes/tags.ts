import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as tagController from '../controllers/tagController';
import { validate } from '../middleware/validation';
import {
  trendingTagsValidator,
  searchTagsValidator,
  tagPostsValidator,
} from '../validators/tagValidator';

const router = Router();

router.get('/trending', authenticate, validate(trendingTagsValidator), tagController.getTrendingTags);
router.get('/search', authenticate, validate(searchTagsValidator), tagController.searchTags);
router.get('/:name/posts', authenticate, validate(tagPostsValidator), tagController.getTagPosts);

export default router;
