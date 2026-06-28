'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import RepoCard from './RepoCard';
import RichContent from './RichContent';
import AitmChangeStoryCard from './AitmChangeStoryCard';
import BookmarkButton from './BookmarkButton';
import LoadLatestButton from './LoadLatestButton';
import { parseAitmChangeStoryBlock } from '@/utils/aitmChangeStory';
import ContentHider from './moderation/ContentHider';
import { useModeration } from '@/hooks/useModeration';
import { isPostMuted, parseSelfLabel } from '@/utils/moderation';
import { realtimeService } from '@/services/realtimeService';
import api from '@/services/api';

interface Post {
  id: string;
  content: string;
  createdAt: string;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  likedByMe?: boolean;
  account: {
    username: string;
    type: 'USER' | 'REPOSITORY' | 'ORGANIZATION';
    avatar?: string;
    displayName?: string;
  };
}

interface Repo {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  description?: string;
  stars: number;
  forks: number;
  language?: string;
}

interface FeedPage {
  posts: Post[];
  nextCursor: string | null;
  isDiscover?: boolean;
}

async function fetchFeedPage(cursor?: string): Promise<FeedPage> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const res = await api.get('/v1/posts/feed', { params });
  const data = res.data as FeedPage;

  // Following feed empty → fall back to discover (Bluesky HomeFeedAPI pattern)
  if (!data.posts?.length && !cursor) {
    const discoverRes = await api.get('/v1/posts/explore', { params: { limit: '20' } });
    const discoverData = discoverRes.data as FeedPage;
    return { posts: discoverData.posts || [], nextCursor: discoverData.nextCursor ?? null, isDiscover: true };
  }

  return { posts: data.posts || [], nextCursor: data.nextCursor ?? null };
}

/**
 * Lightweight poll for the very latest post ids at the top of the feed. Used to
 * detect content published after the feed rendered without disturbing the
 * existing infinite-query cache. Returns ids newest-first.
 */
async function fetchLatestPostIds(): Promise<string[]> {
  const res = await api.get('/v1/posts/feed', { params: { limit: '20' } });
  const data = res.data as FeedPage;
  return (data.posts ?? []).map((p) => p.id);
}

const NEW_POSTS_POLL_INTERVAL_MS = 60_000;

const ACCOUNT_BADGES = {
  USER: { color: 'bg-blue-500', icon: '👤' },
  REPOSITORY: { color: 'bg-purple-500', icon: '📦' },
  ORGANIZATION: { color: 'bg-green-500', icon: '🏢' },
} as const;

