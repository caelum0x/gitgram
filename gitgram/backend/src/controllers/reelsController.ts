import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';
import { uploadMedia } from '../services/storageService';
import { repositoryService } from '../services/repositoryService';
import { musicService } from '../services/musicService';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

const reelInclude = {
    user: {
        select: {
            id: true,
            username: true,
            avatar: true,
        },
    },
    repository: {
        select: {
            id: true,
            owner: true,
            name: true,
            fullName: true,
        },
    },
} as const;

/**
 * Code reels carry a language + source snippet, but the Reel model has no
 * dedicated columns for them (no schema change is permitted here). We therefore
 * stash that metadata inside the existing free-text `description` field as a
 * fenced block and transparently parse it back out on read. This keeps the web
 * reel detail page's `reel.code` / `reel.language` contract working without
 * touching the Prisma schema.
 */
const CODE_REEL_FENCE = /^```([a-z0-9+#.\- ]*)\n([\s\S]*?)\n```\s*$/i;

interface CodeReelMeta {
    language: string | null;
    code: string | null;
}

const encodeCodeReelDescription = (
    description: string | null,
    language: unknown,
    code: unknown,
): string | null => {
    const trimmedCode = typeof code === 'string' ? code.trim() : '';
    if (trimmedCode.length === 0) {
        return description;
    }

    const lang = typeof language === 'string' ? language.trim() : '';
    return `\`\`\`${lang}\n${trimmedCode}\n\`\`\``;
};

const decodeCodeReelDescription = (description: string | null): CodeReelMeta => {
    if (!description) {
        return { language: null, code: null };
    }

    const match = CODE_REEL_FENCE.exec(description.trim());
    if (!match) {
        return { language: null, code: null };
    }

    const language = match[1].trim();
    const code = match[2];
    return {
        language: language.length > 0 ? language : null,
        code: code.length > 0 ? code : null,
    };
};

/**
 * Normalize a Prisma reel into the shape the web client expects, exposing
 * `code` and `language` derived from the description fence when present.
 */
const serializeReel = <T extends { description: string | null }>(
    reel: T,
): T & CodeReelMeta => {
    const { language, code } = decodeCodeReelDescription(reel.description);
    return { ...reel, language, code };
};

const ALLOWED_REEL_EFFECTS = new Set([
    'none',
    'vintage',
    'blackwhite',
    'warm',
    'cool',
    'dramatic',
    'fade',
    'vivid',
    'noir',
    'sepia',
]);

const parseMusicTrackId = (rawMusicTrackId: unknown, rawMusicTrack: unknown) => {
    if (typeof rawMusicTrackId === 'string' && rawMusicTrackId.trim().length > 0) {
        return rawMusicTrackId.trim();
    }

    if (typeof rawMusicTrack === 'string' && rawMusicTrack.trim().length > 0) {
        return rawMusicTrack.trim();
    }

    return null;
};

const resolveMusicSelection = async (trackId: string | null, rawStartTime: unknown) => {
    if (!trackId) {
        return null;
    }

    if (!musicService.isConfigured()) {
        throw Errors.serviceUnavailable('music');
    }

    const track = await musicService.getTrackById(trackId);
    if (!track) {
        throw Errors.notFound('Music track');
    }

    const parsedStartTime = Number(rawStartTime ?? 0);

    return {
        musicTrackId: track.id,
        musicTitle: track.title,
        musicArtist: track.artist,
        musicPreviewUrl: track.previewUrl || null,
        musicArtworkUrl: track.artworkUrl || null,
        musicStartTime: Number.isFinite(parsedStartTime) && parsedStartTime >= 0
            ? Math.floor(parsedStartTime)
            : 0,
    };
};

