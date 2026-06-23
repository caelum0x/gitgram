'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useInfiniteQuery, useMutation } from '@tanstack/react-query'
import Link from 'next/link'
import { reelService } from '@/services/reelService'
import { userService } from '@/services/userService'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReelUser {
  id: string
  username: string
  displayName?: string
  avatarUrl?: string
  avatar?: string
}

interface ReelRepository {
  id: string
  owner: string
  name: string
  fullName?: string
}

interface CodeReel {
  id: string
  title: string
  description?: string
  caption?: string
  language?: string
  codeSnippet?: string
  videoUrl?: string
  thumbnailUrl?: string
  hashtags: string[]
  likesCount: number
  commentsCount: number
  sharesCount: number
  isLiked?: boolean
  user: ReelUser
  repository?: ReelRepository | null
}

interface FeedPage {
  reels: CodeReel[]
  nextCursor?: string | null
  hasMore?: boolean
}

// ─── Language badge colours ───────────────────────────────────────────────────

const LANGUAGE_COLOURS: Record<string, string> = {
  typescript: '#3178c6',
  javascript: '#f7df1e',
  python: '#3572A5',
  rust: '#dea584',
  go: '#00ADD8',
  java: '#b07219',
  cpp: '#f34b7d',
  'c++': '#f34b7d',
  c: '#555555',
  ruby: '#701516',
  swift: '#ffac45',
  kotlin: '#A97BFF',
  php: '#4F5D95',
  html: '#e34c26',
  css: '#563d7c',
  shell: '#89e051',
  bash: '#89e051',
  sql: '#e38c00',
  graphql: '#e10098',
  yaml: '#cb171e',
  json: '#8bc34a',
}

function getLanguageColour(lang: string): string {
  return LANGUAGE_COLOURS[lang.toLowerCase()] ?? '#8b949e'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function resolveSnippet(reel: CodeReel): string {
  if (reel.codeSnippet) return reel.codeSnippet
  return reel.description ?? reel.caption ?? '// No code snippet provided'
}

function resolveTitle(reel: CodeReel): string {
  return reel.title ?? reel.caption ?? reel.description ?? 'Untitled Reel'
}

function resolveAvatar(user: ReelUser): string | undefined {
  return user.avatarUrl ?? user.avatar
}

// ─── Code Block ───────────────────────────────────────────────────────────────

interface CodeDisplayProps {
  code: string
  language: string
}

function CodeDisplay({ code, language }: CodeDisplayProps) {
  const lines = code.split('\n')

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div
        className="absolute inset-0 overflow-y-auto overflow-x-hidden"
        style={{ scrollbarWidth: 'none' }}
      >
        <pre
          className="text-sm leading-relaxed font-mono p-6 pt-8 select-none"
          style={{ color: '#c9d1d9', minHeight: '100%' }}
        >
          {lines.map((line, i) => (
            <div key={i} className="flex gap-4 group">
              <span
                className="select-none flex-shrink-0 w-6 text-right"
                style={{ color: '#30363d' }}
              >
                {i + 1}
              </span>
              <span className="flex-1 whitespace-pre">{line || ' '}</span>
            </div>
          ))}
        </pre>
        {/* Language-tinted bottom fade */}
        <div
          className="sticky bottom-0 left-0 right-0 h-16 pointer-events-none"
          style={{
            background: `linear-gradient(to bottom, transparent, #0d1117)`,
          }}
        />
      </div>
      {/* Language watermark */}
      <div
        className="absolute bottom-4 right-4 text-xs font-mono uppercase tracking-widest opacity-20 pointer-events-none"
        style={{ color: getLanguageColour(language) }}
      >
        {language}
      </div>
    </div>
  )
}

// ─── Timer ring ───────────────────────────────────────────────────────────────

interface TimerRingProps {
  progress: number
}

