'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TimePeriod = 'week' | 'month' | 'all'
type Category = 'contributions' | 'followed' | 'repos' | 'snippets'

interface LeaderboardDeveloper {
  rank: number
  id: string
  username: string
  displayName?: string
  avatar?: string
  verified?: boolean
  contributionCount: number
  trend: 'up' | 'down' | 'same'
  trendDelta: number
  languages: string[]
}

interface FollowedLeaderEntry {
  rank: number
  id: string
  username: string
  displayName?: string
  avatar?: string
  verified?: boolean
  newFollowers: number
  totalFollowers: number
}

interface TopRepoEntry {
  rank: number
  id: string
  owner: string
  name: string
  fullName: string
  description?: string
  starsGained: number
  totalStars: number
  language?: string
}

interface TopSnippetEntry {
  rank: number
  id: string
  title: string
  author: string
  authorAvatar?: string
  likes: number
  language: string
  preview: string
}

interface ApiDeveloper {
  id: string
  username: string
  displayName?: string
  avatar?: string
  verified?: boolean
  contributionCount?: number
  contributions?: number
  rank?: number
  trend?: 'up' | 'down' | 'same'
  trendDelta?: number
  languages?: string[]
}

interface ApiFollowedEntry {
  id: string
  username: string
  displayName?: string
  avatar?: string
  verified?: boolean
  newFollowers?: number
  followersGained?: number
  totalFollowers?: number
  followersCount?: number
}

interface ApiRepoEntry {
  id: string
  owner?: string
  name?: string
  fullName?: string
  full_name?: string
  description?: string
  starsGained?: number
  starsThisPeriod?: number
  totalStars?: number
  stars?: number
  language?: string
}

interface ApiSnippetEntry {
  id: string
  title?: string
  author?: string | { username: string; avatar?: string }
  authorAvatar?: string
  likes?: number
  likesCount?: number
  language?: string
  preview?: string
  content?: string
}

interface UserRankInfo {
  rank: number
  category: Category
  period: TimePeriod
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLORS = {
  bg: '#0F0F1A',
  surface: '#1A1A2E',
  surfaceHover: '#22223A',
  border: '#2D2D50',
  borderHover: 'rgba(124,58,237,0.5)',
  primary: '#7C3AED',
  primaryLight: 'rgba(124,58,237,0.15)',
  text: '#E2E8F0',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  gold: '#F59E0B',
  goldBg: 'rgba(245,158,11,0.12)',
  silver: '#94A3B8',
  silverBg: 'rgba(148,163,184,0.12)',
  bronze: '#D97706',
  bronzeBg: 'rgba(217,119,6,0.12)',
  upTrend: '#22C55E',
  downTrend: '#EF4444',
  sameTrend: '#64748B',
} as const

const TIME_PERIODS: { label: string; value: TimePeriod }[] = [
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'All Time', value: 'all' },
]

const CATEGORIES: { label: string; value: Category; icon: string }[] = [
  { label: 'Contributions', value: 'contributions', icon: '⚡' },
  { label: 'Most Followed', value: 'followed', icon: '👥' },
  { label: 'Top Repos', value: 'repos', icon: '📦' },
  { label: 'Top Snippets', value: 'snippets', icon: '💻' },
]

