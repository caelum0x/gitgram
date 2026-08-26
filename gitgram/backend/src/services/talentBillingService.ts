/**
 * Talent Graph placement / candidate-unlock revenue engine.
 *
 * This is the recruiter monetization the talent graph was designed for but never
 * wired: a recruiter (the opportunity owner) pays a placement/access fee to
 * unlock a matched candidate's contact details and full evidence. The fee is
 * charged through the shared Polar adapter (the same provider used for
 * subscriptions and the store) and settled by the Polar `order.created` webhook.
 *
 * Design notes:
 *  - Fee math is pure and configuration-driven (see the `*FeeCents` helpers).
 *  - Gating mirrors the referral gate: only the opportunity owner may unlock, and
 *    only a candidate with real matching evidence can be unlocked.
 *  - The charge is idempotent. The DB enforces one entitlement per
 *    (opportunity, candidate, recruiter); a repeated unlock never opens a second
 *    charge, and settlement is a no-op once the entitlement is already paid.
 *  - Every function accepts injectable dependencies so the flow can be unit
 *    tested without a live Postgres, Polar, or the matcher (same pattern as
 *    `findTalentMatches`).
 */
import prisma from '../utils/prisma';
import { findTalentMatches } from './talentGraphService';
import { createCreemCheckout } from './creemService';
import { Errors } from '../middleware/errorHandler';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Configuration + fee math (pure)
// ---------------------------------------------------------------------------

/** Flat access fee to unlock a single candidate's contact + evidence. */
export const DEFAULT_UNLOCK_FEE_CENTS = 4900; // $49.00
/** Success-fee rate applied to an agreed placement amount (Wellfound-style). */
export const DEFAULT_PLACEMENT_FEE_RATE = 0.1; // 10%
/** Floor for a computed placement success fee. */
export const DEFAULT_PLACEMENT_FEE_MIN_CENTS = 4900; // $49.00
/** Ceiling for a computed placement success fee. */
export const DEFAULT_PLACEMENT_FEE_MAX_CENTS = 2_000_000; // $20,000.00
/** Absolute guard rail — reject absurd inputs before they reach a charge. */
const MAX_REASONABLE_AMOUNT_CENTS = 1_000_000_000; // $10,000,000.00

export type FeeModel = 'unlock' | 'placement';

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    logger.warn(`[talentBilling] ${name} is not a positive integer — using default`, { raw, fallback });
    return fallback;
  }
  return value;
}

function readRateEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value >= 1) {
    logger.warn(`[talentBilling] ${name} must be a rate in (0, 1) — using default`, { raw, fallback });
    return fallback;
  }
  return value;
}

/** The flat candidate-unlock access fee, in cents. */
export function getUnlockFeeCents(): number {
  return readPositiveIntEnv('TALENT_UNLOCK_FEE_CENTS', DEFAULT_UNLOCK_FEE_CENTS);
}

export interface PlacementFeeOptions {
  rate?: number;
  minCents?: number;
  maxCents?: number;
}

/**
 * Computes a placement success fee from an agreed placement amount:
 *   fee = clamp(round(amount * rate), min, max)
 * Rounding is half-up to the nearest cent. Throws on non-positive / non-integer
 * amounts so a bad input can never silently produce a charge.
 */
export function computePlacementFeeCents(
  placementAmountCents: number,
  options: PlacementFeeOptions = {},
): number {
  if (!Number.isInteger(placementAmountCents) || placementAmountCents <= 0) {
    throw Errors.invalidField(
      'placementAmountCents',
      'placementAmountCents must be a positive integer number of cents',
    );
  }
  if (placementAmountCents > MAX_REASONABLE_AMOUNT_CENTS) {
    throw Errors.invalidField('placementAmountCents', 'placementAmountCents is unreasonably large');
  }

  const rate = options.rate ?? readRateEnv('TALENT_PLACEMENT_FEE_RATE', DEFAULT_PLACEMENT_FEE_RATE);
  const minCents = options.minCents ?? readPositiveIntEnv('TALENT_PLACEMENT_FEE_MIN_CENTS', DEFAULT_PLACEMENT_FEE_MIN_CENTS);
  const maxCents = options.maxCents ?? readPositiveIntEnv('TALENT_PLACEMENT_FEE_MAX_CENTS', DEFAULT_PLACEMENT_FEE_MAX_CENTS);
  // Guard against a misconfigured floor above the ceiling.
  const effectiveMin = Math.min(minCents, maxCents);

  const raw = Math.round(placementAmountCents * rate);
  return Math.min(maxCents, Math.max(effectiveMin, raw));
}

