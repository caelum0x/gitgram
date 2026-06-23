import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { exportUserData } from '../services/dataExportService';
import logger from '../utils/logger';
import path from 'path';
import fs from 'fs/promises';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

/**
 * Request data export
 * POST /api/v1/data-export/request
 */
export const requestDataExport = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId;

    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    // Generate export file
    const filepath = await exportUserData(userId);
    const filename = path.basename(filepath);

    logger.info(`Data export generated for user ${userId}: ${filename}`);

    res.json({
        message: 'Data export ready',
        downloadUrl: `/api/v1/data-export/download/${filename}`,
        filename,
    });
});

/**
 * Download data export file
 * GET /api/v1/data-export/download/:filename
 */
export const downloadDataExport = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    const { filename } = req.params;

    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    // Validate filename format and user ownership
    const filenameRegex = /^user-data-([a-zA-Z0-9]+)-\d+\.json$/;
    const match = filename.match(filenameRegex);

    if (!match) {
        throw Errors.badRequest('Invalid filename format');
    }

    const fileUserId = match[1];
    if (fileUserId !== userId) {
        throw Errors.forbidden('Not authorized to download this file');
    }

    const exportDir = path.join(__dirname, '../../exports');
    const filepath = path.join(exportDir, filename);

    // Check if file exists
    try {
        await fs.access(filepath);
    } catch {
        throw Errors.notFound('Export file');
    }

    res.download(filepath, filename, (err) => {
        if (err) {
            logger.error('Download error:', err);
            if (!res.headersSent) {
                res.status(500).json({ message: 'Failed to download file' });
            }
        }
    });
});

/**
 * Get export status/history
 * GET /api/v1/data-export/status
 */
export const getExportStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId;

    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    const exportDir = path.join(__dirname, '../../exports');

    // Check if exports directory exists
    try {
        await fs.access(exportDir);
    } catch {
        return res.json({ exports: [] });
    }

    // List user's export files
    const files = await fs.readdir(exportDir);
    const userFiles = files.filter(f => f.startsWith(`user-data-${userId}-`));

    const exports = await Promise.all(
        userFiles.map(async (filename) => {
            const filepath = path.join(exportDir, filename);
            const stats = await fs.stat(filepath);
            return {
                filename,
                downloadUrl: `/api/v1/data-export/download/${filename}`,
                createdAt: stats.birthtime,
                size: stats.size,
            };
        })
    );

    // Sort by creation date, newest first
    exports.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    res.json({ exports });
});

/**
 * Delete an export file
 * DELETE /api/v1/data-export/:filename
 */
export const deleteExport = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    const { filename } = req.params;

    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    // Validate filename format and user ownership
    const filenameRegex = /^user-data-([a-zA-Z0-9]+)-\d+\.json$/;
    const match = filename.match(filenameRegex);

    if (!match) {
        throw Errors.badRequest('Invalid filename format');
    }

    const fileUserId = match[1];
    if (fileUserId !== userId) {
        throw Errors.forbidden('Not authorized to delete this file');
    }

    const exportDir = path.join(__dirname, '../../exports');
    const filepath = path.join(exportDir, filename);

    try {
        await fs.unlink(filepath);
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            throw Errors.notFound('Export file');
        }
        throw error;
    }

    logger.info(`Data export deleted for user ${userId}: ${filename}`);
    res.json({ message: 'Export file deleted successfully' });
});
