import express, { Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/authorization';
import * as auditLogService from '../services/auditLogService';
import type { AuditAction } from '../services/auditLogService';
import logger from '../utils/logger';

const router = express.Router();

const adminOnly = requireRole('ADMIN', 'SUPER_ADMIN');

// ---------------------------------------------------------------------------
// GET /audit-logs
// Admin: list all audit log entries with optional filters.
//
// Query params:
//   action    – AuditAction string
//   userId    – filter by a specific user
//   startDate – ISO date string (inclusive lower bound)
//   endDate   – ISO date string (inclusive upper bound)
//   page      – page number (default 1)
//   limit     – page size (default 50, max 100)
// ---------------------------------------------------------------------------
router.get('/', authenticate, adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      action,
      userId,
      startDate,
      endDate,
      page,
      limit,
    } = req.query as Record<string, string | undefined>;

    const result = await auditLogService.getAdminLogs({
      action: action as AuditAction | undefined,
      userId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });

    res.json({ success: true, ...result });
  } catch (err: unknown) {
    logger.error('GET /audit-logs failed', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve audit logs' });
  }
});

// ---------------------------------------------------------------------------
// GET /audit-logs/user/:userId
// Retrieve audit log entries for a specific user.
// Accessible by the authenticated user themselves or by an admin.
//
// Query params: action, startDate, endDate, page, limit
// ---------------------------------------------------------------------------
router.get('/user/:userId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const requestingUser = (req as Request & { user?: { id: string; role?: string } }).user;

    // Allow users to view their own logs; admins can view anyone's logs
    const isAdmin = requestingUser?.role === 'ADMIN' || requestingUser?.role === 'SUPER_ADMIN';
    if (!isAdmin && requestingUser?.id !== userId) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    const {
      action,
      startDate,
      endDate,
      page,
      limit,
    } = req.query as Record<string, string | undefined>;

    const result = await auditLogService.getUserLogs(userId, {
      action: action as AuditAction | undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });

    res.json({ success: true, ...result });
  } catch (err: unknown) {
    logger.error('GET /audit-logs/user/:userId failed', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve user audit logs' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /audit-logs/cleanup
// Admin: delete audit log entries older than `days` days.
//
// Query params:
//   days – number of days to retain (default 90)
// ---------------------------------------------------------------------------
router.delete('/cleanup', authenticate, adminOnly, async (req: Request, res: Response): Promise<void> => {
  try {
    const days = parseInt((req.query.days as string | undefined) ?? '90', 10);

    if (isNaN(days) || days < 1) {
      res.status(400).json({ success: false, error: '`days` must be a positive integer' });
      return;
    }

    const deleted = await auditLogService.deleteOldLogs(days);

    res.json({ success: true, data: { deleted, olderThanDays: days } });
  } catch (err: unknown) {
    logger.error('DELETE /audit-logs/cleanup failed', err);
    res.status(500).json({ success: false, error: 'Failed to clean up audit logs' });
  }
});

export default router;
