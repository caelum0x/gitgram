import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

export const getDrafts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const drafts = await prisma.postDraft.findMany({
    where: { userId: req.userId! },
    orderBy: { updatedAt: 'desc' },
  });

  res.json(drafts);
});

export const getDraft = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const draft = await prisma.postDraft.findFirst({
    where: { id, userId: req.userId! },
  });

  if (!draft) {
    throw Errors.notFound('Draft');
  }

  res.json(draft);
});

export const createDraft = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { content, mediaUrls } = req.body;

  const draft = await prisma.postDraft.create({
    data: {
      userId: req.userId!,
      content: content || '',
      mediaUrls: mediaUrls || [],
    },
  });

  res.status(201).json(draft);
});

export const updateDraft = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { content, mediaUrls } = req.body;

  // Check if draft exists and belongs to user
  const existing = await prisma.postDraft.findFirst({
    where: { id, userId: req.userId! },
  });

  if (!existing) {
    throw Errors.notFound('Draft');
  }

  const draft = await prisma.postDraft.update({
    where: { id },
    data: {
      content: content !== undefined ? content : existing.content,
      mediaUrls: mediaUrls !== undefined ? mediaUrls : existing.mediaUrls,
    },
  });

  res.json(draft);
});

export const deleteDraft = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const result = await prisma.postDraft.deleteMany({
    where: { id, userId: req.userId! },
  });

  if (result.count === 0) {
    throw Errors.notFound('Draft');
  }

  res.json({ success: true });
});

// Publish a draft as a post
export const publishDraft = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const draft = await prisma.postDraft.findFirst({
    where: { id, userId: req.userId! },
  });

  if (!draft) {
    throw Errors.notFound('Draft');
  }

  // Get user's account
  const account = await prisma.account.findFirst({
    where: { userId: req.userId! },
  });

  if (!account) {
    throw Errors.notFound('Account');
  }

  // Create the post
  const post = await prisma.post.create({
    data: {
      accountId: account.id,
      userId: req.userId!,
      content: draft.content || '',
      mediaUrls: draft.mediaUrls,
      type: 'POST',
    },
    include: {
      user: {
        select: { id: true, username: true, avatar: true, verified: true },
      },
    },
  });

  // Delete the draft
  await prisma.postDraft.delete({ where: { id } });

  res.status(201).json(post);
});

// Sync multiple drafts from local storage
export const syncDrafts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { drafts } = req.body;

  if (!Array.isArray(drafts)) {
    throw Errors.badRequest('Drafts must be an array');
  }

  const results = [];

  for (const draft of drafts) {
    const { localId, content, mediaUrls, updatedAt } = draft;

    // Check if we have a draft with this local ID stored in our metadata
    // For simplicity, create new drafts for synced content
    const newDraft = await prisma.postDraft.create({
      data: {
        userId: req.userId!,
        content: content || '',
        mediaUrls: mediaUrls || [],
      },
    });

    results.push({
      localId,
      serverId: newDraft.id,
      synced: true,
    });
  }

  res.json({ synced: results });
});
