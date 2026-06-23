'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import api from '@/services/api';
import { buildRepoPath } from '@/utils/repositoryRouting';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrendingRepo {
  id?: string;
  owner: string;
  name: string;
  fullName: string;
  description?: string;
  stars: number;
  forks: number;
  language?: string;
  ownerAvatarUrl?: string;
  isClaimed?: boolean;
  trendingRank?: number;
  updatedAt?: string;
  topics?: string[];
  contributors?: number;
}

type TimeRange = 'daily' | 'weekly' | 'monthly' | 'alltime';
type SortBy = 'trending' | 'stars' | 'forks' | 'updated';
type ViewMode = 'grid' | 'list';

interface TrendingApiResponse {
  repos?: unknown[];
  repositories?: unknown[];
  entries?: unknown[];
  hasMore?: boolean;
  nextOffset?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LANGUAGES = [
  'All',
  'TypeScript',
  'Python',
  'JavaScript',
  'Go',
  'Rust',
  'Swift',
  'Java',
  'C++',
  'Kotlin',
  'Ruby',
] as const;

type Language = (typeof LANGUAGES)[number];

const TIME_RANGES: Array<{ label: string; value: TimeRange }> = [
  { label: 'Today', value: 'daily' },
  { label: 'This Week', value: 'weekly' },
  { label: 'This Month', value: 'monthly' },
  { label: 'All Time', value: 'alltime' },
];

const SORT_OPTIONS: Array<{ label: string; value: SortBy }> = [
  { label: 'Trending', value: 'trending' },
  { label: 'Stars', value: 'stars' },
  { label: 'Forks', value: 'forks' },
  { label: 'Recently Updated', value: 'updated' },
];

const MIN_STARS_OPTIONS = [
  { label: 'Any', value: 0 },
  { label: '10+', value: 10 },
  { label: '100+', value: 100 },
  { label: '1k+', value: 1000 },
  { label: '10k+', value: 10000 },
];

const POPULAR_TOPICS = [
  'AI',
  'Machine Learning',
  'Web',
  'Mobile',
  'DevOps',
  'Security',
  'Database',
  'CLI',
  'API',
  'Framework',
  'Game',
  'Blockchain',
];

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Go: '#00ADD8',
  Rust: '#dea584',
  Swift: '#F05138',
  Java: '#b07219',
  'C++': '#f34b7d',
  Kotlin: '#A97BFF',
  Ruby: '#CC342D',
};

