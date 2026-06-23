import express from 'express';
import path from 'path';
import { authenticate } from '../middleware/auth';
import { requireRole, requireSuperAdmin } from '../middleware/authorization';
import { validate } from '../middleware/validation';
import { createDatabaseBackup, restoreDatabaseBackup } from '../utils/backup';
import { getDatabaseStats, checkDatabaseHealth } from '../utils/dbHealth';
import { getRequestMetrics } from '../middleware/requestMetrics';
import { performanceMonitor } from '../middleware/performanceMonitor';
import { uptimeMonitor } from '../utils/uptimeMonitor';
import logger from '../utils/logger';
import * as adminController from '../controllers/adminController';
import * as adminModerationController from '../controllers/adminModerationController';
import * as abuseDetection from '../services/abuseDetectionService';
import { getAbuseIncidents, getAbuseStats } from '../services/abuseTelemetryService';
import { userModerationActionLimit } from '../middleware/tieredRateLimiter';
import {
  getUsersValidator,
  userIdValidator,
  updateUserValidator,
  banUserValidator,
  deleteUserValidator,
  getReportsValidator,
  resolveReportValidator,
  moderatePostValidator,
  getAnalyticsValidator,
  getAuditLogsValidator,
  updateConfigValidator,
  sendAnnouncementValidator,
  bulkBanValidator,
  exportDataValidator,
  getModerationQueueValidator,
  reportIdValidator,
  resolveModerationReportValidator,
  getModerationAppealsValidator,
  reviewModerationAppealValidator,
  getAbuseIncidentsValidator,
  updateAbuseConfigValidator,
} from '../validators/adminValidator';

const router = express.Router();

// All admin routes require authentication.
router.use(authenticate);

const adminOnly = requireRole('ADMIN');
const moderationAccess = requireRole('MODERATOR', 'ADMIN', 'SUPER_ADMIN');

// ============================================================================
// DASHBOARD & ANALYTICS
// ============================================================================

// Dashboard overview
router.get('/dashboard', adminOnly, adminController.getDashboardStats);

// Detailed analytics
router.get('/analytics', adminOnly, validate(getAnalyticsValidator), adminController.getAnalytics);

// ============================================================================
// USER MANAGEMENT
// ============================================================================

// List users with filters
router.get('/users', adminOnly, validate(getUsersValidator), adminController.getUsers);

// Get user details
router.get('/users/:userId', adminOnly, validate(userIdValidator), adminController.getUserDetails);

// Update user
router.put('/users/:userId', adminOnly, validate(updateUserValidator), adminController.updateUser);

// Ban user
router.post('/users/:userId/ban', adminOnly, validate(banUserValidator), adminController.banUser);

// Unban user
router.post('/users/:userId/unban', adminOnly, validate(userIdValidator), adminController.unbanUser);

// Delete user
router.delete('/users/:userId', adminOnly, validate(deleteUserValidator), adminController.deleteUser);

// ============================================================================
// CONTENT MODERATION
// ============================================================================

// Get reports (legacy - uses PostReport model)
router.get('/reports', adminOnly, validate(getReportsValidator), adminController.getReports);

// Resolve report (legacy - uses PostReport model)
router.post(
  '/reports/:reportId/resolve',
  adminOnly,
  userModerationActionLimit,
  validate(resolveReportValidator),
  adminController.resolveReport
);

// Get flagged content
router.get('/flagged', adminOnly, adminController.getFlaggedContent);

// Moderate post
router.post(
  '/posts/:postId/moderate',
  adminOnly,
  userModerationActionLimit,
  validate(moderatePostValidator),
  adminController.moderatePost
);

// ============================================================================
// MODERATION QUEUE (New - uses Report model with full content support)
// ============================================================================

// Get pending reports with pagination, sorted by priority (severity) and date
router.get('/moderation/queue', moderationAccess, validate(getModerationQueueValidator), adminModerationController.getModerationQueue);

// Get specific report details with full content and history
router.get('/moderation/queue/:id', moderationAccess, validate(reportIdValidator), adminModerationController.getReportDetails);

// Resolve a report with action (approve, dismiss, warn_user, remove_content, ban_user)
router.put(
  '/moderation/queue/:id/resolve',
  moderationAccess,
  userModerationActionLimit,
  validate(resolveModerationReportValidator),
  adminModerationController.resolveReport
);

// Get moderation statistics (overview, trends, breakdown by type/reason, moderator activity)
router.get('/moderation/stats', moderationAccess, adminModerationController.getModerationStats);

// Get moderation appeals queue
router.get('/moderation/appeals', moderationAccess, validate(getModerationAppealsValidator), adminModerationController.getAppeals);

// Review moderation appeal
router.put(
  '/moderation/appeals/:id/review',
  moderationAccess,
  userModerationActionLimit,
  validate(reviewModerationAppealValidator),
  adminModerationController.reviewAppealAction
);

// ============================================================================
// AUDIT LOGS
// ============================================================================

router.get('/audit-logs', adminOnly, validate(getAuditLogsValidator), adminController.getAuditLogs);

// ============================================================================
// SYSTEM CONFIGURATION
// ============================================================================

