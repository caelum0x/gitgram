import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';
import { asyncHandler, Errors } from '../middleware/errorHandler';

interface CampaignRecord {
  id: string;
  advertiserId: string;
  name: string;
  description: string | null;
  type: string;
  budget: number;
  dailyBudget: number | null;
  spent: number;
  billingType: string;
  status: string;
  targetAudience: string | null;
  startDate: Date | null;
  endDate: Date | null;
  createdAt: Date;
}

function serializeCampaign(c: CampaignRecord) {
  let targetAudience: unknown = null;
  if (c.targetAudience) {
    try {
      targetAudience = JSON.parse(c.targetAudience);
    } catch {
      targetAudience = c.targetAudience;
    }
  }
  return {
    id: c.id,
    advertiserId: c.advertiserId,
    name: c.name,
    description: c.description,
    type: c.type,
    budget: c.budget,
    dailyBudget: c.dailyBudget,
    spent: c.spent,
    billingType: c.billingType,
    status: c.status,
    targetAudience,
    startDate: c.startDate,
    endDate: c.endDate,
    createdAt: c.createdAt,
  };
}

async function ownCampaignOrThrow(id: string, userId: string) {
  const campaign = await prisma.adCampaign.findUnique({ where: { id } });
  if (!campaign) {
    throw Errors.notFound('Campaign');
  }
  if (campaign.advertiserId !== userId) {
    throw Errors.forbidden('You can only modify your own campaigns');
  }
  return campaign;
}

export const createCampaign = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, description, type, budget, dailyBudget, startDate, endDate, billingType, targetAudience } = req.body;

  const resolvedName = (name || '').toString().trim();
  if (!resolvedName) {
    throw Errors.badRequest('Campaign name is required');
  }
  const numericBudget = Number(budget);
  if (!Number.isFinite(numericBudget) || numericBudget < 0) {
    throw Errors.badRequest('Budget must be a non-negative number');
  }

  const campaign = await prisma.adCampaign.create({
    data: {
      advertiserId: req.userId!,
      name: resolvedName,
      description: description ? String(description) : null,
      type: type || 'post',
      budget: numericBudget,
      dailyBudget: dailyBudget !== undefined ? Number(dailyBudget) || null : null,
      billingType: billingType || 'cpc',
      targetAudience: targetAudience ? JSON.stringify(targetAudience) : null,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    },
  });

  res.status(201).json({ campaign: serializeCampaign(campaign) });
});

export const getCampaigns = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { status } = req.query;
  const campaigns = await prisma.adCampaign.findMany({
    where: {
      advertiserId: req.userId!,
      ...(status ? { status: String(status) } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ campaigns: campaigns.map(serializeCampaign) });
});

export const getCampaign = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const campaign = await ownCampaignOrThrow(id, req.userId!);
  res.json({ campaign: serializeCampaign(campaign) });
});

export const updateCampaign = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await ownCampaignOrThrow(id, req.userId!);

  const { name, description, type, budget, dailyBudget, billingType, status, targetAudience, startDate, endDate } = req.body;
  const campaign = await prisma.adCampaign.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name: String(name) } : {}),
      ...(description !== undefined ? { description: String(description) } : {}),
      ...(type !== undefined ? { type: String(type) } : {}),
      ...(budget !== undefined ? { budget: Number(budget) || 0 } : {}),
      ...(dailyBudget !== undefined ? { dailyBudget: Number(dailyBudget) || null } : {}),
      ...(billingType !== undefined ? { billingType: String(billingType) } : {}),
      ...(status !== undefined ? { status: String(status) } : {}),
      ...(targetAudience !== undefined ? { targetAudience: JSON.stringify(targetAudience) } : {}),
      ...(startDate !== undefined ? { startDate: startDate ? new Date(startDate) : null } : {}),
      ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
    },
  });
  res.json({ campaign: serializeCampaign(campaign) });
});

export const deleteCampaign = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await ownCampaignOrThrow(id, req.userId!);
  // Detach any ads from this campaign before deleting it.
  await prisma.advertisement.updateMany({ where: { campaignId: id }, data: { campaignId: null } });
  await prisma.adCampaign.delete({ where: { id } });
  res.json({ success: true });
});

async function setCampaignStatus(req: AuthRequest, res: Response, status: string) {
  const { id } = req.params;
  await ownCampaignOrThrow(id, req.userId!);
  const campaign = await prisma.adCampaign.update({ where: { id }, data: { status } });
  // Cascade pause/resume to the campaign's ads.
  await prisma.advertisement.updateMany({
    where: { campaignId: id },
    data: { status: status === 'paused' ? 'paused' : 'active' },
  });
  res.json({ campaign: serializeCampaign(campaign) });
}

export const pauseCampaign = asyncHandler(async (req: AuthRequest, res: Response) => {
  await setCampaignStatus(req, res, 'paused');
});

export const resumeCampaign = asyncHandler(async (req: AuthRequest, res: Response) => {
  await setCampaignStatus(req, res, 'active');
});

export const fundCampaign = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { amount } = req.body;
  await ownCampaignOrThrow(id, req.userId!);

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw Errors.badRequest('Amount must be a positive number');
  }

  const campaign = await prisma.adCampaign.update({
    where: { id },
    data: { budget: { increment: numericAmount } },
  });
  res.json({ campaign: serializeCampaign(campaign) });
});

export const getCampaignAnalytics = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await ownCampaignOrThrow(id, req.userId!);

  const aggregate = await prisma.advertisement.aggregate({
    where: { campaignId: id },
    _sum: { impressions: true, clicks: true, conversions: true, spent: true },
    _count: true,
  });

  const impressions = aggregate._sum.impressions ?? 0;
  const clicks = aggregate._sum.clicks ?? 0;
  const conversions = aggregate._sum.conversions ?? 0;
  const spent = aggregate._sum.spent ?? 0;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

  res.json({
    analytics: {
      campaignId: id,
      adCount: aggregate._count,
      impressions,
      views: impressions,
      clicks,
      conversions,
      spent,
      ctr: Number(ctr.toFixed(2)),
    },
  });
});
