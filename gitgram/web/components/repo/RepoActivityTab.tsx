'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { repoService } from '@/services/repoService';
import { AitmChangeStory, parseAitmChangeStoryBlock } from '@/utils/aitmChangeStory';
import AitmChangeStoryCard from '@/components/AitmChangeStoryCard';
import EmptyState from '@/components/EmptyState';

interface RepoActivityTabProps {
  owner: string;
  name: string;
  initialActivities: any[];
  posts: any[];
}

type ActivityFilter = 'all' | 'github' | 'platform' | 'checkpoints';

/** Extracts AITM checkpoint-linked stories from posts. */
function extractCheckpointPosts(posts: any[]): { post: any; story: AitmChangeStory; cleanContent: string }[] {
  const results: { post: any; story: AitmChangeStory; cleanContent: string }[] = [];
  for (const post of posts) {
    const { story, cleanContent } = parseAitmChangeStoryBlock(post.content || '');
    if (story) {
      results.push({ post, story, cleanContent });
    }
  }
  return results;
}

function ActivityIcon({ eventType }: { eventType?: string }) {
  const type = (eventType || '').toLowerCase();
  if (type.includes('push') || type.includes('commit')) {
    return (
      <svg className="h-4 w-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    );
  }
  if (type.includes('pull') || type.includes('pr')) {
    return (
      <svg className="h-4 w-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16m-7 6h7" />
      </svg>
    );
  }
  if (type.includes('issue')) {
    return (
      <svg className="h-4 w-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    );
  }
  if (type.includes('release') || type.includes('tag')) {
    return (
      <svg className="h-4 w-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
      </svg>
    );
  }
  if (type.includes('star') || type.includes('fork') || type.includes('watch')) {
    return (
      <svg className="h-4 w-4 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4 text-foreground-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

export default function RepoActivityTab({ owner, name, initialActivities, posts }: RepoActivityTabProps) {
  const [activities, setActivities] = useState<any[]>(initialActivities);
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialActivities.length >= 20);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const checkpointPosts = useMemo(() => extractCheckpointPosts(posts), [posts]);

  // On-platform activity: non-checkpoint posts about this repo
  const platformPosts = useMemo(() => {
    return posts.filter((p) => {
      const { story } = parseAitmChangeStoryBlock(p.content || '');
      return !story; // Only posts that are NOT change stories
    });
  }, [posts]);

  // Infinite scroll for GitHub activity
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore && hasMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, page]);

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await repoService.getActivity(owner, name, { page: nextPage, limit: 20 });
      const newActivities = res.data?.activities || [];
      if (newActivities.length < 20) {
        setHasMore(false);
      }
      setActivities((prev) => [
        ...prev,
        ...newActivities.filter((a: any) => !prev.find((e: any) => e.id === a.id)),
      ]);
      setPage(nextPage);
    } catch (error) {
      console.error('Failed to load more activities', error);
    } finally {
      setLoadingMore(false);
    }
  }, [owner, name, page, loadingMore]);

  const FILTERS: { key: ActivityFilter; label: string }[] = [
    { key: 'all', label: 'All Activity' },
    { key: 'github', label: 'GitHub Events' },
    { key: 'platform', label: 'On-Platform' },
    { key: 'checkpoints', label: 'Checkpoints' },
  ];

  const showGithubTimeline = filter === 'all' || filter === 'github';
  const showPlatformActivity = filter === 'all' || filter === 'platform';
  const showCheckpoints = filter === 'all' || filter === 'checkpoints';

  const isEmpty =
    activities.length === 0 && platformPosts.length === 0 && checkpointPosts.length === 0;

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                filter === f.key
                  ? 'bg-primary text-white'
                  : 'bg-hover text-foreground-secondary hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Link
          href={`/compose?type=change_story&owner=${owner}&name=${name}`}
          className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary-hover"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Change Story
        </Link>
      </div>

      {isEmpty && (
        <EmptyState
          icon="Activity"
          title="No activity yet"
          description="GitHub events, on-platform posts, and change stories for this repository will appear here."
        />
      )}

      {/* Checkpoint-linked posts section */}
      {showCheckpoints && checkpointPosts.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <svg className="h-5 w-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <h2 className="text-base font-semibold text-foreground">AITM Change Stories</h2>
            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-500">
              {checkpointPosts.length}
            </span>
          </div>
          <div className="space-y-3">
            {checkpointPosts.map(({ post, story, cleanContent }) => (
              <div key={post.id} className="rounded-xl border border-border bg-card overflow-hidden transition hover:border-blue-500/30">
                <div className="p-4">
                  <AitmChangeStoryCard story={story} />
                  {cleanContent && (
                    <p className="mt-2 text-sm text-foreground">{cleanContent}</p>
                  )}
                  <div className="mt-2 flex items-center gap-2 text-xs text-foreground-secondary">
                    <span>by @{post.user?.username || 'unknown'}</span>
                    {post.createdAt && (
                      <span>
                        {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* On-platform activity */}
      {showPlatformActivity && platformPosts.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <svg className="h-5 w-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            <h2 className="text-base font-semibold text-foreground">On-Platform Activity</h2>
            <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-xs font-medium text-purple-500">
              {platformPosts.length}
            </span>
          </div>
          <div className="space-y-2">
            {platformPosts.slice(0, 5).map((post) => (
              <div key={post.id} className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 transition hover:border-purple-500/20">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-purple-500/10">
                  {post.user?.avatar ? (
                    <img src={post.user.avatar} alt={post.user.username} className="h-full w-full rounded-full object-cover" />
                  ) : (
                    <span className="text-xs font-semibold text-purple-500">
                      {post.user?.username?.[0]?.toUpperCase() || '?'}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground line-clamp-2">
                    {post.content?.replace(/\[AITM_CHANGE_STORY\][\s\S]*?\[\/AITM_CHANGE_STORY\]/g, '').trim().slice(0, 200) || 'Post'}
                  </p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-foreground-secondary">
                    <span>@{post.user?.username || 'unknown'}</span>
                    {post.createdAt && (
                      <span>{formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}</span>
                    )}
                    <span className="flex items-center gap-1">
                      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                      </svg>
                      {post.likesCount || post._count?.likes || 0}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* GitHub activity timeline */}
      {showGithubTimeline && activities.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <svg className="h-5 w-5 text-foreground-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-base font-semibold text-foreground">GitHub Activity</h2>
          </div>

          <div className="relative">
            {/* Timeline line */}
            <div className="absolute bottom-0 left-5 top-0 w-px bg-border" />

            <div className="space-y-0">
              {activities.map((activity) => (
                <div key={activity.id} className="relative flex gap-4 pb-6">
                  {/* Timeline dot */}
                  <div className="relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 border-border bg-card">
                    <ActivityIcon eventType={activity.eventType} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 rounded-lg border border-border bg-card px-4 py-3 transition hover:border-primary/20">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-medium text-primary capitalize">
                        {(activity.eventType || 'event').replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-foreground-secondary">
                        {activity.occurredAt || activity.createdAt
                          ? formatDistanceToNow(new Date(activity.occurredAt || activity.createdAt), { addSuffix: true })
                          : ''}
                      </span>
                    </div>
                    <p className="text-sm text-foreground">
                      {activity.summary || activity.title || activity.description || 'Repository activity captured.'}
                    </p>
                    {activity.actorLogin && (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        {activity.actorAvatar && (
                          <img src={activity.actorAvatar} alt={activity.actorLogin} className="h-4 w-4 rounded-full" />
                        )}
                        <span className="text-xs text-foreground-secondary">{activity.actorLogin}</span>
                      </div>
                    )}
                    {activity.sha && (
                      <p className="mt-1.5 inline-block rounded bg-background px-2 py-0.5 font-mono text-xs text-foreground-secondary">
                        {activity.sha.slice(0, 7)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-4" />
          {loadingMore && (
            <div className="flex justify-center py-4">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
          {!hasMore && activities.length > 0 && (
            <p className="py-4 text-center text-sm text-foreground-secondary">No more activity to load.</p>
          )}
        </section>
      )}
    </div>
  );
}
