import { Response, Request } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';
import { asyncHandler, Errors } from '../middleware/errorHandler';
import { uploadPostImage } from '../services/storageService';

interface AdRecord {
  id: string;
  advertiserId: string;
  campaignId: string | null;
  title: string;
  content: string;
  mediaUrl: string | null;
  targetUrl: string;
  callToAction: string | null;
  placement: string[];
  priority: number;
  budget: number;
  spent: number;
  impressions: number;
  clicks: number;
  conversions: number;
  status: string;
  type: string;
  createdAt: Date;
}

/** Serialize an ad, exposing aliases (`imageUrl`, `views`, `description`) the UI reads. */
function serializeAd(ad: AdRecord) {
  return {
    id: ad.id,
    advertiserId: ad.advertiserId,
    campaignId: ad.campaignId,
    title: ad.title,
    content: ad.content,
    description: ad.content,
    mediaUrl: ad.mediaUrl,
    imageUrl: ad.mediaUrl,
    targetUrl: ad.targetUrl,
    callToAction: ad.callToAction,
    placement: ad.placement,
    priority: ad.priority,
    budget: ad.budget,
    spent: ad.spent,
    impressions: ad.impressions,
    views: ad.impressions,
    clicks: ad.clicks,
    conversions: ad.conversions,
    status: ad.status,
    type: ad.type,
    createdAt: ad.createdAt,
  };
}

function parsePlacement(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return [raw];
    }
  }
  return [];
}

export const createAd = asyncHandler(async (req: AuthRequest, res: Response) => {
  const {
    type,
    content,
    targetAudience,
    budget,
    startDate,
    endDate,
    title,
    targetUrl,
    destinationUrl,
    callToAction,
    placement,
    priority,
    campaignId,
  } = req.body;

  let mediaUrl: string | undefined = req.body.mediaUrl;
  if (req.file) {
    const uploaded = await uploadPostImage(req.file, 'ads');
    mediaUrl = uploaded.url;
  }

  // If attached to a campaign, verify ownership.
  if (campaignId) {
    const campaign = await prisma.adCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) {
      throw Errors.notFound('Campaign');
    }
    if (campaign.advertiserId !== req.userId) {
      throw Errors.forbidden('You can only add ads to your own campaigns');
    }
  }

  const ad = await prisma.advertisement.create({
    data: {
      advertiserId: req.userId!,
      campaignId: campaignId || null,
      type: type || 'banner',
      title: title || 'Untitled Ad',
      content: content || '',
      targetUrl: destinationUrl || targetUrl || '',
      callToAction: callToAction || null,
      placement: parsePlacement(placement),
      priority: priority !== undefined ? Number(priority) || 0 : 0,
      mediaUrl,
      targetAudience,
      budget: budget !== undefined ? Number(budget) || 0 : 0,
      status: 'pending',
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    },
  });

  res.status(201).json(serializeAd(ad));
});

export const getAds = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { campaignId, status } = req.query;
  const ads = await prisma.advertisement.findMany({
    where: {
      advertiserId: req.userId!,
      ...(campaignId ? { campaignId: String(campaignId) } : {}),
      ...(status ? { status: String(status) } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ ads: ads.map(serializeAd) });
});

export const getMyAds = asyncHandler(async (req: AuthRequest, res: Response) => {
  const ads = await prisma.advertisement.findMany({
    where: { advertiserId: req.userId! },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ ads: ads.map(serializeAd) });
});

export const getAd = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const ad = await prisma.advertisement.findUnique({ where: { id } });
  if (!ad) {
    throw Errors.notFound('Ad');
  }
  res.json(serializeAd(ad));
});

