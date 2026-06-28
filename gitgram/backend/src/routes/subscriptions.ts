import express from 'express';
import * as subscriptionController from '../controllers/subscriptionController';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { createCheckoutValidator } from '../validators/subscriptionValidator';

const router = express.Router();

router.post('/checkout', authenticate, validate(createCheckoutValidator), subscriptionController.createCheckout);
router.get('/plans', authenticate, subscriptionController.getPlans);
router.get('/', authenticate, subscriptionController.getSubscription);
router.delete('/', authenticate, subscriptionController.cancelSubscription);

// NOTE: Polar webhooks are handled exclusively by the dedicated handler mounted at
// POST /api/v1/webhooks/polar (see src/routes/polarWebhooks.ts). That route is
// registered with express.raw BEFORE the global JSON body parser so HMAC signature
// verification receives the unparsed buffer. A previous duplicate route here was
// mounted AFTER express.json(), so its express.raw never saw a raw buffer and
// signature verification would always fail — it has been removed to avoid that foot-gun.

export default router;
