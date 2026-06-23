import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';
import { uploadMedia, uploadStoryImage } from '../services/storageService';
import { repositoryService } from '../services/repositoryService';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

/**
 * Create a new story
 * POST /api/stories
 */
export const createStory = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    const {
        repositoryId: repositoryIdRaw,
        mediaType,
        mediaUrl,
        thumbnailUrl,
        duration,
        caption,
        repoOwner,
        repoName,
    } = req.body;

    let repositoryId = repositoryIdRaw;
    if (!repositoryId && repoOwner && repoName) {
        try {
            const repository = await repositoryService.getRepository(repoOwner, repoName);
            repositoryId = repository.id;
        } catch {
            throw Errors.notFound('Repository');
        }
    }

    let resolvedMediaUrl = mediaUrl;
    const resolvedMediaType = mediaType || (req.file?.mimetype.startsWith('video/') ? 'video' : 'image');
    if (!resolvedMediaUrl && req.file) {
        if (resolvedMediaType === 'image') {
            const optimized = await uploadStoryImage(req.file, 'stories');
            resolvedMediaUrl = optimized.url;
        } else {
            resolvedMediaUrl = await uploadMedia(req.file, 'stories');
        }
    }

    if (!resolvedMediaUrl) {
        throw Errors.badRequest('Media URL is required');
    }

    // Stories expire after 24 hours
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const account = await prisma.account.findFirst({ where: { userId } });
    if (!account) throw Errors.notFound('Account');

    const story = await prisma.story.create({
        data: {
            accountId: account.id,
            userId,
            repositoryId,
            mediaType: resolvedMediaType || 'image',
            mediaUrl: resolvedMediaUrl,
            caption,
            expiresAt,
        },
        include: {
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
        },
    });

    logger.info(`Story created: ${story.id} by user ${userId}`);
    res.status(201).json(story);
});

/**
 * Get active stories (not expired)
 * GET /api/stories
 */
export const getActiveStories = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId;

    // Get stories from followed users
    const stories = await prisma.story.findMany({
        where: {
            expiresAt: {
                gt: new Date(),
            },
        },
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
            repository: {
                select: {
                    id: true,
                    owner: true,
                    name: true,
                    fullName: true,
                },
            },
            _count: {
                select: {
                    views: true,
                },
            },
        },
    });

    // Group stories by user
    const groupedStories = stories.reduce((acc: any, story) => {
        const userId = story.userId;
        if (!acc[userId!]) {
            acc[userId!] = {
                user: story.user,
                stories: [],
            };
        }
        acc[userId!].stories.push(story);
        return acc;
    }, {});

    res.json({
        stories: Object.values(groupedStories),
    });
});

/**
 * Get story by ID
 * GET /api/stories/:id
 */
export const getStoryById = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.userId;

    const story = await prisma.story.findUnique({
        where: { id },
        include: {
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
            _count: {
                select: {
                    views: true,
                },
            },
        },
    });

    if (!story) {
        throw Errors.notFound('Story');
    }

    // Check if expired
    if (story.expiresAt < new Date()) {
        return res.status(410).json({ message: 'Story has expired' });
    }

    // Track view with upsert to handle new fields and avoid duplicates
    if (userId) {
        // Check if this is a new view (for view count increment)
        const existingView = await prisma.storyView.findUnique({
            where: { storyId_userId: { storyId: id, userId } },
        });

        await prisma.storyView.upsert({
            where: { storyId_userId: { storyId: id, userId } },
            create: {
                storyId: id,
                userId,
                // Additional fields can be set by the client via the dedicated view tracking endpoint
            },
            update: {
                // Just touch the record on revisit (viewedAt stays as original)
            },
        });

        // Only increment view count for new views
        if (!existingView) {
            await prisma.story.update({
                where: { id },
                data: { viewsCount: { increment: 1 } },
            });
        }
    }

    res.json(story);
});

/**
 * Delete story
 * DELETE /api/stories/:id
 */
export const deleteStory = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.userId;

    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    const story = await prisma.story.findUnique({
        where: { id },
        select: { userId: true },
    });

    if (!story) {
        throw Errors.notFound('Story');
    }

    if (story.userId !== userId) {
        throw Errors.forbidden('Not authorized to delete this story');
    }

    await prisma.story.delete({
        where: { id },
    });

    logger.info(`Story deleted: ${id} by user ${userId}`);
    res.json({ message: 'Story deleted successfully' });
});

