import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { asyncHandler, Errors } from '../middleware/errorHandler';
import { findTalentMatches, getTalentGraph } from '../services/talentGraphService';
import { analyzeNeedCoverage } from '../services/talentGapAnalysisService';
import prisma from '../utils/prisma';
import { normalizePublicHttpUrl } from '../utils/publicHttpUrl';
import { runTalentMutation, type TalentMutationResult } from '../services/talentMutationService';

const PILOT_STATUSES = ['PLANNED', 'ACTIVE', 'REVIEW', 'COMPLETED', 'CANCELLED'] as const;
type PilotStatus = (typeof PILOT_STATUSES)[number];

const PILOT_STATUS_TRANSITIONS: Record<PilotStatus, readonly PilotStatus[]> = {
  PLANNED: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['REVIEW', 'COMPLETED', 'CANCELLED'],
  REVIEW: ['ACTIVE', 'COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

const pilotProvenanceInclude = {
  opportunity: true,
  referral: true,
  statusTransitions: { orderBy: { createdAt: 'asc' as const } },
};

function publicHttpUrl(value: unknown) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const url = normalizePublicHttpUrl(normalized);
  if (!url) throw Errors.badRequest('Deliverable URL must be a public HTTP or HTTPS URL');
  return url;
}

function boundedText(value: unknown, field: string, max: number) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > max) throw Errors.invalidField(field, `${field} must contain 1 to ${max} characters`);
  return text;
}

function expectedRevision(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw Errors.invalidField('expectedRevision', 'expectedRevision must be a positive integer');
  }
  return Number(value);
}

function sendMutation<T>(res: Response, result: TalentMutationResult<T>, created = false) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Idempotency-Replayed', String(result.replayed));
  res.setHeader('Idempotency-Key-Expires-In', String(30 * 24 * 60 * 60));
  res.status(created && !result.replayed ? 201 : 200).json({ data: result.value });
}

function publicOpportunity<T extends { createdById: string }>(opportunity: T, viewerId?: string) {
  const { createdById, ...publicFields } = opportunity;
  return {
    ...publicFields,
    viewerRole: createdById === viewerId ? 'institution' as const : 'public' as const,
  };
}

function setViewerAwareReadCache(res: Response, viewerId?: string) {
  res.setHeader('Vary', 'Authorization, Cookie');
  res.setHeader(
    'Cache-Control',
    viewerId ? 'no-store, private' : 'public, max-age=30, stale-while-revalidate=60',
  );
}

