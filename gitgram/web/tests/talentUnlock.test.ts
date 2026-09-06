/// <reference types="vitest/globals" />
import { describe, it, expect } from 'vitest'
import {
  deriveUnlockState,
  findPlacement,
  formatFee,
  interpretUnlockResult,
} from '@/utils/talentUnlock'
import type { RequestUnlockResult, TalentPlacement } from '@/services/talentGraphService'

function placement(overrides: Partial<TalentPlacement> = {}): TalentPlacement {
  return {
    id: 'plc-1',
    opportunityId: 'opp-1',
    candidateId: 'cand-1',
    recruiterId: 'rec-1',
    feeCents: 4900,
    currency: 'usd',
    feeModel: 'unlock',
    status: 'pending',
    provider: 'creem',
    checkoutId: 'chk-1',
    providerOrderId: null,
    paidAt: null,
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
    ...overrides,
  }
}

describe('deriveUnlockState', () => {
  it('returns not-owner when the viewer does not own the opportunity', () => {
    expect(deriveUnlockState({ isOwner: false, placement: null })).toBe('not-owner')
    // Ownership gates even when a paid entitlement somehow exists.
    expect(deriveUnlockState({ isOwner: false, placement: placement({ status: 'paid' }) })).toBe('not-owner')
  })

  it('returns unlockable for an owner with no entitlement yet', () => {
    expect(deriveUnlockState({ isOwner: true, placement: null })).toBe('unlockable')
    expect(deriveUnlockState({ isOwner: true })).toBe('unlockable')
  })

  it('returns pending for an owner with an open (unpaid) checkout', () => {
    expect(deriveUnlockState({ isOwner: true, placement: placement({ status: 'pending' }) })).toBe('pending')
  })

  it('returns unlocked for an owner with a paid entitlement', () => {
    expect(deriveUnlockState({ isOwner: true, placement: placement({ status: 'paid' }) })).toBe('unlocked')
  })

  it('treats failed/refunded entitlements as unlockable (a fresh charge can be opened)', () => {
    expect(deriveUnlockState({ isOwner: true, placement: placement({ status: 'failed' }) })).toBe('unlockable')
    expect(deriveUnlockState({ isOwner: true, placement: placement({ status: 'refunded' }) })).toBe('unlockable')
  })
})

describe('findPlacement', () => {
  it('finds the entitlement matching the candidate id', () => {
    const list = [placement({ id: 'a', candidateId: 'cand-1' }), placement({ id: 'b', candidateId: 'cand-2' })]
    expect(findPlacement(list, 'cand-2')?.id).toBe('b')
  })

  it('returns null when no entitlement matches', () => {
    expect(findPlacement([placement({ candidateId: 'cand-1' })], 'cand-9')).toBeNull()
    expect(findPlacement([], 'cand-1')).toBeNull()
  })
})

describe('interpretUnlockResult', () => {
  it('reveals immediately when already unlocked', () => {
    const result: RequestUnlockResult = { placement: placement({ status: 'paid' }), checkoutUrl: null, alreadyUnlocked: true }
    expect(interpretUnlockResult(result)).toEqual({ action: 'reveal', checkoutUrl: null })
  })

  it('opens a checkout when an unpaid entitlement returns a checkout URL', () => {
    const result: RequestUnlockResult = {
      placement: placement({ status: 'pending' }),
      checkoutUrl: 'https://test-api.creem.io/checkout/abc',
      alreadyUnlocked: false,
    }
    expect(interpretUnlockResult(result)).toEqual({ action: 'checkout', checkoutUrl: 'https://test-api.creem.io/checkout/abc' })
  })

  it('falls back to reveal when no checkout URL is present', () => {
    const result: RequestUnlockResult = { placement: placement(), checkoutUrl: null, alreadyUnlocked: false }
    expect(interpretUnlockResult(result)).toEqual({ action: 'reveal', checkoutUrl: null })
  })
})

describe('formatFee', () => {
  it('formats usd cents as a dollar amount', () => {
    expect(formatFee(4900)).toBe('$49.00')
    expect(formatFee(199900, 'usd')).toBe('$1999.00')
  })

  it('formats non-usd currencies with an ISO suffix', () => {
    expect(formatFee(4900, 'eur')).toBe('49.00 EUR')
  })
})
