import { param, query, body, ValidationChain } from 'express-validator';

// ============================================================================
// USER MANAGEMENT VALIDATORS
// ============================================================================

/**
 * Get users validator
 */
export const getUsersValidator: ValidationChain[] = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
  query('search')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Search query must be less than 100 characters'),
  query('role')
    .optional()
    .isIn(['user', 'admin', 'moderator'])
    .withMessage('Invalid role'),
  query('status')
    .optional()
    .isIn(['banned', 'verified', 'unverified', 'all'])
    .withMessage('Invalid status'),
  query('sortBy')
    .optional()
    .isIn(['createdAt', 'username', 'lastActive', 'email'])
    .withMessage('Invalid sort field'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc'),
];

/**
 * User ID param validator
 */
export const userIdValidator: ValidationChain[] = [
  param('userId')
    .notEmpty()
    .withMessage('User ID is required')
    .isString()
    .withMessage('User ID must be a string'),
];

/**
 * Update user validator
 */
export const updateUserValidator: ValidationChain[] = [
  ...userIdValidator,
  body('role')
    .optional()
    .isIn(['user', 'admin', 'moderator'])
    .withMessage('Invalid role'),
  body('isVerified')
    .optional()
    .isBoolean()
    .withMessage('isVerified must be a boolean'),
  body('isBanned')
    .optional()
    .isBoolean()
    .withMessage('isBanned must be a boolean'),
  body('banReason')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Ban reason must be less than 500 characters'),
];

/**
 * Ban user validator
 */
export const banUserValidator: ValidationChain[] = [
  ...userIdValidator,
  body('reason')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Reason must be less than 500 characters'),
  body('duration')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Duration must be between 1 and 365 days')
    .toInt(),
];

/**
 * Delete user validator
 */
export const deleteUserValidator: ValidationChain[] = [
  ...userIdValidator,
  body('permanent')
    .optional()
    .isBoolean()
    .withMessage('permanent must be a boolean'),
];

// ============================================================================
// CONTENT MODERATION VALIDATORS
// ============================================================================

/**
 * Get reports validator
 */
export const getReportsValidator: ValidationChain[] = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
  query('status')
    .optional()
    .isIn(['pending', 'resolved', 'dismissed'])
    .withMessage('Invalid status'),
  query('type')
    .optional()
    .isIn(['post', 'comment', 'user', 'message'])
    .withMessage('Invalid report type'),
];

/**
 * Resolve report validator
 */
export const resolveReportValidator: ValidationChain[] = [
  param('reportId')
    .notEmpty()
    .withMessage('Report ID is required')
    .isString()
    .withMessage('Report ID must be a string'),
  body('action')
    .notEmpty()
    .withMessage('Action is required')
    .isIn(['dismiss', 'warn_user', 'remove_content', 'ban_user'])
    .withMessage('Invalid action'),
  body('note')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Note must be less than 1000 characters'),
];

/**
 * Moderate post validator
 */
export const moderatePostValidator: ValidationChain[] = [
  param('postId')
    .notEmpty()
    .withMessage('Post ID is required')
    .isString()
    .withMessage('Post ID must be a string'),
  body('action')
    .notEmpty()
    .withMessage('Action is required')
    .isIn(['approve', 'remove'])
    .withMessage('Action must be approve or remove'),
  body('reason')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Reason must be less than 500 characters'),
];

// ============================================================================
// ANALYTICS VALIDATORS
// ============================================================================

/**
 * Get analytics validator
 */
export const getAnalyticsValidator: ValidationChain[] = [
  query('timeframe')
    .optional()
    .isIn(['24h', '7d', '30d', '90d', 'year', 'all'])
    .withMessage('Invalid timeframe'),
];

// ============================================================================
// AUDIT LOG VALIDATORS
// ============================================================================

/**
 * Get audit logs validator
 */
