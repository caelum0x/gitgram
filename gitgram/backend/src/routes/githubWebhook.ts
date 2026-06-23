import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { verifyGitHubWebhook } from '../middleware/githubWebhookAuth';
import {
  handleWebhook,
  registerWebhookHandler,
  deactivateWebhookHandler,
  getWebhookStatusHandler
} from '../controllers/githubWebhookController';
import { validate } from '../middleware/validation';
import { registerWebhookValidator, ownerRepoParamsValidator } from '../validators/githubWebhookValidator';

const router = Router();

// Incoming webhook from GitHub (uses signature verification, no auth)
router.post('/incoming', verifyGitHubWebhook, handleWebhook);

// Webhook management (requires user authentication)
router.post('/register', authenticate, validate(registerWebhookValidator), registerWebhookHandler);
router.delete('/:owner/:repo', authenticate, validate(ownerRepoParamsValidator), deactivateWebhookHandler);
router.get('/:owner/:repo/status', validate(ownerRepoParamsValidator), getWebhookStatusHandler);

export default router;