const parseEffectId = (rawEffectId: unknown, rawEffect: unknown) => {
    const candidate = typeof rawEffectId === 'string' && rawEffectId.trim().length > 0
        ? rawEffectId.trim()
        : typeof rawEffect === 'string' && rawEffect.trim().length > 0
            ? rawEffect.trim()
            : null;

    if (!candidate || candidate === 'none') {
        return null;
    }

    if (!ALLOWED_REEL_EFFECTS.has(candidate)) {
        throw Errors.badRequest('Unsupported reel effect');
    }

    return candidate;
};

const parseNonNegativeNumber = (value: unknown) => {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
        throw Errors.badRequest('Invalid reel timing value');
    }

    return parsedValue;
};

const resolveReelEditMetadata = (params: {
    rawEffectId?: unknown;
    rawEffect?: unknown;
    rawTrimStart?: unknown;
    rawTrimEnd?: unknown;
    rawThumbnailTime?: unknown;
}) => {
    const effectId = parseEffectId(params.rawEffectId, params.rawEffect);
    const trimStart = parseNonNegativeNumber(params.rawTrimStart);
    const trimEnd = parseNonNegativeNumber(params.rawTrimEnd);
    const thumbnailTime = parseNonNegativeNumber(params.rawThumbnailTime);

    const effectiveTrimStart = trimStart ?? 0;
    if (trimEnd !== null && trimEnd <= effectiveTrimStart) {
        throw Errors.badRequest('trimEnd must be greater than trimStart');
    }

    return {
        ...(effectId ? { effectId } : {}),
        ...(trimStart !== null ? { trimStart } : {}),
        ...(trimEnd !== null ? { trimEnd } : {}),
        ...(thumbnailTime !== null ? { thumbnailTime } : {}),
    };
};

/**
 * Create a new reel
 * POST /api/reels
 */
export const createReel = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    const account = await prisma.account.findFirst({ where: { userId } });
    if (!account) throw Errors.notFound('Account');

    let {
        repositoryId,
        title,
        description,
        videoUrl,
        thumbnailUrl,
        duration,
        repoOwner,
        repoName,
        caption,
        musicTrackId,
        musicTrack,
        musicStartTime,
        effectId,
        effect,
        trimStart,
        trimEnd,
        thumbnailTime,
        language,
        code,
        codeSnippet,
    } = req.body;
    if (!repositoryId && repoOwner && repoName) {
        try {
            const repository = await repositoryService.getRepository(repoOwner, repoName);
            repositoryId = repository.id;
        } catch {
            throw Errors.notFound('Repository');
        }
    }

    if (!videoUrl && req.file) {
        videoUrl = await uploadMedia(req.file, 'reels');
    }
    title = title || caption || 'New Reel';
    description = description || caption || null;
    // For code reels, persist the language + source into the description fence
    // so it round-trips through reads without a schema change.
    description = encodeCodeReelDescription(description, language, code ?? codeSnippet);
    thumbnailUrl = thumbnailUrl || videoUrl;
    duration = Number(duration || 0);

    if (!title || !videoUrl || !thumbnailUrl) {
        throw Errors.badRequest('Title, video URL, and thumbnail are required');
    }

    const musicSelection = await resolveMusicSelection(
        parseMusicTrackId(musicTrackId, musicTrack),
        musicStartTime,
    );
    const reelEditMetadata = resolveReelEditMetadata({
        rawEffectId: effectId,
        rawEffect: effect,
        rawTrimStart: trimStart,
        rawTrimEnd: trimEnd,
        rawThumbnailTime: thumbnailTime,
    });
    const trimmedDuration = typeof reelEditMetadata.trimEnd === 'number'
        ? reelEditMetadata.trimEnd - (typeof reelEditMetadata.trimStart === 'number' ? reelEditMetadata.trimStart : 0)
        : null;
    if (trimmedDuration !== null && trimmedDuration > 0 && (duration <= 0 || trimmedDuration < duration)) {
        duration = Math.max(1, Math.round(trimmedDuration));
    }

    const reel = await prisma.reel.create({
        data: {
            accountId: account.id,
            userId,
            repositoryId,
            title,
            description,
            videoUrl,
            thumbnailUrl,
            duration: duration || 0,
            ...(musicSelection ?? {}),
            ...reelEditMetadata,
        },
        include: reelInclude,
    });

    logger.info(`Reel created: ${reel.id} by user ${userId}`);

    // Run auto-moderation pipeline (async, don't block response)
    try {
        const { runAutoModerationPipeline } = require('../services/moderationService');
        const textForModeration = [title, description].filter(Boolean).join(' ');
        runAutoModerationPipeline('REEL', reel.id, userId, textForModeration).catch((modError: any) => {
            logger.error('Auto-moderation pipeline error for reel:', modError);
        });
    } catch (modLoadError) {
        logger.warn('Auto-moderation service not available:', modLoadError);
    }

    res.status(201).json(serializeReel(reel));
});

