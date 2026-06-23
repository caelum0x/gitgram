import { body } from 'express-validator';

export const createCheckoutValidator = [
  body('plan')
    .notEmpty()
    .withMessage('Plan is required')
    .isIn(['premium', 'creator'])
    .withMessage('Plan must be one of: premium, creator'),
];
