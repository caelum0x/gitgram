import express from 'express';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/authorization';
import {
  getDashboardStats,
  getUsers,
  suspendUser,
  unsuspendUser,
  getPendingReports,
  resolveReportPanel,
  getAuditLog,
} from '../controllers/adminController';

const router = express.Router();

// All routes in this panel require authentication + ADMIN role
router.use(authenticate);
router.use(requireAdmin);

// ============================================================================
// DASHBOARD
// ============================================================================

/**
 * GET /admin/panel/dashboard
 * Aggregated platform stats: user counts, content counts, active users, revenue
 */
router.get('/dashboard', getDashboardStats);

// ============================================================================
// USER MANAGEMENT
// ============================================================================

/**
 * GET /admin/panel/users
 * Paginated, searchable user list
 * Query: page, limit, search, sort (sortBy + sortOrder)
 */
router.get('/users', getUsers);

/**
 * POST /admin/panel/users/:userId/suspend
 * Suspend a user — sets isSuspended = true, logs to audit trail
 * Body: { reason?: string, suspendedUntil?: string (ISO date) }
 */
router.post('/users/:userId/suspend', suspendUser);

/**
 * POST /admin/panel/users/:userId/unsuspend
 * Lift a suspension — sets isSuspended = false
 */
router.post('/users/:userId/unsuspend', unsuspendUser);

// ============================================================================
// CONTENT REPORTS
// ============================================================================

/**
 * GET /admin/panel/reports/pending
 * Unresolved content reports sorted by priority then age
 * Query: page, limit
 */
router.get('/reports/pending', getPendingReports);

/**
 * POST /admin/panel/reports/:reportId/resolve
 * Resolve a report with an action
 * Body: { action: 'dismiss' | 'remove_content' | 'suspend_user', note?: string }
 */
router.post('/reports/:reportId/resolve', resolveReportPanel);

// ============================================================================
// AUDIT LOG
// ============================================================================

/**
 * GET /admin/panel/audit-log
 * Recent admin actions for accountability
 * Query: page, limit, adminId, action
 */
router.get('/audit-log', getAuditLog);

export default router;