const LANGUAGE_COLORS: Record<string, string> = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572A5',
  Go: '#00ADD8',
  Rust: '#dea584',
  Java: '#b07219',
  'C++': '#f34b7d',
  'C#': '#178600',
  Ruby: '#701516',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  PHP: '#4F5D95',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRankDisplay(rank: number): { label: string; color: string; bg: string; isEmoji: boolean } {
  if (rank === 1) return { label: '🥇', color: COLORS.gold, bg: COLORS.goldBg, isEmoji: true }
  if (rank === 2) return { label: '🥈', color: COLORS.silver, bg: COLORS.silverBg, isEmoji: true }
  if (rank === 3) return { label: '🥉', color: COLORS.bronze, bg: COLORS.bronzeBg, isEmoji: true }
  return { label: `#${rank}`, color: COLORS.textMuted, bg: 'transparent', isEmoji: false }
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function SkeletonBlock({
  height,
  width = '100%',
  radius = '6px',
}: {
  height: string
  width?: string
  radius?: string
}) {
  return (
    <div
      style={{
        height,
        width,
        borderRadius: radius,
        background: 'rgba(45,45,80,0.6)',
        animation: 'pulse 1.5s ease-in-out infinite',
        flexShrink: 0,
      }}
    />
  )
}

function RowSkeleton() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '14px 16px',
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: '12px',
      }}
    >
      <SkeletonBlock height="32px" width="32px" radius="8px" />
      <SkeletonBlock height="40px" width="40px" radius="50%" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <SkeletonBlock height="13px" width="140px" />
        <SkeletonBlock height="11px" width="90px" />
      </div>
      <SkeletonBlock height="28px" width="80px" radius="8px" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rank Badge
// ---------------------------------------------------------------------------

function RankBadge({ rank }: { rank: number }) {
  const { label, color, bg, isEmoji } = getRankDisplay(rank)
  return (
    <div
      style={{
        width: '36px',
        height: '36px',
        borderRadius: '8px',
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontSize: isEmoji ? '20px' : '13px',
        fontWeight: '700',
        color,
        border: `1px solid ${bg === 'transparent' ? COLORS.border : 'transparent'}`,
      }}
    >
      {label}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trend Arrow
// ---------------------------------------------------------------------------

function TrendArrow({ trend, delta }: { trend: 'up' | 'down' | 'same'; delta: number }) {
  if (trend === 'same') {
    return (
      <span style={{ fontSize: '11px', color: COLORS.sameTrend, whiteSpace: 'nowrap' }}>—</span>
    )
  }
  const color = trend === 'up' ? COLORS.upTrend : COLORS.downTrend
  const arrow = trend === 'up' ? '▲' : '▼'
  return (
    <span style={{ fontSize: '11px', color, whiteSpace: 'nowrap', fontWeight: '600' }}>
      {arrow} {delta}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

function Avatar({ src, name, size = 40 }: { src?: string; name: string; size?: number }) {
  const initial = name.charAt(0).toUpperCase()
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          border: `2px solid ${COLORS.border}`,
          flexShrink: 0,
        }}
      />
    )
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #7C3AED, #4F46E5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.floor(size * 0.38),
        fontWeight: '700',
        color: '#FFFFFF',
        flexShrink: 0,
        border: `2px solid ${COLORS.border}`,
      }}
    >
      {initial}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Your Rank Card
// ---------------------------------------------------------------------------

