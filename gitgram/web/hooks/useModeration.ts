'use client'

import { useEffect, useState } from 'react'
import {
  loadModeration,
  subscribeModeration,
  type ModerationState,
} from '@/utils/moderation'

/**
 * Reactive accessor for the client-side moderation state. Re-renders whenever
 * muted words / accounts / threads change (including from other components via
 * the shared pub/sub).
 */
export function useModeration(): ModerationState {
  const [state, setState] = useState<ModerationState>(() => loadModeration())

  useEffect(() => {
    // Re-sync on mount in case localStorage changed before subscription.
    setState(loadModeration())
    return subscribeModeration(setState)
  }, [])

  return state
}