/**
 * Get reels feed (paginated)
 * GET /api/reels/feed
 */
export const getReelsFeed = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { cursor, limit = '20' } = req.query;
    const take = parseInt(limit as string);

    const reels = await prisma.reel.findMany({
        where: {
            isArchived: false,
        },
        take: take + 1,
        ...(cursor && {
            cursor: { id: cursor as string },
            skip: 1,
        }),
        orderBy: {
            createdAt: 'desc',
        },
        include: {
            ...reelInclude,
            _count: {
                select: {
                    likes: true,
                    comments: true,
                    views: true,
                },
            },
        },
    });

    const hasMore = reels.length > take;
    const items = hasMore ? reels.slice(0, -1) : reels;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    res.json({
        reels: items.map(serializeReel),
        nextCursor,
        hasMore,
    });
});

/**
 * Get reel by ID
 * GET /api/reels/:id
 */
export const getReelById = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.userId;

    const reel = await prisma.reel.findUnique({
        where: { id },
        include: {
            ...reelInclude,
            _count: {
                select: {
                    likes: true,
                    comments: true,
                    views: true,
                },
            },
        },
    });

    if (!reel) {
        throw Errors.notFound('Reel');
    }

    // If reel is archived, only the owner can view it via direct link
    if (reel.isArchived && reel.userId !== userId) {
        throw Errors.notFound('Reel');
    }

    // Track view
    if (userId) {
        await prisma.reelView.create({
            data: {
                reelId: id,
                userId,
            },
        }).catch(() => { }); // Ignore duplicates

        // Update view count
        await prisma.reel.update({
            where: { id },
            data: { viewsCount: { increment: 1 } },
        });

        const existingLike = await prisma.reelLike.findUnique({
            where: {
                reelId_userId: {
                    reelId: id,
                    userId,
                },
            },
        }).catch(() => null);

        res.json({
            ...serializeReel(reel),
            isLiked: Boolean(existingLike),
        });
        return;
    }

    res.json(serializeReel(reel));
});

/**
 * Like a reel
 * POST /api/reels/:id/like
 */
export const likeReel = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.userId;

    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    try {
        const like = await prisma.reelLike.create({
            data: {
                reelId: id,
                userId,
            },
        });

        // Update like count
        const updatedReel = await prisma.reel.update({
            where: { id },
            data: { likesCount: { increment: 1 } },
        });

        res.json({
            message: 'Reel liked',
            like,
            liked: true,
            likesCount: updatedReel.likesCount,
        });
    } catch (error: any) {
        if (error.code === 'P2002') {
            throw Errors.badRequest('Already liked');
        }
        throw error;
    }
});

/**
 * Unlike a reel
 * DELETE /api/reels/:id/like
 */
export const unlikeReel = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.userId;

    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    await prisma.reelLike.delete({
        where: {
            reelId_userId: {
                reelId: id,
                userId,
            },
        },
    });

    // Update like count
    const updatedReel = await prisma.reel.update({
        where: { id },
        data: { likesCount: { decrement: 1 } },
    });

    res.json({
        message: 'Reel unliked',
        liked: false,
        likesCount: updatedReel.likesCount,
    });
});

