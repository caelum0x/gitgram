import { Response, Request } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

export const createAd = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { type, content, mediaUrl, targetAudience, budget, startDate, endDate, title, targetUrl } = req.body;

  const ad = await prisma.advertisement.create({
    data: {
      advertiserId: req.userId!,
      type: type || 'banner',
      title: title || 'Ad',
      content: content || '',
      targetUrl: targetUrl || '',
      mediaUrl,
      targetAudience,
      budget: budget || 0,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    },
  });

  res.json(ad);
});

export const getAds = asyncHandler(async (req: AuthRequest, res: Response) => {
  const ads = await prisma.advertisement.findMany({
    where: { advertiserId: req.userId! },
    orderBy: { createdAt: 'desc' },
  });
  res.json(ads);
});

export const updateAd = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const advertiserId = req.userId;
  const { status } = req.body;

  const ad = await prisma.advertisement.updateMany({
    where: { id, advertiserId },
    data: { status },
  });

  res.json(ad);
});

export const trackImpression = async (adId: string) => {
  await prisma.advertisement.update({
    where: { id: adId },
    data: { impressions: { increment: 1 } },
  });
};

export const trackClick = async (adId: string) => {
  await prisma.advertisement.update({
    where: { id: adId },
    data: { clicks: { increment: 1 } },
  });
};

export const getActiveAds = asyncHandler(async (req: Request, res: Response) => {
  const { type } = req.query;
  const now = new Date();

  const ads = await prisma.advertisement.findMany({
    where: {
      type: type as string,
      status: 'active',
      startDate: { lte: now },
      endDate: { gte: now },
    },
    take: 5,
  });

  res.json(ads);
});

export const trackImpressionRoute = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const ad = await prisma.advertisement.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!ad || ad.status !== 'active') {
    throw Errors.notFound('Ad');
  }
  await trackImpression(id);
  res.json({ success: true });
});

export const trackClickRoute = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const ad = await prisma.advertisement.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!ad || ad.status !== 'active') {
    throw Errors.notFound('Ad');
  }
  await trackClick(id);
  res.json({ success: true });
});
