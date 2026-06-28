import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { optionalAuth } from '../middleware/auth';
import { validate } from '../middleware/validation';
import * as locationController from '../controllers/locationController';

const router = Router();

const nearbyValidation = validate([
  query('latitude').isFloat({ min: -90, max: 90 }).withMessage('A valid latitude is required'),
  query('longitude').isFloat({ min: -180, max: 180 }).withMessage('A valid longitude is required'),
  query('radius').optional().isFloat({ min: 0.1, max: 500 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
]);

router.get('/projects/nearby', optionalAuth, nearbyValidation, locationController.getNearbyProjects);
router.get('/posts/nearby', optionalAuth, nearbyValidation, locationController.getNearbyPosts);
router.get('/users/nearby', optionalAuth, nearbyValidation, locationController.getNearbyUsers);

router.post(
  '/geocode',
  optionalAuth,
  validate([body('address').isString().trim().isLength({ min: 1, max: 300 }).withMessage('Address is required')]),
  locationController.geocode,
);

router.get(
  '/search',
  optionalAuth,
  validate([query('q').optional().isString().trim().isLength({ max: 300 })]),
  locationController.searchLocations,
);

router.get(
  '/trending',
  optionalAuth,
  validate([query('limit').optional().isInt({ min: 1, max: 100 })]),
  locationController.getTrendingLocations,
);

// Posts at a named location (declared last so it doesn't shadow the routes above)
router.get(
  '/:name/posts',
  optionalAuth,
  validate([
    param('name').isString().trim().isLength({ min: 1, max: 300 }),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 60 }),
  ]),
  locationController.getLocationPosts,
);

export default router;
