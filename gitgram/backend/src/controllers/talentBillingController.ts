import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { asyncHandler, Errors } from '../middleware/errorHandler';
import prisma from '../utils/prisma';
import { getTalentGraph } from '../services/talentGraphService';
import {
  requestCandidateUnlock,
  isCandidateUnlocked,
} from '../services/talentBillingService';

function boundedId(value: unknown, field: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > 160) {
    throw Errors.invalidField(field, `${field} must contain 1 to 160 characters`);
  }
  return text;
}

function parsePlacementAmount(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw Errors.invalidField('placementAmountCents', 'placementAmountCents must be a positive integer number of cents');
  }
  return amount;
}

async function requireOwnedOpportunity(opportunityId: string, userId: string) {
  const opportunity = await prisma.talentOpportunity.findUnique({
    where: { id: opportunityId },
    select: { id: true, createdById: true },
  });
  if (!opportunity) throw Errors.notFound('Talent opportunity', opportunityId);
  if (opportunity.createdById !== userId) {
    throw Errors.forbidden('Only the opportunity owner can manage candidate unlocks');
  }
  return opportunity;
}

export const talentBillingController = {
  /**
   * POST /opportunities/:id/unlocks
   * Recruiter opens (or replays) a paid unlock for a matched candidate. Returns a
   * Polar checkout URL, or `alreadyUnlocked` when the entitlement is already paid.
   */
  requestUnlock: asyncHandler(async (req: AuthRequest, res: Response) => {
    const opportunityId = req.params.id;
    const candidateId = boundedId(req.body.candidateId, 'candidateId');
    const placementAmountCents = parsePlacementAmount(req.body.placementAmountCents);

    const recruiter = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { email: true },
    });
    if (!recruiter?.email) throw Errors.userNotFound(req.userId);

    const successUrl = `${process.env.FRONTEND_URL ?? ''}/talent/opportunities/${encodeURIComponent(
      opportunityId,
    )}?unlocked=${encodeURIComponent(candidateId)}`;

    const result = await requestCandidateUnlock({
      recruiterId: req.userId!,
      opportunityId,
      candidateId,
      recruiterEmail: recruiter.email,
      successUrl,
      placementAmountCents,
    });

    res.setHeader('Cache-Control', 'no-store');
    res.status(result.alreadyUnlocked ? 200 : 201).json({ data: result });
  }),

  /**
   * GET /opportunities/:id/unlocks
   * Lists the recruiter's placement entitlements (receipts) for an opportunity.
   */
  listUnlocks: asyncHandler(async (req: AuthRequest, res: Response) => {
    await requireOwnedOpportunity(req.params.id, req.userId!);
    const placements = await prisma.talentPlacement.findMany({
      where: { opportunityId: req.params.id, recruiterId: req.userId! },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.setHeader('Cache-Control', 'no-store, private');
    res.json({ data: placements });
  }),

  /**
   * GET /opportunities/:id/candidates/:candidateId/contact
   * The gated resource. Contact details + full evidence are returned only when the
   * recruiter holds a paid unlock entitlement; otherwise 402 Payment Required.
   */
  getCandidateContact: asyncHandler(async (req: AuthRequest, res: Response) => {
    const opportunityId = req.params.id;
    const candidateId = req.params.candidateId;
    await requireOwnedOpportunity(opportunityId, req.userId!);

    const unlocked = await isCandidateUnlocked(opportunityId, candidateId, req.userId!);
    if (!unlocked) {
      throw Errors.paymentRequired(
        'Unlock this candidate to view their contact details and full evidence',
      );
    }

    const candidate = await prisma.user.findUnique({
      where: { id: candidateId },
      select: { id: true, username: true, displayName: true, email: true, githubUsername: true },
    });
    if (!candidate) throw Errors.userNotFound(candidateId);

    const evidence = await getTalentGraph(candidateId, { publicView: true });

    res.setHeader('Cache-Control', 'no-store, private');
    res.json({
      data: {
        contact: {
          id: candidate.id,
          username: candidate.username,
          displayName: candidate.displayName,
          email: candidate.email,
          githubUsername: candidate.githubUsername,
        },
        evidence,
      },
    });
  }),
};
