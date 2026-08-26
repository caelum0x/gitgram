/**
 * Unit tests for the talent-graph placement / candidate-unlock revenue engine
 * (talentBillingService). Covers the three load-bearing concerns of a charge:
 *   1. Fee math — flat unlock fee + percentage placement success fee (rounding,
 *      floor/ceiling clamps, invalid inputs).
 *   2. Gating — only the opportunity owner can unlock, no self-unlock, and the
 *      candidate must have real matching evidence.
 *   3. Idempotency — a paid entitlement never re-charges, a pending entitlement
 *      is reused, and settlement is a no-op once paid.
 *
 * Everything runs in-memory against injected fakes (db / matcher / checkout), so
 * no live Postgres or Polar is required — the same pattern as the matcher tests.
 */
import {
  getUnlockFeeCents,
  computePlacementFeeCents,
  resolvePlacementFee,
  requestCandidateUnlock,
  settlePlacementOrder,
  isCandidateUnlocked,
  DEFAULT_UNLOCK_FEE_CENTS,
  type BillingDb,
} from '../../src/services/talentBillingService';

// ---------------------------------------------------------------------------
// In-memory fakes
// ---------------------------------------------------------------------------

type PlacementRow = {
  id: string;
  opportunityId: string;
  candidateId: string;
  recruiterId: string;
  feeCents: number;
  feeModel: string;
  status: string;
  checkoutId?: string | null;
  polarOrderId?: string | null;
  paidAt?: Date | null;
};

function makeFakeDb(opportunity: any, seedPlacements: PlacementRow[] = []) {
  const placements = [...seedPlacements];
  let counter = 0;
  const db: BillingDb = {
    talentOpportunity: {
      findUnique: async ({ where }: any) =>
        opportunity && opportunity.id === where.id ? { ...opportunity } : null,
    },
    talentPlacement: {
      findUnique: async ({ where }: any) => {
        if (where.id) return placements.find((p) => p.id === where.id) ?? null;
        const key = where.opportunityId_candidateId_recruiterId;
        if (key) {
          return (
            placements.find(
              (p) =>
                p.opportunityId === key.opportunityId &&
                p.candidateId === key.candidateId &&
                p.recruiterId === key.recruiterId,
            ) ?? null
          );
        }
        return null;
      },
      create: async ({ data }: any) => {
        const row: PlacementRow = { id: `placement-${++counter}`, ...data };
        placements.push(row);
        return { ...row };
      },
      update: async ({ where, data }: any) => {
        const row = placements.find((p) => p.id === where.id);
        if (!row) throw new Error('placement not found');
        Object.assign(row, data);
        return { ...row };
      },
    },
  };
  return { db, placements };
}

const OPPORTUNITY = {
  id: 'opp-1',
  createdById: 'recruiter-1',
  requiredSkills: ['typescript'],
};

function matcherWithEvidence(candidateId: string) {
  return (async () => [
    { profile: { id: candidateId }, projects: [{ id: 'r1' }] },
  ]) as any;
}

const matcherNoEvidence = (async () => []) as any;

function fakeCheckout() {
  const calls: any[] = [];
  const fn = (async (input: any) => {
    calls.push(input);
    return {
      id: `checkout-${calls.length}`,
      checkoutUrl: `https://checkout.creem.io/session-${calls.length}`,
      status: 'pending' as const,
    };
  }) as any;
  return { fn, calls };
}

const baseParams = {
  recruiterId: 'recruiter-1',
  opportunityId: 'opp-1',
  candidateId: 'candidate-1',
  recruiterEmail: 'recruiter@example.com',
  successUrl: 'https://app.example.com/return',
};

// ---------------------------------------------------------------------------
// Fee math
// ---------------------------------------------------------------------------

