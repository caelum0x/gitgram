import { Router, Request, Response } from 'express';
import path from 'path';
import { authenticate } from '../middleware/auth';
import { dataExportLimiter } from '../middleware/rateLimiter';
import {
  createExportRequest,
  generateExport,
  getExportStatus,
  getExportDownload,
  listExportHistory,
} from '../services/dataExportService';
import logger from '../utils/logger';

const router = Router();

// All data-export routes require authentication.
router.use(authenticate);

// ---------------------------------------------------------------------------
// POST /data/export/request
// Enqueue a full data-export job for the authenticated user.
// Rate limited: 1 request per 24 hours (enforced both in middleware and service).
// ---------------------------------------------------------------------------
router.post('/request', dataExportLimiter, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId?: string }).userId;

  if (!userId) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  try {
    const exportRequest = await createExportRequest(userId);

    // Fire-and-forget: generate the export asynchronously so this endpoint
    // returns immediately with the exportId.
    setImmediate(() => {
      generateExport(exportRequest.exportId).catch((err: unknown) => {
        logger.error(`Background export generation failed: exportId=${exportRequest.exportId}`, err);
      });
    });

    res.status(202).json({
      success: true,
      data: {
        exportId: exportRequest.exportId,
        estimatedTime: '2-5 minutes',
        createdAt: exportRequest.createdAt,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create export request';

    // 429 for rate-limit errors surfaced from the service layer.
    const status = message.toLowerCase().includes('already requested') ? 429 : 500;

    logger.error('POST /data/export/request error:', error);
    res.status(status).json({ success: false, error: message });
  }
});

// ---------------------------------------------------------------------------
// GET /data/export/history
// List all export requests for the authenticated user.
// Placed before /:exportId routes to avoid ambiguous matching.
// ---------------------------------------------------------------------------
router.get('/history', async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId?: string }).userId;

  if (!userId) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  try {
    const { listExportHistory } = await import('../services/dataExportService');
    const history = await listExportHistory(userId);

    res.status(200).json({ success: true, data: history });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve export history';
    logger.error('GET /data/export/history error:', error);
    res.status(500).json({ success: false, error: message });
  }
});

// ---------------------------------------------------------------------------
// GET /data/export/:exportId/status
// Check the status and progress of an export job.
// ---------------------------------------------------------------------------
router.get('/:exportId/status', async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId?: string }).userId;
  const { exportId } = req.params;

  if (!userId) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  if (!exportId) {
    res.status(400).json({ success: false, error: 'exportId is required' });
    return;
  }

  try {
    const status = await getExportStatus(exportId, userId);
    res.status(200).json({ success: true, data: status });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve export status';
    const status = message === 'Export not found' ? 404 : 500;
    logger.error(`GET /data/export/${exportId}/status error:`, error);
    res.status(status).json({ success: false, error: message });
  }
});

// ---------------------------------------------------------------------------
// GET /data/export/:exportId/download
// Download the compiled export file.
// The export must be in 'ready' status and not yet expired.
// The file is served as a JSON attachment and expires 7 days after creation.
// ---------------------------------------------------------------------------
router.get('/:exportId/download', async (req: Request, res: Response): Promise<void> => {
  const userId = (req as Request & { userId?: string }).userId;
  const { exportId } = req.params;

  if (!userId) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  if (!exportId) {
    res.status(400).json({ success: false, error: 'exportId is required' });
    return;
  }

  try {
    const filePath = await getExportDownload(exportId, userId);
    const filename = path.basename(filePath);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');

    res.download(filePath, filename, (err) => {
      if (err) {
        logger.error(`Error streaming export file: exportId=${exportId}`, err);
        // Headers may already be sent; log but don't re-send.
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to download export';

    let status = 500;
    if (message === 'Export not found') status = 404;
    else if (message.toLowerCase().includes('expired')) status = 410;
    else if (message.toLowerCase().includes('still being generated')) status = 202;

    logger.error(`GET /data/export/${exportId}/download error:`, error);
    res.status(status).json({ success: false, error: message });
  }
});

export default router;