export const getAuditLogsValidator: ValidationChain[] = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
  query('adminId')
    .optional()
    .isString()
    .withMessage('Admin ID must be a string'),
  query('action')
    .optional()
    .isString()
    .withMessage('Action must be a string'),
];

// ============================================================================
// CONFIGURATION VALIDATORS
// ============================================================================

/**
 * Update config validator
 */
export const updateConfigValidator: ValidationChain[] = [
  body('key')
    .notEmpty()
    .withMessage('Key is required')
    .isString()
    .isIn(['MAINTENANCE_MODE', 'REGISTRATION_ENABLED'])
    .withMessage('Invalid configuration key'),
  body('value')
    .notEmpty()
    .withMessage('Value is required')
    .isString()
    .isIn(['true', 'false'])
    .withMessage('Value must be true or false'),
];

// ============================================================================
// BULK ACTION VALIDATORS
// ============================================================================

/**
 * Send announcement validator
 */
export const sendAnnouncementValidator: ValidationChain[] = [
  body('title')
    .notEmpty()
    .withMessage('Title is required')
    .isString()
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Title must be between 3 and 100 characters'),
  body('message')
    .notEmpty()
    .withMessage('Message is required')
    .isString()
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Message must be between 10 and 1000 characters'),
  body('targetRole')
    .optional()
    .isIn(['user', 'admin', 'moderator', 'all'])
    .withMessage('Invalid target role'),
];

/**
 * Bulk ban validator
 */
export const bulkBanValidator: ValidationChain[] = [
  body('userIds')
    .isArray({ min: 1, max: 100 })
    .withMessage('userIds must be an array with 1-100 items'),
  body('userIds.*')
    .isString()
    .withMessage('Each userId must be a string'),
  body('reason')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Reason must be less than 500 characters'),
];

/**
 * Export data validator
 */
export const exportDataValidator: ValidationChain[] = [
  query('type')
    .notEmpty()
    .withMessage('Export type is required')
    .isIn(['users', 'posts'])
    .withMessage('Invalid export type (use: users, posts)'),
  query('format')
    .optional()
    .isIn(['json', 'csv'])
    .withMessage('Format must be json or csv'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
];

// ============================================================================
// MODERATION QUEUE VALIDATORS
// ============================================================================

/**
 * Get moderation queue validator
 */
export const getModerationQueueValidator: ValidationChain[] = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
  query('status')
    .optional()
    .isIn(['PENDING', 'REVIEWING', 'RESOLVED', 'DISMISSED'])
    .withMessage('Invalid status. Use: PENDING, REVIEWING, RESOLVED, DISMISSED'),
  query('targetType')
    .optional()
    .isIn(['POST', 'COMMENT', 'USER', 'REEL', 'STORY'])
    .withMessage('Invalid target type. Use: POST, COMMENT, USER, REEL, STORY'),
  query('reason')
    .optional()
    .isIn(['SPAM', 'HARASSMENT', 'INAPPROPRIATE', 'MISINFORMATION', 'OTHER'])
    .withMessage('Invalid reason. Use: SPAM, HARASSMENT, INAPPROPRIATE, MISINFORMATION, OTHER'),
];

/**
 * Report ID param validator
 */
export const reportIdValidator: ValidationChain[] = [
  param('id')
    .notEmpty()
    .withMessage('Report ID is required')
    .isString()
    .withMessage('Report ID must be a string'),
];

/**
 * Resolve moderation report validator
 */
export const resolveModerationReportValidator: ValidationChain[] = [
  ...reportIdValidator,
  body('action')
    .notEmpty()
    .withMessage('Action is required')
    .isIn(['approve', 'dismiss', 'warn_user', 'remove_content', 'suspend_user', 'ban_user'])
    .withMessage('Invalid action. Use: approve, dismiss, warn_user, remove_content, suspend_user, ban_user'),
  body('resolution')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Resolution notes must be less than 1000 characters'),
  body('duration')
    .optional()
    .isInt({ min: 1, max: 8760 })
    .withMessage('Duration must be between 1 and 8760 hours (365 days)')
    .toInt(),
];