describe('fee math', () => {
  const ENV_KEYS = [
    'TALENT_UNLOCK_FEE_CENTS',
    'TALENT_PLACEMENT_FEE_RATE',
    'TALENT_PLACEMENT_FEE_MIN_CENTS',
    'TALENT_PLACEMENT_FEE_MAX_CENTS',
  ];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });
  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('returns the default flat unlock fee', () => {
    expect(getUnlockFeeCents()).toBe(DEFAULT_UNLOCK_FEE_CENTS);
    expect(getUnlockFeeCents()).toBe(4900);
  });

  it('honours a valid TALENT_UNLOCK_FEE_CENTS override', () => {
    process.env.TALENT_UNLOCK_FEE_CENTS = '9900';
    expect(getUnlockFeeCents()).toBe(9900);
  });

  it('falls back to the default when the env override is invalid', () => {
    process.env.TALENT_UNLOCK_FEE_CENTS = 'not-a-number';
    expect(getUnlockFeeCents()).toBe(DEFAULT_UNLOCK_FEE_CENTS);
    process.env.TALENT_UNLOCK_FEE_CENTS = '-5';
    expect(getUnlockFeeCents()).toBe(DEFAULT_UNLOCK_FEE_CENTS);
  });

  it('computes a percentage placement fee (10% of $10,000 = $1,000)', () => {
    // 10% default rate, amount 1,000,000 cents ($10k) -> 100,000 cents ($1k)
    expect(computePlacementFeeCents(1_000_000)).toBe(100_000);
  });

  it('rounds the computed fee half-up to the nearest cent', () => {
    // 3333 * 0.10 = 333.3 -> 333 ; 3335 * 0.10 = 333.5 -> 334
    expect(computePlacementFeeCents(3333, { rate: 0.1, minCents: 1, maxCents: 10_000_000 })).toBe(333);
    expect(computePlacementFeeCents(3335, { rate: 0.1, minCents: 1, maxCents: 10_000_000 })).toBe(334);
  });

  it('applies the floor when the raw fee is below the minimum', () => {
    // 1,000 * 0.10 = 100, floored to 4,900
    expect(computePlacementFeeCents(1_000)).toBe(4_900);
  });

  it('applies the ceiling when the raw fee is above the maximum', () => {
    // 100,000,000 * 0.10 = 10,000,000, capped to 2,000,000
    expect(computePlacementFeeCents(100_000_000)).toBe(2_000_000);
  });

  it('rejects non-positive or non-integer placement amounts', () => {
    expect(() => computePlacementFeeCents(0)).toThrow();
    expect(() => computePlacementFeeCents(-100)).toThrow();
    expect(() => computePlacementFeeCents(12.5)).toThrow();
  });

  it('resolvePlacementFee selects the unlock model without an amount', () => {
    expect(resolvePlacementFee({})).toEqual({ feeCents: DEFAULT_UNLOCK_FEE_CENTS, feeModel: 'unlock' });
  });

  it('resolvePlacementFee selects the placement model with an amount', () => {
    expect(resolvePlacementFee({ placementAmountCents: 1_000_000 })).toEqual({
      feeCents: 100_000,
      feeModel: 'placement',
    });
  });
});

// ---------------------------------------------------------------------------
// Gating
// ---------------------------------------------------------------------------