/**
 * Add comment to reel
 * POST /api/reels/:id/comments
 */
export const addReelComment = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.userId;
    // The web reel detail page sends either `content` or `text`.
    const rawContent = req.body?.content ?? req.body?.text;
    const content = typeof rawContent === 'string' ? rawContent.trim() : '';

    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    if (!content) {
        throw Errors.badRequest('Content is required');
    }

    if (content.length > 2000) {
        throw Errors.badRequest('Comment must be 2000 characters or fewer');
    }

    const reelExists = await prisma.reel.findUnique({
        where: { id },
        select: { id: true },
    });
    if (!reelExists) {
        throw Errors.notFound('Reel');
    }

    const comment = await prisma.reelComment.create({
        data: {
            reelId: id,
            userId,
            content,
        },
        include: {
            user: {
                select: {
                    id: true,
                    username: true,
                    avatar: true,
                },
            },
        },
    });

    // Update comment count
    await prisma.reel.update({
        where: { id },
        data: { commentsCount: { increment: 1 } },
    });

    res.status(201).json(comment);
});

/**
 * Get reel comments
 * GET /api/reels/:id/comments
 */
export const getReelComments = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { cursor, page, limit = '20' } = req.query;
    const take = Math.min(50, Math.max(1, parseInt(limit as string, 10) || 20));

    // Support both cursor pagination (preferred) and page-based pagination
    // (used by the web reel detail page via reelService.getReelComments).
    const pageNum = page !== undefined ? Math.max(1, parseInt(page as string, 10) || 1) : null;

    const comments = await prisma.reelComment.findMany({
        where: { reelId: id },
        take: take + 1,
        ...(cursor
            ? { cursor: { id: cursor as string }, skip: 1 }
            : pageNum && pageNum > 1
                ? { skip: (pageNum - 1) * take }
                : {}),
        orderBy: {
            createdAt: 'desc',
        },
        include: {
            user: {
                select: {
                    id: true,
                    username: true,
                    avatar: true,
                },
            },
        },
    });

    const hasMore = comments.length > take;
    const items = hasMore ? comments.slice(0, -1) : comments;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    res.json({
        comments: items,
        nextCursor,
        hasMore,
        ...(pageNum !== null ? { page: pageNum, limit: take } : {}),
    });
});

/**
 * Get reel likes
 * GET /api/reels/:id/likes
 */
export const getReelLikes = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 50));

    const [likes, total] = await Promise.all([
        prisma.reelLike.findMany({
            where: { reelId: id },
            orderBy: { createdAt: 'desc' },
            take: limitNum,
            skip: (pageNum - 1) * limitNum,
        }),
        prisma.reelLike.count({ where: { reelId: id } }),
    ]);

    const userIds = likes
        .map((like) => like.userId)
        .filter((likeUserId): likeUserId is string => Boolean(likeUserId));

    const users = userIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, username: true, avatar: true },
        })
        : [];

    const userMap = new Map(users.map((user) => [user.id, user]));

    res.json({
        likes: likes.map((like) => ({
            ...like,
            user: like.userId ? userMap.get(like.userId) ?? null : null,
        })),
        pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            hasMore: pageNum * limitNum < total,
        },
    });
});

/**
 * Delete reel
 * DELETE /api/reels/:id
 */
export const deleteReel = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.userId;

    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    const reel = await prisma.reel.findUnique({
        where: { id },
        select: { userId: true },
    });

    if (!reel) {
        throw Errors.notFound('Reel');
    }

    if (reel.userId !== userId) {
        throw Errors.forbidden('Not authorized to delete this reel');
    }

    await prisma.reel.delete({
        where: { id },
    });

    logger.info(`Reel deleted: ${id} by user ${userId}`);
    res.json({ message: 'Reel deleted successfully' });
});

/**
 * Update reel
 * PUT /api/reels/:id
 */