/**
 * Clean up expired stories (called by cron job)
 * DELETE /api/stories/cleanup
 */
export const cleanupExpiredStories = asyncHandler(async (req: Request, res: Response) => {
    const result = await prisma.story.deleteMany({
        where: {
            expiresAt: {
                lt: new Date(),
            },
        },
    });

    logger.info(`Cleaned up ${result.count} expired stories`);
    res.json({ message: `Deleted ${result.count} expired stories` });
});

/**
 * Update story caption
 * PUT /api/stories/:id
 */
export const updateStory = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.userId;
    const { caption } = req.body;

    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    const story = await prisma.story.findUnique({
        where: { id },
        select: { userId: true, expiresAt: true },
    });

    if (!story) {
        throw Errors.notFound('Story');
    }

    if (story.userId !== userId) {
        throw Errors.forbidden('Not authorized to update this story');
    }

    if (story.expiresAt < new Date()) {
        return res.status(410).json({ message: 'Cannot update an expired story' });
    }

    const updatedStory = await prisma.story.update({
        where: { id },
        data: { caption },
        include: {
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
        },
    });

    logger.info(`Story updated: ${id} by user ${userId}`);
    res.json(updatedStory);
});

/**
 * Archive a story (save to highlights before expiration)
 * POST /api/stories/:id/archive
 */
export const archiveStory = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.userId;

    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    const story = await prisma.story.findUnique({
        where: { id },
    });

    if (!story) {
        throw Errors.notFound('Story');
    }

    if (story.userId !== userId) {
        throw Errors.forbidden('Not authorized to archive this story');
    }

    // Check if already archived
    const existingArchive = await prisma.storyArchive.findUnique({
        where: { storyId: id },
    });

    if (existingArchive) {
        throw Errors.badRequest('Story already archived');
    }

    const archive = await prisma.storyArchive.create({
        data: {
            storyId: id,
            userId,
            mediaUrl: story.mediaUrl,
            mediaType: story.mediaType,
            caption: story.caption,
        },
    });

    logger.info(`Story archived: ${id} by user ${userId}`);
    res.status(201).json(archive);
});

/**
 * Get archived stories (highlights) for a user
 * GET /api/stories/archives
 */
export const getArchivedStories = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    const { targetUserId } = req.query;

    const queryUserId = targetUserId as string || userId;

    if (!queryUserId) {
        throw Errors.badRequest('User ID required');
    }

    const archives = await prisma.storyArchive.findMany({
        where: { userId: queryUserId },
        orderBy: { createdAt: 'desc' },
    });

    res.json({ archives });
});

/**
 * Delete an archived story
 * DELETE /api/stories/archives/:archiveId
 */
export const deleteArchivedStory = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { archiveId } = req.params;
    const userId = req.userId;

    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    const archive = await prisma.storyArchive.findUnique({
        where: { id: archiveId },
    });

    if (!archive) {
        throw Errors.notFound('Archived story');
    }

    if (archive.userId !== userId) {
        throw Errors.forbidden('Not authorized to delete this archive');
    }

    await prisma.storyArchive.delete({ where: { id: archiveId } });

    logger.info(`Story archive deleted: ${archiveId} by user ${userId}`);
    res.json({ message: 'Archived story deleted successfully' });
});

/**
 * Get story viewers
 * GET /api/stories/:id/viewers
 */
export const getStoryViewers = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.userId;
    const { page = '1', limit = '50' } = req.query;

    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    const story = await prisma.story.findUnique({
        where: { id },
        select: { userId: true },
    });

    if (!story) {
        throw Errors.notFound('Story');
    }

    // Only story owner can see viewers
    if (story.userId !== userId) {
        throw Errors.forbidden('Not authorized to view story viewers');
    }

    const views = await prisma.storyView.findMany({
        where: { storyId: id },
        orderBy: { viewedAt: 'desc' },
        take: parseInt(limit as string),
        skip: (parseInt(page as string) - 1) * parseInt(limit as string),
    });

    // Get user details
    const userIds = views.map(v => v.userId).filter((id): id is string => id !== null);
    const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true, avatar: true },
    });

    const viewersWithDetails = views.map(view => ({
        ...view,
        user: users.find(u => u.id === view.userId),
    }));

    const totalViewers = await prisma.storyView.count({ where: { storyId: id } });

    res.json({
        viewers: viewersWithDetails,
        total: totalViewers,
        pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            hasMore: views.length === parseInt(limit as string),
        },
    });
});