describe('requestCandidateUnlock gating', () => {
  it('rejects a recruiter unlocking their own profile', async () => {
    const { db } = makeFakeDb(OPPORTUNITY);
    const checkout = fakeCheckout();
    await expect(
      requestCandidateUnlock(
        { ...baseParams, candidateId: 'recruiter-1' },
        { db, matcher: matcherWithEvidence('recruiter-1'), createCheckout: checkout.fn },
      ),
    ).rejects.toThrow(/cannot unlock their own/i);
    expect(checkout.calls).toHaveLength(0);
  });

  it('rejects when the opportunity does not exist', async () => {
    const { db } = makeFakeDb(null);
    const checkout = fakeCheckout();
    await expect(
      requestCandidateUnlock(baseParams, {
        db,
        matcher: matcherWithEvidence('candidate-1'),
        createCheckout: checkout.fn,
      }),
    ).rejects.toThrow(/not found/i);
    expect(checkout.calls).toHaveLength(0);
  });

  it('rejects a recruiter who does not own the opportunity', async () => {
    const { db } = makeFakeDb({ ...OPPORTUNITY, createdById: 'someone-else' });
    const checkout = fakeCheckout();
    await expect(
      requestCandidateUnlock(baseParams, {
        db,
        matcher: matcherWithEvidence('candidate-1'),
        createCheckout: checkout.fn,
      }),
    ).rejects.toThrow(/only the opportunity owner/i);
    expect(checkout.calls).toHaveLength(0);
  });

  it('rejects a candidate without matching evidence', async () => {
    const { db, placements } = makeFakeDb(OPPORTUNITY);
    const checkout = fakeCheckout();
    await expect(
      requestCandidateUnlock(baseParams, { db, matcher: matcherNoEvidence, createCheckout: checkout.fn }),
    ).rejects.toThrow(/evidence/i);
    expect(checkout.calls).toHaveLength(0);
    expect(placements).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Happy path + idempotency of the charge
// ---------------------------------------------------------------------------

describe('requestCandidateUnlock charge + idempotency', () => {
  it('opens a checkout for a valid unlock and records a pending entitlement', async () => {
    const { db, placements } = makeFakeDb(OPPORTUNITY);
    const checkout = fakeCheckout();

    const result = await requestCandidateUnlock(baseParams, {
      db,
      matcher: matcherWithEvidence('candidate-1'),
      createCheckout: checkout.fn,
    });

    expect(result.alreadyUnlocked).toBe(false);
    expect(result.checkoutUrl).toBe('https://checkout.creem.io/session-1');
    expect(checkout.calls).toHaveLength(1);
    expect(placements).toHaveLength(1);
    expect(placements[0].status).toBe('pending');
    expect(placements[0].feeCents).toBe(DEFAULT_UNLOCK_FEE_CENTS);
    expect(placements[0].feeModel).toBe('unlock');
    expect(placements[0].checkoutId).toBe('checkout-1');
    // Creem custom_price is charged the exact computed fee.
    expect(checkout.calls[0].amountCents).toBe(DEFAULT_UNLOCK_FEE_CENTS);
    expect(checkout.calls[0].requestId).toBe(placements[0].id);
    // metadata carries the placement id for webhook settlement
    expect(checkout.calls[0].metadata.placementId).toBe(placements[0].id);
    expect(checkout.calls[0].metadata.kind).toBe('talent_placement');
  });

  it('uses the placement success-fee model when an amount is supplied', async () => {
    const { db, placements } = makeFakeDb(OPPORTUNITY);
    const checkout = fakeCheckout();

    await requestCandidateUnlock(
      { ...baseParams, placementAmountCents: 1_000_000 },
      { db, matcher: matcherWithEvidence('candidate-1'), createCheckout: checkout.fn },
    );

    expect(placements[0].feeModel).toBe('placement');
    expect(placements[0].feeCents).toBe(100_000);
  });

  it('does not re-charge when the candidate is already unlocked (paid)', async () => {
    const paid: PlacementRow = {
      id: 'placement-existing',
      opportunityId: 'opp-1',
      candidateId: 'candidate-1',
      recruiterId: 'recruiter-1',
      feeCents: 4900,
      feeModel: 'unlock',
      status: 'paid',
      paidAt: new Date(),
    };
    const { db, placements } = makeFakeDb(OPPORTUNITY, [paid]);
    const checkout = fakeCheckout();

    const result = await requestCandidateUnlock(baseParams, {
      db,
      matcher: matcherWithEvidence('candidate-1'),
      createCheckout: checkout.fn,
    });

    expect(result.alreadyUnlocked).toBe(true);
    expect(result.checkoutUrl).toBeNull();
    expect(checkout.calls).toHaveLength(0);
    expect(placements).toHaveLength(1);
  });

  it('reuses a pending entitlement instead of creating a second one', async () => {
    const pending: PlacementRow = {
      id: 'placement-pending',
      opportunityId: 'opp-1',
      candidateId: 'candidate-1',
      recruiterId: 'recruiter-1',
      feeCents: 4900,
      feeModel: 'unlock',
      status: 'pending',
    };
    const { db, placements } = makeFakeDb(OPPORTUNITY, [pending]);
    const checkout = fakeCheckout();

    const result = await requestCandidateUnlock(baseParams, {
      db,
      matcher: matcherWithEvidence('candidate-1'),
      createCheckout: checkout.fn,
    });

    expect(result.alreadyUnlocked).toBe(false);
    expect(placements).toHaveLength(1); // reused, not duplicated
    expect(result.placement.id).toBe('placement-pending');
    expect(checkout.calls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Settlement + entitlement
// ---------------------------------------------------------------------------

describe('settlePlacementOrder + isCandidateUnlocked', () => {
  function seedPending(): { db: BillingDb; placements: PlacementRow[] } {
    return makeFakeDb(OPPORTUNITY, [
      {
        id: 'placement-1',
        opportunityId: 'opp-1',
        candidateId: 'candidate-1',
        recruiterId: 'recruiter-1',
        feeCents: 4900,
        feeModel: 'unlock',
        status: 'pending',
      },
    ]);
  }

  it('marks a pending placement paid and stamps the receipt', async () => {
    const { db, placements } = seedPending();
    const result = await settlePlacementOrder(
      { placementId: 'placement-1', providerOrderId: 'order-abc', amountCents: 4900 },
      { db },
    );
    expect(result).toEqual({ settled: true, alreadyPaid: false });
    expect(placements[0].status).toBe('paid');
    expect(placements[0].providerOrderId).toBe('order-abc');
    expect(placements[0].paidAt).toBeInstanceOf(Date);
  });

  it('is idempotent — replaying the order for a paid placement is a no-op', async () => {
    const { db, placements } = seedPending();
    await settlePlacementOrder({ placementId: 'placement-1', providerOrderId: 'order-abc' }, { db });
    const firstPaidAt = placements[0].paidAt;

    const replay = await settlePlacementOrder(
      { placementId: 'placement-1', providerOrderId: 'order-duplicate' },
      { db },
    );
    expect(replay).toEqual({ settled: false, alreadyPaid: true });
    expect(placements[0].providerOrderId).toBe('order-abc'); // unchanged
    expect(placements[0].paidAt).toBe(firstPaidAt);
  });

  it('refuses to settle when the paid amount does not match the quoted fee', async () => {
    const { db, placements } = seedPending();
    const result = await settlePlacementOrder(
      { placementId: 'placement-1', providerOrderId: 'order-abc', amountCents: 100 },
      { db },
    );
    expect(result).toEqual({ settled: false, alreadyPaid: false, amountMismatch: true });
    expect(placements[0].status).toBe('pending');
    expect(placements[0].providerOrderId).toBeUndefined();
  });

  it('reports a missing placement without throwing', async () => {
    const { db } = seedPending();
    const result = await settlePlacementOrder({ placementId: 'nope', providerOrderId: 'order-x' }, { db });
    expect(result).toEqual({ settled: false, alreadyPaid: false });
  });

  it('isCandidateUnlocked is true only after settlement', async () => {
    const { db } = seedPending();
    expect(await isCandidateUnlocked('opp-1', 'candidate-1', 'recruiter-1', db)).toBe(false);
    await settlePlacementOrder({ placementId: 'placement-1', providerOrderId: 'order-abc' }, { db });
    expect(await isCandidateUnlocked('opp-1', 'candidate-1', 'recruiter-1', db)).toBe(true);
    expect(await isCandidateUnlocked('opp-1', 'other', 'recruiter-1', db)).toBe(false);
  });
});
