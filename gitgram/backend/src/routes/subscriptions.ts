import express from 'express';
import * as subscriptionController from '../controllers/subscriptionController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { createCheckoutValidator } from '../validators/subscriptionValidator';

const router = express.Router();

router.post('/checkout', authenticate, validate(createCheckoutValidator), subscriptionController.createCheckout);
router.get('/', authenticate, subscriptionController.getSubscription);
router.delete('/', authenticate, subscriptionController.cancelSubscription);
router.post('/webhook', express.raw({ type: 'application/json' }), subscriptionController.webhook as any);

export default router;