/**
 * Get user's own stories
 * GET /api/stories/my
 */
export const getMyStories = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId;

    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    const stories = await prisma.story.findMany({
        where: {
            userId,
            expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
        include: {
            _count: {
                select: { views: true },
            },
        },
    });

    res.json({ stories });
});

/**
 * Get story settings for current user
 * GET /api/stories/settings
 */
export const getStorySettings = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId;

    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    const settings = await prisma.storySettings.findUnique({
        where: { userId },
        select: {
            allowReplies: true,
            hideFrom: true,
        },
    });

    res.json({
        settings: settings ?? {
            allowReplies: true,
            hideFrom: [],
        },
    });
});

/**
 * Update story settings for current user
 * PUT /api/stories/settings
 */
export const updateStorySettings = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    const { allowReplies, hideFrom } = req.body;

    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    const normalizedHideFrom = Array.isArray(hideFrom)
        ? hideFrom.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        : [];

    const settings = await prisma.storySettings.upsert({
        where: { userId },
        create: {
            userId,
            allowReplies: typeof allowReplies === 'boolean' ? allowReplies : true,
            hideFrom: normalizedHideFrom,
        },
        update: {
            ...(typeof allowReplies === 'boolean' ? { allowReplies } : {}),
            ...(Array.isArray(hideFrom) ? { hideFrom: normalizedHideFrom } : {}),
        },
        select: {
            allowReplies: true,
            hideFrom: true,
        },
    });

    res.json({ settings });
});

/**
 * Get story highlights for a user
 * GET /api/stories/highlights
 */
export const getStoryHighlights = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId;
    const { targetUserId } = req.query;

    const queryUserId = (targetUserId as string) || userId;
    if (!queryUserId) {
        throw Errors.unauthorized('Unauthorized');
    }

    const highlights = await prisma.storyHighlight.findMany({
        where: { userId: queryUserId },
        orderBy: { createdAt: 'desc' },
    });

    res.json({
        highlights: highlights.map((highlight) => ({
            ...highlight,
            storiesCount: highlight.archiveIds.length,
        })),
    });
});

/**
 * Create story highlight
 * POST /api/stories/highlights
 */
export const createStoryHighlight = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId;

    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    const { name } = req.body;
    const rawStoryIds = req.body.storyIds;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        throw Errors.badRequest('Highlight name is required');
    }

    const archiveIds = Array.isArray(rawStoryIds)
        ? rawStoryIds
        : typeof rawStoryIds === 'string' && rawStoryIds.trim().length > 0
            ? [rawStoryIds]
            : [];

    if (archiveIds.length === 0) {
        throw Errors.badRequest('Select at least one archived story');
    }

    const archives = await prisma.storyArchive.findMany({
        where: {
            id: { in: archiveIds },
            userId,
        },
        orderBy: { createdAt: 'desc' },
    });

    if (archives.length !== archiveIds.length) {
        throw Errors.forbidden('One or more archived stories are unavailable');
    }

    let coverImage: string | null = null;
    if (req.file) {
        coverImage = await uploadMedia(req.file, 'story-highlights');
    } else {
        const firstImageArchive = archives.find((archive) => archive.mediaType === 'image');
        coverImage = firstImageArchive?.mediaUrl || null;
    }

    const highlight = await prisma.storyHighlight.create({
        data: {
            userId,
            name: name.trim(),
            coverImage,
            archiveIds: archives.map((archive) => archive.id),
        },
    });

    res.status(201).json({
        highlight: {
            ...highlight,
            storiesCount: highlight.archiveIds.length,
        },
    });
});

/**
 * Get story highlight by ID
 * GET /api/stories/highlights/:highlightId
 */
export const getStoryHighlightById = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { highlightId } = req.params;
    const userId = req.userId;

    const highlight = await prisma.storyHighlight.findUnique({
        where: { id: highlightId },
    });

    if (!highlight) {
        throw Errors.notFound('Story highlight');
    }

    if (highlight.userId !== userId) {
        throw Errors.forbidden('Not authorized to view this story highlight');
    }

    const archives = highlight.archiveIds.length > 0
        ? await prisma.storyArchive.findMany({
            where: {
                id: { in: highlight.archiveIds },
                userId: highlight.userId,
            },
        })
        : [];

    const archiveMap = new Map(archives.map((archive) => [archive.id, archive]));
    const stories = highlight.archiveIds
        .map((archiveId) => archiveMap.get(archiveId))
        .filter((archive): archive is NonNullable<typeof archive> => Boolean(archive));

    res.json({
        highlight: {
            ...highlight,
            storiesCount: highlight.archiveIds.length,
            stories,
        },
    });
});