function YourRankCard({ rankInfo }: { rankInfo: UserRankInfo }) {
  const categoryLabel = CATEGORIES.find((c) => c.value === rankInfo.category)?.label ?? rankInfo.category
  const periodLabel = TIME_PERIODS.find((p) => p.value === rankInfo.period)?.label ?? rankInfo.period
  const { label, color } = getRankDisplay(rankInfo.rank)

  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${COLORS.primaryLight}, rgba(124,58,237,0.05))`,
        border: `1px solid rgba(124,58,237,0.4)`,
        borderRadius: '14px',
        padding: '16px 20px',
        marginBottom: '24px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ fontSize: '28px' }}>🏆</div>
      <div style={{ flex: 1, minWidth: '200px' }}>
        <div style={{ fontSize: '15px', fontWeight: '700', color: COLORS.text }}>
          You&apos;re{' '}
          <span style={{ color: color !== COLORS.textMuted ? color : COLORS.primary }}>
            {label}
          </span>{' '}
          this {rankInfo.period === 'week' ? 'week' : rankInfo.period === 'month' ? 'month' : 'time'}
        </div>
        <div style={{ fontSize: '13px', color: COLORS.textSecondary, marginTop: '2px' }}>
          {categoryLabel} leaderboard · {periodLabel}
        </div>
      </div>
      <button
        onClick={() => {
          if (typeof window !== 'undefined') {
            navigator.clipboard?.writeText(window.location.href).catch(() => undefined)
          }
        }}
        style={{
          padding: '7px 14px',
          borderRadius: '8px',
          border: `1px solid rgba(124,58,237,0.5)`,
          background: COLORS.primaryLight,
          color: COLORS.primary,
          fontSize: '12px',
          fontWeight: '600',
          cursor: 'pointer',
        }}
      >
        Share
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Contributions Leaderboard Row
// ---------------------------------------------------------------------------

interface ContribRowProps {
  entry: LeaderboardDeveloper
  followState: Record<string, boolean>
  onFollow: (id: string, username: string) => void
}

function ContribRow({ entry, followState, onFollow }: ContribRowProps) {
  const isFollowing = followState[entry.id] ?? false

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '14px 16px',
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: '12px',
        transition: 'border-color 0.15s, background 0.15s',
        cursor: 'default',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = COLORS.borderHover
        el.style.background = COLORS.surfaceHover
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = COLORS.border
        el.style.background = COLORS.surface
      }}
    >
      <RankBadge rank={entry.rank} />

      <Link href={`/${entry.username}`} style={{ textDecoration: 'none', flexShrink: 0 }}>
        <Avatar src={entry.avatar} name={entry.displayName ?? entry.username} />
      </Link>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <Link
            href={`/${entry.username}`}
            style={{ fontWeight: '600', fontSize: '14px', color: COLORS.text, textDecoration: 'none' }}
          >
            {entry.displayName ?? entry.username}
          </Link>
          {entry.verified && (
            <svg width="13" height="13" viewBox="0 0 20 20" fill={COLORS.primary} style={{ flexShrink: 0 }}>
              <path
                fillRule="evenodd"
                d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: COLORS.textSecondary }}>
            {formatNumber(entry.contributionCount)} contributions
          </span>
          <TrendArrow trend={entry.trend} delta={entry.trendDelta} />
          {entry.languages.slice(0, 3).map((lang) => (
            <span
              key={lang}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                color: COLORS.textSecondary,
                background: 'rgba(45,45,80,0.6)',
                padding: '1px 6px',
                borderRadius: '4px',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: LANGUAGE_COLORS[lang] ?? '#6b7280',
                  flexShrink: 0,
                }}
              />
              {lang}
            </span>
          ))}
        </div>
      </div>

      <button
        onClick={() => onFollow(entry.id, entry.username)}
        style={{
          padding: '6px 14px',
          borderRadius: '8px',
          fontSize: '12px',
          fontWeight: '600',
          cursor: 'pointer',
          border: `1px solid ${isFollowing ? COLORS.border : COLORS.primary}`,
          background: isFollowing ? 'transparent' : COLORS.primaryLight,
          color: isFollowing ? COLORS.textSecondary : COLORS.primary,
          flexShrink: 0,
          transition: 'all 0.15s',
        }}
      >
        {isFollowing ? 'Following' : 'Follow'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Most Followed Row
// ---------------------------------------------------------------------------

function FollowedRow({
  entry,
  followState,
  onFollow,
}: {
  entry: FollowedLeaderEntry
  followState: Record<string, boolean>
  onFollow: (id: string, username: string) => void
}) {
  const isFollowing = followState[entry.id] ?? false

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '14px 16px',
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: '12px',
        transition: 'border-color 0.15s, background 0.15s',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = COLORS.borderHover
        el.style.background = COLORS.surfaceHover
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = COLORS.border
        el.style.background = COLORS.surface
      }}
    >
      <RankBadge rank={entry.rank} />
      <Link href={`/${entry.username}`} style={{ textDecoration: 'none', flexShrink: 0 }}>
        <Avatar src={entry.avatar} name={entry.displayName ?? entry.username} />
      </Link>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link
          href={`/${entry.username}`}
          style={{ fontWeight: '600', fontSize: '14px', color: COLORS.text, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px' }}
        >
          {entry.displayName ?? entry.username}
          {entry.verified && (
            <svg width="13" height="13" viewBox="0 0 20 20" fill={COLORS.primary}>
              <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          )}
        </Link>
        <div style={{ fontSize: '12px', color: COLORS.textSecondary, marginTop: '3px' }}>
          <span style={{ color: COLORS.upTrend, fontWeight: '600' }}>+{formatNumber(entry.newFollowers)}</span>
          {' '}new followers · {formatNumber(entry.totalFollowers)} total
        </div>
      </div>
      <button
        onClick={() => onFollow(entry.id, entry.username)}
        style={{
          padding: '6px 14px',
          borderRadius: '8px',
          fontSize: '12px',
          fontWeight: '600',
          cursor: 'pointer',
          border: `1px solid ${isFollowing ? COLORS.border : COLORS.primary}`,
          background: isFollowing ? 'transparent' : COLORS.primaryLight,
          color: isFollowing ? COLORS.textSecondary : COLORS.primary,
          flexShrink: 0,
          transition: 'all 0.15s',
        }}
      >
        {isFollowing ? 'Following' : 'Follow'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Top Repos Row
// ---------------------------------------------------------------------------

function RepoRow({ entry }: { entry: TopRepoEntry }) {
  const router = useRouter()

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '14px 16px',
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: '12px',
        cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
      }}
      onClick={() => router.push(`/${entry.owner}/${entry.name}`)}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = COLORS.borderHover
        el.style.background = COLORS.surfaceHover
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = COLORS.border
        el.style.background = COLORS.surface
      }}
    >
      <RankBadge rank={entry.rank} />
      <div
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '10px',
          background: COLORS.primaryLight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={COLORS.primary} strokeWidth="1.5">
          <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: '600', fontSize: '14px', color: COLORS.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {entry.fullName}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: COLORS.textSecondary }}>
            <span style={{ color: COLORS.gold, fontWeight: '600' }}>+{formatNumber(entry.starsGained)}</span>
            {' '}stars · {formatNumber(entry.totalStars)} total
          </span>
          {entry.language && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: COLORS.textSecondary }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: LANGUAGE_COLORS[entry.language] ?? '#6b7280' }} />
              {entry.language}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Top Snippets Row
// ---------------------------------------------------------------------------

function SnippetRow({ entry }: { entry: TopSnippetEntry }) {
  const router = useRouter()

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '14px 16px',
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: '12px',
        cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
      }}
      onClick={() => router.push(`/snippets/${entry.id}`)}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = COLORS.borderHover
        el.style.background = COLORS.surfaceHover
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = COLORS.border
        el.style.background = COLORS.surface
      }}
    >
      <RankBadge rank={entry.rank} />
      <div
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '10px',
          background: 'rgba(34,197,94,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="1.5">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: '600', fontSize: '14px', color: COLORS.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {entry.title || 'Untitled Snippet'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: COLORS.textSecondary }}>by @{entry.author}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: COLORS.textSecondary }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: LANGUAGE_COLORS[entry.language] ?? '#6b7280' }} />
            {entry.language}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#EF4444', fontSize: '13px', fontWeight: '700', flexShrink: 0 }}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
        </svg>
        {formatNumber(entry.likes)}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 0', color: COLORS.textMuted }}>
      <div style={{ fontSize: '40px', marginBottom: '10px' }}>🏅</div>
      <p style={{ fontSize: '14px', margin: 0 }}>{message}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function LeaderboardPage() {
  const router = useRouter()
  const { user, isAuthenticated, isInitialized, initialize } = useAuthStore()

  const [period, setPeriod] = useState<TimePeriod>('week')
  const [category, setCategory] = useState<Category>('contributions')

  // Contributions
  const [contribs, setContribs] = useState<LeaderboardDeveloper[]>([])
  const [contribsLoading, setContribsLoading] = useState(false)

  // Most Followed
  const [followed, setFollowed] = useState<FollowedLeaderEntry[]>([])
  const [followedLoading, setFollowedLoading] = useState(false)

  // Top Repos
  const [topRepos, setTopRepos] = useState<TopRepoEntry[]>([])
  const [reposLoading, setReposLoading] = useState(false)

  // Top Snippets
  const [snippets, setSnippets] = useState<TopSnippetEntry[]>([])
  const [snippetsLoading, setSnippetsLoading] = useState(false)

  // Follow state: maps userId -> isFollowing
  const [followState, setFollowState] = useState<Record<string, boolean>>({})

  // User rank info (shown if in top 50)
  const [userRank, setUserRank] = useState<UserRankInfo | null>(null)

  // Follow all loading
  const [followAllLoading, setFollowAllLoading] = useState(false)

  // Share copied feedback
  const [shareCopied, setShareCopied] = useState(false)

  // Auth init
  useEffect(() => {
    initialize()
  }, [initialize])

  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      router.push('/login')
    }
  }, [isInitialized, isAuthenticated, router])

  // ---------------------------------------------------------------------------
  // Fetchers
  // ---------------------------------------------------------------------------

  const fetchContributions = useCallback(async () => {
    setContribsLoading(true)
    try {
      const { data } = await api.get('/v1/trending/developers', {
        params: { period, limit: 20 },
      })
      const raw: ApiDeveloper[] = data?.developers ?? data?.entries ?? data?.data ?? []
      const mapped: LeaderboardDeveloper[] = raw.map((d, idx) => ({
        rank: d.rank ?? idx + 1,
        id: d.id,
        username: d.username,
        displayName: d.displayName,
        avatar: d.avatar,
        verified: d.verified,
        contributionCount: d.contributionCount ?? d.contributions ?? 0,
        trend: d.trend ?? 'same',
        trendDelta: d.trendDelta ?? 0,
        languages: d.languages ?? [],
      }))
      setContribs(mapped)

      // Check if current user is in top 50
      if (user) {
        const myEntry = mapped.find((d) => d.username === user.username)
        if (myEntry) {
          setUserRank({ rank: myEntry.rank, category: 'contributions', period })
        }
      }
    } catch {
      setContribs([])
    } finally {
      setContribsLoading(false)
    }
  }, [period, user])

  const fetchFollowed = useCallback(async () => {
    setFollowedLoading(true)
    try {
      const { data } = await api.get('/v1/leaderboard/followed', {
        params: { period, limit: 20 },
      })
      const raw: ApiFollowedEntry[] = data?.developers ?? data?.entries ?? data?.data ?? []
      const mapped: FollowedLeaderEntry[] = raw.map((d, idx) => ({
        rank: idx + 1,
        id: d.id,
        username: d.username,
        displayName: d.displayName,
        avatar: d.avatar,
        verified: d.verified,
        newFollowers: d.newFollowers ?? d.followersGained ?? 0,
        totalFollowers: d.totalFollowers ?? d.followersCount ?? 0,
      }))
      setFollowed(mapped)
    } catch {
      setFollowed([])
    } finally {
      setFollowedLoading(false)
    }
  }, [period])

  const fetchTopRepos = useCallback(async () => {
    setReposLoading(true)
    try {
      const { data } = await api.get('/v1/leaderboard/repos', {
        params: { period, limit: 20 },
      })
      const raw: ApiRepoEntry[] = data?.repos ?? data?.entries ?? data?.data ?? []
      const mapped: TopRepoEntry[] = raw.map((r, idx) => {
        const fullName = r.fullName ?? r.full_name ?? `${r.owner ?? ''}/${r.name ?? ''}`
        const parts = fullName.split('/')
        return {
          rank: idx + 1,
          id: r.id,
          owner: parts[0] ?? r.owner ?? '',
          name: parts[1] ?? r.name ?? '',
          fullName,
          description: r.description,
          starsGained: r.starsGained ?? r.starsThisPeriod ?? 0,
          totalStars: r.totalStars ?? r.stars ?? 0,
          language: r.language,
        }
      })
      setTopRepos(mapped)
    } catch {
      setTopRepos([])
    } finally {
      setReposLoading(false)
    }
  }, [period])

  const fetchSnippets = useCallback(async () => {
    setSnippetsLoading(true)
    try {
      const { data } = await api.get('/v1/leaderboard/snippets', {
        params: { period, limit: 20 },
      })
      const raw: ApiSnippetEntry[] = data?.snippets ?? data?.entries ?? data?.data ?? []
      const mapped: TopSnippetEntry[] = raw.map((s, idx) => {
        const authorVal = s.author
        const authorName = typeof authorVal === 'string' ? authorVal : authorVal?.username ?? 'unknown'
        const authorAvatar = typeof authorVal === 'object' ? authorVal?.avatar : s.authorAvatar
        return {
          rank: idx + 1,
          id: s.id,
          title: s.title ?? 'Untitled Snippet',
          author: authorName,
          authorAvatar,
          likes: s.likes ?? s.likesCount ?? 0,
          language: s.language ?? 'Unknown',
          preview: s.preview ?? s.content?.slice(0, 80) ?? '',
        }
      })
      setSnippets(mapped)
    } catch {
      setSnippets([])
    } finally {
      setSnippetsLoading(false)
    }
  }, [period])

  useEffect(() => {
    if (!isAuthenticated) return
    if (category === 'contributions') fetchContributions()
    if (category === 'followed') fetchFollowed()
    if (category === 'repos') fetchTopRepos()
    if (category === 'snippets') fetchSnippets()
  }, [isAuthenticated, category, period, fetchContributions, fetchFollowed, fetchTopRepos, fetchSnippets])

  // ---------------------------------------------------------------------------
  // Follow handler
  // ---------------------------------------------------------------------------

  const handleFollow = useCallback(async (id: string, username: string) => {
    const current = followState[id] ?? false
    setFollowState((prev) => ({ ...prev, [id]: !current }))
    try {
      if (current) {
        await api.delete(`/users/${username}/follow`)
      } else {
        await api.post(`/users/${username}/follow`)
      }
    } catch {
      setFollowState((prev) => ({ ...prev, [id]: current }))
    }
  }, [followState])

  // ---------------------------------------------------------------------------
  // Follow All (top 10)
  // ---------------------------------------------------------------------------

  const handleFollowAll = useCallback(async () => {
    setFollowAllLoading(true)
    const topEntries =
      category === 'contributions'
        ? contribs.slice(0, 10)
        : category === 'followed'
          ? followed.slice(0, 10)
          : []

    const toFollow = topEntries.filter((e) => !(followState[e.id] ?? false))

    const updates: Record<string, boolean> = {}
    toFollow.forEach((e) => { updates[e.id] = true })
    setFollowState((prev) => ({ ...prev, ...updates }))

    await Promise.allSettled(
      toFollow.map((e) =>
        api.post(`/users/${e.username}/follow`).catch(() => {
          setFollowState((prev) => ({ ...prev, [e.id]: false }))
        })
      )
    )
    setFollowAllLoading(false)
  }, [category, contribs, followed, followState])

  // ---------------------------------------------------------------------------
  // Share leaderboard
  // ---------------------------------------------------------------------------

  const handleShare = useCallback(async () => {
    if (typeof window === 'undefined') return
    try {
      await navigator.clipboard.writeText(window.location.href)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    } catch {
      // clipboard unavailable — silently ignore
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Render guard
  // ---------------------------------------------------------------------------

  if (!isInitialized || !isAuthenticated) {
    return (
      <div style={{ minHeight: '100vh', background: COLORS.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '32px', height: '32px', border: `2px solid ${COLORS.primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      </div>
    )
  }

  const showFollowAll = category === 'contributions' || category === 'followed'
  const isLoading =
    (category === 'contributions' && contribsLoading) ||
    (category === 'followed' && followedLoading) ||
    (category === 'repos' && reposLoading) ||
    (category === 'snippets' && snippetsLoading)

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, color: COLORS.text, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        * { box-sizing: border-box; }
      `}</style>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px 16px 48px' }}>

        {/* ─── Page Header ─── */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '28px' }}>🏆</span>
              <h1
                style={{
                  fontSize: '26px',
                  fontWeight: '800',
                  margin: 0,
                  background: `linear-gradient(135deg, ${COLORS.text}, ${COLORS.gold})`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Developer Leaderboard
              </h1>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              {showFollowAll && (
                <button
                  onClick={handleFollowAll}
                  disabled={followAllLoading}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: followAllLoading ? 'not-allowed' : 'pointer',
                    border: `1px solid ${COLORS.primary}`,
                    background: COLORS.primaryLight,
                    color: COLORS.primary,
                    opacity: followAllLoading ? 0.6 : 1,
                    transition: 'all 0.15s',
                  }}
                >
                  {followAllLoading ? 'Following…' : 'Follow Top 10'}
                </button>
              )}
              <button
                onClick={handleShare}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  border: `1px solid ${COLORS.border}`,
                  background: 'transparent',
                  color: shareCopied ? COLORS.upTrend : COLORS.textSecondary,
                  transition: 'all 0.15s',
                }}
              >
                {shareCopied ? '✓ Copied!' : 'Share'}
              </button>
            </div>
          </div>
          <p style={{ color: COLORS.textSecondary, fontSize: '14px', margin: 0 }}>
            Who&apos;s building the most this week — contributions, followers, repos, and snippets.
          </p>
        </div>

        {/* ─── Your Rank Card ─── */}
        {userRank && <YourRankCard rankInfo={userRank} />}

        {/* ─── Period Tabs ─── */}
        <div style={{ marginBottom: '16px' }}>
          <div
            style={{
              display: 'inline-flex',
              gap: '4px',
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: '12px',
              padding: '4px',
            }}
          >
            {TIME_PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                style={{
                  padding: '7px 16px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  border: 'none',
                  background: period === p.value ? COLORS.primary : 'transparent',
                  color: period === p.value ? '#FFFFFF' : COLORS.textSecondary,
                  transition: 'all 0.15s',
                  boxShadow: period === p.value ? '0 2px 8px rgba(124,58,237,0.4)' : 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* ─── Category Tabs ─── */}
        <div style={{ marginBottom: '24px', borderBottom: `1px solid ${COLORS.border}` }}>
          <div style={{ display: 'flex', gap: '0', overflowX: 'auto' }}>
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                onClick={() => setCategory(c.value)}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  border: 'none',
                  background: 'transparent',
                  color: category === c.value ? COLORS.primary : COLORS.textSecondary,
                  borderBottom: category === c.value ? `2px solid ${COLORS.primary}` : '2px solid transparent',
                  marginBottom: '-1px',
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>{c.icon}</span>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* ─── List ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} />)
          ) : (
            <>
              {category === 'contributions' && (
                contribs.length === 0
                  ? <EmptyState message="No contribution data yet for this period." />
                  : contribs.map((entry) => (
                    <ContribRow
                      key={entry.id}
                      entry={entry}
                      followState={followState}
                      onFollow={handleFollow}
                    />
                  ))
              )}

              {category === 'followed' && (
                followed.length === 0
                  ? <EmptyState message="No follower data yet for this period." />
                  : followed.map((entry) => (
                    <FollowedRow
                      key={entry.id}
                      entry={entry}
                      followState={followState}
                      onFollow={handleFollow}
                    />
                  ))
              )}

              {category === 'repos' && (
                topRepos.length === 0
                  ? <EmptyState message="No repository data yet for this period." />
                  : topRepos.map((entry) => (
                    <RepoRow key={entry.id} entry={entry} />
                  ))
              )}

              {category === 'snippets' && (
                snippets.length === 0
                  ? <EmptyState message="No snippet data yet for this period." />
                  : snippets.map((entry) => (
                    <SnippetRow key={entry.id} entry={entry} />
                  ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
