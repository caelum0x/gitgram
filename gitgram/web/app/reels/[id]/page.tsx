'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import Image from 'next/image'
import { reelService } from '@/services/reelService'
import { userService } from '@/services/userService'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReelAuthor {
  id: string
  username: string
  displayName?: string
  avatarUrl?: string
  avatar?: string
  bio?: string
  isFollowing?: boolean
}

interface Reel {
  id: string
  title: string
  code?: string
  codeSnippet?: string
  language?: string
  author?: ReelAuthor
  user?: ReelAuthor
  likesCount: number
  commentsCount: number
  isLiked?: boolean
  createdAt: string
  description?: string
  caption?: string
}

interface Comment {
  id: string
  content: string
  text?: string
  createdAt: string
  user?: ReelAuthor
  author?: ReelAuthor
}

interface RelatedReel {
  id: string
  title: string
  code?: string
  codeSnippet?: string
  language?: string
  likesCount: number
  user?: ReelAuthor
  author?: ReelAuthor
}

// ─── Language colours ─────────────────────────────────────────────────────────

const LANG_COLOURS: Record<string, { bg: string; text: string }> = {
  typescript:  { bg: '#1a2e4a', text: '#3b82f6' },
  javascript:  { bg: '#2e2a00', text: '#f7df1e' },
  python:      { bg: '#1a2e3b', text: '#4ec9b0' },
  rust:        { bg: '#2e1e10', text: '#dea584' },
  go:          { bg: '#003a40', text: '#00ADD8' },
  java:        { bg: '#2e1a00', text: '#e57c13' },
  cpp:         { bg: '#2e0012', text: '#f34b7d' },
  'c++':       { bg: '#2e0012', text: '#f34b7d' },
  c:           { bg: '#222222', text: '#a0a0a0' },
  ruby:        { bg: '#2e0000', text: '#cc342d' },
  swift:       { bg: '#2e1a00', text: '#ffac45' },
  kotlin:      { bg: '#1e1030', text: '#A97BFF' },
  php:         { bg: '#0d0f20', text: '#7e7fba' },
  html:        { bg: '#2e1000', text: '#e34c26' },
  css:         { bg: '#12001a', text: '#563d7c' },
  shell:       { bg: '#0a1a0a', text: '#89e051' },
  bash:        { bg: '#0a1a0a', text: '#89e051' },
  sql:         { bg: '#1a1000', text: '#e38c00' },
}

function getLangColour(lang?: string) {
  if (!lang) return { bg: '#1a1a2e', text: '#8b949e' }
  return LANG_COLOURS[lang.toLowerCase()] ?? { bg: '#1a1a2e', text: '#8b949e' }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function getCode(reel: Reel | RelatedReel): string {
  return reel.code ?? reel.codeSnippet ?? ''
}

function getAuthor(reel: Reel | RelatedReel): ReelAuthor | undefined {
  return (reel as Reel).author ?? (reel as Reel).user
}

function getAvatar(user?: ReelAuthor): string | undefined {
  return user?.avatarUrl ?? user?.avatar
}

// ─── Language badge ───────────────────────────────────────────────────────────

function LanguageBadge({ language }: { language?: string }) {
  if (!language) return null
  const { bg, text } = getLangColour(language)
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider"
      style={{ background: bg, color: text }}
    >
      {language}
    </span>
  )
}

// ─── Code Player ─────────────────────────────────────────────────────────────

interface CodePlayerProps {
  code: string
  language?: string
  title: string
}

