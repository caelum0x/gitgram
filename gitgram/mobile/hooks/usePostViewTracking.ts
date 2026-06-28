import { useCallback, useRef } from 'react';
import type { ViewToken } from 'react-native';

import { analyticsService } from '../services/analyticsService';
import { logger } from '../utils/logger';

/**
 * Per-feed-item impression tracking, ported from Bluesky's usePostViewTracking.
 *
 * Wire `onViewableItemsChanged` and `viewabilityConfig` into a FlatList. The
 * hook dedupes by post id so each post is only reported once per mount, then
 * flushes batches to the axios analyticsService. Designed for a feed whose
 * items are tagged objects (post / ad / repo); only entries whose id can be
 * resolved by `getPostId` are tracked.
 */

interface UsePostViewTrackingOptions<T> {
  /**
   * Resolves a stable post id from a viewable feed item, or `null` if the item
   * is not a trackable post (e.g. an ad or trending-repo row).
   */
  getPostId: (item: T) => string | null;
  /** Where the views happened, e.g. "home-feed". Sent to analytics. */
  logContext: string;
}

interface PostViewTracking {
  onViewableItemsChanged: (info: { viewableItems: ViewToken[] }) => void;
  /** Resets the dedupe set, e.g. after a pull-to-refresh swaps the feed. */
  reset: () => void;
}

export function usePostViewTracking<T>({
  getPostId,
  logContext,
}: UsePostViewTrackingOptions<T>): PostViewTracking {
  const seenIdsRef = useRef<Set<string>>(new Set());

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const seen = seenIdsRef.current;
      const fresh: string[] = [];

      for (const token of viewableItems) {
        if (!token.isViewable || token.item == null) {
          continue;
        }
        const id = getPostId(token.item as T);
        if (id && !seen.has(id)) {
          seen.add(id);
          fresh.push(id);
        }
      }

      if (fresh.length === 0) {
        return;
      }

      // Fire-and-forget: impression tracking must not block rendering, and the
      // service already swallows network errors. Guard the promise anyway so a
      // synchronous throw can never bubble into the FlatList callback.
      try {
        void analyticsService.trackPostViews(fresh, logContext);
      } catch (error) {
        logger.error('Post view tracking error:', error);
      }
    },
    [getPostId, logContext],
  );

  const reset = useCallback(() => {
    seenIdsRef.current = new Set();
  }, []);

  return { onViewableItemsChanged, reset };
}