export const updateAd = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const existing = await prisma.advertisement.findUnique({ where: { id } });
  if (!existing) {
    throw Errors.notFound('Ad');
  }
  if (existing.advertiserId !== req.userId) {
    throw Errors.forbidden('You can only edit your own ads');
  }

  const { status, title, content, targetUrl, callToAction, budget, priority } = req.body;
  const ad = await prisma.advertisement.update({
    where: { id },
    data: {
      ...(status !== undefined ? { status: String(status) } : {}),
      ...(title !== undefined ? { title: String(title) } : {}),
      ...(content !== undefined ? { content: String(content) } : {}),
      ...(targetUrl !== undefined ? { targetUrl: String(targetUrl) } : {}),
      ...(callToAction !== undefined ? { callToAction: String(callToAction) } : {}),
      ...(budget !== undefined ? { budget: Number(budget) || 0 } : {}),
      ...(priority !== undefined ? { priority: Number(priority) || 0 } : {}),
    },
  });
  res.json(serializeAd(ad));
});

async function setAdStatus(req: AuthRequest, res: Response, status: string) {
  const { id } = req.params;
  const existing = await prisma.advertisement.findUnique({ where: { id } });
  if (!existing) {
    throw Errors.notFound('Ad');
  }
  if (existing.advertiserId !== req.userId) {
    throw Errors.forbidden('You can only modify your own ads');
  }
  const ad = await prisma.advertisement.update({ where: { id }, data: { status } });
  res.json(serializeAd(ad));
}

export const pauseAd = asyncHandler(async (req: AuthRequest, res: Response) => {
  await setAdStatus(req, res, 'paused');
});

export const resumeAd = asyncHandler(async (req: AuthRequest, res: Response) => {
  await setAdStatus(req, res, 'active');
});

export const deleteAd = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const existing = await prisma.advertisement.findUnique({ where: { id } });
  if (!existing) {
    throw Errors.notFound('Ad');
  }
  if (existing.advertiserId !== req.userId) {
    throw Errors.forbidden('You can only delete your own ads');
  }
  await prisma.advertisement.delete({ where: { id } });
  res.json({ success: true });
});

export const getAdAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const ad = await prisma.advertisement.findUnique({ where: { id } });
  if (!ad) {
    throw Errors.notFound('Ad');
  }

  const ctr = ad.impressions > 0 ? (ad.clicks / ad.impressions) * 100 : 0;
  const cpc = ad.clicks > 0 ? ad.spent / ad.clicks : 0;
  const cpm = ad.impressions > 0 ? (ad.spent / ad.impressions) * 1000 : 0;

  res.json({
    analytics: {
      adId: ad.id,
      impressions: ad.impressions,
      views: ad.impressions,
      clicks: ad.clicks,
      conversions: ad.conversions,
      spent: ad.spent,
      ctr: Number(ctr.toFixed(2)),
      cpc: Number(cpc.toFixed(2)),
      cpm: Number(cpm.toFixed(2)),
    },
  });
});

export const reportAd = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body;
  const ad = await prisma.advertisement.findUnique({ where: { id }, select: { id: true } });
  if (!ad) {
    throw Errors.notFound('Ad');
  }

  await prisma.moderationLog.create({
    data: {
      moderatorId: req.userId!,
      action: 'report_ad',
      targetType: 'advertisement',
      targetId: id,
      reason: reason ? String(reason) : null,
      automated: false,
    },
  });

  res.json({ success: true });
});

// --- Ad preferences -------------------------------------------------------

export const getAdPreferences = asyncHandler(async (req: AuthRequest, res: Response) => {
  const prefs = await prisma.adPreferences.findUnique({ where: { userId: req.userId! } });
  res.json({
    preferences: prefs ?? {
      userId: req.userId,
      personalizedAds: true,
      interestCategories: [],
      optOut: false,
    },
  });
});

export const updateAdPreferences = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { personalizedAds, interestCategories, optOut } = req.body;
  const data = {
    ...(personalizedAds !== undefined ? { personalizedAds: Boolean(personalizedAds) } : {}),
    ...(Array.isArray(interestCategories) ? { interestCategories: interestCategories.map(String) } : {}),
    ...(optOut !== undefined ? { optOut: Boolean(optOut) } : {}),
  };

  const prefs = await prisma.adPreferences.upsert({
    where: { userId: req.userId! },
    create: { userId: req.userId!, ...data },
    update: data,
  });

  res.json({ preferences: prefs });
});

