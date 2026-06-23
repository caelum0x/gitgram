'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import api from '@/services/api';
import { draftService } from '@/services/draftService';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GitHubActivityFeedProps {
  username: string;
  githubUsername?: string;
}

type GitgramEventType = 'POST';
type GitHubEventType = 'PushEvent' | 'PullRequestEvent' | 'IssuesEvent' | 'WatchEvent' | 'ForkEvent';

interface GitgramPost {
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

interface GitHubRepo {
  owner: string;
  name: string;
  fullName: string;
}

interface GitHubPushPayload {
  commitCount: number;
  ref: string;
  commits?: Array<{ sha: string; message: string }>;
}

interface GitHubPRPayload {
  action: string;
  number: number;
  title: string;
  url: string;
  merged: boolean;
}

interface GitHubIssuePayload {
  action: string;
  number: number;
  title: string;
  url: string;
}

interface GitHubStarPayload {
  action: string;
}

interface GitHubForkPayload {
  forkee: string;
}

type GitHubPayload =
  | GitHubPushPayload
  | GitHubPRPayload
  | GitHubIssuePayload
  | GitHubStarPayload
  | GitHubForkPayload;

interface GitHubEvent {
  id: string;
  type: GitHubEventType;
  createdAt: string;
  repo?: GitHubRepo;
  payload: GitHubPayload;
  actor: {
    login: string;
    avatarUrl?: string;
  };
}

interface FeedItem {
  kind: 'gitgram';
  sortKey: string;
  data: GitgramPost;
}

interface GitHubFeedItem {
  kind: 'github';
  sortKey: string;
  data: GitHubEvent;
}

type ActivityItem = FeedItem | GitHubFeedItem;

interface GitgramFeedPage {
  posts: GitgramPost[];
  nextCursor: string | null;
}

interface GitHubActivityPage {
  events: GitHubEvent[];
  nextCursor: string | null;
}

// ── Fetchers ──────────────────────────────────────────────────────────────────

async function fetchGitgramActivity(cursor?: string): Promise<GitgramFeedPage> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const res = await api.get('/v1/social/activity-feed', { params });
  const raw = res.data as { posts?: GitgramPost[]; nextCursor?: string | null };
  return {
    posts: raw.posts ?? [],
    nextCursor: raw.nextCursor ?? null,
  };
}