function TimerRing({ progress }: TimerRingProps) {
  const circumference = 2 * Math.PI * 16
  const offset = circumference - (progress / 100) * circumference

  return (
    <svg width="40" height="40" className="rotate-[-90deg]">
      <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2.5" />
      <circle
        cx="20"
        cy="20"
        r="16"
        fill="none"
        stroke="white"
        strokeWidth="2.5"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1s linear' }}
      />
    </svg>
  )
}

// ─── Reel Card ────────────────────────────────────────────────────────────────

const AUTO_ADVANCE_SECONDS = 30

interface ReelCardProps {
  reel: CodeReel
  isActive: boolean
  onAdvance: () => void
}

function ReelCard({ reel, isActive, onAdvance }: ReelCardProps) {
  const [isLiked, setIsLiked] = useState(reel.isLiked ?? false)
  const [likesCount, setLikesCount] = useState(reel.likesCount ?? 0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(AUTO_ADVANCE_SECONDS)
  const [timerPaused, setTimerPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Reset and start timer when active
  useEffect(() => {
    if (!isActive) {
      if (timerRef.current) clearInterval(timerRef.current)
      setSecondsLeft(AUTO_ADVANCE_SECONDS)
      setTimerPaused(false)
      return
    }

    setSecondsLeft(AUTO_ADVANCE_SECONDS)
    timerRef.current = setInterval(() => {
      if (timerPaused) return
      setSecondsLeft((s) => {
        if (s <= 1) {
          onAdvance()
          return AUTO_ADVANCE_SECONDS
        }
        return s - 1
      })
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive])

  // Pause/resume timer separately without restarting the interval
  useEffect(() => {
    if (!isActive) return
    if (timerPaused && timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    } else if (!timerPaused && !timerRef.current) {
      timerRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            onAdvance()
            return AUTO_ADVANCE_SECONDS
          }
          return s - 1
        })
      }, 1000)
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [timerPaused, isActive, onAdvance])

  const timerProgress = ((AUTO_ADVANCE_SECONDS - secondsLeft) / AUTO_ADVANCE_SECONDS) * 100

  const likeMutation = useMutation({
    mutationFn: () => reelService.likeReel(reel.id),
    onMutate: () => {
      const wasLiked = isLiked
      setIsLiked(!wasLiked)
      setLikesCount((c) => (wasLiked ? c - 1 : c + 1))
      return { wasLiked }
    },
    onError: (_err: unknown, _vars: unknown, context: { wasLiked: boolean } | undefined) => {
      if (context) {
        setIsLiked(context.wasLiked)
        setLikesCount((c) => (context.wasLiked ? c + 1 : c - 1))
      }
    },
  })

  const followMutation = useMutation({
    mutationFn: () =>
      isFollowing ? userService.unfollow(reel.user.id) : userService.follow(reel.user.id),
    onMutate: () => setIsFollowing((f) => !f),
    onError: () => setIsFollowing((f) => !f),
  })

  const handleShare = useCallback(async () => {
    try {
      await reelService.shareReel(reel.id, 'copy_link')
      const url = `${window.location.origin}/reel/${reel.id}`
      if (navigator.share) {
        await navigator.share({ url })
      } else {
        await navigator.clipboard.writeText(url)
      }
    } catch {
      // Share cancelled or clipboard unavailable
    }
  }, [reel.id])

  const language = reel.language ?? 'code'
  const code = resolveSnippet(reel)
  const title = resolveTitle(reel)
  const avatar = resolveAvatar(reel.user)
  const langColour = getLanguageColour(language)

  return (
    <div className="relative h-screen w-full snap-start flex flex-col overflow-hidden select-none">
      {/* ── Background: dark code editor feel ── */}
      <div className="absolute inset-0" style={{ background: '#0d1117' }} />

      {/* Subtle language-tinted top bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1 z-30 opacity-80"
        style={{ background: langColour }}
      />

      {/* ── Language badge (top-left) ── */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
        <span
          className="px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wide"
          style={{
            background: `${langColour}22`,
            color: langColour,
            border: `1px solid ${langColour}55`,
          }}
        >
          {language}
        </span>
      </div>

      {/* ── Timer ring + pause toggle (top-right) ── */}
      {isActive && (
        <button
          onClick={() => setTimerPaused((p) => !p)}
          aria-label={timerPaused ? 'Resume auto-advance' : 'Pause auto-advance'}
          className="absolute top-3 right-3 z-20 flex items-center justify-center"
        >
          <TimerRing progress={timerProgress} />
          <span className="absolute text-[10px] font-mono text-white/70">{secondsLeft}</span>
        </button>
      )}

      {/* ── Code block: 60 vh ── */}
      <div
        className="absolute left-0 right-0 top-0 z-10"
        style={{ height: '62vh' }}
        onClick={() => setTimerPaused((p) => !p)}
      >
        {/* Top safe area */}
        <div className="h-12" />
        <div className="h-full overflow-hidden">
          <CodeDisplay code={code} language={language} />
        </div>
      </div>

      {/* ── Horizontal divider ── */}
      <div
        className="absolute left-4 right-4 z-10"
        style={{ top: '62vh', height: '1px', background: '#21262d' }}
      />

      {/* ── Bottom info bar ── */}
      <div
        className="absolute left-0 right-0 bottom-0 z-10 flex flex-col justify-end"
        style={{ top: '62vh', padding: '14px 14px 24px 14px' }}
      >
        {/* Author row */}
        <Link
          href={`/${reel.user.username}`}
          className="flex items-center gap-2.5 mb-2 group w-fit"
        >
          {avatar ? (
            <img
              src={avatar}
              alt={reel.user.username}
              className="w-8 h-8 rounded-full border border-white/20 object-cover flex-shrink-0"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
              style={{ background: '#21262d' }}
            >
              {reel.user.username[0]?.toUpperCase()}
            </div>
          )}
          <span className="text-white/90 text-sm font-semibold group-hover:text-white transition-colors">
            @{reel.user.username}
          </span>
          {!isFollowing && (
            <button
              onClick={(e) => {
                e.preventDefault()
                followMutation.mutate()
              }}
              className="ml-1 px-2 py-0.5 rounded text-xs font-medium"
              style={{
                background: '#238636',
                color: 'white',
                border: '1px solid #2ea043',
              }}
            >
              Follow
            </button>
          )}
        </Link>

        {/* Title */}
        <h2 className="text-white font-bold text-base leading-snug mb-1 line-clamp-2 pr-14">
          {title}
        </h2>

        {/* Description */}
        {reel.description && reel.description !== title && (
          <p className="text-white/60 text-xs leading-snug line-clamp-2 pr-14 mb-1.5">
            {reel.description}
          </p>
        )}

        {/* Repo link */}
        {reel.repository && (
          <Link
            href={`/${reel.repository.owner}/${reel.repository.name}`}
            className="inline-flex items-center gap-1.5 mb-1.5 w-fit group"
          >
            <svg
              className="w-3.5 h-3.5 text-white/40 group-hover:text-white/70 transition-colors"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            <span className="text-white/40 text-xs group-hover:text-white/70 transition-colors font-mono">
              {reel.repository.fullName ?? `${reel.repository.owner}/${reel.repository.name}`}
            </span>
          </Link>
        )}

        {/* Hashtags */}
        {reel.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {reel.hashtags.slice(0, 4).map((tag) => (
              <Link
                key={tag}
                href={`/hashtag/${tag.replace(/^#/, '')}`}
                className="text-xs font-medium transition-colors"
                style={{ color: '#58a6ff' }}
              >
                #{tag.replace(/^#/, '')}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── Right sidebar actions ── */}
      <div
        className="absolute right-3 z-20 flex flex-col items-center gap-5"
        style={{ top: '62vh', transform: 'translateY(-50%)' }}
      >
        {/* Author avatar */}
        <Link href={`/${reel.user.username}`} className="relative">
          {avatar ? (
            <img
              src={avatar}
              alt={reel.user.username}
              className="w-11 h-11 rounded-full border-2 border-white/30 object-cover"
            />
          ) : (
            <div
              className="w-11 h-11 rounded-full border-2 border-white/30 flex items-center justify-center text-white text-sm font-bold"
              style={{ background: '#21262d' }}
            >
              {reel.user.username[0]?.toUpperCase()}
            </div>
          )}
          {/* Follow indicator dot */}
          {!isFollowing && (
            <div
              className="absolute -bottom-1 -right-0.5 w-4 h-4 rounded-full border-2 border-[#0d1117] flex items-center justify-center"
              style={{ background: '#238636' }}
            >
              <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
          )}
        </Link>

        {/* Like */}
        <button
          onClick={() => likeMutation.mutate(undefined)}
          aria-label={isLiked ? 'Unlike' : 'Like'}
          className="flex flex-col items-center gap-1"
        >
          <div className={`p-2 rounded-full transition-transform active:scale-90 ${isLiked ? 'text-red-400' : 'text-white/80'}`}>
            <svg
              className="w-6 h-6 drop-shadow"
              fill={isLiked ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth={isLiked ? 0 : 2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
              />
            </svg>
          </div>
          <span className="text-white/70 text-xs font-medium drop-shadow">{formatCount(likesCount)}</span>
        </button>

        {/* Comments */}
        <Link href={`/reel/${reel.id}`} aria-label="Comments" className="flex flex-col items-center gap-1">
          <div className="p-2 rounded-full text-white/80">
            <svg className="w-6 h-6 drop-shadow" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <span className="text-white/70 text-xs font-medium drop-shadow">{formatCount(reel.commentsCount ?? 0)}</span>
        </Link>

        {/* Share */}
        <button onClick={handleShare} aria-label="Share" className="flex flex-col items-center gap-1">
          <div className="p-2 rounded-full text-white/80">
            <svg className="w-6 h-6 drop-shadow" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </div>
          <span className="text-white/70 text-xs font-medium drop-shadow">{formatCount(reel.sharesCount ?? 0)}</span>
        </button>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReelsPage() {
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const observerRef = useRef<IntersectionObserver | null>(null)

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery<FeedPage>({
    queryKey: ['reels', 'feed'],
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam as string | undefined
      const url = cursor
        ? `/api/v1/reels/feed?cursor=${encodeURIComponent(cursor)}&limit=5`
        : '/api/v1/reels/feed?limit=5'
      const response = await fetch(url, { credentials: 'include' })
      if (!response.ok) throw new Error(`Failed to fetch reels: ${response.status}`)
      const json = (await response.json()) as {
        reels?: CodeReel[]
        data?: CodeReel[]
        nextCursor?: string | null
        hasMore?: boolean
        meta?: { nextCursor?: string | null; hasMore?: boolean }
      }
      return {
        reels: json.reels ?? json.data ?? [],
        nextCursor: json.nextCursor ?? json.meta?.nextCursor ?? null,
        hasMore: json.hasMore ?? json.meta?.hasMore ?? false,
      }
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })

  const allReels: CodeReel[] = data?.pages.flatMap((p) => p.reels) ?? []

  // Scroll to a reel by index
  const scrollToIndex = useCallback((index: number) => {
    const el = cardRefs.current.get(index)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const goNext = useCallback(() => {
    setActiveIndex((i) => {
      const next = Math.min(i + 1, allReels.length - 1)
      scrollToIndex(next)
      return next
    })
  }, [allReels.length, scrollToIndex])

  const goPrev = useCallback(() => {
    setActiveIndex((i) => {
      const prev = Math.max(i - 1, 0)
      scrollToIndex(prev)
      return prev
    })
  }, [scrollToIndex])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'j') goNext()
      if (e.key === 'ArrowUp' || e.key === 'k') goPrev()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [goNext, goPrev])

  // IntersectionObserver — track active reel
  useEffect(() => {
    observerRef.current?.disconnect()
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = Number((entry.target as HTMLElement).dataset.index)
            if (!Number.isNaN(idx)) setActiveIndex(idx)
          }
        }
      },
      { threshold: 0.7 }
    )
    cardRefs.current.forEach((el) => observerRef.current?.observe(el))
    return () => observerRef.current?.disconnect()
  }, [allReels.length])

  // Fetch next page when near the end
  useEffect(() => {
    if (activeIndex >= allReels.length - 2 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [activeIndex, allReels.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  const setCardRef = useCallback((el: HTMLDivElement | null, index: number) => {
    if (el) {
      el.dataset.index = String(index)
      cardRefs.current.set(index, el)
      observerRef.current?.observe(el)
    } else {
      const existing = cardRefs.current.get(index)
      if (existing) {
        observerRef.current?.unobserve(existing)
        cardRefs.current.delete(index)
      }
    }
  }, [])

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#0d1117' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          <p className="text-white/50 text-sm font-mono">loading reels...</p>
        </div>
      </div>
    )
  }

  // ── Error state ──
  if (isError) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#0d1117' }}>
        <div className="text-center px-6">
          <p className="text-white text-lg font-semibold mb-2">Something went wrong</p>
          <p className="text-white/50 text-sm">Could not load reels. Please try again.</p>
        </div>
      </div>
    )
  }

  // ── Empty state ──
  if (allReels.length === 0) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#0d1117' }}>
        <div className="text-center px-6">
          <svg className="w-12 h-12 mx-auto mb-4 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          <p className="text-white text-base font-semibold mb-2">No code reels yet</p>
          <p className="text-white/50 text-sm mb-4">Be the first to share a code demo.</p>
          <Link
            href="/reels/create"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: '#238636' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create a Reel
          </Link>
        </div>
      </div>
    )
  }

  // ── Main feed ──
  return (
    <>
      {/* Hide scrollbar globally while on reels page */}
      <style>{`
        body { overflow: hidden !important; }
        .reels-feed::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Back / home button */}
      <Link
        href="/"
        aria-label="Back to home"
        className="fixed top-4 left-4 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white/70 hover:text-white transition-colors"
        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        <span className="hidden sm:inline">Home</span>
      </Link>

      {/* Create reel shortcut */}
      <Link
        href="/reels/create"
        aria-label="Create reel"
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold text-white shadow-lg"
        style={{ background: '#238636', border: '1px solid #2ea043' }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Post a reel
      </Link>

      {/* Progress indicator */}
      <div className="fixed right-1.5 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-1">
        {allReels.map((_, i) => (
          <button
            key={i}
            onClick={() => scrollToIndex(i)}
            aria-label={`Go to reel ${i + 1}`}
            className="rounded-full transition-all"
            style={{
              width: 4,
              height: i === activeIndex ? 16 : 4,
              background: i === activeIndex ? 'white' : 'rgba(255,255,255,0.25)',
            }}
          />
        ))}
      </div>

      {/* Scroll container */}
      <div
        ref={containerRef}
        className="reels-feed fixed inset-0 overflow-y-scroll snap-y snap-mandatory"
        style={{ scrollbarWidth: 'none' }}
      >
        {allReels.map((reel, index) => (
          <div
            key={reel.id}
            ref={(el) => setCardRef(el, index)}
            className="h-screen w-full snap-start"
          >
            <ReelCard
              reel={reel}
              isActive={activeIndex === index}
              onAdvance={goNext}
            />
          </div>
        ))}

        {isFetchingNextPage && (
          <div
            className="h-screen w-full snap-start flex items-center justify-center"
            style={{ background: '#0d1117' }}
          >
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {!hasNextPage && allReels.length > 0 && (
          <div
            className="h-24 w-full flex items-center justify-center"
            style={{ background: '#0d1117' }}
          >
            <p className="text-white/30 text-sm font-mono">// end of feed</p>
          </div>
        )}
      </div>
    </>
  )
}
