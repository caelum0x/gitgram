import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as webhookController from '../controllers/webhookController';
import { validate } from '../middleware/validation';
import {
  webhookIdValidator,
  createWebhookValidator,
  updateWebhookValidator,
} from '../validators/webhookValidator';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get all webhooks for the user
router.get('/', webhookController.getWebhooks);

// Get available webhook events
router.get('/events', webhookController.getWebhookEvents);

// Get a specific webhook
router.get('/:id', validate(webhookIdValidator), webhookController.getWebhook);

// Create a new webhook
router.post('/', validate(createWebhookValidator), webhookController.createWebhook);

// Update a webhook
router.patch('/:id', validate(updateWebhookValidator), webhookController.updateWebhook);

// Delete a webhook
router.delete('/:id', validate(webhookIdValidator), webhookController.deleteWebhook);

// Regenerate webhook secret
router.post('/:id/regenerate-secret', validate(webhookIdValidator), webhookController.regenerateSecret);

// Test a webhook
router.post('/:id/test', validate(webhookIdValidator), webhookController.testWebhook);

export default router;