/**
 * Resolves the fee for an unlock request. When the recruiter supplies an agreed
 * placement amount the success-fee model applies; otherwise the flat access fee.
 */
export function resolvePlacementFee(input: { placementAmountCents?: number }): {
  feeCents: number;
  feeModel: FeeModel;
} {
  if (input.placementAmountCents !== undefined) {
    return { feeCents: computePlacementFeeCents(input.placementAmountCents), feeModel: 'placement' };
  }
  return { feeCents: getUnlockFeeCents(), feeModel: 'unlock' };
}

// ---------------------------------------------------------------------------
// Injectable dependency shapes
// ---------------------------------------------------------------------------

/** Minimal Prisma surface the billing flow touches. */
export type BillingDb = {
  talentOpportunity: { findUnique: (args: any) => Promise<any> };
  talentPlacement: {
    findUnique: (args: any) => Promise<any>;
    create: (args: any) => Promise<any>;
    update: (args: any) => Promise<any>;
  };
};

export interface UnlockDeps {
  db?: BillingDb;
  matcher?: typeof findTalentMatches;
  createCheckout?: typeof createCreemCheckout;
}

export interface RequestCandidateUnlockParams {
  recruiterId: string;
  opportunityId: string;
  candidateId: string;
  recruiterEmail: string;
  successUrl: string;
  placementAmountCents?: number;
}

export interface RequestCandidateUnlockResult {
  placement: any;
  checkoutUrl: string | null;
  alreadyUnlocked: boolean;
}

function placementWhere(opportunityId: string, candidateId: string, recruiterId: string) {
  return { opportunityId_candidateId_recruiterId: { opportunityId, candidateId, recruiterId } };
}

// ---------------------------------------------------------------------------
// Unlock request (the charged gate)
// ---------------------------------------------------------------------------

/**
 * Opens (or replays) a candidate-unlock charge for a recruiter. Gating:
 *   - the opportunity must exist and be owned by the recruiter;
 *   - a recruiter cannot unlock themselves;
 *   - the candidate must be a real match with evidence for the opportunity.
 *
 * Idempotency: a paid entitlement short-circuits with no new charge; a pending
 * entitlement is reused so at most one charge is ever open per candidate.
 */