function CodePlayer({ code, language, title }: CodePlayerProps) {
  const lines = code.split('\n')
  const [visibleLines, setVisibleLines] = useState(lines.length)
  const [playing, setPlaying] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const codeRef = useRef<HTMLPreElement>(null)

  const startPlay = useCallback(() => {
    setVisibleLines(0)
    setPlaying(true)
    let i = 0
    intervalRef.current = setInterval(() => {
      i += 1
      setVisibleLines(i)
      if (i >= lines.length) {
        clearInterval(intervalRef.current!)
        setPlaying(false)
      }
    }, 80)
  }, [lines.length])

  const pausePlay = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setPlaying(false)
  }, [])

  const togglePlay = useCallback(() => {
    if (playing) {
      pausePlay()
    } else if (visibleLines >= lines.length) {
      startPlay()
    } else {
      // resume
      setPlaying(true)
      let i = visibleLines
      intervalRef.current = setInterval(() => {
        i += 1
        setVisibleLines(i)
        if (i >= lines.length) {
          clearInterval(intervalRef.current!)
          setPlaying(false)
        }
      }, 80)
    }
  }, [playing, visibleLines, lines.length, startPlay, pausePlay])

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  // scroll to bottom as lines appear
  useEffect(() => {
    if (playing && codeRef.current) {
      codeRef.current.scrollTop = codeRef.current.scrollHeight
    }
  }, [visibleLines, playing])

  const progress = lines.length > 0 ? (visibleLines / lines.length) * 100 : 100
  const { text: langText } = getLangColour(language)

  return (
    <div className="flex flex-col h-full" style={{ background: '#0F0F1A' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500/70" />
            <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
            <span className="w-3 h-3 rounded-full bg-green-500/70" />
          </div>
          <span className="text-sm font-medium text-[var(--foreground)] truncate">{title}</span>
        </div>
        <LanguageBadge language={language} />
      </div>

      {/* Code area */}
      <div className="relative flex-1 overflow-hidden">
        <pre
          ref={codeRef}
          className="h-full overflow-y-auto p-4 text-sm leading-relaxed font-mono scrollbar-thin scrollbar-thumb-[var(--border)] scrollbar-track-transparent"
          style={{ background: '#1A1A2E', color: '#E2E8F0' }}
        >
          <code>
            {lines.slice(0, visibleLines).map((line, idx) => (
              <div
                key={idx}
                className="flex"
                style={{
                  animation: idx === visibleLines - 1 && playing ? 'fadeIn 0.05s ease-in' : undefined,
                }}
              >
                <span
                  className="select-none pr-4 text-right shrink-0 text-xs pt-0.5"
                  style={{ color: langText + '55', minWidth: '2.5rem' }}
                >
                  {idx + 1}
                </span>
                <span className="flex-1 whitespace-pre">{line || ' '}</span>
              </div>
            ))}
          </code>
        </pre>

        {/* Play / Pause overlay button */}
        <button
          onClick={togglePlay}
          className="absolute bottom-4 right-4 flex items-center justify-center w-10 h-10 rounded-full transition-all hover:scale-110 active:scale-95 shadow-lg"
          style={{ background: langText, color: '#0F0F1A' }}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect x="3" y="2" width="4" height="12" rx="1" />
              <rect x="9" y="2" width="4" height="12" rx="1" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3 2.5l11 5.5-11 5.5V2.5z" />
            </svg>
          )}
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full bg-[var(--border)] shrink-0">
        <div
          className="h-full transition-all duration-75"
          style={{ width: `${progress}%`, background: langText }}
        />
      </div>
    </div>
  )
}

// ─── Comment Item ─────────────────────────────────────────────────────────────