export const updateReel = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.userId;
    const { title, description } = req.body;

    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    const { language, code, codeSnippet } = req.body;

    const reel = await prisma.reel.findUnique({
        where: { id },
        select: { userId: true, description: true },
    });

    if (!reel) {
        throw Errors.notFound('Reel');
    }

    if (reel.userId !== userId) {
        throw Errors.forbidden('Not authorized to update this reel');
    }

    const updateData: { title?: string; description?: string | null } = {};
    if (title !== undefined) updateData.title = title;

    // Re-encode code reel metadata when the caller updates code/language,
    // otherwise preserve the existing fenced description if one is present.
    const incomingCode = code ?? codeSnippet;
    if (incomingCode !== undefined || language !== undefined) {
        const existing = decodeCodeReelDescription(reel.description);
        updateData.description = encodeCodeReelDescription(
            description !== undefined ? description : null,
            language !== undefined ? language : existing.language,
            incomingCode !== undefined ? incomingCode : existing.code,
        );
    } else if (description !== undefined) {
        updateData.description = description;
    }

    const updatedReel = await prisma.reel.update({
        where: { id },
        data: updateData,
        include: reelInclude,
    });

    logger.info(`Reel updated: ${id} by user ${userId}`);
    res.json(serializeReel(updatedReel));
});

/**
 * Apply music to reel
 * POST /api/reels/:id/music
 */
export const applyMusicToReel = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.userId;
    const { musicId, startTime = 0 } = req.body;

    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    const reel = await prisma.reel.findUnique({
        where: { id },
        select: { userId: true },
    });

    if (!reel) {
        throw Errors.notFound('Reel');
    }

    if (reel.userId !== userId) {
        throw Errors.forbidden('Not authorized to update this reel');
    }

    const musicSelection = await resolveMusicSelection(
        typeof musicId === 'string' && musicId.trim().length > 0 ? musicId.trim() : null,
        startTime,
    );

    if (!musicSelection) {
        throw Errors.badRequest('musicId is required');
    }

    const updatedReel = await prisma.reel.update({
        where: { id },
        data: musicSelection,
        include: reelInclude,
    });

    res.json({
        message: 'Music applied to reel',
        reel: updatedReel,
    });
});

/**
 * Remove music from reel
 * DELETE /api/reels/:id/music
 */
export const removeMusicFromReel = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.userId;

    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    const reel = await prisma.reel.findUnique({
        where: { id },
        select: { userId: true },
    });

    if (!reel) {
        throw Errors.notFound('Reel');
    }

    if (reel.userId !== userId) {
        throw Errors.forbidden('Not authorized to update this reel');
    }

    const updatedReel = await prisma.reel.update({
        where: { id },
        data: {
            musicTrackId: null,
            musicTitle: null,
            musicArtist: null,
            musicPreviewUrl: null,
            musicArtworkUrl: null,
            musicStartTime: null,
        },
        include: reelInclude,
    });

    res.json({
        message: 'Music removed from reel',
        reel: updatedReel,
    });
});

/**
 * Share reel (track share count)
 * POST /api/reels/:id/share
 */