router.get('/config', adminOnly, adminController.getSystemConfig);
router.put('/config', adminOnly, validate(updateConfigValidator), adminController.updateSystemConfig);

// ============================================================================
// BULK ACTIONS
// ============================================================================

// Send announcement
router.post('/announcements', adminOnly, validate(sendAnnouncementValidator), adminController.sendAnnouncement);

// Bulk ban users (SUPER_ADMIN only)
router.post('/users/bulk-ban', adminOnly, requireSuperAdmin, validate(bulkBanValidator), adminController.bulkBanUsers);

// Export data
router.get('/export', adminOnly, validate(exportDataValidator), adminController.exportData);

// ============================================================================
// SYSTEM HEALTH & MONITORING (existing endpoints)
// ============================================================================

// Database health check
router.get('/health/database', adminOnly, async (req, res) => {
  try {
    const health = await checkDatabaseHealth();
    res.json(health);
  } catch (error) {
    logger.error('Database health check failed:', error);
    res.status(500).json({ error: 'Health check failed' });
  }
});

// Database statistics
router.get('/stats/database', adminOnly, async (req, res) => {
  try {
    const stats = await getDatabaseStats();
    res.json(stats);
  } catch (error) {
    logger.error('Failed to get database stats:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Request metrics
router.get('/stats/requests', adminOnly, (req, res) => {
  try {
    const metrics = getRequestMetrics();
    res.json(metrics);
  } catch (error) {
    logger.error('Failed to get request metrics:', error);
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

// Performance metrics
router.get('/stats/performance', adminOnly, (req, res) => {
  try {
    const endpoint = req.query.endpoint as string | undefined;
    const stats = {
      averageResponseTime: performanceMonitor.getAverageResponseTime(endpoint),
      p95ResponseTime: performanceMonitor.getP95ResponseTime(endpoint),
      errorRate: performanceMonitor.getErrorRate(endpoint),
      memoryStats: performanceMonitor.getMemoryStats(),
      endpointStats: performanceMonitor.getEndpointStats(),
    };
    res.json(stats);
  } catch (error) {
    logger.error('Failed to get performance metrics:', error);
    res.status(500).json({ error: 'Failed to get performance metrics' });
  }
});

// Uptime statistics
router.get('/stats/uptime', adminOnly, (req, res) => {
  try {
    const stats = uptimeMonitor.getStats();
    const uptime24h = uptimeMonitor.getUptimePercentage(24 * 60 * 60 * 1000);
    const uptime7d = uptimeMonitor.getUptimePercentage(7 * 24 * 60 * 60 * 1000);
    
    res.json({
      ...stats,
      uptime24h: `${uptime24h.toFixed(2)}%`,
      uptime7d: `${uptime7d.toFixed(2)}%`,
    });
  } catch (error) {
    logger.error('Failed to get uptime stats:', error);
    res.status(500).json({ error: 'Failed to get uptime stats' });
  }
});

// ============================================================================
// ABUSE SCORE MANAGEMENT
// ============================================================================

// Get aggregate abuse telemetry stats
router.get('/abuse/stats', adminOnly, async (req, res) => {
  try {
    const days = Number(req.query.days || 7);
    const stats = await getAbuseStats(days);
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Failed to get abuse stats:', error);
    res.status(500).json({ error: 'Failed to get abuse stats' });
  }
});

// Get abuse incidents feed with filters and pagination
router.get('/abuse/incidents', adminOnly, validate(getAbuseIncidentsValidator), async (req, res) => {
  try {
    const incidents = await getAbuseIncidents({
      days: req.query.days ? Number(req.query.days) : undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      action: req.query.action ? String(req.query.action) : undefined,
      userId: req.query.userId ? String(req.query.userId) : undefined,
    });
    res.json({ success: true, data: incidents });
  } catch (error) {
    logger.error('Failed to get abuse incidents:', error);
    res.status(500).json({ error: 'Failed to get abuse incidents' });
  }
});

// Get runtime abuse configuration
router.get('/abuse/config', adminOnly, (req, res) => {
  try {
    const config = abuseDetection.getRuntimeConfig();
    res.json({ success: true, data: config });
  } catch (error) {
    logger.error('Failed to get abuse config:', error);
    res.status(500).json({ error: 'Failed to get abuse config' });
  }
});

// Update runtime abuse configuration
router.put('/abuse/config', adminOnly, validate(updateAbuseConfigValidator), (req, res) => {
  try {
    const updated = abuseDetection.updateRuntimeConfig(req.body || {});
    logger.info(`Admin updated abuse config by admin ${(req as any).userId}`);
    res.json({ success: true, data: updated });
  } catch (error) {
    logger.error('Failed to update abuse config:', error);
    res.status(500).json({ error: 'Failed to update abuse config' });
  }
});

// Reset runtime abuse configuration to env defaults
router.post('/abuse/config/reset', adminOnly, (req, res) => {
  try {
    const reset = abuseDetection.resetRuntimeConfig();
    logger.info(`Admin reset abuse config by admin ${(req as any).userId}`);
    res.json({ success: true, data: reset });
  } catch (error) {
    logger.error('Failed to reset abuse config:', error);
    res.status(500).json({ error: 'Failed to reset abuse config' });
  }
});

// Get abuse status for a user
router.get('/abuse/:userId', adminOnly, async (req, res) => {
  try {
    const status = await abuseDetection.getStatus(req.params.userId);
    const record = await abuseDetection.getFullRecord(req.params.userId);
    res.json({ status, record });
  } catch (error) {
    logger.error('Failed to get abuse status:', error);
    res.status(500).json({ error: 'Failed to get abuse status' });
  }
});

// Reset abuse score for a user
router.post('/abuse/:userId/reset', adminOnly, async (req, res) => {
  try {
    const status = await abuseDetection.adminReset(req.params.userId);
    logger.info(`Admin reset abuse score for user ${req.params.userId} by admin ${(req as any).userId}`);
    res.json({ message: 'Abuse score reset', status });
  } catch (error) {
    logger.error('Failed to reset abuse score:', error);
    res.status(500).json({ error: 'Failed to reset abuse score' });
  }
});

// Override restriction for a user
router.post('/abuse/:userId/restrict', adminOnly, async (req, res) => {
  try {
    const { level, durationMinutes } = req.body;
    if (!level || !['none', 'soft', 'hard'].includes(level)) {
      return res.status(400).json({ error: 'Invalid restriction level. Must be none, soft, or hard.' });
    }
    const status = await abuseDetection.adminOverride(
      req.params.userId,
      level as abuseDetection.RestrictionLevel,
      durationMinutes
    );
    logger.info(
      `Admin override restriction for user ${req.params.userId}: level=${level} ` +
      `duration=${durationMinutes || 'default'} by admin ${(req as any).userId}`
    );
    res.json({ message: 'Restriction updated', status });
  } catch (error) {
    logger.error('Failed to override restriction:', error);
    res.status(500).json({ error: 'Failed to override restriction' });
  }
});

// ============================================================================
// DATABASE BACKUP & RESTORE
// ============================================================================

// Create database backup (SUPER_ADMIN only)
router.post('/backup/create', adminOnly, requireSuperAdmin, async (req, res) => {
  try {
    const backupFile = await createDatabaseBackup({
      outputDir: req.body.outputDir,
      compress: req.body.compress !== false,
      retentionDays: req.body.retentionDays || 7,
    });
    res.json({ message: 'Backup created successfully', file: backupFile });
  } catch (error: any) {
    logger.error('Backup creation failed:', error);
    res.status(500).json({ error: error.message || 'Backup failed' });
  }
});

// Restore database backup (SUPER_ADMIN only - dangerous operation)
router.post('/backup/restore', adminOnly, requireSuperAdmin, async (req, res) => {
  try {
    const { backupFile } = req.body;
    if (!backupFile) {
      return res.status(400).json({ error: 'backupFile is required' });
    }

    // Security: Sanitize backupFile to prevent path traversal attacks
    // Extract only the filename, stripping any path components
    const sanitizedFilename = path.basename(backupFile);

    // Validate the filename is a simple name without path separators
    if (sanitizedFilename !== backupFile || backupFile.includes('..') || backupFile.includes('/') || backupFile.includes('\\')) {
      logger.warn('Path traversal attempt detected in backup restore', {
        originalInput: backupFile,
        userId: (req as any).user?.id
      });
      return res.status(400).json({ error: 'Invalid backup filename. Only simple filenames are allowed.' });
    }

    // Validate file extension - only allow .sql or .dump files
    const allowedExtensions = ['.sql', '.dump', '.sql.gz', '.dump.gz'];
    const hasValidExtension = allowedExtensions.some(ext => sanitizedFilename.endsWith(ext));
    if (!hasValidExtension) {
      return res.status(400).json({ error: 'Invalid backup file type. Only .sql, .dump, .sql.gz, or .dump.gz files are allowed.' });
    }

    // Validate filename format (alphanumeric, hyphens, underscores, and dots only)
    const validFilenamePattern = /^[a-zA-Z0-9_\-\.]+$/;
    if (!validFilenamePattern.test(sanitizedFilename)) {
      return res.status(400).json({ error: 'Invalid characters in backup filename.' });
    }

    // Construct the full path using the allowed backup directory
    const ALLOWED_BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');
    const fullBackupPath = path.join(ALLOWED_BACKUP_DIR, sanitizedFilename);

    // Final check: ensure the resolved path is within the allowed directory
    const resolvedPath = path.resolve(fullBackupPath);
    const resolvedBackupDir = path.resolve(ALLOWED_BACKUP_DIR);
    if (!resolvedPath.startsWith(resolvedBackupDir + path.sep)) {
      logger.warn('Path escape attempt detected in backup restore', {
        resolvedPath,
        allowedDir: resolvedBackupDir,
        userId: (req as any).user?.id
      });
      return res.status(400).json({ error: 'Invalid backup file path.' });
    }

    await restoreDatabaseBackup(fullBackupPath);
    res.json({ message: 'Database restored successfully' });
  } catch (error: any) {
    logger.error('Restore failed:', error);
    res.status(500).json({ error: error.message || 'Restore failed' });
  }
});

export default router;