/**
 * Get moderation appeals validator
 */
export const getModerationAppealsValidator: ValidationChain[] = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
  query('status')
    .optional()
    .isIn(['PENDING', 'APPROVED', 'DENIED', 'ALL'])
    .withMessage('Invalid status. Use: PENDING, APPROVED, DENIED, ALL'),
];

/**
 * Review moderation appeal validator
 */
export const reviewModerationAppealValidator: ValidationChain[] = [
  param('id')
    .notEmpty()
    .withMessage('Appeal ID is required')
    .isString()
    .withMessage('Appeal ID must be a string'),
  body('decision')
    .notEmpty()
    .withMessage('Decision is required')
    .isIn(['APPROVED', 'DENIED'])
    .withMessage('Decision must be APPROVED or DENIED'),
  body('reviewNotes')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Review notes must be less than 1000 characters'),
];

/**
 * Update abuse runtime config validator
 */
export const updateAbuseConfigValidator: ValidationChain[] = [
  body('softRestrictThreshold')
    .optional()
    .isInt({ min: 1, max: 100000 })
    .withMessage('softRestrictThreshold must be an integer between 1 and 100000')
    .toInt(),
  body('hardRestrictThreshold')
    .optional()
    .isInt({ min: 1, max: 100000 })
    .withMessage('hardRestrictThreshold must be an integer between 1 and 100000')
    .toInt(),
  body('softRestrictDurationMin')
    .optional()
    .isInt({ min: 1, max: 10080 })
    .withMessage('softRestrictDurationMin must be an integer between 1 and 10080')
    .toInt(),
  body('hardRestrictDurationMin')
    .optional()
    .isInt({ min: 1, max: 10080 })
    .withMessage('hardRestrictDurationMin must be an integer between 1 and 10080')
    .toInt(),
  body('scoreDecayPerHour')
    .optional()
    .isInt({ min: 0, max: 10000 })
    .withMessage('scoreDecayPerHour must be an integer between 0 and 10000')
    .toInt(),
  body('violationPoints')
    .optional()
    .isObject()
    .withMessage('violationPoints must be an object'),
  body('violationPoints.RATE_LIMIT_HIT')
    .optional()
    .isInt({ min: 0, max: 10000 })
    .withMessage('violationPoints.RATE_LIMIT_HIT must be an integer between 0 and 10000')
    .toInt(),
  body('violationPoints.DUPLICATE_CONTENT')
    .optional()
    .isInt({ min: 0, max: 10000 })
    .withMessage('violationPoints.DUPLICATE_CONTENT must be an integer between 0 and 10000')
    .toInt(),
  body('violationPoints.RAPID_FIRE_ACTION')
    .optional()
    .isInt({ min: 0, max: 10000 })
    .withMessage('violationPoints.RAPID_FIRE_ACTION must be an integer between 0 and 10000')
    .toInt(),
  body('violationPoints.SPAM_CONTENT')
    .optional()
    .isInt({ min: 0, max: 10000 })
    .withMessage('violationPoints.SPAM_CONTENT must be an integer between 0 and 10000')
    .toInt(),
  body('violationPoints.REPEATED_OFFENSE')
    .optional()
    .isInt({ min: 0, max: 10000 })
    .withMessage('violationPoints.REPEATED_OFFENSE must be an integer between 0 and 10000')
    .toInt(),
];

/**
 * Get abuse incidents validator
 */
export const getAbuseIncidentsValidator: ValidationChain[] = [
  query('days')
    .optional()
    .isInt({ min: 1, max: 90 })
    .withMessage('days must be an integer between 1 and 90')
    .toInt(),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 200 })
    .withMessage('limit must be an integer between 1 and 200')
    .toInt(),
  query('action')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 120 })
    .withMessage('action must be between 1 and 120 characters'),
  query('userId')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('userId must be between 1 and 100 characters'),
];
