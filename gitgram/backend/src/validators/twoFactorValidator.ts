import { body } from 'express-validator';

export const verify2FAValidator = [
  body('token')
    .notEmpty()
    .withMessage('Token is required')
    .isString()
    .withMessage('Token must be a string')
    .isLength({ min: 6, max: 6 })
    .withMessage('Token must be exactly 6 digits')
    .matches(/^\d{6}$/)
    .withMessage('Token must contain only digits'),
];

export const disable2FAValidator = [
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isString()
    .withMessage('Password must be a string')
    .isLength({ min: 1, max: 128 })
    .withMessage('Password must be between 1 and 128 characters'),
];

export const verifyLoginValidator = [
  body('userId')
    .notEmpty()
    .withMessage('User ID is required')
    .isString()
    .withMessage('User ID must be a string'),
  body('token')
    .notEmpty()
    .withMessage('Token is required')
    .isString()
    .withMessage('Token must be a string')
    .isLength({ min: 6, max: 6 })
    .withMessage('Token must be exactly 6 digits')
    .matches(/^\d{6}$/)
    .withMessage('Token must contain only digits'),
];