export const talentGraphController = {
  getMine: asyncHandler(async (req: AuthRequest, res: Response) => {
    const graph = await getTalentGraph(req.userId!);
    if (!graph) throw Errors.userNotFound(req.userId);

    res.setHeader('Cache-Control', 'no-store, private');
    res.json({ data: graph });
  }),

  getPublic: asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: { id: true, isPrivate: true },
    });

    if (!user || user.isPrivate) throw Errors.userNotFound(req.params.username);

    const graph = await getTalentGraph(user.id, { publicView: true });
    if (!graph) throw Errors.userNotFound(req.params.username);

    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    res.setHeader('X-Talent-Proof-Schema', '1');
    res.json({ data: graph, meta: { proofSchemaVersion: 1 } });
  }),

  listOpportunities: asyncHandler(async (req: AuthRequest, res: Response) => {
    const opportunities = await prisma.talentOpportunity.findMany({
      where: { status: { in: ['OPEN', 'MATCHING', 'PILOT'] } },
      include: {
        pilots: { select: { status: true } },
        referrals: { select: { status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    setViewerAwareReadCache(res, req.userId);
    res.json({
      data: opportunities.map(({ pilots, referrals, ...opportunity }) => {
        const visible = publicOpportunity(opportunity, req.userId);
        if (visible.viewerRole !== 'institution') return visible;
        return {
          ...visible,
          pilotSummary: {
            total: pilots.length,
            active: pilots.filter((pilot) => pilot.status === 'ACTIVE' || pilot.status === 'REVIEW').length,
            completed: pilots.filter((pilot) => pilot.status === 'COMPLETED').length,
          },
          referralSummary: {
            total: referrals.length,
            contacted: referrals.filter((referral) => referral.status === 'CONTACTED').length,
            accepted: referrals.filter((referral) => referral.status === 'ACCEPTED').length,
            declined: referrals.filter((referral) => referral.status === 'DECLINED').length,
          },
        };
      }),
    });
  }),

  createOpportunity: asyncHandler(async (req: AuthRequest, res: Response) => {
    const organizationName = boundedText(req.body.organizationName, 'organizationName', 160);
    const title = boundedText(req.body.title, 'title', 160);
    const problem = boundedText(req.body.problem, 'problem', 4000);
    const successMetric = boundedText(req.body.successMetric, 'successMetric', 500);
    if (!Array.isArray(req.body.requiredSkills) || req.body.requiredSkills.length > 12) {
      throw Errors.invalidField('requiredSkills', 'requiredSkills must contain 1 to 12 entries');
    }
    const normalizedSkills = req.body.requiredSkills.map((skill: unknown, index: number) =>
      boundedText(skill, `requiredSkills[${index}]`, 64).toLowerCase());
    const requiredSkills = Array.from(new Set(normalizedSkills));
    const durationWeeks = req.body.durationWeeks === undefined ? 4 : Number(req.body.durationWeeks);
    if (!Number.isInteger(durationWeeks) || durationWeeks < 1 || durationWeeks > 16) {
      throw Errors.invalidField('durationWeeks', 'durationWeeks must be an integer from 1 to 16');
    }
    const allowedSourceChannels = new Set(['direct', 'gitgram', 'zemin360', 'zen-talent']);
    const requestedSourceChannel = String(req.body.sourceChannel || 'direct').trim().toLowerCase();
    if (!allowedSourceChannels.has(requestedSourceChannel)) {
      throw Errors.invalidField('sourceChannel', 'Unknown opportunity source channel');
    }
    const sourceChannel = requestedSourceChannel;
    const communityReferralConsent = req.body.communityReferralConsent === true;

    if (requiredSkills.length === 0) throw Errors.missingField('requiredSkills');

    const result = await runTalentMutation(req, 'opportunity.create', async (tx) => {
      const opportunity = await tx.talentOpportunity.create({
        data: {
          organizationName,
          title,
          problem,
          successMetric,
          requiredSkills,
          durationWeeks,
          sourceChannel,
          communityReferralConsent,
          createdById: req.userId!,
          revision: 1,
        },
      });
      return {
        value: { ...publicOpportunity(opportunity, req.userId), pilotSummary: emptyPilotSummary(), referralSummary: emptyReferralSummary() },
        resourceType: 'opportunity' as const,
        resourceId: opportunity.id,
      };
    });
    sendMutation(res, result, true);
  }),

  getOpportunityMatches: asyncHandler(async (req: AuthRequest, res: Response) => {
    const opportunity = await prisma.talentOpportunity.findUnique({ where: { id: req.params.id } });
    if (!opportunity) throw Errors.notFound('Talent opportunity', req.params.id);
    const matches = await findTalentMatches(opportunity.requiredSkills, 12);
    setViewerAwareReadCache(res, req.userId);
    res.json({ data: { opportunity: publicOpportunity(opportunity, req.userId), matches } });
  }),

  getOpportunityCoverage: asyncHandler(async (req: AuthRequest, res: Response) => {
    const opportunity = await prisma.talentOpportunity.findUnique({ where: { id: req.params.id } });
    if (!opportunity) throw Errors.notFound('Talent opportunity', req.params.id);
    const matches = await findTalentMatches(opportunity.requiredSkills, 25);
    const coverage = analyzeNeedCoverage(opportunity.requiredSkills, matches);
    setViewerAwareReadCache(res, req.userId);
    res.json({ data: { opportunity: publicOpportunity(opportunity, req.userId), coverage } });
  }),

  startPilot: asyncHandler(async (req: AuthRequest, res: Response) => {
    const participantId = boundedText(req.body.participantId, 'participantId', 160);
    if (participantId === req.userId) throw Errors.badRequest('Opportunity owners cannot verify their own pilot evidence');
    const milestones = normalizeStartingMilestones(req.body.milestones);
    const startedAt = new Date();
    const result = await runTalentMutation(req, `pilot.start:${req.params.id}`, async (tx) => {
      const opportunity = await tx.talentOpportunity.findUnique({ where: { id: req.params.id } });
      if (!opportunity) throw Errors.notFound('Talent opportunity', req.params.id);
      if (opportunity.createdById !== req.userId) throw Errors.forbidden('Only the opportunity owner can start a pilot');
      const participant = await tx.user.findFirst({
        where: { id: participantId, isPrivate: false, isBanned: false, isSuspended: false },
        select: { id: true },
      });
      if (!participant) throw Errors.userNotFound(participantId);
      const referral = opportunity.sourceChannel === 'zen-talent'
        ? await tx.talentReferral.findUnique({
            where: { opportunityId_participantId: { opportunityId: opportunity.id, participantId } },
          })
        : null;

      if (opportunity.sourceChannel === 'zen-talent' && referral?.status !== 'ACCEPTED') {
        throw Errors.conflict('The participant must accept the Zen Talent referral before the institution can start a pilot');
      }

      const created = await tx.talentPilot.create({
        data: {
          opportunityId: opportunity.id,
          referralId: referral?.id,
          participantId,
          status: 'ACTIVE',
          revision: 1,
          startedAt,
          milestones,
          statusTransitions: {
            create: {
              actorId: req.userId!,
              previousStatus: 'PLANNED',
              nextStatus: 'ACTIVE',
              revision: 1,
              createdAt: startedAt,
            },
          },
        },
        include: pilotProvenanceInclude,
      });
      await tx.talentOpportunity.update({
        where: { id: opportunity.id },
        data: { status: 'PILOT', revision: { increment: 1 } },
      });
      const value = { ...created, viewerRole: 'institution' as const };
      return { value, resourceType: 'pilot' as const, resourceId: created.id };
    });
    sendMutation(res, result, true);
  }),

  createReferral: asyncHandler(async (req: AuthRequest, res: Response) => {
    const participantId = boundedText(req.body.participantId, 'participantId', 160);
    if (participantId === req.userId) throw Errors.badRequest('Opportunity owners cannot refer themselves');

    const result = await runTalentMutation(req, `referral.create:${req.params.id}`, async (tx) => {
      const currentOpportunity = await tx.talentOpportunity.findUnique({ where: { id: req.params.id } });
      if (!currentOpportunity) throw Errors.notFound('Talent opportunity', req.params.id);
      if (currentOpportunity.createdById !== req.userId) throw Errors.forbidden('Only the opportunity owner can create a referral');
      if (currentOpportunity.sourceChannel !== 'zen-talent' || !currentOpportunity.communityReferralConsent) {
        throw Errors.forbidden('Zen Talent referrals require an explicit community referral consent');
      }
      const participant = await tx.user.findFirst({
        where: { id: participantId, isPrivate: false, isBanned: false, isSuspended: false },
        select: { id: true },
      });
      if (!participant) throw Errors.userNotFound(participantId);
      const matches = await findTalentMatches(currentOpportunity.requiredSkills, 25, tx);
      const participantMatch = matches.find((match) => match.profile.id === participantId);
      if (!participantMatch || participantMatch.projects.length === 0) {
        throw Errors.badRequest('Participant must have public repository or completed-pilot evidence matching this opportunity');
      }
      const referral = await tx.talentReferral.upsert({
        where: { opportunityId_participantId: { opportunityId: currentOpportunity.id, participantId } },
        create: { opportunityId: currentOpportunity.id, participantId, referredById: req.userId!, revision: 1 },
        update: {},
        include: { opportunity: true },
      });
      const value = { ...referral, viewerRole: 'institution' as const };
      return { value, resourceType: 'referral' as const, resourceId: referral.id };
    });
    sendMutation(res, result, true);
  }),

  listMyReferrals: asyncHandler(async (req: AuthRequest, res: Response) => {
    const referrals = await prisma.talentReferral.findMany({
      where: {
        OR: [
          { participantId: req.userId! },
          { opportunity: { createdById: req.userId! } },
        ],
      },
      include: { opportunity: true },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    res.setHeader('Cache-Control', 'no-store, private');
    res.json({
      data: referrals.map((referral) => ({
        ...referral,
        viewerRole: referral.participantId === req.userId ? 'participant' : 'institution',
      })),
    });
  }),

  updateReferral: asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.body.status !== 'ACCEPTED' && req.body.status !== 'DECLINED') {
      throw Errors.badRequest('Referral status must be ACCEPTED or DECLINED');
    }
    const revision = expectedRevision(req.body.expectedRevision);
    const result = await runTalentMutation(req, `referral.respond:${req.params.referralId}`, async (tx) => {
      const referral = await tx.talentReferral.findUnique({
        where: { id: req.params.referralId },
        include: { opportunity: true },
      });
      if (!referral) throw Errors.notFound('Talent referral', req.params.referralId);
      if (referral.participantId !== req.userId) throw Errors.forbidden('Only the referred participant can respond');
      if (referral.status !== 'CONTACTED') throw Errors.conflict('A referral decision cannot be changed after the participant responds');
      if (referral.revision !== revision) throw Errors.conflict(`Referral changed after revision ${revision}`);
      const updatedCount = await tx.talentReferral.updateMany({
        where: { id: referral.id, revision, status: 'CONTACTED' },
        data: { status: req.body.status, respondedAt: new Date(), revision: { increment: 1 } },
      });
      if (updatedCount.count !== 1) throw Errors.conflict('Referral changed while the decision was being saved');
      const updated = await tx.talentReferral.findUnique({
        where: { id: referral.id },
        include: { opportunity: true },
      });
      if (!updated) throw Errors.notFound('Talent referral', referral.id);
      const value = { ...updated, viewerRole: 'participant' as const };
      return { value, resourceType: 'referral' as const, resourceId: updated.id };
    });
    sendMutation(res, result);
  }),

  listMyPilots: asyncHandler(async (req: AuthRequest, res: Response) => {
    const pilots = await prisma.talentPilot.findMany({
      where: {
        OR: [
          { participantId: req.userId! },
          { opportunity: { createdById: req.userId! } },
        ],
      },
      include: pilotProvenanceInclude,
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    res.setHeader('Cache-Control', 'no-store, private');
    res.json({
      data: pilots.map((pilot) => ({
        ...pilot,
        viewerRole: pilot.participantId === req.userId ? 'participant' : 'institution',
      })),
    });
  }),

  updatePilot: asyncHandler(async (req: AuthRequest, res: Response) => {
    const revision = expectedRevision(req.body.expectedRevision);
    const result = await runTalentMutation(req, `pilot.update:${req.params.pilotId}`, async (tx) => {
      const pilot = await tx.talentPilot.findUnique({
        where: { id: req.params.pilotId },
        include: { opportunity: true },
      });
      if (!pilot) throw Errors.notFound('Talent pilot', req.params.pilotId);

      const isInstitution = pilot.opportunity.createdById === req.userId;
      const isParticipant = pilot.participantId === req.userId;
      if (!isInstitution && !isParticipant) {
        throw Errors.forbidden('Only the institution or participant can update this pilot');
      }
      if (pilot.revision !== revision) throw Errors.conflict(`Pilot changed after revision ${revision}`);

      const requestedStatus = req.body.status as PilotStatus | undefined;
      if (requestedStatus !== undefined && !PILOT_STATUSES.includes(requestedStatus)) {
        throw Errors.badRequest('Unknown pilot status');
      }
      if (requestedStatus !== undefined && !isInstitution) {
        throw Errors.forbidden('Only the institution can change pilot status');
      }

      const currentStatus = pilot.status as PilotStatus;
      const status = requestedStatus || currentStatus;
      if (status !== currentStatus && !PILOT_STATUS_TRANSITIONS[currentStatus].includes(status)) {
        throw Errors.conflict(`Pilot status cannot move from ${currentStatus} to ${status}`);
      }

      const transitionedAt = status !== pilot.status ? new Date() : null;
      if (!isInstitution && req.body.milestones !== undefined) {
        throw Errors.forbidden('Only the institution can change pilot milestones');
      }
      const milestones = req.body.milestones === undefined
        ? pilot.milestones
        : normalizeMilestones(req.body.milestones);
      const deliverableUrl = req.body.deliverableUrl === undefined
        ? pilot.deliverableUrl
        : publicHttpUrl(req.body.deliverableUrl);
      const institutionChangedDeliverable = isInstitution
        && req.body.deliverableUrl !== undefined
        && deliverableUrl !== pilot.deliverableUrl;
      const publicEvidenceConsent = institutionChangedDeliverable
        ? false
        : isParticipant && typeof req.body.publicEvidenceConsent === 'boolean'
          ? req.body.publicEvidenceConsent
          : pilot.publicEvidenceConsent;
      const feedback = !isInstitution || req.body.feedback === undefined
        ? pilot.feedback
        : optionalBoundedText(req.body.feedback, 'feedback', 4000);
      const nextRevision = revision + 1;
      const updatedCount = await tx.talentPilot.updateMany({
        where: { id: pilot.id, revision },
        data: {
          status,
          milestones,
          deliverableUrl,
          feedback,
          publicEvidenceConsent,
          revision: nextRevision,
          startedAt: status === 'ACTIVE' ? pilot.startedAt || transitionedAt || new Date() : pilot.startedAt,
          completedAt: status === 'COMPLETED' ? pilot.completedAt || transitionedAt || new Date() : pilot.completedAt,
        },
      });
      if (updatedCount.count !== 1) throw Errors.conflict('Pilot changed while the update was being saved');
      if (transitionedAt) {
        await tx.talentPilotStatusTransition.create({
          data: {
            pilotId: pilot.id,
            actorId: req.userId!,
            previousStatus: pilot.status,
            nextStatus: status,
            revision: nextRevision,
            createdAt: transitionedAt,
          },
        });
      }

      const current = await tx.talentPilot.findUnique({
        where: { id: pilot.id },
        include: pilotProvenanceInclude,
      });
      if (!current) throw Errors.notFound('Talent pilot', pilot.id);
      await syncPublicProof(tx, current);

      const value = {
        ...current,
        viewerRole: isParticipant ? 'participant' as const : 'institution' as const,
      };
      return { value, resourceType: 'pilot' as const, resourceId: current.id };
    });
    sendMutation(res, result);
  }),
};

function normalizeMilestones(value: unknown) {
  if (!Array.isArray(value)) throw Errors.invalidField('milestones', 'milestones must be an array');
  if (value.length > 12) throw Errors.invalidField('milestones', 'milestones must contain at most 12 entries');
  return value.map((item, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw Errors.invalidField('milestones', `milestones[${index}] must be an object`);
    }
    const row = item as Record<string, unknown>;
    return {
      title: boundedText(row.title, `milestones[${index}].title`, 160),
      completed: row.completed === true,
    };
  });
}

function normalizeStartingMilestones(value: unknown) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw Errors.invalidField('milestones', 'milestones must be an array');
  if (value.length > 12) throw Errors.invalidField('milestones', 'milestones must contain at most 12 entries');
  return value.map((item, index) => ({
    title: boundedText(item, `milestones[${index}]`, 160),
    completed: false,
  }));
}

function emptyPilotSummary() {
  return { total: 0, active: 0, completed: 0 };
}

function emptyReferralSummary() {
  return { total: 0, contacted: 0, accepted: 0, declined: 0 };
}

function optionalBoundedText(value: unknown, field: string, max: number) {
  if (value === null || value === '') return null;
  return boundedText(value, field, max);
}

async function syncPublicProof(tx: any, pilot: any) {
  const deliverableUrl = normalizePublicHttpUrl(pilot.deliverableUrl);
  const eligible = pilot.status === 'COMPLETED'
    && pilot.publicEvidenceConsent === true
    && deliverableUrl !== null
    && pilot.completedAt instanceof Date;
  if (!eligible) {
    await tx.talentPublicProof.deleteMany({ where: { pilotId: pilot.id } });
    return;
  }
  const evidenceSkills = Array.from(new Set(
    pilot.opportunity.requiredSkills
      .map((skill: string) => skill.trim().toLowerCase())
      .filter((skill: string) => skill.length > 0 && skill.length <= 64),
  )).slice(0, 12);
  await tx.talentPublicProof.upsert({
    where: { pilotId: pilot.id },
    create: {
      pilotId: pilot.id,
      participantId: pilot.participantId,
      deliverableUrl,
      evidenceSkills,
      completedAt: pilot.completedAt,
      schemaVersion: 1,
    },
    update: {
      participantId: pilot.participantId,
      deliverableUrl,
      evidenceSkills,
      completedAt: pilot.completedAt,
      schemaVersion: 1,
    },
  });
}