// --- Admin moderation -----------------------------------------------------

export const getPendingAds = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));

  const where = { status: 'pending' };
  const [ads, total] = await Promise.all([
    prisma.advertisement.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.advertisement.count({ where }),
  ]);

  const advertiserIds = Array.from(new Set(ads.map((a) => a.advertiserId)));
  const advertisers = await prisma.user.findMany({
    where: { id: { in: advertiserIds } },
    select: { id: true, username: true, avatar: true },
  });
  const advertiserMap = new Map(advertisers.map((u) => [u.id, u]));

  const campaignIds = Array.from(new Set(ads.map((a) => a.campaignId).filter(Boolean))) as string[];
  const campaigns = campaignIds.length
    ? await prisma.adCampaign.findMany({ where: { id: { in: campaignIds } }, select: { id: true, name: true } })
    : [];
  const campaignMap = new Map(campaigns.map((c) => [c.id, c]));

  res.json({
    ads: ads.map((ad) => ({
      ...serializeAd(ad),
      advertiser: advertiserMap.get(ad.advertiserId) ?? null,
      campaign: ad.campaignId ? campaignMap.get(ad.campaignId) ?? null : null,
    })),
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});

export const approveAd = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const existing = await prisma.advertisement.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw Errors.notFound('Ad');
  }
  const ad = await prisma.advertisement.update({ where: { id }, data: { status: 'active' } });
  await prisma.moderationLog.create({
    data: {
      moderatorId: req.userId!,
      action: 'approve_ad',
      targetType: 'advertisement',
      targetId: id,
      automated: false,
    },
  });
  res.json(serializeAd(ad));
});

export const rejectAd = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body;
  const existing = await prisma.advertisement.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw Errors.notFound('Ad');
  }
  const ad = await prisma.advertisement.update({ where: { id }, data: { status: 'rejected' } });
  await prisma.moderationLog.create({
    data: {
      moderatorId: req.userId!,
      action: 'reject_ad',
      targetType: 'advertisement',
      targetId: id,
      reason: reason ? String(reason) : null,
      automated: false,
    },
  });
  res.json(serializeAd(ad));
});

// --- Public delivery & tracking -------------------------------------------

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
  const limit = Math.min(20, Math.max(1, parseInt(String(req.query.limit ?? '10'), 10) || 10));
  const now = new Date();

  const ads = await prisma.advertisement.findMany({
    where: {
      ...(type ? { type: String(type) } : {}),
      status: 'active',
      OR: [
        { startDate: null },
        { startDate: { lte: now } },
      ],
      AND: [
        {
          OR: [{ endDate: null }, { endDate: { gte: now } }],
        },
      ],
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  });

  res.json({ ads: ads.map(serializeAd) });
});

export const getFeedAds = asyncHandler(async (req: Request, res: Response) => {
  const placement = String(req.query.placement ?? 'feed');
  const limit = Math.min(5, Math.max(1, parseInt(String(req.query.limit ?? '1'), 10) || 1));
  const now = new Date();

  const ads = await prisma.advertisement.findMany({
    where: {
      status: 'active',
      placement: { has: placement },
      OR: [{ startDate: null }, { startDate: { lte: now } }],
      AND: [{ OR: [{ endDate: null }, { endDate: { gte: now } }] }],
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  });

  res.json({ ads: ads.map(serializeAd) });
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

export const trackConversionRoute = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const ad = await prisma.advertisement.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!ad || ad.status !== 'active') {
    throw Errors.notFound('Ad');
  }
  await prisma.advertisement.update({ where: { id }, data: { conversions: { increment: 1 } } });
  res.json({ success: true });
});