export async function requestCandidateUnlock(
  params: RequestCandidateUnlockParams,
  deps: UnlockDeps = {},
): Promise<RequestCandidateUnlockResult> {
  const db = deps.db ?? (prisma as unknown as BillingDb);
  const matcher = deps.matcher ?? findTalentMatches;
  const createCheckout = deps.createCheckout ?? createCreemCheckout;

  const { recruiterId, opportunityId, candidateId } = params;
  if (candidateId === recruiterId) {
    throw Errors.badRequest('A recruiter cannot unlock their own profile');
  }

  const opportunity = await db.talentOpportunity.findUnique({ where: { id: opportunityId } });
  if (!opportunity) throw Errors.notFound('Talent opportunity', opportunityId);
  if (opportunity.createdById !== recruiterId) {
    throw Errors.forbidden('Only the opportunity owner can unlock candidates');
  }

  // Reuse an existing entitlement before charging again (DB-backed idempotency).
  const existing = await db.talentPlacement.findUnique({
    where: placementWhere(opportunityId, candidateId, recruiterId),
  });
  if (existing?.status === 'paid') {
    return { placement: existing, checkoutUrl: null, alreadyUnlocked: true };
  }

  // Gate: the candidate must have real, matching evidence for this opportunity.
  const matches = await matcher(opportunity.requiredSkills, 25, db as any);
  const candidateMatch = matches.find((match) => match.profile.id === candidateId);
  if (!candidateMatch || candidateMatch.projects.length === 0) {
    throw Errors.badRequest(
      'Candidate must have public repository or completed-pilot evidence matching this opportunity',
    );
  }

  const { feeCents, feeModel } = resolvePlacementFee(params);

  const placement = existing
    ? existing
    : await db.talentPlacement.create({
        data: { opportunityId, candidateId, recruiterId, feeCents, feeModel, status: 'pending' },
      });

  // Creem custom_price charges the exact fee our engine computed; the amount is
  // revalidated against feeCents in the signed webhook before we grant access.
  const checkout = await createCheckout({
    requestId: placement.id,
    amountCents: feeCents,
    successUrl: params.successUrl,
    metadata: {
      kind: 'talent_placement',
      placementId: placement.id,
      opportunityId,
      candidateId,
      recruiterId,
      feeModel,
      recruiterEmail: params.recruiterEmail,
    },
  });

  const withCheckout = await db.talentPlacement.update({
    where: { id: placement.id },
    data: { checkoutId: checkout.id },
  });

  logger.info('[talentBilling] Candidate unlock checkout opened', {
    placementId: placement.id,
    opportunityId,
    recruiterId,
    feeCents,
    feeModel,
    provider: 'creem',
  });

  return { placement: withCheckout, checkoutUrl: checkout.checkoutUrl, alreadyUnlocked: false };
}

// ---------------------------------------------------------------------------
// Settlement (Polar order webhook) + entitlement check
// ---------------------------------------------------------------------------

export interface SettlePlacementParams {
  placementId: string;
  providerOrderId: string;
  /** Amount the provider reports as paid; revalidated against the quoted fee. */
  amountCents?: number;
}

export interface SettlePlacementResult {
  settled: boolean;
  alreadyPaid: boolean;
  amountMismatch?: boolean;
}

/**
 * Settles a placement entitlement from a paid Creem order. Idempotent: replaying
 * the same order (or any order for an already-paid placement) is a no-op. When
 * the provider reports an amount it must equal the quoted fee, so a tampered or
 * under-paid checkout can never unlock a candidate.
 */
export async function settlePlacementOrder(
  params: SettlePlacementParams,
  deps: { db?: BillingDb } = {},
): Promise<SettlePlacementResult> {
  const db = deps.db ?? (prisma as unknown as BillingDb);
  const placement = await db.talentPlacement.findUnique({ where: { id: params.placementId } });

  if (!placement) {
    logger.warn('[talentBilling] settle: placement not found', { placementId: params.placementId });
    return { settled: false, alreadyPaid: false };
  }
  if (placement.status === 'paid') {
    logger.info('[talentBilling] settle: placement already paid — no-op', { placementId: placement.id });
    return { settled: false, alreadyPaid: true };
  }
  if (params.amountCents !== undefined && params.amountCents !== placement.feeCents) {
    logger.error('[talentBilling] settle: paid amount does not match quoted fee — refusing', {
      placementId: placement.id,
      quotedFeeCents: placement.feeCents,
      paidAmountCents: params.amountCents,
    });
    return { settled: false, alreadyPaid: false, amountMismatch: true };
  }

  await db.talentPlacement.update({
    where: { id: placement.id },
    data: { status: 'paid', paidAt: new Date(), providerOrderId: params.providerOrderId },
  });

  logger.info('[talentBilling] Placement settled — candidate unlocked', {
    placementId: placement.id,
    providerOrderId: params.providerOrderId,
    feeCents: placement.feeCents,
  });

  return { settled: true, alreadyPaid: false };
}

/** True only when the recruiter holds a paid unlock entitlement for the candidate. */
export async function isCandidateUnlocked(
  opportunityId: string,
  candidateId: string,
  recruiterId: string,
  db: BillingDb = prisma as unknown as BillingDb,
): Promise<boolean> {
  const placement = await db.talentPlacement.findUnique({
    where: placementWhere(opportunityId, candidateId, recruiterId),
  });
  return placement?.status === 'paid';
}