function CommentItem({ comment }: { comment: Comment }) {
  const author = comment.user ?? comment.author
  const avatar = getAvatar(author)
  const text = comment.content ?? comment.text ?? ''

  return (
    <div className="flex gap-3 py-3 border-b border-[var(--border)]/40 last:border-0">
      {avatar ? (
        <Image
          src={avatar}
          alt={author?.username ?? 'user'}
          width={32}
          height={32}
          className="rounded-full shrink-0 object-cover"
        />
      ) : (
        <div className="w-8 h-8 rounded-full bg-[var(--surface-secondary)] flex items-center justify-center shrink-0 text-sm font-bold text-[var(--foreground-secondary)]">
          {(author?.username ?? 'U')[0].toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <Link
            href={`/${author?.username ?? ''}`}
            className="text-sm font-semibold text-[var(--foreground)] hover:text-[var(--primary)] transition-colors"
          >
            {author?.displayName ?? author?.username ?? 'Unknown'}
          </Link>
          <span className="text-xs text-[var(--foreground-secondary)]">
            {formatRelative(comment.createdAt)}
          </span>
        </div>
        <p className="text-sm text-[var(--foreground)] mt-0.5 break-words">{text}</p>
      </div>
    </div>
  )
}

// ─── Related Reel Card ────────────────────────────────────────────────────────

function RelatedReelCard({ reel }: { reel: RelatedReel }) {
  const author = getAuthor(reel)
  const code = getCode(reel)
  const { text: langText, bg: langBg } = getLangColour(reel.language)
  const preview = code.split('\n').slice(0, 4).join('\n')

  return (
    <Link
      href={`/reels/${reel.id}`}
      className="flex gap-3 p-3 rounded-lg hover:bg-[var(--surface-secondary)] transition-colors group"
    >
      {/* Mini code preview */}
      <div
        className="w-20 h-14 rounded overflow-hidden shrink-0 flex items-start p-1.5"
        style={{ background: langBg || '#1A1A2E' }}
      >
        <pre
          className="text-[8px] leading-tight font-mono overflow-hidden"
          style={{ color: langText, opacity: 0.85 }}
        >
          {preview || '// code'}
        </pre>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--foreground)] truncate group-hover:text-[var(--primary)] transition-colors">
          {reel.title}
        </p>
        <p className="text-xs text-[var(--foreground-secondary)] truncate mt-0.5">
          @{author?.username ?? 'unknown'}
        </p>
        <div className="flex items-center gap-1 mt-1">
          <svg width="12" height="12" viewBox="0 0 16 16" className="text-red-400" fill="currentColor">
            <path d="M8 14s-6-3.9-6-8a4 4 0 0 1 6-3.4A4 4 0 0 1 14 6c0 4.1-6 8-6 8z" />
          </svg>
          <span className="text-xs text-[var(--foreground-secondary)]">{reel.likesCount}</span>
          {reel.language && (
            <span
              className="ml-1 text-[9px] px-1.5 py-0.5 rounded-full font-medium uppercase"
              style={{ background: langBg, color: langText }}
            >
              {reel.language}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReelDetailPage() {
  const params = useParams()
  const router = useRouter()
  const reelId = params.id as string
  const queryClient = useQueryClient()

  const [commentText, setCommentText] = useState('')
  const [commentPage, setCommentPage] = useState(1)
  const [allComments, setAllComments] = useState<Comment[]>([])
  const [optimisticLiked, setOptimisticLiked] = useState<boolean | null>(null)
  const [optimisticLikes, setOptimisticLikes] = useState<number | null>(null)
  const [optimisticFollowing, setOptimisticFollowing] = useState<boolean | null>(null)
  const commentInputRef = useRef<HTMLTextAreaElement>(null)

  // ── Fetch reel ──────────────────────────────────────────────────────────────

  const { data: reelData, isLoading: reelLoading, error: reelError } = useQuery({
    queryKey: ['reel', reelId],
    queryFn: () => reelService.getReel(reelId),
    enabled: Boolean(reelId),
  })

  const reel: Reel | undefined = reelData?.reel ?? reelData

  // ── Fetch comments ──────────────────────────────────────────────────────────

  const { data: commentsData, isFetching: commentsFetching } = useQuery({
    queryKey: ['reel-comments', reelId, commentPage],
    queryFn: () => reelService.getReelComments(reelId, commentPage, 20),
    enabled: Boolean(reelId),
  })

  useEffect(() => {
    if (!commentsData) return
    const incoming: Comment[] = commentsData.comments ?? []
    if (commentPage === 1) {
      setAllComments(incoming)
    } else {
      setAllComments(prev => {
        const existingIds = new Set(prev.map(c => c.id))
        return [...prev, ...incoming.filter(c => !existingIds.has(c.id))]
      })
    }
  }, [commentsData, commentPage])

  // ── Fetch related reels ─────────────────────────────────────────────────────

  const { data: relatedData } = useQuery({
    queryKey: ['related-reels', reel?.language],
    queryFn: async () => {
      const res = await reelService.getReels(1, 6)
      const all: RelatedReel[] = res?.reels ?? []
      return all.filter(r => r.id !== reelId).slice(0, 5)
    },
    enabled: Boolean(reel),
  })

  const relatedReels: RelatedReel[] = relatedData ?? []

  // ── Navigation helpers ──────────────────────────────────────────────────────

  const handlePrev = useCallback(() => router.back(), [router])
  const handleNext = useCallback(() => {
    if (relatedReels.length > 0) router.push(`/reels/${relatedReels[0].id}`)
  }, [router, relatedReels])

  // ── Like mutation ───────────────────────────────────────────────────────────

  const likeMutation = useMutation({
    mutationFn: () => reelService.likeReel(reelId),
    onMutate: () => {
      const wasLiked = optimisticLiked ?? reel?.isLiked ?? false
      const currentCount = optimisticLikes ?? reel?.likesCount ?? 0
      setOptimisticLiked(!wasLiked)
      setOptimisticLikes(wasLiked ? currentCount - 1 : currentCount + 1)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reel', reelId] })
    },
    onError: () => {
      setOptimisticLiked(null)
      setOptimisticLikes(null)
    },
  })

  // ── Follow mutation ─────────────────────────────────────────────────────────

  const followMutation = useMutation({
    mutationFn: async () => {
      const author = reel?.author ?? reel?.user
      if (!author?.id) throw new Error('No author id')
      const isFollowing = optimisticFollowing ?? author.isFollowing ?? false
      if (isFollowing) {
        await userService.unfollow(author.id)
      } else {
        await userService.follow(author.id)
      }
    },
    onMutate: () => {
      const author = reel?.author ?? reel?.user
      const current = optimisticFollowing ?? author?.isFollowing ?? false
      setOptimisticFollowing(!current)
    },
    onError: () => {
      setOptimisticFollowing(null)
    },
  })

  // ── Comment mutation ────────────────────────────────────────────────────────

  const commentMutation = useMutation({
    mutationFn: (content: string) => reelService.createReelComment(reelId, content),
    onSuccess: (data) => {
      const newComment: Comment = data?.comment ?? data
      setAllComments(prev => [newComment, ...prev])
      setCommentText('')
      queryClient.invalidateQueries({ queryKey: ['reel', reelId] })
    },
  })

  const handleCommentKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        const trimmed = commentText.trim()
        if (trimmed && !commentMutation.isPending) {
          commentMutation.mutate(trimmed)
        }
      }
    },
    [commentText, commentMutation]
  )

  // ── Share ───────────────────────────────────────────────────────────────────

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/reels/${reelId}`
    try {
      if (navigator.share) {
        await navigator.share({ title: reel?.title, url })
      } else {
        await navigator.clipboard.writeText(url)
      }
    } catch {
      // user cancelled or clipboard unavailable
    }
  }, [reelId, reel?.title])

  // ── Derived values ──────────────────────────────────────────────────────────

  const isLiked = optimisticLiked ?? reel?.isLiked ?? false
  const likesCount = optimisticLikes ?? reel?.likesCount ?? 0
  const author = reel ? getAuthor(reel) : undefined
  const isFollowing = optimisticFollowing ?? author?.isFollowing ?? false
  const code = reel ? getCode(reel) : ''
  const hasMore = (commentsData?.hasMore ?? commentsData?.pagination?.hasMore) === true

  // ── Loading / error states ──────────────────────────────────────────────────

  if (reelLoading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: '#0F0F1A' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
          <p className="text-sm text-[var(--foreground-secondary)]">Loading reel…</p>
        </div>
      </div>
    )
  }

  if (reelError || !reel) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: '#0F0F1A' }}>
        <div className="text-center">
          <p className="text-lg font-semibold text-[var(--foreground)]">Reel not found</p>
          <p className="mt-1 text-sm text-[var(--foreground-secondary)]">
            This reel may have been removed.
          </p>
          <button
            onClick={() => router.push('/reels')}
            className="mt-4 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--primary)] text-white hover:opacity-90 transition-opacity"
          >
            Browse reels
          </button>
        </div>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: '#0F0F1A' }}
    >
      {/* ── Left: Code player (2/3) ──────────────────────────────────────────── */}
      <div className="flex flex-col w-full lg:w-2/3 h-full border-r border-[var(--border)]">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] shrink-0" style={{ background: '#0F0F1A' }}>
          <button
            onClick={handlePrev}
            className="flex items-center gap-1.5 text-sm text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrev}
              className="p-1.5 rounded-lg hover:bg-[var(--surface-secondary)] transition-colors text-[var(--foreground-secondary)] hover:text-[var(--foreground)]"
              title="Previous reel"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M11 2L5 8l6 6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              onClick={handleNext}
              disabled={relatedReels.length === 0}
              className="p-1.5 rounded-lg hover:bg-[var(--surface-secondary)] transition-colors text-[var(--foreground-secondary)] hover:text-[var(--foreground)] disabled:opacity-40"
              title="Next reel"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M5 2l6 6-6 6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Code player */}
        <div className="flex-1 overflow-hidden">
          <CodePlayer code={code} language={reel.language} title={reel.title} />
        </div>
      </div>

      {/* ── Right: Sidebar (1/3) ────────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col w-1/3 h-full overflow-y-auto bg-[var(--background)]">

        {/* Author card */}
        <div className="p-5 border-b border-[var(--border)]">
          <div className="flex items-start gap-3">
            {getAvatar(author) ? (
              <Image
                src={getAvatar(author)!}
                alt={author?.username ?? 'author'}
                width={48}
                height={48}
                className="rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-[var(--surface-secondary)] flex items-center justify-center shrink-0 text-lg font-bold text-[var(--foreground-secondary)]">
                {(author?.username ?? 'U')[0].toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <Link
                href={`/${author?.username ?? ''}`}
                className="block text-sm font-semibold text-[var(--foreground)] hover:text-[var(--primary)] transition-colors truncate"
              >
                {author?.displayName ?? author?.username ?? 'Unknown'}
              </Link>
              <p className="text-xs text-[var(--foreground-secondary)] truncate">
                @{author?.username ?? 'unknown'}
              </p>
              {author?.bio && (
                <p className="text-xs text-[var(--foreground-secondary)] mt-1 line-clamp-2">
                  {author.bio}
                </p>
              )}
            </div>
            <button
              onClick={() => followMutation.mutate()}
              disabled={followMutation.isPending}
              className={`shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                isFollowing
                  ? 'bg-[var(--surface-secondary)] text-[var(--foreground)] border border-[var(--border)] hover:bg-red-900/30 hover:text-red-400 hover:border-red-400/30'
                  : 'bg-[var(--accent)] text-white hover:opacity-90'
              }`}
            >
              {isFollowing ? 'Following' : 'Follow'}
            </button>
          </div>
        </div>

        {/* Like & Share */}
        <div className="flex items-center gap-4 px-5 py-3.5 border-b border-[var(--border)]">
          <button
            onClick={() => likeMutation.mutate()}
            disabled={likeMutation.isPending}
            className="flex items-center gap-2 transition-transform active:scale-90"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 16 16"
              fill={isLiked ? '#f87171' : 'none'}
              stroke={isLiked ? '#f87171' : '#8b949e'}
              strokeWidth="1.25"
              className="transition-all"
            >
              <path d="M8 14s-6-3.9-6-8a4 4 0 0 1 6-3.4A4 4 0 0 1 14 6c0 4.1-6 8-6 8z" />
            </svg>
            <span className={`text-sm font-semibold ${isLiked ? 'text-red-400' : 'text-[var(--foreground-secondary)]'}`}>
              {likesCount.toLocaleString()}
            </span>
          </button>

          <button
            onClick={handleShare}
            className="flex items-center gap-2 text-[var(--foreground-secondary)] hover:text-[var(--primary)] transition-colors ml-auto"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25">
              <circle cx="12" cy="3" r="1.5" />
              <circle cx="4" cy="8" r="1.5" />
              <circle cx="12" cy="13" r="1.5" />
              <line x1="10.5" y1="3.75" x2="5.5" y2="7.25" />
              <line x1="10.5" y1="12.25" x2="5.5" y2="8.75" />
            </svg>
            <span className="text-sm font-medium">Share</span>
          </button>
        </div>

        {/* Comments section */}
        <div className="flex flex-col flex-1 min-h-0">
          <div className="px-5 py-3 border-b border-[var(--border)] shrink-0">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              Comments
              {reel.commentsCount > 0 && (
                <span className="ml-1.5 text-xs text-[var(--foreground-secondary)] font-normal">
                  ({reel.commentsCount})
                </span>
              )}
            </h3>
          </div>

          {/* Comment input */}
          <div className="px-5 py-3 border-b border-[var(--border)] shrink-0">
            <div className="flex gap-2">
              <textarea
                ref={commentInputRef}
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={handleCommentKeyDown}
                placeholder="Add a comment… (Enter to post)"
                rows={2}
                className="flex-1 resize-none bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--foreground-secondary)] focus:outline-none focus:border-[var(--primary)] transition-colors"
              />
              <button
                onClick={() => {
                  const trimmed = commentText.trim()
                  if (trimmed && !commentMutation.isPending) commentMutation.mutate(trimmed)
                }}
                disabled={!commentText.trim() || commentMutation.isPending}
                className="self-end px-3 py-2 rounded-lg text-xs font-semibold bg-[var(--primary)] text-white hover:opacity-90 disabled:opacity-40 transition-all"
              >
                Post
              </button>
            </div>
          </div>

          {/* Comment list */}
          <div className="flex-1 overflow-y-auto px-5">
            {allComments.length === 0 && !commentsFetching && (
              <p className="text-sm text-[var(--foreground-secondary)] text-center py-6">
                No comments yet. Be the first!
              </p>
            )}
            {allComments.map(comment => (
              <CommentItem key={comment.id} comment={comment} />
            ))}
            {commentsFetching && (
              <div className="flex justify-center py-4">
                <div className="w-5 h-5 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin" />
              </div>
            )}
            {hasMore && !commentsFetching && (
              <button
                onClick={() => setCommentPage(p => p + 1)}
                className="w-full py-2.5 text-xs font-medium text-[var(--primary)] hover:text-[var(--foreground)] transition-colors"
              >
                Load more comments
              </button>
            )}
          </div>
        </div>

        {/* Related reels */}
        {relatedReels.length > 0 && (
          <div className="border-t border-[var(--border)] shrink-0">
            <div className="px-5 py-3 border-b border-[var(--border)]">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">Related reels</h3>
            </div>
            <div className="pb-4">
              {relatedReels.map(r => (
                <RelatedReelCard key={r.id} reel={r} />
              ))}
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(2px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .scrollbar-thin::-webkit-scrollbar { width: 4px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
      `}</style>
    </div>
  )
}