async function fetchGitHubActivity(username: string, cursor?: string): Promise<GitHubActivityPage> {
  const params: Record<string, string> = {};
  if (cursor) params.cursor = cursor;
  const res = await api.get(`/v1/users/${username}/github-activity`, { params });
  const raw = res.data as { events?: GitHubEvent[]; nextCursor?: string | null };
  return {
    events: raw.events ?? [],
    nextCursor: raw.nextCursor ?? null,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mergeAndSort(
  gitgramPages: GitgramFeedPage[],
  githubPages: GitHubActivityPage[]
): ActivityItem[] {
  const gitgramItems: FeedItem[] = gitgramPages
    .flatMap((p) => p.posts)
    .map((post) => ({
      kind: 'gitgram' as const,
      sortKey: post.createdAt,
      data: post,
    }));

  const githubItems: GitHubFeedItem[] = githubPages
    .flatMap((p) => p.events)
    .map((event) => ({
      kind: 'github' as const,
      sortKey: event.createdAt,
      data: event,
    }));

  return [...gitgramItems, ...githubItems].sort(
    (a, b) => new Date(b.sortKey).getTime() - new Date(a.sortKey).getTime()
  );
}

function buildShareContent(event: GitHubEvent): string {
  const repoLabel = event.repo ? event.repo.fullName : 'a repository';

  switch (event.type) {
    case 'PushEvent': {
      const payload = event.payload as GitHubPushPayload;
      const branch = payload.ref?.replace('refs/heads/', '') ?? 'main';
      return `Just pushed ${payload.commitCount} commit${payload.commitCount !== 1 ? 's' : ''} to ${branch} on ${repoLabel} 🚀`;
    }
    case 'PullRequestEvent': {
      const payload = event.payload as GitHubPRPayload;
      return `Opened PR #${payload.number} on ${repoLabel}: "${payload.title}"`;
    }
    case 'IssuesEvent': {
      const payload = event.payload as GitHubIssuePayload;
      return `Opened issue #${payload.number} on ${repoLabel}: "${payload.title}"`;
    }
    case 'WatchEvent':
      return `Starred ${repoLabel} ⭐`;
    case 'ForkEvent':
      return `Forked ${repoLabel} 🍴`;
    default:
      return `Activity on ${repoLabel}`;
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RepoBadge({ repo }: { repo: GitHubRepo }) {
  return (
    <a
      href={`https://github.com/${repo.fullName}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
      aria-label={`View ${repo.fullName} on GitHub`}
    >
      <svg
        className="w-3 h-3 shrink-0"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
      </svg>
      {repo.fullName}
    </a>
  );
}

// Icon components for event types
function PushIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function PullRequestIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7" />
      <line x1="6" y1="9" x2="6" y2="21" />
    </svg>
  );
}

function IssueIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function ForkIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="6" r="3" />
      <path d="M6 9v2a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9" />
      <line x1="12" y1="12" x2="12" y2="15" />
    </svg>
  );
}

interface EventIconConfig {
  icon: React.ReactNode;
  bgClass: string;
  textClass: string;
  label: string;
}

function getEventConfig(type: GitHubEventType): EventIconConfig {
  switch (type) {
    case 'PushEvent':
      return {
        icon: <PushIcon />,
        bgClass: 'bg-blue-100 dark:bg-blue-900/40',
        textClass: 'text-blue-600 dark:text-blue-400',
        label: 'Push',
      };
    case 'PullRequestEvent':
      return {
        icon: <PullRequestIcon />,
        bgClass: 'bg-purple-100 dark:bg-purple-900/40',
        textClass: 'text-purple-600 dark:text-purple-400',
        label: 'Pull Request',
      };
    case 'IssuesEvent':
      return {
        icon: <IssueIcon />,
        bgClass: 'bg-yellow-100 dark:bg-yellow-900/40',
        textClass: 'text-yellow-600 dark:text-yellow-400',
        label: 'Issue',
      };
    case 'WatchEvent':
      return {
        icon: <StarIcon />,
        bgClass: 'bg-amber-100 dark:bg-amber-900/40',
        textClass: 'text-amber-500 dark:text-amber-400',
        label: 'Star',
      };
    case 'ForkEvent':
      return {
        icon: <ForkIcon />,
        bgClass: 'bg-green-100 dark:bg-green-900/40',
        textClass: 'text-green-600 dark:text-green-400',
        label: 'Fork',
      };
  }
}

function buildEventDescription(event: GitHubEvent): string {
  const repoLabel = event.repo ? event.repo.fullName : 'a repository';

  switch (event.type) {
    case 'PushEvent': {
      const payload = event.payload as GitHubPushPayload;
      const branch = payload.ref?.replace('refs/heads/', '') ?? 'main';
      return `pushed ${payload.commitCount} commit${payload.commitCount !== 1 ? 's' : ''} to ${branch}`;
    }
    case 'PullRequestEvent': {
      const payload = event.payload as GitHubPRPayload;
      return `opened PR #${payload.number}: ${payload.title}`;
    }
    case 'IssuesEvent': {
      const payload = event.payload as GitHubIssuePayload;
      return `opened issue: ${payload.title}`;
    }
    case 'WatchEvent':
      return `starred ${repoLabel}`;
    case 'ForkEvent':
      return `forked ${repoLabel}`;
  }
}

interface ShareButtonProps {
  event: GitHubEvent;
  onShared: (draftId: string) => void;
}

function ShareToGitgramButton({ event, onShared }: ShareButtonProps) {
  const mutation = useMutation({
    mutationFn: () => draftService.createDraft(buildShareContent(event)),
    onSuccess: (draft) => {
      onShared(draft.id);
    },
  });

  return (
    <button
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending || mutation.isSuccess}
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      aria-label="Share this GitHub event as a Gitgram post draft"
    >
      {mutation.isPending ? (
        <>
          <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
          <span>Saving...</span>
        </>
      ) : mutation.isSuccess ? (
        <>
          <svg className="w-3 h-3 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="text-green-600 dark:text-green-400">Saved to drafts</span>
        </>
      ) : (
        <>
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          <span>Share to Gitgram</span>
        </>
      )}
    </button>
  );
}

interface GitHubEventCardProps {
  event: GitHubEvent;
}

function GitHubEventCard({ event }: GitHubEventCardProps) {
  const [sharedDraftId, setSharedDraftId] = useState<string | null>(null);
  const config = getEventConfig(event.type);
  const description = buildEventDescription(event);
  const avatarSrc = event.actor.avatarUrl ?? `https://avatars.githubusercontent.com/${event.actor.login}`;

  return (
    <article
      className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
      aria-label={`GitHub ${config.label} event by ${event.actor.login}`}
    >
      <div className="flex items-start gap-3">
        {/* Event type icon */}
        <div
          className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${config.bgClass} ${config.textClass}`}
          aria-hidden="true"
        >
          {config.icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Actor avatar + name */}
            <a
              href={`https://github.com/${event.actor.login}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:underline"
            >
              <img
                src={avatarSrc}
                alt={event.actor.login}
                className="w-5 h-5 rounded-full"
                loading="lazy"
              />
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {event.actor.login}
              </span>
            </a>

            <span className="text-sm text-gray-600 dark:text-gray-400 truncate">
              {description}
            </span>
          </div>

          {/* Repo chip */}
          {event.repo && (
            <div className="mt-1.5">
              <RepoBadge repo={event.repo} />
            </div>
          )}

          {/* Footer row */}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <time
              dateTime={event.createdAt}
              className="text-xs text-gray-400 dark:text-gray-500"
              title={new Date(event.createdAt).toLocaleString()}
            >
              {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
            </time>

            <ShareToGitgramButton event={event} onShared={setSharedDraftId} />

            {sharedDraftId && (
              <Link
                href={`/drafts/${sharedDraftId}`}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Edit draft
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

interface GitgramPostCardProps {
  post: GitgramPost;
  onLike: (id: string, liked: boolean) => void;
}

function GitgramPostCard({ post, onLike }: GitgramPostCardProps) {
  return (
    <article
      className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
      aria-label={`Post by ${post.account.username}`}
    >
      <div className="flex items-start gap-3 mb-3">
        <Link href={`/${post.account.username}`} className="flex-shrink-0">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-sm font-bold hover:scale-105 transition-transform">
            {post.account.username[0].toUpperCase()}
          </div>
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Link
              href={`/${post.account.username}`}
              className="text-sm font-medium text-gray-900 dark:text-gray-100 hover:underline truncate"
            >
              @{post.account.username}
            </Link>
          </div>
          <time
            dateTime={post.createdAt}
            className="text-xs text-gray-400 dark:text-gray-500"
            title={new Date(post.createdAt).toLocaleString()}
          >
            {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
          </time>
        </div>
      </div>

      <p className="text-sm text-gray-800 dark:text-gray-200 mb-3 leading-relaxed">
        {post.content}
      </p>

      <div className="flex gap-5 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-3">
        <button
          onClick={() => onLike(post.id, post.likedByMe ?? false)}
          className={`flex items-center gap-1.5 transition-colors ${
            post.likedByMe ? 'text-blue-600 dark:text-blue-400' : 'hover:text-blue-600'
          }`}
          aria-label={post.likedByMe ? 'Unlike post' : 'Like post'}
          aria-pressed={post.likedByMe}
        >
          <svg className={`w-4 h-4 ${post.likedByMe ? 'fill-current' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          <span>{post.likesCount}</span>
        </button>

        <Link
          href={`/posts/${post.id}`}
          className="flex items-center gap-1.5 hover:text-blue-600 transition-colors"
          aria-label={`${post.commentsCount} comments`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span>{post.commentsCount}</span>
        </Link>

        <span className="flex items-center gap-1.5" aria-label={`${post.sharesCount} shares`}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <polyline points="17 1 21 5 17 9" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <polyline points="7 23 3 19 7 15" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
          <span>{post.sharesCount}</span>
        </span>
      </div>
    </article>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading activity feed" aria-busy="true">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 animate-pulse"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-48" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function GitHubActivityFeed({ username, githubUsername }: GitHubActivityFeedProps) {
  const queryClient = useQueryClient();
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Gitgram activity feed — cursor-based infinite query
  const gitgramQuery = useInfiniteQuery({
    queryKey: ['activity-feed', username],
    queryFn: ({ pageParam }) => fetchGitgramActivity(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  // GitHub raw activity feed (optional)
  const githubQuery = useInfiniteQuery({
    queryKey: ['github-activity', githubUsername],
    queryFn: ({ pageParam }) => fetchGitHubActivity(githubUsername!, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(githubUsername),
  });

  // Determine if any next page is available across both queries
  const hasNextPage = gitgramQuery.hasNextPage || (githubUsername ? githubQuery.hasNextPage : false);
  const isFetchingNextPage = gitgramQuery.isFetchingNextPage || githubQuery.isFetchingNextPage;

  const fetchNextPageBoth = useCallback(() => {
    if (gitgramQuery.hasNextPage && !gitgramQuery.isFetchingNextPage) {
      gitgramQuery.fetchNextPage();
    }
    if (githubUsername && githubQuery.hasNextPage && !githubQuery.isFetchingNextPage) {
      githubQuery.fetchNextPage();
    }
  }, [gitgramQuery, githubQuery, githubUsername]);

  // Intersection Observer for infinite scroll
  const onIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPageBoth();
      }
    },
    [fetchNextPageBoth, hasNextPage, isFetchingNextPage]
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(onIntersect, { rootMargin: '300px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onIntersect]);

  // Optimistic like mutation
  const likeMutation = useMutation({
    mutationFn: async ({ id, liked }: { id: string; liked: boolean }) => {
      if (liked) {
        await api.delete(`/v1/posts/${id}/like`);
      } else {
        await api.post(`/v1/posts/${id}/like`);
      }
    },
    onMutate: async ({ id, liked }) => {
      const queryKey = ['activity-feed', username];
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData(queryKey);

      queryClient.setQueryData(queryKey, (old: typeof gitgramQuery.data) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            posts: page.posts.map((p) =>
              p.id === id
                ? { ...p, likedByMe: !liked, likesCount: liked ? p.likesCount - 1 : p.likesCount + 1 }
                : p
            ),
          })),
        };
      });

      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(['activity-feed', username], ctx.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['activity-feed', username] });
    },
  });

  // Build interleaved feed
  const gitgramPages = gitgramQuery.data?.pages ?? [];
  const githubPages = githubQuery.data?.pages ?? [];
  const feedItems = mergeAndSort(gitgramPages, githubPages);

  // Loading state — show skeleton on initial fetch
  const isInitialLoading =
    gitgramQuery.status === 'pending' ||
    (githubUsername && githubQuery.status === 'pending' && !githubQuery.isFetchingNextPage);

  if (isInitialLoading) {
    return <FeedSkeleton />;
  }

  // Error state
  if (gitgramQuery.status === 'error') {
    return (
      <div
        role="alert"
        className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-center"
      >
        <p className="text-sm text-red-600 dark:text-red-400">Failed to load activity feed.</p>
        <button
          onClick={() => gitgramQuery.refetch()}
          className="mt-2 text-xs text-red-500 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  // Empty state
  if (feedItems.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400 text-sm">No activity yet.</p>
        {githubUsername && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            GitHub events will appear here once activity is detected.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {feedItems.map((item) => {
        if (item.kind === 'gitgram') {
          return (
            <GitgramPostCard
              key={`gitgram-${item.data.id}`}
              post={item.data}
              onLike={(id, liked) => likeMutation.mutate({ id, liked })}
            />
          );
        }

        return (
          <GitHubEventCard
            key={`github-${item.data.id}`}
            event={item.data}
          />
        );
      })}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-1" aria-hidden="true" />

      {isFetchingNextPage && (
        <div className="flex justify-center py-4" aria-label="Loading more activity">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!hasNextPage && feedItems.length > 0 && (
        <p className="text-center text-xs text-gray-400 dark:text-gray-500 py-4">
          All caught up
        </p>
      )}
    </div>
  );
}
