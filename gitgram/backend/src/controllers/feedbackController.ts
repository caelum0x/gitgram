import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';
import { asyncHandler, Errors } from '../middleware/errorHandler';

const VALID_TYPES = ['bug', 'feature', 'other'];

export const createFeedback = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { type, title, content, screenshotUrl } = req.body;

  const resolvedTitle = (title || '').toString().trim();
  const resolvedContent = (content || '').toString().trim();

  if (!resolvedTitle) {
    throw Errors.badRequest('Title is required');
  }
  if (!resolvedContent) {
    throw Errors.badRequest('Content is required');
  }

  const resolvedType = VALID_TYPES.includes(type) ? type : 'other';

  const feedback = await prisma.feedback.create({
    data: {
      userId: req.userId!,
      type: resolvedType,
      title: resolvedTitle,
      content: resolvedContent,
      screenshotUrl: screenshotUrl ? String(screenshotUrl) : null,
    },
  });

  res.status(201).json({ feedback });
});

export const getFeedbacks = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));

  const where = { userId: req.userId! };
  const [feedbacks, total] = await Promise.all([
    prisma.feedback.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.feedback.count({ where }),
  ]);

  res.json({
    feedbacks,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});

export const getFeedback = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const feedback = await prisma.feedback.findFirst({
    where: { id, userId: req.userId! },
  });

  if (!feedback) {
    throw Errors.notFound('Feedback');
  }

  res.json({ feedback });
});