export default function Feed() {
  const queryClient = useQueryClient();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const moderation = useModeration();

  // ── Infinite feed query ────────────────────────────────────────────────────
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    status,
  } = useInfiniteQuery({
    queryKey: ['feed'],
    queryFn: ({ pageParam }) => fetchFeedPage(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const allPosts = data?.pages.flatMap((p) => p.posts) ?? [];
  const isDiscover = data?.pages[0]?.isDiscover;

  // Apply client-side moderation (muted words / accounts / threads).
  const posts = allPosts.filter(
    (post) =>
      !isPostMuted(
        { id: post.id, content: post.content ?? '', username: post.account.username },
        moderation,
      ),
  );
  const mutedCount = allPosts.length - posts.length;

  // ── "New posts" pill: surface content published after the feed rendered ────
  const [newPostCount, setNewPostCount] = useState(0);
  const loadedIds = useRef<Set<string>>(new Set());
  loadedIds.current = new Set(allPosts.map((p) => p.id));

  const checkForNewPosts = useCallback(async () => {
    // Don't bother on the discover fallback — it isn't a chronological feed.
    if (isDiscover) return;
    try {
      const latestIds = await fetchLatestPostIds();
      const known = loadedIds.current;
      const fresh = latestIds.filter((id) => !known.has(id)).length;
      if (fresh > 0) setNewPostCount(fresh);
    } catch {
      // Polling failures are non-fatal — keep the existing feed intact.
    }
  }, [isDiscover]);

  // Poll on an interval while the tab is visible.
  useEffect(() => {
    if (status !== 'success') return;
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void checkForNewPosts();
    };
    const interval = setInterval(tick, NEW_POSTS_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [status, checkForNewPosts]);

  // React immediately to realtime like activity as a cheap "something changed"
  // signal, then confirm with a targeted poll.
  useEffect(() => {
    const unsubscribe = realtimeService.onNotification((n) => {
      if (n.type === 'post' || n.type === 'mention' || n.type === 'new_post') {
        void checkForNewPosts();
      }
    });
    return unsubscribe;
  }, [checkForNewPosts]);

  const handleLoadLatest = useCallback(async () => {
    setNewPostCount(0);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    // Refetch the first page so freshly-published posts are prepended.
    await queryClient.invalidateQueries({ queryKey: ['feed'] });
  }, [queryClient]);

  // ── Intersection Observer for infinite scroll ──────────────────────────────
  const onIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetching) {
        fetchNextPage();
      }
    },
    [fetchNextPage, hasNextPage, isFetching]
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(onIntersect, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onIntersect]);

  // ── Trending repos (one-shot, no pagination needed) ────────────────────────
  const { data: trendingData } = useInfiniteQuery({
    queryKey: ['trending-repos'],
    queryFn: async () => {
      const res = await api.get('/v1/repositories/trending');
      const repos: Repo[] = ((res.data as { repositories?: Repo[] }).repositories || []).slice(0, 3);
      return repos;
    },
    initialPageParam: undefined,
    getNextPageParam: () => undefined,
  });
  const trendingRepos = trendingData?.pages[0] ?? [];

  // ── Optimistic like mutation ───────────────────────────────────────────────
  const likeMutation = useMutation({
    mutationFn: async ({ id, liked }: { id: string; liked: boolean }) => {
      if (liked) {
        await api.delete(`/v1/posts/${id}/like`);
      } else {
        await api.post(`/v1/posts/${id}/like`);
      }
    },
    onMutate: async ({ id, liked }) => {
      await queryClient.cancelQueries({ queryKey: ['feed'] });
      const prev = queryClient.getQueryData(['feed']);

      queryClient.setQueryData(['feed'], (old: typeof data) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            posts: page.posts.map((p) =>
              p.id === id
                ? {
                    ...p,
                    likedByMe: !liked,
                    likesCount: liked ? p.likesCount - 1 : p.likesCount + 1,
                  }
                : p
            ),
          })),
        };
      });

      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['feed'], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  if (status === 'pending') {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-lg p-6 animate-pulse">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-4" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg">
        <p className="text-red-500">Failed to load feed. Please try again.</p>
      </div>
    );
  }

  if (!posts.length) {
    // Distinguish a genuinely empty feed from one fully hidden by moderation.
    if (mutedCount > 0) {
      return (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            All {mutedCount} post{mutedCount === 1 ? '' : 's'} here are hidden by your muted words or accounts.
          </p>
          <Link href="/settings/moderation" className="text-sm text-blue-600 hover:underline">
            Manage moderation filters
          </Link>
        </div>
      );
    }
    return (
      <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg">
        <p className="text-gray-600 dark:text-gray-400 mb-4">No posts yet</p>
        <p className="text-sm text-gray-500">
          Follow some accounts or{' '}
          <Link href="/claim" className="text-blue-600 hover:underline">
            claim a repository
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <LoadLatestButton count={newPostCount} onPress={handleLoadLatest} />

      {isDiscover && (
        <p className="text-xs text-center text-gray-400 dark:text-gray-500">
          Showing popular posts — follow more people to personalize your feed
        </p>
      )}

      {mutedCount > 0 && (
        <p className="text-xs text-center text-gray-400 dark:text-gray-500">
          {mutedCount} post{mutedCount === 1 ? '' : 's'} hidden by your{' '}
          <Link href="/settings/moderation" className="underline hover:text-gray-600 dark:hover:text-gray-300">
            moderation filters
          </Link>
        </p>
      )}

      {trendingRepos.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-500">Trending Repos</h3>
          {trendingRepos.map((repo) => (
            <RepoCard key={repo.fullName} repo={repo} />
          ))}
        </div>
      )}

      {posts.map((post) => {
        const badge = ACCOUNT_BADGES[post.account.type] ?? ACCOUNT_BADGES.USER;
        const { label: selfLabel, cleanContent: labelledContent } = parseSelfLabel(post.content || '');
        const { story, cleanContent } = parseAitmChangeStoryBlock(labelledContent);
        return (
          <article
            key={post.id}
            className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition"
          >
            <div className="flex items-start gap-3 mb-4">
              <Link href={`/${post.account.username}`}>
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold cursor-pointer hover:scale-105 transition">
                  {post.account.username[0].toUpperCase()}
                </div>
              </Link>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Link href={`/${post.account.username}`} className="font-medium hover:underline">
                    @{post.account.username}
                  </Link>
                  <span className={`${badge.color} text-white text-xs px-2 py-0.5 rounded-full`}>
                    {badge.icon}
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  {new Date(post.createdAt).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="text-gray-800 dark:text-gray-200 mb-4">
              <ContentHider label={selfLabel}>
                {story && <AitmChangeStoryCard story={story} />}
                <RichContent content={cleanContent} />
              </ContentHider>
            </div>

            <div className="flex gap-6 text-sm text-gray-600 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-4">
              <button
                onClick={() => likeMutation.mutate({ id: post.id, liked: post.likedByMe ?? false })}
                className={`flex items-center gap-2 transition ${
                  post.likedByMe
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'hover:text-blue-600'
                }`}
                aria-label={post.likedByMe ? 'Unlike post' : 'Like post'}
                aria-pressed={post.likedByMe}
              >
                <span>{post.likedByMe ? '👍' : '👍'}</span>
                <span>{post.likesCount}</span>
              </button>
              <button className="flex items-center gap-2 hover:text-blue-600 transition" aria-label="Comment on post">
                <span>💬</span>
                <span>{post.commentsCount}</span>
              </button>
              <button className="flex items-center gap-2 hover:text-blue-600 transition" aria-label="Share post">
                <span>🔄</span>
                <span>{post.sharesCount}</span>
              </button>
              <BookmarkButton postId={post.id} initialSaved={false} className="ml-auto" />
            </div>
          </article>
        );
      })}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-1" />

      {isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!hasNextPage && posts.length > 0 && (
        <p className="text-center text-xs text-gray-400 dark:text-gray-500 py-4">
          You&apos;re all caught up
        </p>
      )}
    </div>
  );
}
