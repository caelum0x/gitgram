import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { repositoryService } from '../services/repositoryService';
import { repoTextExportService } from '../services/repoTextExportService';
import prisma from '../utils/prisma';
import { encryptApiKey, decryptApiKey } from '../services/changeStoryService';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

export const repositoryController = {
  // GET /api/repositories/search?q=vscode
  search: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { q } = req.query;
    if (!q || typeof q !== 'string') {
      throw Errors.badRequest('Query required');
    }

    const results = await repositoryService.searchRepositories(q);
    res.json({ repositories: results });
  }),

  // GET /api/repositories/trending?language=typescript
  trending: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { language } = req.query;
    const results = await repositoryService.getTrending(
      language as string | undefined
    );
    res.json({ repositories: results });
  }),

  // GET /api/repositories/:owner/:name
  get: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { owner, name } = req.params;
    const repository = await repositoryService.getRepositoryWithStats(owner, name);

    let isFollowing = false;
    if (req.userId) {
      isFollowing = await repositoryService.isFollowing(req.userId, repository.id);
    }

    res.json({ repository, isFollowing });
  }),

  // GET /api/repositories/:owner/:name/export/text
  exportText: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { owner, name } = req.params;
    const maxFiles =
      typeof req.query.maxFiles === 'string' ? parseInt(req.query.maxFiles, 10) : undefined;
    const maxFileBytes =
      typeof req.query.maxFileBytes === 'string'
        ? parseInt(req.query.maxFileBytes, 10)
        : undefined;

    const result = await repoTextExportService.exportRepositoryToText(owner, name, {
      maxFiles,
      maxFileBytes,
    });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${result.filename}"`);
    res.send(result.content);
  }),

  // GET /api/repositories/:owner/:name/posts?page=1&limit=10
  getPosts: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { owner, name } = req.params;
    const { page = '1', limit = '10' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string) || 10));

    const repository = await repositoryService.getRepository(owner, name);

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where: { repositoryId: repository.id },
        include: {
          user: {
            select: { id: true, username: true, avatar: true, verified: true },
          },
          _count: { select: { likes: true, comments: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limitNum,
        skip: (pageNum - 1) * limitNum,
      }),
      prisma.post.count({ where: { repositoryId: repository.id } }),
    ]);

    res.json({
      posts,
      total,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
        hasMore: pageNum * limitNum < total,
      },
    });
  }),

  // GET /api/repositories/:owner/:name/snippets?page=1&limit=20
  getSnippets: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { owner, name } = req.params;
    const { page = '1', limit = '20' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string) || 20));

    const repository = await repositoryService.getRepository(owner, name);

    const [snippets, total] = await Promise.all([
      prisma.codeSnippet.findMany({
        where: { repositoryId: repository.id },
        include: {
          user: {
            select: { id: true, username: true, avatar: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limitNum,
        skip: (pageNum - 1) * limitNum,
      }),
      prisma.codeSnippet.count({ where: { repositoryId: repository.id } }),
    ]);

    res.json({
      snippets,
      total,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
        hasMore: pageNum * limitNum < total,
      },
    });
  }),

  // GET /api/repositories/:owner/:name/media?page=1&limit=20
  getMedia: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { owner, name } = req.params;
    const { page = '1', limit = '20' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string) || 20));

    const repository = await repositoryService.getRepository(owner, name);

    // Posts that contain media
    const where = {
      repositoryId: repository.id,
      OR: [
        { mediaUrls: { isEmpty: false } },
        { type: 'IMAGE' as const },
        { type: 'VIDEO' as const },
      ],
    };

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        include: {
          user: {
            select: { id: true, username: true, avatar: true, verified: true },
          },
          _count: { select: { likes: true, comments: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limitNum,
        skip: (pageNum - 1) * limitNum,
      }),
      prisma.post.count({ where }),
    ]);

    res.json({
      posts,
      total,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
        hasMore: pageNum * limitNum < total,
      },
    });
  }),

  // POST /api/repositories/:owner/:name/follow
  follow: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { owner, name } = req.params;
    const userId = req.userId!;

    const repository = await repositoryService.getRepository(owner, name);

    const existingFollow = await prisma.repositoryFollow.findUnique({
      where: { userId_repositoryId: { userId, repositoryId: repository.id } },
    });
    if (existingFollow) {
      throw Errors.badRequest('Repository already followed');
    }

    await repositoryService.followRepository(userId, repository.id);

    res.json({ message: 'Repository followed', following: true });
  }),

  // DELETE /api/repositories/:owner/:name/follow
  unfollow: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { owner, name } = req.params;
    const userId = req.userId!;

    const repository = await repositoryService.getRepository(owner, name);
    await repositoryService.unfollowRepository(userId, repository.id);

    res.json({ message: 'Repository unfollowed' });
  }),

  // GET /api/repositories/following
  getFollowing: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;

    const follows = await prisma.repositoryFollow.findMany({
      where: { userId },
      include: { repository: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ repositories: follows.map(f => f.repository) });
  }),

  // PUT /api/repositories/:owner/:name
  // Update repository profile (customize for Gitgram)
  update: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { owner, name } = req.params;
    const userId = req.userId!;
    const { bio, customName, tags } = req.body;

    const repository = await repositoryService.getRepository(owner, name);

    // Verify user owns this repository (via GitHub connection)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { githubUsername: true },
    });

    if (!user?.githubUsername || user.githubUsername.toLowerCase() !== owner.toLowerCase()) {
      throw Errors.forbidden('Not authorized to update this repository');
    }

    const updatedRepo = await prisma.repository.update({
      where: { id: repository.id },
      data: {
        ...(bio !== undefined && { description: bio }),
        ...(customName !== undefined && { displayName: customName }),
        ...(tags !== undefined && { topics: tags }),
      },
    });

    res.json({ repository: updatedRepo });
  }),

  // DELETE /api/repositories/:owner/:name
  // Remove repository from Gitgram (doesn't delete from GitHub)
  remove: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { owner, name } = req.params;
    const userId = req.userId!;

    const repository = await repositoryService.getRepository(owner, name);

    // Verify user owns this repository
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { githubUsername: true },
    });

    if (!user?.githubUsername || user.githubUsername.toLowerCase() !== owner.toLowerCase()) {
      throw Errors.forbidden('Not authorized to remove this repository');
    }

    // Soft delete - mark as inactive rather than actual delete
    await prisma.repository.update({
      where: { id: repository.id },
      data: { status: 'inactive' },
    });

    res.json({ message: 'Repository removed from Gitgram' });
  }),

  // GET /api/repositories/:owner/:name/followers
  // Get users who follow this repository
  getFollowers: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { owner, name } = req.params;
    const { page = '1', limit = '20' } = req.query;

    const repository = await repositoryService.getRepository(owner, name);

    const [followRecords, total] = await Promise.all([
      prisma.repositoryFollow.findMany({
        where: { repositoryId: repository.id },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string),
        skip: (parseInt(page as string) - 1) * parseInt(limit as string),
      }),
      prisma.repositoryFollow.count({ where: { repositoryId: repository.id } }),
    ]);

    // Get user details separately
    const userIds = followRecords.filter(f => f.userId).map(f => f.userId as string);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, avatar: true, verified: true },
    });

    res.json({
      followers: users,
      total,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        hasMore: followRecords.length === parseInt(limit as string),
      },
    });
  }),

  // POST /api/repositories/:owner/:name/bookmark
  // Bookmark a repository
  bookmark: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { owner, name } = req.params;
    const userId = req.userId!;

    const repository = await repositoryService.getRepository(owner, name);

    // Check if already bookmarked
    const existing = await prisma.repositoryBookmark.findUnique({
      where: {
        userId_repositoryId: {
          userId,
          repositoryId: repository.id,
        },
      },
    });

    if (existing) {
      throw Errors.badRequest('Repository already bookmarked');
    }

    await prisma.repositoryBookmark.create({
      data: {
        userId,
        repositoryId: repository.id,
      },
    });

    res.json({ message: 'Repository bookmarked' });
  }),

  // DELETE /api/repositories/:owner/:name/bookmark
  // Remove bookmark
  removeBookmark: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { owner, name } = req.params;
    const userId = req.userId!;

    const repository = await repositoryService.getRepository(owner, name);

    await prisma.repositoryBookmark.delete({
      where: {
        userId_repositoryId: {
          userId,
          repositoryId: repository.id,
        },
      },
    });

    res.json({ message: 'Bookmark removed' });
  }),

  // POST /api/repositories/:owner/:name/change-story
  // Create a repository-scoped "change story" post linked to AITM checkpoint metadata
  createChangeStory: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { owner, name } = req.params;
    const userId = req.userId!;
    const {
      title,
      summary,
      checkpointId,
      fromCheckpointId,
      aitmProjectId,
      diffSummary,
      changedFiles,
    } = req.body || {};

    if (!checkpointId || typeof checkpointId !== 'string') {
      throw Errors.badRequest('checkpointId is required');
    }

    const repository = await repositoryService.getRepository(owner, name);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { githubUsername: true },
    });
    const isOwner = user?.githubUsername?.toLowerCase() === owner.toLowerCase() || repository.claimedBy === userId;
    if (!isOwner) {
      throw Errors.forbidden('Only repository owners/managers can publish change story posts');
    }

    const account = await prisma.account.findFirst({ where: { userId } });
    if (!account) {
      throw Errors.notFound('Account');
    }

    const parsedFiles = Array.isArray(changedFiles)
      ? changedFiles
      : typeof changedFiles === 'string'
        ? changedFiles.split('\n').map((line: string) => line.trim()).filter(Boolean)
        : [];
    const ds = typeof diffSummary === 'object' && diffSummary
      ? diffSummary
      : { added: 0, removed: 0, modified: 0 };

    const content = [
      `${title || `Change Story for ${owner}/${name}`}`,
      summary || 'Checkpoint-linked repository change story.',
      '',
      '[AITM_CHANGE_STORY]',
      `checkpointId=${checkpointId}`,
      `fromCheckpointId=${fromCheckpointId || ''}`,
      `aitmProjectId=${aitmProjectId || ''}`,
      `diffAdded=${Number((ds as any).added || 0)}`,
      `diffRemoved=${Number((ds as any).removed || 0)}`,
      `diffModified=${Number((ds as any).modified || 0)}`,
      `changedFiles=${JSON.stringify(parsedFiles)}`,
      '[/AITM_CHANGE_STORY]',
    ].join('\n');

    const post = await prisma.post.create({
      data: {
        accountId: account.id,
        userId,
        repositoryId: repository.id,
        repoUrl: `aitm://checkpoint/${checkpointId}`,
        type: 'REPOSITORY',
        content,
        mediaUrls: [],
      },
      include: {
        user: { select: { id: true, username: true, avatar: true, verified: true } },
        repository: true,
      },
    });

    res.status(201).json({ post });
  }),

  // GET /api/repositories/bookmarks
  // Get user's bookmarked repositories
  getBookmarks: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    const { page = '1', limit = '20' } = req.query;

    const [bookmarkRecords, total] = await Promise.all([
      prisma.repositoryBookmark.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string),
        skip: (parseInt(page as string) - 1) * parseInt(limit as string),
      }),
      prisma.repositoryBookmark.count({ where: { userId } }),
    ]);

    // Get repository details separately
    const repoIds = bookmarkRecords.map(b => b.repositoryId);
    const repositories = await prisma.repository.findMany({
      where: { id: { in: repoIds } },
      include: {
        _count: {
          select: { followers: true, posts: true },
        },
      },
    });

    res.json({
      repositories,
      total,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        hasMore: bookmarkRecords.length === parseInt(limit as string),
      },
    });
  }),

  // GET /api/repositories/:owner/:name/aitm-settings
  // Get AITM change story settings for a repository
  getAitmSettings: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { owner, name } = req.params;
    const userId = req.userId!;

    const repository = await repositoryService.getRepository(owner, name);

    // Verify ownership
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { githubUsername: true },
    });
    const isOwner = user?.githubUsername?.toLowerCase() === owner.toLowerCase() || repository.claimedBy === userId;
    if (!isOwner) {
      throw Errors.forbidden('Only repository owners can view AITM settings');
    }

    const settings = await prisma.repositoryAitmSettings.findUnique({
      where: { repositoryId: repository.id },
    });

    if (!settings) {
      return res.json({
        settings: {
          aitmProjectId: null,
          autoGenerateStories: false,
          hasApiKey: false,
        },
      });
    }

    return res.json({
      settings: {
        aitmProjectId: settings.aitmProjectId,
        autoGenerateStories: settings.autoGenerateStories,
        hasApiKey: !!settings.encryptedApiKey,
      },
    });
  }),

  // PUT /api/repositories/:owner/:name/aitm-settings
  // Update AITM change story settings for a repository
  updateAitmSettings: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { owner, name } = req.params;
    const userId = req.userId!;
    const { aitmProjectId, aitmApiKey, autoGenerateStories } = req.body;

    const repository = await repositoryService.getRepository(owner, name);

    // Verify ownership
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { githubUsername: true },
    });
    const isOwner = user?.githubUsername?.toLowerCase() === owner.toLowerCase() || repository.claimedBy === userId;
    if (!isOwner) {
      throw Errors.forbidden('Only repository owners can update AITM settings');
    }

    if (!aitmProjectId || typeof aitmProjectId !== 'string') {
      throw Errors.badRequest('aitmProjectId is required');
    }

    // Build update data
    const updateData: any = {
      aitmProjectId,
      autoGenerateStories: autoGenerateStories === true,
    };

    // Only update API key if a new one is provided
    if (aitmApiKey && typeof aitmApiKey === 'string' && aitmApiKey.trim()) {
      updateData.encryptedApiKey = encryptApiKey(aitmApiKey.trim());
    }

    const settings = await prisma.repositoryAitmSettings.upsert({
      where: { repositoryId: repository.id },
      create: {
        repositoryId: repository.id,
        aitmProjectId,
        encryptedApiKey: aitmApiKey ? encryptApiKey(aitmApiKey.trim()) : '',
        autoGenerateStories: autoGenerateStories === true,
      },
      update: updateData,
    });

    return res.json({
      settings: {
        aitmProjectId: settings.aitmProjectId,
        autoGenerateStories: settings.autoGenerateStories,
        hasApiKey: !!settings.encryptedApiKey,
      },
    });
  }),

  // DELETE /api/repositories/:owner/:name/aitm-settings
  // Remove AITM integration from a repository
  removeAitmSettings: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { owner, name } = req.params;
    const userId = req.userId!;

    const repository = await repositoryService.getRepository(owner, name);

    // Verify ownership
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { githubUsername: true },
    });
    const isOwner = user?.githubUsername?.toLowerCase() === owner.toLowerCase() || repository.claimedBy === userId;
    if (!isOwner) {
      throw Errors.forbidden('Only repository owners can remove AITM settings');
    }

    await prisma.repositoryAitmSettings.deleteMany({
      where: { repositoryId: repository.id },
    });

    return res.json({ message: 'AITM settings removed' });
  }),
};