/**
 * Get comprehensive story analytics
 * GET /api/stories/:id/analytics
 *
 * Returns:
 * - Total view count
 * - Unique viewers
 * - Viewer list with timestamps
 * - Engagement rate (interactions/views)
 * - Completion rate
 * - View duration stats
 * - Device breakdown
 * - Source breakdown
 */
export const getStoryAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.userId;
    const { page = '1', limit = '50' } = req.query;

    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    // Get the story and verify ownership
    const story = await prisma.story.findUnique({
        where: { id },
        select: {
            id: true,
            userId: true,
            viewsCount: true,
            createdAt: true,
            expiresAt: true,
            mediaType: true,
        },
    });

    if (!story) {
        throw Errors.notFound('Story');
    }

    // Only story owner can see analytics
    if (story.userId !== userId) {
        throw Errors.forbidden('Not authorized to view story analytics');
    }

    // Get all views with details
    const allViews = await prisma.storyView.findMany({
        where: { storyId: id },
        orderBy: { viewedAt: 'desc' },
    });

    // Get paginated viewers with user details
    const paginatedViews = await prisma.storyView.findMany({
        where: { storyId: id },
        orderBy: { viewedAt: 'desc' },
        take: parseInt(limit as string),
        skip: (parseInt(page as string) - 1) * parseInt(limit as string),
    });

    // Get user details for paginated views
    const userIds = paginatedViews
        .map(v => v.userId)
        .filter((id): id is string => id !== null);

    const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
            id: true,
            username: true,
            avatar: true,
            displayName: true,
        },
    });

    // Get reactions count
    const reactionsCount = await prisma.storyReaction.count({
        where: { storyId: id },
    });

    // Get reactions breakdown by type
    const reactionsByType = await prisma.storyReaction.groupBy({
        by: ['type'],
        where: { storyId: id },
        _count: { type: true },
    });

    // Get replies count
    const repliesCount = await prisma.storyReply.count({
        where: { storyId: id },
    });

    // Get users who interacted (reacted or replied)
    const reactedUserIds = await prisma.storyReaction.findMany({
        where: { storyId: id },
        select: { userId: true },
    });

    const repliedUserIds = await prisma.storyReply.findMany({
        where: { storyId: id },
        select: { userId: true },
    });

    // Unique interacting users
    const interactingUserIds = new Set([
        ...reactedUserIds.map(r => r.userId),
        ...repliedUserIds.map(r => r.userId),
    ]);

    // Calculate metrics
    const totalViews = story.viewsCount;
    const uniqueViewers = allViews.length;
    const totalInteractions = reactionsCount + repliesCount;
    const engagementRate = uniqueViewers > 0
        ? Math.round((interactingUserIds.size / uniqueViewers) * 100 * 100) / 100
        : 0;

    // Completion rate (viewers who completed the story)
    const completedViews = allViews.filter(v => v.completed).length;
    const completionRate = uniqueViewers > 0
        ? Math.round((completedViews / uniqueViewers) * 100 * 100) / 100
        : 0;

    // Average view duration (for views that tracked duration)
    const viewsWithDuration = allViews.filter(v => v.duration !== null);
    const avgDuration = viewsWithDuration.length > 0
        ? Math.round(viewsWithDuration.reduce((sum, v) => sum + (v.duration || 0), 0) / viewsWithDuration.length)
        : null;

    // Device breakdown
    const deviceBreakdown = allViews.reduce((acc: Record<string, number>, view) => {
        const device = view.deviceType || 'unknown';
        acc[device] = (acc[device] || 0) + 1;
        return acc;
    }, {});

    // Source breakdown
    const sourceBreakdown = allViews.reduce((acc: Record<string, number>, view) => {
        const source = view.source || 'unknown';
        acc[source] = (acc[source] || 0) + 1;
        return acc;
    }, {});

    // Views over time (hourly breakdown for the story's lifetime)
    const viewsByHour = allViews.reduce((acc: Record<string, number>, view) => {
        const hour = new Date(view.viewedAt).toISOString().slice(0, 13) + ':00:00Z';
        acc[hour] = (acc[hour] || 0) + 1;
        return acc;
    }, {});

    // Format viewers list with details
    const viewersWithDetails = paginatedViews.map(view => {
        const user = users.find(u => u.id === view.userId);
        const hasReacted = reactedUserIds.some(r => r.userId === view.userId);
        const hasReplied = repliedUserIds.some(r => r.userId === view.userId);

        return {
            id: view.id,
            viewedAt: view.viewedAt,
            duration: view.duration,
            completed: view.completed,
            source: view.source,
            deviceType: view.deviceType,
            hasInteracted: hasReacted || hasReplied,
            hasReacted,
            hasReplied,
            user: user || null,
        };
    });

    // Reactions breakdown formatted
    const reactionsBreakdown = reactionsByType.reduce((acc: Record<string, number>, r) => {
        acc[r.type] = r._count.type;
        return acc;
    }, {});

    logger.info(`Story analytics fetched: ${id} by user ${userId}`);

    res.json({
        storyId: id,
        storyCreatedAt: story.createdAt,
        storyExpiresAt: story.expiresAt,
        mediaType: story.mediaType,

        // Core metrics
        metrics: {
            totalViews,
            uniqueViewers,
            totalInteractions,
            reactionsCount,
            repliesCount,
            engagementRate, // Percentage of viewers who interacted
            completionRate, // Percentage of viewers who completed the story
            avgViewDuration: avgDuration, // in milliseconds
        },

        // Breakdowns
        breakdowns: {
            reactions: reactionsBreakdown,
            devices: deviceBreakdown,
            sources: sourceBreakdown,
            viewsByHour,
        },

        // Paginated viewer list
        viewers: viewersWithDetails,

        // Pagination info
        pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total: uniqueViewers,
            hasMore: paginatedViews.length === parseInt(limit as string),
        },
    });
});

