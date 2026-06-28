'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  postService,
  type FeedSignal,
  type FeedSignalEvent,
} from '@/services/postService'

const FLUSH_INTERVAL_MS = 10_000
const HISTORY_STORAGE_KEY = 'gitgram:feed-feedback:hidden'
const MAX_HISTORY = 200

/**
 * Loads the locally-persisted set of "not interested" post ids.
 *
 * Persisting client-side means the negative signal is honoured immediately on
 * the next render (and across reloads) even before/without the backend ranker
 * acting on it — mirroring Bluesky's userActionHistory recency tracking, scoped
 * here to the hide-from-feed use case.
 */
function loadHidden(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((v): v is string => typeof v === 'string'))
    }
  } catch {
    // Corrupt storage — start fresh.
  }
  return new Set()
}

function persistHidden(ids: Set<string>): void {
  if (typeof window === 'undefined') return
  try {
    // Keep only the most recent N to bound storage growth.
    const trimmed = Array.from(ids).slice(-MAX_HISTORY)
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // Storage full / unavailable — non-fatal.
  }
}

export interface UseFeedFeedback {
  /** Set of post ids the viewer marked "not interested" — hide these. */
  hiddenIds: Set<string>
  /** True if the given post has been hidden via "not interested". */
  isHidden: (postId: string) => boolean
  /** Mark a post seen (deduped per session; queued + batched). */
  markSeen: (postId: string, feedContext?: string) => void
  /** "Show more like this" — positive ranking signal. */
  requestMore: (postId: string, feedContext?: string) => void
  /** "Not interested / show less" — hides locally and sends a negative signal. */
  requestLess: (postId: string, feedContext?: string) => void
}

/**
 * Feed-feedback controller, ported from Bluesky's `feed-feedback.tsx` and
 * `userActionHistory.ts` onto the gitgram-web stack.
 *
 * - De-duplicates and batches signals, flushing on an interval, on unmount, and
 *   when the tab is hidden.
 * - Persists "not interested" posts locally so they vanish from the feed
 *   immediately and stay hidden across reloads.
 * - All network writes are best-effort: failures never surface to the user.
 *
 * @param enabled Disable on non-personalised feeds (e.g. a profile grid).
 */
export function useFeedFeedback(enabled = true): UseFeedFeedback {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => loadHidden())

  const queue = useRef<Map<string, FeedSignalEvent>>(new Map())
  const seenHistory = useRef<Set<string>>(new Set())

  const flush = useCallback(() => {
    if (queue.current.size === 0) return
    const events = Array.from(queue.current.values())
    queue.current.clear()
    // Best-effort: drop on failure, do not retry or surface.
    void postService.sendFeedSignal(events).catch(() => {})
  }, [])

  const enqueue = useCallback(
    (postId: string, signal: FeedSignal, feedContext?: string) => {
      if (!enabled || !postId) return
      // Key dedupes repeated identical signals for the same post.
      queue.current.set(`${postId}:${signal}`, { postId, signal, feedContext })
    },
    [enabled],
  )

  const markSeen = useCallback(
    (postId: string, feedContext?: string) => {
      if (!enabled || !postId || seenHistory.current.has(postId)) return
      seenHistory.current.add(postId)
      enqueue(postId, 'seen', feedContext)
    },
    [enabled, enqueue],
  )

  const requestMore = useCallback(
    (postId: string, feedContext?: string) => {
      enqueue(postId, 'requestMore', feedContext)
      flush()
    },
    [enqueue, flush],
  )

  const requestLess = useCallback(
    (postId: string, feedContext?: string) => {
      if (!postId) return
      setHiddenIds((prev) => {
        if (prev.has(postId)) return prev
        const next = new Set(prev)
        next.add(postId)
        persistHidden(next)
        return next
      })
      enqueue(postId, 'requestLess', feedContext)
      flush()
    },
    [enqueue, flush],
  )

  const isHidden = useCallback((postId: string) => hiddenIds.has(postId), [hiddenIds])

  // Periodic flush + flush on tab-hide and unmount so queued "seen" signals
  // are not lost.
  useEffect(() => {
    if (!enabled) return
    const interval = setInterval(flush, FLUSH_INTERVAL_MS)

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
      flush()
    }
  }, [enabled, flush])

  return { hiddenIds, isHidden, markSeen, requestMore, requestLess }
}
