import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { authenticate, optionalAuth } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { upload } from '../services/storageService';
import * as storeController from '../controllers/storeController';

const router = Router();

const itemIdValidation = validate([
  param('id').isString().notEmpty().withMessage('Invalid item id'),
]);

const createItemValidation = validate([
  body('title').optional().isString().trim().isLength({ max: 200 }).withMessage('Title must be under 200 characters'),
  body('name').optional().isString().trim().isLength({ max: 200 }).withMessage('Name must be under 200 characters'),
  body('description').optional().isString().trim().isLength({ max: 5000 }).withMessage('Description must be under 5000 characters'),
  body('price').exists().withMessage('Price is required'),
  body('category').optional().isString().trim().isLength({ max: 50 }),
]);

const listValidation = validate([
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
]);

// Public catalog (auth optional so logged-out users can browse)
router.get('/items', optionalAuth, listValidation, storeController.getItems);

// Authenticated: personal listings & purchases (declared before /items/:id to avoid collision)
router.get('/my/items', authenticate, storeController.getMyItems);
router.get('/my/purchases', authenticate, storeController.getPurchaseHistory);

router.get('/items/:id', optionalAuth, itemIdValidation, storeController.getItem);

router.post(
  '/items',
  authenticate,
  upload.array('images', 8),
  createItemValidation,
  storeController.createItem,
);

router.put(
  '/items/:id',
  authenticate,
  upload.array('images', 8),
  itemIdValidation,
  storeController.updateItem,
);

router.delete('/items/:id', authenticate, itemIdValidation, storeController.deleteItem);

// Purchase: support both REST style (/items/:id/purchase) and body style (/purchase)
router.post('/items/:id/purchase', authenticate, itemIdValidation, storeController.purchaseItem);
router.post(
  '/purchase',
  authenticate,
  validate([body('itemId').isString().notEmpty().withMessage('Item id is required')]),
  storeController.purchaseItem,
);

export default router;
