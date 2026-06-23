import { Router } from 'express';
import * as snippetController from '../controllers/snippetController';
import { authenticate, optionalAuth } from '../middleware/auth';
import { validate } from '../middleware/validation';
import {
  createSnippetValidator,
  updateSnippetValidator,
  getSnippetsValidator,
  snippetIdValidator,
} from '../validators/snippetValidator';

const router = Router();

// CRUD
router.post('/', authenticate, validate(createSnippetValidator), snippetController.createSnippet);
router.get('/', optionalAuth, validate(getSnippetsValidator), snippetController.getSnippets);
router.get('/trending', optionalAuth, snippetController.getTrendingSnippets);
router.get('/:id', optionalAuth, validate(snippetIdValidator), snippetController.getSnippet);
router.put('/:id', authenticate, validate(updateSnippetValidator), snippetController.updateSnippet);
router.delete('/:id', authenticate, validate(snippetIdValidator), snippetController.deleteSnippet);

// Interactions
router.post('/:id/like', authenticate, validate(snippetIdValidator), snippetController.likeSnippet);

export default router;