const PAGE_SIZE = 12;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function truncate(text: string, max: number): string {
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function timeAgo(dateStr?: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function normalizeRepo(raw: unknown): TrendingRepo {
  const r = raw as Record<string, unknown>;
  const fullName =
    (r?.fullName as string) ||
    `${(r?.owner as string) || ''}/${(r?.name as string) || ''}`;
  const parts = fullName.split('/');
  const owner = parts[0] ?? ((r?.owner as string) || '');
  const name = parts[1] ?? ((r?.name as string) || '');
  return {
    id: (r?.id as string) || fullName,
    owner,
    name,
    fullName,
    description: (r?.description as string) || undefined,
    stars: Number(r?.stars || 0),
    forks: Number(r?.forks || 0),
    language: (r?.language as string) || undefined,
    ownerAvatarUrl: (r?.ownerAvatarUrl as string) || undefined,
    isClaimed: Boolean(r?.isClaimed),
    trendingRank: r?.trendingRank !== undefined ? Number(r.trendingRank) : undefined,
    updatedAt: (r?.updatedAt as string) || undefined,
    topics: Array.isArray(r?.topics) ? (r.topics as string[]) : [],
    contributors: r?.contributors !== undefined ? Number(r.contributors) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SkeletonCard({ listView }: { listView?: boolean }) {
  if (listView) {
    return (
      <div className="animate-pulse flex items-center gap-4 rounded-xl border border-white/5 bg-white/[0.03] px-5 py-4">
        <div className="h-9 w-9 rounded-full bg-white/10 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-48 rounded bg-white/10" />
          <div className="h-3 w-72 rounded bg-white/10" />
        </div>
        <div className="flex gap-4">
          <div className="h-3 w-12 rounded bg-white/10" />
          <div className="h-3 w-12 rounded bg-white/10" />
        </div>
      </div>
    );
  }
  return (
    <div className="animate-pulse rounded-2xl border border-white/5 bg-white/5 p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-white/10" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-24 rounded bg-white/10" />
          <div className="h-4 w-36 rounded bg-white/10" />
        </div>
      </div>
      <div className="mb-4 space-y-2">
        <div className="h-3 w-full rounded bg-white/10" />
        <div className="h-3 w-4/5 rounded bg-white/10" />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <div className="h-3 w-12 rounded bg-white/10" />
          <div className="h-3 w-12 rounded bg-white/10" />
        </div>
        <div className="flex gap-2">
          <div className="h-7 w-14 rounded-lg bg-white/10" />
          <div className="h-7 w-14 rounded-lg bg-white/10" />
        </div>
      </div>
    </div>
  );
}

interface RepoCardProps {
  repo: TrendingRepo;
  onFollow: (owner: string, name: string) => Promise<void>;
  followingSet: Set<string>;
  viewMode: ViewMode;
}

function RepoCard({ repo, onFollow, followingSet, viewMode }: RepoCardProps) {
  const langColor = repo.language ? (LANGUAGE_COLORS[repo.language] ?? '#8b949e') : null;
  const claimHref = `/claim?repo=${encodeURIComponent(repo.fullName)}`;
  const viewHref = buildRepoPath(repo.owner, repo.name);
  const isFollowing = followingSet.has(repo.fullName);

  const handleFollow = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onFollow(repo.owner, repo.name);
  };

  if (viewMode === 'list') {
    return (
      <div className="group flex items-center gap-4 rounded-xl border border-white/8 bg-white/[0.03] px-5 py-4 transition hover:border-white/20 hover:bg-white/[0.06]">
        {repo.ownerAvatarUrl ? (
          <Image
            src={repo.ownerAvatarUrl}
            alt={repo.owner}
            width={36}
            height={36}
            className="h-9 w-9 flex-shrink-0 rounded-full object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-xs font-bold text-white">
            {repo.owner.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              href={viewHref}
              className="text-sm font-semibold text-white transition hover:text-blue-400"
            >
              {repo.owner}/{repo.name}
            </Link>
            {repo.isClaimed && (
              <span className="rounded-full bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
                claimed
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-white/50">
            {repo.description ? truncate(repo.description, 100) : 'No description'}
          </p>
          {repo.topics && repo.topics.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {repo.topics.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/40"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-5 text-xs text-white/50">
          {langColor && repo.language && (
            <span className="hidden items-center gap-1.5 sm:flex">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: langColor }} />
              {repo.language}
            </span>
          )}
          <span className="flex items-center gap-1">
            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 16 16">
              <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
            </svg>
            {formatCount(repo.stars)}
          </span>
          <span className="flex items-center gap-1">
            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 16 16">
              <path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z" />
            </svg>
            {formatCount(repo.forks)}
          </span>
          {repo.updatedAt && (
            <span className="hidden text-white/35 lg:block">{timeAgo(repo.updatedAt)}</span>
          )}
          {repo.contributors !== undefined && (
            <span className="hidden items-center gap-1 xl:flex">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
              </svg>
              {repo.contributors}
            </span>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          <Link
            href={viewHref}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/20 hover:bg-white/10"
          >
            View
          </Link>
          <button
            type="button"
            onClick={handleFollow}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              isFollowing
                ? 'border-white/10 bg-white/5 text-white/40'
                : 'border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10'
            }`}
          >
            {isFollowing ? 'Following' : 'Follow'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex flex-col rounded-2xl border border-white/8 bg-white/[0.04] p-5 transition hover:border-white/20 hover:bg-white/[0.07]">
      {/* Header */}
      <div className="mb-3 flex items-start gap-3">
        {repo.ownerAvatarUrl ? (
          <Image
            src={repo.ownerAvatarUrl}
            alt={repo.owner}
            width={32}
            height={32}
            className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-xs font-bold text-white">
            {repo.owner.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-white/50">{repo.owner}</p>
          <Link
            href={viewHref}
            className="truncate text-sm font-semibold text-white transition hover:text-blue-400"
          >
            {repo.name}
          </Link>
        </div>
        {typeof repo.trendingRank === 'number' && (
          <span className="flex-shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/60">
            #{repo.trendingRank}
          </span>
        )}
      </div>

      {/* Description */}
      <p className="mb-3 min-h-[2.5rem] flex-1 text-xs leading-relaxed text-white/60">
        {repo.description ? truncate(repo.description, 120) : 'No description'}
      </p>

      {/* Topics */}
      {repo.topics && repo.topics.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {repo.topics.slice(0, 4).map((t) => (
            <span
              key={t}
              className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/40"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-white/50">
        {langColor && repo.language && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: langColor }} />
            {repo.language}
          </span>
        )}
        <span className="flex items-center gap-1">
          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 16 16">
            <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
          </svg>
          {formatCount(repo.stars)}
        </span>
        <span className="flex items-center gap-1">
          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 16 16">
            <path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z" />
          </svg>
          {formatCount(repo.forks)}
        </span>
        {repo.updatedAt && (
          <span className="text-white/35">{timeAgo(repo.updatedAt)}</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {!repo.isClaimed && (
          <Link
            href={claimHref}
            className="flex-1 rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-center text-xs font-medium text-blue-400 transition hover:border-blue-400 hover:bg-blue-500/20"
          >
            Claim
          </Link>
        )}
        <Link
          href={viewHref}
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-center text-xs font-medium text-white/80 transition hover:border-white/20 hover:bg-white/10"
        >
          View
        </Link>
        <button
          type="button"
          onClick={handleFollow}
          className={`flex-shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
            isFollowing
              ? 'border-white/10 bg-white/5 text-white/40'
              : 'border-white/10 bg-white/5 text-white/80 hover:border-white/20 hover:bg-white/10'
          }`}
        >
          {isFollowing ? 'Following' : 'Follow'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Featured repo carousel card
// ---------------------------------------------------------------------------

const FEATURED_GRADIENTS = [
  'from-blue-600/30 via-purple-600/20 to-transparent',
  'from-emerald-600/30 via-teal-600/20 to-transparent',
  'from-orange-600/30 via-rose-600/20 to-transparent',
];

interface FeaturedCardProps {
  repo: TrendingRepo;
  gradientIndex: number;
  onFollow: (owner: string, name: string) => Promise<void>;
  followingSet: Set<string>;
}

function FeaturedCard({ repo, gradientIndex, onFollow, followingSet }: FeaturedCardProps) {
  const gradient = FEATURED_GRADIENTS[gradientIndex % FEATURED_GRADIENTS.length];
  const langColor = repo.language ? (LANGUAGE_COLORS[repo.language] ?? '#8b949e') : null;
  const viewHref = buildRepoPath(repo.owner, repo.name);
  const isFollowing = followingSet.has(repo.fullName);

  return (
    <div
      className={`relative flex flex-col rounded-2xl border border-white/10 bg-gradient-to-br ${gradient} p-6 overflow-hidden`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.03),transparent_70%)]" />
      <div className="relative">
        <div className="mb-4 flex items-center gap-3">
          {repo.ownerAvatarUrl ? (
            <Image
              src={repo.ownerAvatarUrl}
              alt={repo.owner}
              width={40}
              height={40}
              className="h-10 w-10 rounded-full object-cover ring-2 ring-white/10"
              unoptimized
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-sm font-bold text-white ring-2 ring-white/10">
              {repo.owner.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs text-white/50">{repo.owner}</p>
            <p className="truncate text-base font-bold text-white">{repo.name}</p>
          </div>
          <span className="flex-shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/70">
            Featured
          </span>
        </div>

        <p className="mb-4 text-sm leading-relaxed text-white/70">
          {repo.description ? truncate(repo.description, 140) : 'No description'}
        </p>

        <div className="mb-5 flex flex-wrap items-center gap-3 text-sm text-white/60">
          {langColor && repo.language && (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: langColor }} />
              {repo.language}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16">
              <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
            </svg>
            {formatCount(repo.stars)}
          </span>
          <span className="flex items-center gap-1.5">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16">
              <path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z" />
            </svg>
            {formatCount(repo.forks)}
          </span>
        </div>

        <div className="flex gap-2">
          <Link
            href={viewHref}
            className="flex-1 rounded-lg bg-white/10 px-4 py-2 text-center text-sm font-medium text-white transition hover:bg-white/20"
          >
            View Repo
          </Link>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onFollow(repo.owner, repo.name); }}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
              isFollowing
                ? 'border-white/10 bg-white/5 text-white/40'
                : 'border-white/15 bg-white/5 text-white/80 hover:border-white/30 hover:bg-white/10'
            }`}
          >
            {isFollowing ? 'Following' : 'Follow'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ExploreReposDiscoveryPage() {
  const [language, setLanguage] = useState<Language>('All');
  const [timeRange, setTimeRange] = useState<TimeRange>('daily');
  const [sortBy, setSortBy] = useState<SortBy>('trending');
  const [minStars, setMinStars] = useState<number>(0);
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const [repos, setRepos] = useState<TrendingRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const isFetchingRef = useRef(false);

  const featuredRepos = repos.slice(0, 3);

  const fetchPage = useCallback(
    async (
      lang: Language,
      since: TimeRange,
      sort: SortBy,
      stars: number,
      topic: string | null,
      pageOffset: number,
      append: boolean,
    ) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }

      try {
        const params: Record<string, string | number> = {
          since,
          sort,
          limit: PAGE_SIZE,
          offset: pageOffset,
        };
        if (lang !== 'All') params.language = lang.toLowerCase();
        if (stars > 0) params.minStars = stars;
        if (topic) params.topic = topic.toLowerCase();

        const { data } = await api.get<TrendingApiResponse>('/v1/repositories/trending', {
          params,
        });

        const raw: unknown[] =
          (data?.repos as unknown[]) ||
          (data?.repositories as unknown[]) ||
          (data?.entries as unknown[]) ||
          [];

        const normalized = raw.map(normalizeRepo);

        setRepos((prev) => (append ? [...prev, ...normalized] : normalized));
        setHasMore(data?.hasMore ?? normalized.length === PAGE_SIZE);
        setOffset(pageOffset + normalized.length);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Failed to load repositories.';
        setError(message);
        if (!append) setRepos([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
        isFetchingRef.current = false;
      }
    },
    [],
  );

  useEffect(() => {
    setOffset(0);
    setHasMore(true);
    fetchPage(language, timeRange, sortBy, minStars, activeTopic, 0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, timeRange, sortBy, minStars, activeTopic]);

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && hasMore && !loading && !loadingMore) {
          fetchPage(language, timeRange, sortBy, minStars, activeTopic, offset, true);
        }
      },
      { rootMargin: '200px' },
    );

    const sentinel = sentinelRef.current;
    if (sentinel) observerRef.current.observe(sentinel);

    return () => observerRef.current?.disconnect();
  }, [hasMore, loading, loadingMore, offset, language, timeRange, sortBy, minStars, activeTopic, fetchPage]);

  const handleFollow = useCallback(async (owner: string, name: string) => {
    const key = `${owner}/${name}`;
    setFollowingSet((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    try {
      await api.post('/v1/social/follow', { targetType: 'REPOSITORY', owner, name });
    } catch {
      setFollowingSet((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="mx-auto max-w-7xl px-4 py-8">

        {/* Page header */}
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Discover Repos</h1>
            <p className="mt-1 text-sm text-white/50">
              Explore trending repositories from GitHub and Gitgram
            </p>
          </div>
          <Link
            href="/claim"
            className="flex-shrink-0 rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-400 transition hover:border-blue-400 hover:bg-blue-500/20"
          >
            + Submit Repo
          </Link>
        </div>

        {/* Featured carousel */}
        {!loading && featuredRepos.length > 0 && (
          <div className="mb-10">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/40">
              Featured Repos
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featuredRepos.map((repo, i) => (
                <FeaturedCard
                  key={repo.fullName}
                  repo={repo}
                  gradientIndex={i}
                  onFollow={handleFollow}
                  followingSet={followingSet}
                />
              ))}
            </div>
          </div>
        )}

        {/* Main layout: sidebar + content */}
        <div className="flex gap-6">

          {/* Topics sidebar */}
          <aside className="hidden w-52 flex-shrink-0 lg:block">
            <div className="sticky top-6 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">
                Topics
              </p>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTopic(null)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                    activeTopic === null
                      ? 'bg-white/10 text-white font-medium'
                      : 'text-white/50 hover:bg-white/5 hover:text-white/80'
                  }`}
                >
                  All Topics
                </button>
                {POPULAR_TOPICS.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => setActiveTopic(activeTopic === topic ? null : topic)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                      activeTopic === topic
                        ? 'bg-blue-500/15 text-blue-300 font-medium'
                        : 'text-white/50 hover:bg-white/5 hover:text-white/80'
                    }`}
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          {/* Content */}
          <div className="min-w-0 flex-1">

            {/* Filter bar */}
            <div className="mb-6 space-y-3">

              {/* Row 1: time range + sort + view toggle */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Time range */}
                <div className="flex gap-1 rounded-xl border border-white/8 bg-white/[0.03] p-1">
                  {TIME_RANGES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setTimeRange(t.value)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        timeRange === t.value
                          ? 'bg-white/10 text-white'
                          : 'text-white/50 hover:text-white/80'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Sort by */}
                <div className="flex gap-1 rounded-xl border border-white/8 bg-white/[0.03] p-1">
                  {SORT_OPTIONS.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setSortBy(s.value)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        sortBy === s.value
                          ? 'bg-white/10 text-white'
                          : 'text-white/50 hover:text-white/80'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {/* View toggle */}
                <div className="ml-auto flex gap-1 rounded-xl border border-white/8 bg-white/[0.03] p-1">
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    title="Grid view"
                    className={`rounded-lg p-1.5 transition ${
                      viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
                    }`}
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16">
                      <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    title="List view"
                    className={`rounded-lg p-1.5 transition ${
                      viewMode === 'list' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
                    }`}
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16">
                      <path fillRule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5z" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Row 2: language pills + min stars */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="-mx-0 flex flex-wrap gap-1.5">
                  {LANGUAGES.map((lang) => {
                    const color = lang !== 'All' ? LANGUAGE_COLORS[lang] : undefined;
                    const active = language === lang;
                    return (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => setLanguage(lang)}
                        className={`flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
                          active
                            ? 'border-white/30 bg-white/10 text-white'
                            : 'border-white/8 bg-white/[0.03] text-white/50 hover:border-white/15 hover:text-white/80'
                        }`}
                      >
                        {color && (
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                        )}
                        {lang}
                      </button>
                    );
                  })}
                </div>

                {/* Min stars */}
                <div className="ml-auto flex flex-shrink-0 items-center gap-1 rounded-xl border border-white/8 bg-white/[0.03] p-1">
                  <span className="px-2 text-xs text-white/40">Min stars:</span>
                  {MIN_STARS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setMinStars(opt.value)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                        minStars === opt.value
                          ? 'bg-white/10 text-white'
                          : 'text-white/50 hover:text-white/80'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Active topic chip (mobile) */}
              {activeTopic && (
                <div className="flex items-center gap-2 lg:hidden">
                  <span className="text-xs text-white/40">Topic:</span>
                  <button
                    type="button"
                    onClick={() => setActiveTopic(null)}
                    className="flex items-center gap-1.5 rounded-full bg-blue-500/15 px-3 py-1 text-xs text-blue-300"
                  >
                    {activeTopic}
                    <span className="text-blue-400/60">×</span>
                  </button>
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {/* Repo list */}
            {loading ? (
              <div className={viewMode === 'grid' ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3' : 'flex flex-col gap-2'}>
                {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                  <SkeletonCard key={i} listView={viewMode === 'list'} />
                ))}
              </div>
            ) : repos.length > 0 ? (
              <>
                <div className={viewMode === 'grid' ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3' : 'flex flex-col gap-2'}>
                  {repos.map((repo) => (
                    <RepoCard
                      key={repo.fullName}
                      repo={repo}
                      onFollow={handleFollow}
                      followingSet={followingSet}
                      viewMode={viewMode}
                    />
                  ))}
                  {loadingMore &&
                    Array.from({ length: viewMode === 'grid' ? 3 : 5 }).map((_, i) => (
                      <SkeletonCard key={`more-${i}`} listView={viewMode === 'list'} />
                    ))}
                </div>
                <div ref={sentinelRef} className="h-px" />
                {!hasMore && repos.length > 0 && (
                  <p className="mt-10 text-center text-sm text-white/30">
                    All repositories loaded
                  </p>
                )}
              </>
            ) : (
              <div className="py-20 text-center">
                <p className="text-white/40">No repositories found for the current filters.</p>
                <p className="mt-2 text-sm text-white/25">
                  Try a different language, topic, or time range.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