export const shareReel = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.userId;
    const { platform } = req.body; // optional: twitter, copy_link, etc.

    const reel = await prisma.reel.findUnique({
        where: { id },
        select: { id: true, title: true, videoUrl: true },
    });

    if (!reel) {
        throw Errors.notFound('Reel');
    }

    // Track share in interaction
    if (userId) {
        await prisma.interaction.create({
            data: {
                userId,
                contentType: 'REEL',
                contentId: id,
                type: 'share',
            },
        }).catch(() => {}); // Ignore duplicates
    }

    // Generate share data
    const shareUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reels/${id}`;

    res.json({
        message: 'Share tracked',
        shareUrl,
        shareData: {
            title: `Check out this reel: ${reel.title}`,
            url: shareUrl,
        },
    });
});

/**
 * Report reel
 * POST /api/reels/:id/report
 */
export const reportReel = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.userId;
    const { reason, description } = req.body;

    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    if (!reason) {
        throw Errors.badRequest('Reason is required');
    }

    const validReasons = ['spam', 'harassment', 'hate_speech', 'violence', 'nudity', 'copyright', 'misinformation', 'other'];
    if (!validReasons.includes(reason)) {
        throw Errors.badRequest('Invalid reason. Must be one of: ' + validReasons.join(', '));
    }

    const reel = await prisma.reel.findUnique({
        where: { id },
        select: { id: true },
    });

    if (!reel) {
        throw Errors.notFound('Reel');
    }

    // Create moderation log for the report
    await prisma.moderationLog.create({
        data: {
            moderatorId: userId,
            action: 'REEL_REPORTED',
            targetType: 'REEL',
            targetId: id,
            reason: `${reason}: ${description || 'No additional details'}`,
        },
    });

    logger.info(`Reel reported: ${id} by user ${userId} for ${reason}`);
    res.json({ message: 'Reel reported successfully. Our team will review it.' });
});

/**
 * Get user's reels
 * GET /api/reels/user/:userId
 */
export const getUserReels = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userId: targetUserId } = req.params;
    const { page = '1', limit = '20' } = req.query;

    const reels = await prisma.reel.findMany({
        where: { userId: targetUserId, isArchived: false },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string),
        skip: (parseInt(page as string) - 1) * parseInt(limit as string),
        include: {
            user: {
                select: {
                    id: true,
                    username: true,
                    avatar: true,
                },
            },
            _count: {
                select: {
                    likes: true,
                    comments: true,
                    views: true,
                },
            },
        },
    });

    const total = await prisma.reel.count({ where: { userId: targetUserId, isArchived: false } });

    res.json({
        reels: reels.map(serializeReel),
        pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total,
            hasMore: reels.length === parseInt(limit as string),
        },
    });
});

/**
 * List reels, optionally filtered by language (related reels).
 * GET /api/reels?language=&limit=
 *
 * The web reel detail page uses this to render the "related reels" rail keyed
 * on the current reel's language. Language lives inside the description fence
 * (no schema column), so we over-fetch and filter in memory.
 */
export const listReels = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { language, limit = '12' } = req.query;
    const take = Math.min(50, Math.max(1, parseInt(limit as string, 10) || 12));
    const languageFilter =
        typeof language === 'string' && language.trim().length > 0
            ? language.trim().toLowerCase()
            : null;

    // When filtering by language we over-fetch (language is not a DB column)
    // and narrow in memory; otherwise a single page is enough.
    const fetchCount = languageFilter ? Math.min(200, take * 10) : take;

    const reels = await prisma.reel.findMany({
        where: { isArchived: false },
        orderBy: { createdAt: 'desc' },
        take: fetchCount,
        include: {
            ...reelInclude,
            _count: {
                select: {
                    likes: true,
                    comments: true,
                    views: true,
                },
            },
        },
    });

    const serialized = reels.map(serializeReel);
    const filtered = languageFilter
        ? serialized.filter((reel) => (reel.language ?? '').toLowerCase() === languageFilter)
        : serialized;

    res.json({
        reels: filtered.slice(0, take),
        ...(languageFilter ? { language: languageFilter } : {}),
    });
});

/**
 * Get a single featured reel (most engaged recent reel).
 * GET /api/reels/featured
 *
 * Returns `{ reel: null }` when there are no eligible reels so the client can
 * render an empty state instead of erroring.
 */
export const getFeaturedReel = asyncHandler(async (_req: AuthRequest, res: Response) => {
    const reel = await prisma.reel.findFirst({
        where: { isArchived: false },
        orderBy: [
            { likesCount: 'desc' },
            { viewsCount: 'desc' },
            { createdAt: 'desc' },
        ],
        include: {
            ...reelInclude,
            _count: {
                select: {
                    likes: true,
                    comments: true,
                    views: true,
                },
            },
        },
    });

    res.json({ reel: reel ? serializeReel(reel) : null });
});
