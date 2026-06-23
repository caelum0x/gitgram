'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import api from '@/services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Developer {
  id: string;
  username: string;
  displayName?: string;
  avatar?: string;
  bio?: string;
  location?: string;
  topLanguage?: string;
  followers: number;
  following?: number;
  publicRepos?: number;
  isVerified?: boolean;
  isFollowing?: boolean;
  company?: string;
  website?: string;
  githubUsername?: string;
}

type SortBy = 'followers' | 'repos' | 'trending';

interface DevelopersApiResponse {
  users?: unknown[];
  developers?: unknown[];
  data?: unknown[];
  hasMore?: boolean;
  nextCursor?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LANGUAGE_OPTIONS = [
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

type LanguageFilter = (typeof LANGUAGE_OPTIONS)[number];

const SORT_OPTIONS: Array<{ label: string; value: SortBy }> = [
  { label: 'Most Followed', value: 'followers' },
  { label: 'Most Repos', value: 'repos' },
  { label: 'Trending', value: 'trending' },
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

const PAGE_SIZE = 20;

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

function normalizeDeveloper(raw: unknown): Developer {
  const r = raw as Record<string, unknown>;
  const countObj = r?._count as Record<string, unknown> | undefined;
  return {
    id: (r?.id as string) || (r?.username as string) || '',
    username: (r?.username as string) || '',
    displayName: (r?.displayName as string) || (r?.name as string) || undefined,
    avatar: (r?.avatar as string) || (r?.avatarUrl as string) || undefined,
    bio: (r?.bio as string) || undefined,
    location: (r?.location as string) || undefined,
    topLanguage: (r?.topLanguage as string) || undefined,
    followers: Number(
      r?.followers ?? countObj?.followers ?? r?.followersCount ?? 0,
    ),
    following: r?.following !== undefined ? Number(r.following) : undefined,
    publicRepos: r?.publicRepos !== undefined ? Number(r.publicRepos) : undefined,
    isVerified: Boolean(r?.isVerified ?? r?.verified),
    isFollowing: Boolean(r?.isFollowing),
    company: (r?.company as string) || undefined,
    website: (r?.website as string) || undefined,
    githubUsername: (r?.githubUsername as string) || undefined,
  };
}

function avatarInitials(dev: Developer): string {
  const name = dev.displayName || dev.username;
  return name.charAt(0).toUpperCase();
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SkeletonCard({ featured }: { featured?: boolean }) {
  if (featured) {
    return (
      <div className="animate-pulse rounded-2xl border border-white/5 bg-white/[0.04] p-6">
        <div className="mb-4 flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-white/10" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 rounded bg-white/10" />
            <div className="h-3 w-24 rounded bg-white/10" />
          </div>
        </div>
        <div className="mb-4 space-y-2">
          <div className="h-3 w-full rounded bg-white/10" />
          <div className="h-3 w-4/5 rounded bg-white/10" />
        </div>
        <div className="flex gap-3">
          <div className="h-3 w-16 rounded bg-white/10" />
          <div className="h-3 w-16 rounded bg-white/10" />
        </div>
      </div>
    );
  }
  return (
    <div className="animate-pulse flex items-center gap-4 rounded-xl border border-white/5 bg-white/[0.03] px-5 py-4">
      <div className="h-10 w-10 rounded-full bg-white/10 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-32 rounded bg-white/10" />
        <div className="h-3 w-56 rounded bg-white/10" />
      </div>
      <div className="h-7 w-20 rounded-lg bg-white/10 flex-shrink-0" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Featured developer card
// ---------------------------------------------------------------------------

const FEATURED_GRADIENTS = [
  'from-violet-600/25 via-purple-600/15 to-transparent',
  'from-blue-600/25 via-cyan-600/15 to-transparent',
  'from-emerald-600/25 via-teal-600/15 to-transparent',
];

interface FeaturedDevCardProps {
  dev: Developer;
  gradientIndex: number;
  followingSet: Set<string>;
  onFollow: (username: string) => Promise<void>;
}

function FeaturedDevCard({ dev, gradientIndex, followingSet, onFollow }: FeaturedDevCardProps) {
  const gradient = FEATURED_GRADIENTS[gradientIndex % FEATURED_GRADIENTS.length];
  const isFollowing = followingSet.has(dev.username);
  const langColor = dev.topLanguage ? (LANGUAGE_COLORS[dev.topLanguage] ?? '#8b949e') : null;

  return (
    <div className={`relative flex flex-col rounded-2xl border border-white/10 bg-gradient-to-br ${gradient} p-6 overflow-hidden`}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.03),transparent_70%)]" />
      <div className="relative">
        <div className="mb-4 flex items-center gap-4">
          <Link href={`/${dev.username}`}>
            {dev.avatar ? (
              <Image
                src={dev.avatar}
                alt={dev.username}
                width={64}
                height={64}
                className="h-16 w-16 rounded-full object-cover ring-2 ring-white/10 transition hover:ring-white/25"
                unoptimized
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-600 text-xl font-bold text-white ring-2 ring-white/10">
                {avatarInitials(dev)}
              </div>
            )}
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Link
                href={`/${dev.username}`}
                className="text-base font-bold text-white transition hover:text-blue-400"
              >
                {dev.displayName || dev.username}
              </Link>
              {dev.isVerified && (
                <svg
                  className="h-4 w-4 flex-shrink-0 text-blue-400"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M8.603 3.799A4.49 4.49 0 0 1 12 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 0 1 3.498 1.307 4.491 4.491 0 0 1 1.307 3.497A4.49 4.49 0 0 1 21.75 12a4.49 4.49 0 0 1-1.549 3.397 4.491 4.491 0 0 1-1.307 3.497 4.491 4.491 0 0 1-3.497 1.307A4.49 4.49 0 0 1 12 21.75a4.49 4.49 0 0 1-3.397-1.549 4.49 4.49 0 0 1-3.498-1.306 4.491 4.491 0 0 1-1.307-3.498A4.49 4.49 0 0 1 2.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 0 1 1.307-3.497 4.49 4.49 0 0 1 3.497-1.307Zm7.007 6.387a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" />
                </svg>
              )}
            </div>
            <p className="text-sm text-white/50">@{dev.username}</p>
            {dev.location && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-white/35">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                </svg>
                {dev.location}
              </p>
            )}
          </div>
        </div>

        {dev.bio && (
          <p className="mb-4 text-sm leading-relaxed text-white/65">
            {truncate(dev.bio, 150)}
          </p>
        )}

        <div className="mb-5 flex flex-wrap items-center gap-4 text-sm text-white/55">
          <span>
            <span className="font-semibold text-white">{formatCount(dev.followers)}</span>{' '}
            followers
          </span>
          {dev.publicRepos !== undefined && (
            <span>
              <span className="font-semibold text-white">{dev.publicRepos}</span> repos
            </span>
          )}
          {langColor && dev.topLanguage && (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: langColor }} />
              {dev.topLanguage}
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <Link
            href={`/${dev.username}`}
            className="flex-1 rounded-lg bg-white/10 px-4 py-2 text-center text-sm font-medium text-white transition hover:bg-white/20"
          >
            View Profile
          </Link>
          <button
            type="button"
            onClick={() => onFollow(dev.username)}
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
// Developer list card
// ---------------------------------------------------------------------------

interface DevCardProps {
  dev: Developer;
  followingSet: Set<string>;
  onFollow: (username: string) => Promise<void>;
}

function DevCard({ dev, followingSet, onFollow }: DevCardProps) {
  const isFollowing = followingSet.has(dev.username);
  const langColor = dev.topLanguage ? (LANGUAGE_COLORS[dev.topLanguage] ?? '#8b949e') : null;

  return (
    <div className="group flex items-center gap-4 rounded-xl border border-white/8 bg-white/[0.03] px-5 py-4 transition hover:border-white/18 hover:bg-white/[0.06]">
      <Link href={`/${dev.username}`} className="flex-shrink-0">
        {dev.avatar ? (
          <Image
            src={dev.avatar}
            alt={dev.username}
            width={44}
            height={44}
            className="h-11 w-11 rounded-full object-cover transition group-hover:ring-2 group-hover:ring-white/15"
            unoptimized
          />
        ) : (
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-600 text-sm font-bold text-white transition group-hover:ring-2 group-hover:ring-white/15">
            {avatarInitials(dev)}
          </div>
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/${dev.username}`}
            className="text-sm font-semibold text-white transition hover:text-blue-400"
          >
            {dev.displayName || dev.username}
          </Link>
          {dev.isVerified && (
            <svg className="h-3.5 w-3.5 flex-shrink-0 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8.603 3.799A4.49 4.49 0 0 1 12 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 0 1 3.498 1.307 4.491 4.491 0 0 1 1.307 3.497A4.49 4.49 0 0 1 21.75 12a4.49 4.49 0 0 1-1.549 3.397 4.491 4.491 0 0 1-1.307 3.497 4.491 4.491 0 0 1-3.497 1.307A4.49 4.49 0 0 1 12 21.75a4.49 4.49 0 0 1-3.397-1.549 4.49 4.49 0 0 1-3.498-1.306 4.491 4.491 0 0 1-1.307-3.498A4.49 4.49 0 0 1 2.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 0 1 1.307-3.497 4.49 4.49 0 0 1 3.497-1.307Zm7.007 6.387a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" />
            </svg>
          )}
          {langColor && dev.topLanguage && (
            <span className="hidden items-center gap-1 sm:flex">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: langColor }} />
              <span className="text-xs text-white/40">{dev.topLanguage}</span>
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-white/45">
          {dev.bio ? truncate(dev.bio, 90) : dev.location || `@${dev.username}`}
        </p>
      </div>

      <div className="hidden flex-shrink-0 items-center gap-5 text-xs text-white/45 sm:flex">
        <span>
          <span className="font-medium text-white/70">{formatCount(dev.followers)}</span>{' '}
          followers
        </span>
        {dev.publicRepos !== undefined && (
          <span className="hidden lg:block">
            <span className="font-medium text-white/70">{dev.publicRepos}</span> repos
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => onFollow(dev.username)}
        className={`flex-shrink-0 rounded-lg border px-4 py-1.5 text-xs font-medium transition ${
          isFollowing
            ? 'border-white/10 bg-white/5 text-white/40'
            : 'border-white/12 bg-white/5 text-white/75 hover:border-white/25 hover:bg-white/10'
        }`}
      >
        {isFollowing ? 'Following' : 'Follow'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ExploreDevelopersPage() {
  const [languageFilter, setLanguageFilter] = useState<LanguageFilter>('All');
  const [sortBy, setSortBy] = useState<SortBy>('followers');
  const [followingOnly, setFollowingOnly] = useState(false);

  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const isFetchingRef = useRef(false);

  const featuredDevelopers = developers.filter((d) => d.isVerified).slice(0, 3);

  const fetchPage = useCallback(
    async (
      lang: LanguageFilter,
      sort: SortBy,
      followingOnlyFlag: boolean,
      nextCursor: string | undefined,
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
        const params: Record<string, string | number | boolean> = {
          sort,
          limit: PAGE_SIZE,
        };
        if (lang !== 'All') params.language = lang.toLowerCase();
        if (followingOnlyFlag) params.following = true;
        if (nextCursor) params.cursor = nextCursor;

        const { data } = await api.get<DevelopersApiResponse>('/v1/users', { params });

        const raw: unknown[] =
          (data?.users as unknown[]) ||
          (data?.developers as unknown[]) ||
          (data?.data as unknown[]) ||
          [];

        const normalized = raw.map(normalizeDeveloper);

        // Pre-populate followingSet from server data
        const serverFollowing = normalized.filter((d) => d.isFollowing).map((d) => d.username);
        if (serverFollowing.length > 0) {
          setFollowingSet((prev) => {
            const next = new Set(prev);
            serverFollowing.forEach((u) => next.add(u));
            return next;
          });
        }

        setDevelopers((prev) => (append ? [...prev, ...normalized] : normalized));
        setHasMore(data?.hasMore ?? normalized.length === PAGE_SIZE);
        setCursor(data?.nextCursor);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Failed to load developers.';
        setError(message);
        if (!append) setDevelopers([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
        isFetchingRef.current = false;
      }
    },
    [],
  );

  useEffect(() => {
    setCursor(undefined);
    setHasMore(true);
    fetchPage(languageFilter, sortBy, followingOnly, undefined, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageFilter, sortBy, followingOnly]);

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && hasMore && !loading && !loadingMore) {
          fetchPage(languageFilter, sortBy, followingOnly, cursor, true);
        }
      },
      { rootMargin: '200px' },
    );

    const sentinel = sentinelRef.current;
    if (sentinel) observerRef.current.observe(sentinel);

    return () => observerRef.current?.disconnect();
  }, [hasMore, loading, loadingMore, cursor, languageFilter, sortBy, followingOnly, fetchPage]);

  const handleFollow = useCallback(async (username: string) => {
    setFollowingSet((prev) => {
      const next = new Set(prev);
      if (next.has(username)) next.delete(username);
      else next.add(username);
      return next;
    });
    try {
      const isNowFollowing = !followingSet.has(username);
      if (isNowFollowing) {
        await api.post(`/v1/users/${username}/follow`);
      } else {
        await api.delete(`/v1/users/${username}/follow`);
      }
    } catch {
      // Revert optimistic update
      setFollowingSet((prev) => {
        const next = new Set(prev);
        if (next.has(username)) next.delete(username);
        else next.add(username);
        return next;
      });
    }
  }, [followingSet]);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="mx-auto max-w-5xl px-4 py-8">

        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-white">Discover Developers</h1>
          <p className="mt-1 text-sm text-white/50">
            Find and follow talented developers from the Gitgram community
          </p>
        </div>

        {/* Featured (verified) developers */}
        {!loading && featuredDevelopers.length > 0 && (
          <div className="mb-10">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/40">
              Featured Developers
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featuredDevelopers.map((dev, i) => (
                <FeaturedDevCard
                  key={dev.id}
                  dev={dev}
                  gradientIndex={i}
                  followingSet={followingSet}
                  onFollow={handleFollow}
                />
              ))}
            </div>
          </div>
        )}

        {/* Filter bar */}
        <div className="mb-6 space-y-3">

          {/* Row 1: sort + following toggle */}
          <div className="flex flex-wrap items-center gap-3">
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

            <button
              type="button"
              onClick={() => setFollowingOnly((v) => !v)}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-medium transition ${
                followingOnly
                  ? 'border-blue-500/40 bg-blue-500/15 text-blue-300'
                  : 'border-white/8 bg-white/[0.03] text-white/50 hover:border-white/15 hover:text-white/80'
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
              </svg>
              Following only
            </button>
          </div>

          {/* Row 2: language specialization filter */}
          <div className="flex flex-wrap gap-1.5">
            {LANGUAGE_OPTIONS.map((lang) => {
              const color = lang !== 'All' ? LANGUAGE_COLORS[lang] : undefined;
              const active = languageFilter === lang;
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLanguageFilter(lang)}
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
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Developer list */}
        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : developers.length > 0 ? (
          <>
            <div className="flex flex-col gap-2">
              {developers.map((dev) => (
                <DevCard
                  key={dev.id}
                  dev={dev}
                  followingSet={followingSet}
                  onFollow={handleFollow}
                />
              ))}
              {loadingMore &&
                Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonCard key={`more-${i}`} />
                ))}
            </div>
            <div ref={sentinelRef} className="h-px" />
            {!hasMore && developers.length > 0 && (
              <p className="mt-10 text-center text-sm text-white/30">
                All developers loaded
              </p>
            )}
          </>
        ) : (
          <div className="py-20 text-center">
            <svg
              className="mx-auto mb-4 h-12 w-12 text-white/20"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </svg>
            <p className="text-white/40">No developers found for the current filters.</p>
            <p className="mt-2 text-sm text-white/25">
              Try a different language or sort option.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
