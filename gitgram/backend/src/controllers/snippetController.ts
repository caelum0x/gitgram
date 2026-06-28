import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

const SNIPPET_CONTENT_TYPE = 'SNIPPET' as const;

// Ensure a snippet exists or throw a 404 — shared guard for social endpoints.
const ensureSnippetExists = async (id: string): Promise<void> => {
  const snippet = await prisma.codeSnippet.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!snippet) {
    throw Errors.notFound('Snippet');
  }
};

// Create a code snippet
export const createSnippet = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { title, description, code, language, repositoryId, filePath, startLine, endLine } = req.body;

  if (!code?.trim()) {
    throw Errors.badRequest('Code is required');
  }

  const snippet = await prisma.codeSnippet.create({
    data: {
      userId: req.userId!,
      repositoryId,
      title,
      description,
      code,
      language,
    },
    include: {
      user: { select: { id: true, username: true, avatar: true } },
      repository: { select: { fullName: true, htmlUrl: true } }
    }
  });

  res.status(201).json(snippet);
});

// Get snippets with optional filters
export const getSnippets = asyncHandler(async (req: Request, res: Response) => {
  const { language, repositoryId, userId, page = 1, limit = 20 } = req.query;

  const where: any = {};
  if (language) where.language = String(language);
  if (repositoryId) where.repositoryId = String(repositoryId);
  if (userId) where.userId = String(userId);

  const [snippets, total] = await Promise.all([
    prisma.codeSnippet.findMany({
      where,
      include: {
        user: { select: { id: true, username: true, avatar: true } },
        repository: { select: { fullName: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: (Number(page) - 1) * Number(limit)
    }),
    prisma.codeSnippet.count({ where })
  ]);

  res.json({
    snippets,
    total,
    page: Number(page),
    totalPages: Math.ceil(total / Number(limit))
  });
});

// Get single snippet
export const getSnippet = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const snippet = await prisma.codeSnippet.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, username: true, avatar: true, displayName: true } },
      repository: { select: { fullName: true, htmlUrl: true, description: true } }
    }
  });

  if (!snippet) {
    throw Errors.notFound('Snippet');
  }

  res.json(snippet);
});

// Update snippet
export const updateSnippet = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { title, description, code, language } = req.body;

  const snippet = await prisma.codeSnippet.findUnique({ where: { id } });

  if (!snippet) {
    throw Errors.notFound('Snippet');
  }

  if (snippet.userId !== req.userId) {
    throw Errors.forbidden('Not authorized');
  }

  const updated = await prisma.codeSnippet.update({
    where: { id },
    data: { title, description, code, language },
    include: {
      user: { select: { id: true, username: true, avatar: true } },
      repository: { select: { fullName: true } }
    }
  });

  res.json(updated);
});

// Delete snippet
export const deleteSnippet = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const snippet = await prisma.codeSnippet.findUnique({ where: { id } });

  if (!snippet) {
    throw Errors.notFound('Snippet');
  }

  if (snippet.userId !== req.userId) {
    throw Errors.forbidden('Not authorized');
  }

  await prisma.codeSnippet.delete({ where: { id } });

  res.json({ deleted: true });
});

// Like snippet
export const likeSnippet = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId!;

  const existing = await prisma.interaction.findUnique({
    where: {
      userId_contentType_contentId_type: {
        userId,
        contentType: 'SNIPPET',
        contentId: id,
        type: 'like'
      }
    }
  });

  if (existing) {
    await prisma.interaction.delete({ where: { id: existing.id } });
    await prisma.codeSnippet.update({
      where: { id },
      data: { likesCount: { decrement: 1 } }
    });
    return res.json({ liked: false });
  }

  await prisma.interaction.create({
    data: { userId, contentType: 'SNIPPET', contentId: id, type: 'like' }
  });
  await prisma.codeSnippet.update({
    where: { id },
    data: { likesCount: { increment: 1 } }
  });

  res.json({ liked: true });
});

// Get trending snippets
export const getTrendingSnippets = asyncHandler(async (req: Request, res: Response) => {
  const { language, limit = 10 } = req.query;

  const where: any = {};
  if (language) where.language = String(language);

  const snippets = await prisma.codeSnippet.findMany({
    where,
    include: {
      user: { select: { id: true, username: true, avatar: true } },
      repository: { select: { fullName: true } }
    },
    orderBy: [{ likesCount: 'desc' }, { createdAt: 'desc' }],
    take: Number(limit)
  });

  res.json(snippets);
});

// Add a comment (or reply) to a snippet
export const addSnippetComment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { content, parentId } = req.body;
  const userId = req.userId!;

  if (!content?.trim()) {
    throw Errors.badRequest('Comment content is required');
  }

  await ensureSnippetExists(id);

  if (parentId) {
    const parent = await prisma.unifiedComment.findFirst({
      where: { id: parentId, contentType: SNIPPET_CONTENT_TYPE, contentId: id },
      select: { id: true },
    });
    if (!parent) {
      throw Errors.badRequest('Parent comment not found for this snippet');
    }
  }

  const comment = await prisma.unifiedComment.create({
    data: {
      userId,
      contentType: SNIPPET_CONTENT_TYPE,
      contentId: id,
      content: content.trim(),
      parentId: parentId || null,
    },
    include: { user: { select: { id: true, username: true, avatar: true } } },
  });

  res.status(201).json(comment);
});

// List top-level comments for a snippet (with a preview of replies)
export const getSnippetComments = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { page = 1, limit = 20 } = req.query;

  await ensureSnippetExists(id);

  const [comments, total] = await Promise.all([
    prisma.unifiedComment.findMany({
      where: { contentType: SNIPPET_CONTENT_TYPE, contentId: id, parentId: null },
      include: {
        user: { select: { id: true, username: true, avatar: true } },
        replies: {
          take: 3,
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { id: true, username: true, avatar: true } } },
        },
        _count: { select: { replies: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: (Number(page) - 1) * Number(limit),
    }),
    prisma.unifiedComment.count({
      where: { contentType: SNIPPET_CONTENT_TYPE, contentId: id, parentId: null },
    }),
  ]);

  res.json({
    comments,
    total,
    page: Number(page),
    totalPages: Math.ceil(total / Number(limit)),
  });
});

// List the users who liked a snippet
export const getSnippetLikers = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { page = 1, limit = 20 } = req.query;

  await ensureSnippetExists(id);

  const where = {
    contentType: SNIPPET_CONTENT_TYPE,
    contentId: id,
    type: 'like',
    userId: { not: null },
  };

  const [interactions, total] = await Promise.all([
    prisma.interaction.findMany({
      where,
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: (Number(page) - 1) * Number(limit),
    }),
    prisma.interaction.count({ where }),
  ]);

  const userIds = interactions
    .map((i) => i.userId)
    .filter((uid): uid is string => uid !== null);

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, avatar: true, displayName: true },
  });

  // Preserve like-recency ordering from the interaction query
  const usersById = new Map(users.map((u) => [u.id, u]));
  const likers = userIds
    .map((uid) => usersById.get(uid))
    .filter((u): u is NonNullable<typeof u> => u !== undefined);

  res.json({
    likers,
    total,
    page: Number(page),
    totalPages: Math.ceil(total / Number(limit)),
  });
});