/**
 * Update story view with duration/completion data
 * POST /api/stories/:id/view
 *
 * Called when a user views a story - tracks view and optionally duration
 */
export const trackStoryView = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.userId;
    const { duration, completed, source, deviceType } = req.body;

    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    // Verify story exists and is not expired
    const story = await prisma.story.findUnique({
        where: { id },
        select: { id: true, expiresAt: true },
    });

    if (!story) {
        throw Errors.notFound('Story');
    }

    if (story.expiresAt < new Date()) {
        return res.status(410).json({ message: 'Story has expired' });
    }

    // Upsert the view (create if not exists, update if exists)
    const view = await prisma.storyView.upsert({
        where: {
            storyId_userId: { storyId: id, userId },
        },
        create: {
            storyId: id,
            userId,
            duration: duration ? parseInt(duration) : null,
            completed: completed === true || completed === 'true',
            source: source || null,
            deviceType: deviceType || null,
        },
        update: {
            // Only update duration if provided and greater than existing
            ...(duration !== undefined && {
                duration: {
                    set: parseInt(duration),
                },
            }),
            // Update completed status if true (once completed, stays completed)
            ...(completed && {
                completed: true,
            }),
        },
    });

    // Increment view count only on first view (when creating)
    // This is handled by the upsert - we check if it was a create
    // by comparing timestamps
    const isNewView = view.viewedAt.getTime() > Date.now() - 1000; // Created within last second

    if (isNewView) {
        await prisma.story.update({
            where: { id },
            data: { viewsCount: { increment: 1 } },
        });
    }

    res.json({
        message: 'View tracked',
        view: {
            id: view.id,
            viewedAt: view.viewedAt,
            duration: view.duration,
            completed: view.completed,
        },
    });
});

/**
 * Update view duration (called when user finishes viewing)
 * PATCH /api/stories/:id/view
 */
export const updateStoryViewDuration = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.userId;
    const { duration, completed } = req.body;

    if (!userId) {
        throw Errors.unauthorized('Unauthorized');
    }

    // Find existing view
    const existingView = await prisma.storyView.findUnique({
        where: {
            storyId_userId: { storyId: id, userId },
        },
    });

    if (!existingView) {
        throw Errors.notFound('View record');
    }

    // Update the view with duration and completion status
    const updatedView = await prisma.storyView.update({
        where: {
            storyId_userId: { storyId: id, userId },
        },
        data: {
            ...(duration !== undefined && { duration: parseInt(duration) }),
            ...(completed !== undefined && { completed: completed === true || completed === 'true' }),
        },
    });

    res.json({
        message: 'View updated',
        view: {
            id: updatedView.id,
            duration: updatedView.duration,
            completed: updatedView.completed,
        },
    });
});
