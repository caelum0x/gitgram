/**
 * Pure helpers for the recruiter candidate-unlock revenue flow.
 *
 * These keep the gating/error logic out of the talent-network page component so
 * it can be unit tested without rendering. The backend
 * (talentBillingController) is the source of truth for authorization; these
 * helpers only decide what the owner-facing UI should show.
 */
import type { RequestUnlockResult, TalentPlacement } from '@/services/talentGraphService'

/**
 * UI state for a single candidate's unlock action:
 *  - `not-owner`  — the viewer does not own the opportunity; no unlock action.
 *  - `unlockable` — owner, no entitlement yet; the paid unlock can be started.
 *  - `pending`    — owner, a checkout is open but not yet settled.
 *  - `unlocked`   — owner, the entitlement is paid; contact can be revealed.
 */
export type UnlockState = 'not-owner' | 'unlockable' | 'pending' | 'unlocked'

/** Finds the recruiter's placement entitlement for a candidate, if any. */
export function findPlacement(
  placements: ReadonlyArray<TalentPlacement>,
  candidateId: string,
): TalentPlacement | null {
  return placements.find((placement) => placement.candidateId === candidateId) ?? null
}

/**
 * Derives the unlock UI state for a candidate. Only the opportunity owner may
 * unlock; a `paid` entitlement means unlocked, a `pending` one means a checkout
 * is in flight, and anything else (including no entitlement) is unlockable.
 */
export function deriveUnlockState(params: {
  isOwner: boolean
  placement?: Pick<TalentPlacement, 'status'> | null
}): UnlockState {
  if (!params.isOwner) return 'not-owner'
  switch (params.placement?.status) {
    case 'paid':
      return 'unlocked'
    case 'pending':
      return 'pending'
    default:
      return 'unlockable'
  }
}

/**
 * Interprets a `requestUnlock` response: either the entitlement is already paid
 * (reveal now) or a checkout URL must be opened to collect payment.
 */
export function interpretUnlockResult(result: RequestUnlockResult): {
  action: 'reveal' | 'checkout'
  checkoutUrl: string | null
} {
  if (result.alreadyUnlocked || !result.checkoutUrl) {
    return { action: 'reveal', checkoutUrl: null }
  }
  return { action: 'checkout', checkoutUrl: result.checkoutUrl }
}

/** Formats a fee in cents as a plain currency string (e.g. 4900 → "$49.00"). */
export function formatFee(feeCents: number, currency = 'usd'): string {
  const amount = (feeCents / 100).toFixed(2)
  const symbol = currency.toLowerCase() === 'usd' ? '$' : ''
  return symbol ? `${symbol}${amount}` : `${amount} ${currency.toUpperCase()}`
}
