'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'
import PostCard, { type Post } from '@/components/PostCard'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TimeFilter = 'today' | 'week' | 'month'

interface TrendingRepo {
  id: string
  owner: string
  name: string
  fullName: string
  description?: string
  stars: number
  forks: number
  language?: string
  trendingRank?: number
  trendingScore?: number
  isFollowing?: boolean
}

interface TrendingDeveloper {
  id: string
  username: string
  displayName?: string
  avatar?: string
  verified?: boolean
  followersCount: number
  isFollowing?: boolean
}

interface RisingStar {
  id: string
  username: string
  displayName?: string
  avatar?: string
  verified?: boolean
  newFollowers: number
  isFollowing?: boolean
}

interface TrendingHashtag {
  tag: string
  postCount: number
  trend: 'up' | 'stable' | 'new'
}

interface FeaturedSnippet {
  id: string
  title?: string
  description?: string
  code: string
  language: string
  likesCount: number
  user: {
    id: string
    username: string
    avatar?: string
  }
}

type LangTab = 'TypeScript' | 'Python' | 'Go' | 'Rust' | 'JavaScript'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIME_FILTER_TABS: { label: string; value: TimeFilter }[] = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
]

const LANG_TABS: LangTab[] = ['TypeScript', 'Python', 'Go', 'Rust', 'JavaScript']

const HASHTAG_COLORS = [
  'rgba(124,58,237,0.15)',
  'rgba(59,130,246,0.15)',
  'rgba(16,185,129,0.15)',
  'rgba(245,158,11,0.15)',
  'rgba(239,68,68,0.15)',
  'rgba(236,72,153,0.15)',
  'rgba(14,165,233,0.15)',
  'rgba(168,85,247,0.15)',
]

const HASHTAG_TEXT_COLORS = [
  '#a78bfa',
  '#93c5fd',
  '#6ee7b7',
  '#fcd34d',
  '#fca5a5',
  '#f9a8d4',
  '#7dd3fc',
  '#d8b4fe',
]

const CODE_LANGUAGE_DISPLAY: Record<string, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  python: 'Python',
  go: 'Go',
  rust: 'Rust',
  java: 'Java',
  cpp: 'C++',
  csharp: 'C#',
  ruby: 'Ruby',
  swift: 'Swift',
  kotlin: 'Kotlin',
  php: 'PHP',
  shell: 'Shell',
  sql: 'SQL',
}

const LANGUAGES = [
  'All',
  'JavaScript',
  'TypeScript',
  'Python',
  'Go',
  'Rust',
  'Java',
  'C++',
  'C#',
  'Ruby',
  'Swift',
  'Kotlin',
  'PHP',
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
// Styles
// ---------------------------------------------------------------------------

const COLORS = {
  bg: '#0F0F1A',
  surface: '#1A1A2E',
  border: '#2D2D50',
  primary: '#7C3AED',
  primaryLight: 'rgba(124,58,237,0.15)',
  primaryHover: 'rgba(124,58,237,0.25)',
  text: '#E2E8F0',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
}

// ---------------------------------------------------------------------------
// Skeleton helpers
// ---------------------------------------------------------------------------

function SkeletonBlock({ height, width = '100%', radius = '8px' }: { height: string; width?: string; radius?: string }) {
  return (
    <div
      style={{
        height,
        width,
        borderRadius: radius,
        background: 'rgba(45,45,80,0.6)',
        animation: 'pulse 1.5s ease-in-out infinite',
      }}
    />
  )
}

function PostSkeleton() {
  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <SkeletonBlock height="48px" width="48px" radius="50%" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <SkeletonBlock height="14px" width="140px" />
          <SkeletonBlock height="12px" width="100px" />
        </div>
      </div>
      <SkeletonBlock height="12px" />
      <SkeletonBlock height="12px" width="85%" />
      <SkeletonBlock height="12px" width="70%" />
    </div>
  )
}

function RepoSkeleton() {
  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <SkeletonBlock height="36px" width="36px" radius="8px" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <SkeletonBlock height="13px" width="160px" />
          <SkeletonBlock height="11px" width="120px" />
        </div>
      </div>
      <SkeletonBlock height="11px" />
      <SkeletonBlock height="11px" width="75%" />
    </div>
  )
}

function DevSkeleton() {
  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '12px', padding: '14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
      <SkeletonBlock height="44px" width="44px" radius="50%" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <SkeletonBlock height="13px" width="120px" />
        <SkeletonBlock height="11px" width="80px" />
      </div>
      <SkeletonBlock height="30px" width="68px" radius="8px" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trending Repos inline component
// ---------------------------------------------------------------------------

interface TrendingReposProps {
  repos: TrendingRepo[]
  loading: boolean
  language: string
}

function TrendingRepos({ repos, loading, language }: TrendingReposProps) {
  const router = useRouter()
  const [followState, setFollowState] = useState<Record<string, boolean>>({})

  const handleFollow = async (e: React.MouseEvent, repo: TrendingRepo) => {
    e.stopPropagation()
    const key = repo.id
    const current = followState[key] ?? repo.isFollowing ?? false
    setFollowState((prev) => ({ ...prev, [key]: !current }))
    try {
      if (current) {
        await api.delete(`/repositories/${repo.owner}/${repo.name}/follow`)
      } else {
        await api.post(`/repositories/${repo.owner}/${repo.name}/follow`)
      }
    } catch {
      setFollowState((prev) => ({ ...prev, [key]: current }))
    }
  }

  const filtered = language === 'All' ? repos : repos.filter((r) => r.language === language)

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {Array.from({ length: 5 }).map((_, i) => <RepoSkeleton key={i} />)}
      </div>
    )
  }

  if (filtered.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', color: COLORS.textMuted }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>&#x1F4C2;</div>
        <p style={{ fontSize: '14px' }}>No trending repositories</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {filtered.map((repo, index) => {
        const isFollowing = followState[repo.id] ?? repo.isFollowing ?? false
        const rank = repo.trendingRank ?? index + 1
        return (
          <div
            key={repo.id}
            onClick={() => router.push(`/${repo.owner}/${repo.name}`)}
            style={{
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: '12px',
              padding: '14px',
              cursor: 'pointer',
              transition: 'border-color 0.15s',
              position: 'relative',
              overflow: 'hidden',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(124,58,237,0.5)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = COLORS.border }}
          >
            {/* Rank badge for top 3 */}
            {rank <= 3 && (
              <span
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  fontSize: '10px',
                  fontWeight: '700',
                  padding: '2px 6px',
                  borderRadius: '20px',
                  background: rank === 1 ? 'rgba(234,179,8,0.2)' : rank === 2 ? 'rgba(156,163,175,0.2)' : 'rgba(249,115,22,0.2)',
                  color: rank === 1 ? '#EAB308' : rank === 2 ? '#9CA3AF' : '#F97316',
                }}
              >
                #{rank}
              </span>
            )}

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
              {/* Repo icon */}
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
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
                  {repo.fullName}
                </div>
                {repo.description && (
                  <div style={{ fontSize: '12px', color: COLORS.textSecondary, marginTop: '2px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {repo.description}
                  </div>
                )}
              </div>
            </div>

            {/* Stats + follow row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: COLORS.textSecondary }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                {repo.stars >= 1000 ? `${(repo.stars / 1000).toFixed(1)}k` : repo.stars}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5.372 14.628C5.174 14.224 5 13.766 5 13.25c0-1.657 0-2.485.513-2.992C6.025 9.75 6.85 9.75 8.5 9.75h7c1.65 0 2.475 0 2.987.508C19 10.765 19 11.593 19 13.25c0 1.657 0 2.485-.513 2.992-.512.508-1.337.508-2.987.508H14" />
                  <path d="M5 4.75v9.5M5 14.25l-2-2m2 2 2-2M19 4.75v9.5m0 0-2 2m2-2 2 2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {repo.forks >= 1000 ? `${(repo.forks / 1000).toFixed(1)}k` : repo.forks}
              </span>
              {repo.language && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: LANGUAGE_COLORS[repo.language] || '#6b7280', flexShrink: 0 }} />
                  {repo.language}
                </span>
              )}
              <button
                onClick={(e) => handleFollow(e, repo)}
                style={{
                  marginLeft: 'auto',
                  padding: '4px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  border: `1px solid ${isFollowing ? COLORS.border : COLORS.primary}`,
                  background: isFollowing ? 'transparent' : COLORS.primaryLight,
                  color: isFollowing ? COLORS.textSecondary : COLORS.primary,
                  transition: 'all 0.15s',
                }}
              >
                {isFollowing ? 'Following' : 'Follow'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Developer Card
// ---------------------------------------------------------------------------

function DeveloperCard({ dev }: { dev: TrendingDeveloper }) {
  const [isFollowing, setIsFollowing] = useState(dev.isFollowing ?? false)

  const handleFollow = async (e: React.MouseEvent) => {
    e.preventDefault()
    const next = !isFollowing
    setIsFollowing(next)
    try {
      if (next) {
        await api.post(`/users/${dev.username}/follow`)
      } else {
        await api.delete(`/users/${dev.username}/follow`)
      }
    } catch {
      setIsFollowing(!next)
    }
  }

  const initials = (dev.displayName ?? dev.username).charAt(0).toUpperCase()

  return (
    <Link
      href={`/${dev.username}`}
      style={{ textDecoration: 'none' }}
    >
      <div
        style={{
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: '12px',
          padding: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          transition: 'border-color 0.15s',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(124,58,237,0.5)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = COLORS.border }}
      >
        {/* Avatar */}
        {dev.avatar ? (
          <img
            src={dev.avatar}
            alt={dev.displayName ?? dev.username}
            style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover', border: `2px solid ${COLORS.border}`, flexShrink: 0 }}
          />
        ) : (
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #7C3AED, #4F46E5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              fontWeight: '700',
              color: '#FFFFFF',
              flexShrink: 0,
              border: `2px solid ${COLORS.border}`,
            }}
          >
            {initials}
          </div>
        )}

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontWeight: '600', fontSize: '14px', color: COLORS.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {dev.displayName ?? dev.username}
            </span>
            {dev.verified && (
              <svg width="14" height="14" viewBox="0 0 20 20" fill={COLORS.primary} style={{ flexShrink: 0 }}>
                <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            )}
          </div>
          <div style={{ fontSize: '12px', color: COLORS.textSecondary, marginTop: '2px' }}>
            {dev.followersCount.toLocaleString()} followers
          </div>
        </div>

        {/* Follow button */}
        <button
          onClick={handleFollow}
          style={{
            padding: '6px 14px',
            borderRadius: '8px',
            fontSize: '13px',
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
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Language filter dropdown
// ---------------------------------------------------------------------------

function LanguageDropdown({ value, onChange }: { value: string; onChange: (lang: string) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '7px 12px',
          borderRadius: '8px',
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          color: COLORS.text,
          fontSize: '13px',
          fontWeight: '500',
          cursor: 'pointer',
          transition: 'border-color 0.15s',
        }}
      >
        {value !== 'All' && (
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: LANGUAGE_COLORS[value] || '#6b7280', flexShrink: 0 }} />
        )}
        {value === 'All' ? 'All Languages' : value}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              zIndex: 20,
              minWidth: '160px',
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: '10px',
              overflow: 'hidden',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              maxHeight: '240px',
              overflowY: 'auto',
            }}
          >
            {LANGUAGES.map((lang) => (
              <button
                key={lang}
                onClick={() => { onChange(lang); setOpen(false) }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 14px',
                  fontSize: '13px',
                  background: value === lang ? COLORS.primaryLight : 'transparent',
                  color: value === lang ? COLORS.primary : COLORS.text,
                  fontWeight: value === lang ? '600' : '400',
                  cursor: 'pointer',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { if (value !== lang) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(45,45,80,0.8)' }}
                onMouseLeave={(e) => { if (value !== lang) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                {lang !== 'All' && (
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: LANGUAGE_COLORS[lang] || '#6b7280', flexShrink: 0 }} />
                )}
                {lang}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rising Stars horizontal scroller
// ---------------------------------------------------------------------------

interface RisingStarsProps {
  stars: RisingStar[]
  loading: boolean
}

function RisingStarCard({ star }: { star: RisingStar }) {
  const [isFollowing, setIsFollowing] = useState(star.isFollowing ?? false)
  const initials = (star.displayName ?? star.username).charAt(0).toUpperCase()

  const handleFollow = async (e: React.MouseEvent) => {
    e.preventDefault()
    const next = !isFollowing
    setIsFollowing(next)
    try {
      if (next) {
        await api.post(`/users/${star.username}/follow`)
      } else {
        await api.delete(`/users/${star.username}/follow`)
      }
    } catch {
      setIsFollowing(!next)
    }
  }

  return (
    <Link href={`/${star.username}`} style={{ textDecoration: 'none', flexShrink: 0 }}>
      <div
        style={{
          width: '160px',
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: '14px',
          padding: '16px 12px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          transition: 'border-color 0.15s, transform 0.15s',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLDivElement
          el.style.borderColor = 'rgba(124,58,237,0.5)'
          el.style.transform = 'translateY(-2px)'
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLDivElement
          el.style.borderColor = COLORS.border
          el.style.transform = 'translateY(0)'
        }}
      >
        {/* Avatar */}
        {star.avatar ? (
          <img
            src={star.avatar}
            alt={star.displayName ?? star.username}
            style={{ width: '52px', height: '52px', borderRadius: '50%', objectFit: 'cover', border: `2px solid ${COLORS.border}` }}
          />
        ) : (
          <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'linear-gradient(135deg, #7C3AED, #4F46E5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: '700', color: '#FFFFFF', border: `2px solid ${COLORS.border}` }}>
            {initials}
          </div>
        )}

        {/* Name */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: COLORS.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '136px' }}>
            {star.displayName ?? star.username}
          </div>
          <div style={{ fontSize: '11px', color: COLORS.textMuted, marginTop: '1px' }}>@{star.username}</div>
        </div>

        {/* New followers badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(34,197,94,0.12)', borderRadius: '20px', padding: '3px 8px' }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
            <polyline points="18 15 12 9 6 15" />
          </svg>
          <span style={{ fontSize: '11px', fontWeight: '700', color: '#22c55e' }}>
            +{star.newFollowers >= 1000 ? `${(star.newFollowers / 1000).toFixed(1)}k` : star.newFollowers}
          </span>
        </div>

        {/* Follow button */}
        <button
          onClick={handleFollow}
          style={{
            width: '100%',
            padding: '5px 0',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            border: `1px solid ${isFollowing ? COLORS.border : COLORS.primary}`,
            background: isFollowing ? 'transparent' : COLORS.primaryLight,
            color: isFollowing ? COLORS.textSecondary : COLORS.primary,
            transition: 'all 0.15s',
          }}
        >
          {isFollowing ? 'Following' : 'Follow'}
        </button>
      </div>
    </Link>
  )
}

function RisingStarsRow({ stars, loading }: RisingStarsProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return
    scrollRef.current.scrollBy({ left: dir === 'right' ? 340 : -340, behavior: 'smooth' })
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Left arrow */}
      <button
        onClick={() => scroll('left')}
        aria-label="Scroll left"
        style={{
          position: 'absolute',
          left: '-12px',
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 2,
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          color: COLORS.textSecondary,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      {/* Scroll container */}
      <div
        ref={scrollRef}
        style={{
          display: 'flex',
          gap: '12px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          paddingBottom: '4px',
          paddingLeft: '4px',
          paddingRight: '4px',
        }}
      >
        <style>{`.rising-scroll::-webkit-scrollbar { display: none; }`}</style>
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: '160px',
                  flexShrink: 0,
                  height: '196px',
                  borderRadius: '14px',
                  background: 'rgba(45,45,80,0.4)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              />
            ))
          : stars.map((star) => <RisingStarCard key={star.id} star={star} />)}
      </div>

      {/* Right arrow */}
      <button
        onClick={() => scroll('right')}
        aria-label="Scroll right"
        style={{
          position: 'absolute',
          right: '-12px',
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 2,
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          color: COLORS.textSecondary,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trending Hashtags grid
// ---------------------------------------------------------------------------

interface TrendingHashtagsGridProps {
  hashtags: TrendingHashtag[]
  loading: boolean
}

function TrendingHashtagsGrid({ hashtags, loading }: TrendingHashtagsGridProps) {
  const router = useRouter()

  if (loading) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            style={{
              height: '34px',
              width: `${70 + (i % 5) * 20}px`,
              borderRadius: '20px',
              background: 'rgba(45,45,80,0.4)',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
        ))}
      </div>
    )
  }

  if (hashtags.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0', color: COLORS.textMuted, fontSize: '13px' }}>
        No trending hashtags
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
      {hashtags.map((ht, i) => {
        const colorIdx = i % HASHTAG_COLORS.length
        return (
          <button
            key={ht.tag}
            onClick={() => router.push(`/hashtag/${ht.tag}`)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '20px',
              background: HASHTAG_COLORS[colorIdx],
              border: `1px solid ${HASHTAG_TEXT_COLORS[colorIdx]}30`,
              color: HASHTAG_TEXT_COLORS[colorIdx],
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'transform 0.1s, opacity 0.1s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.8' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
          >
            #{ht.tag}
            <span
              style={{
                fontSize: '10px',
                fontWeight: '500',
                color: HASHTAG_TEXT_COLORS[colorIdx],
                opacity: 0.75,
              }}
            >
              {ht.postCount >= 1000 ? `${(ht.postCount / 1000).toFixed(1)}k` : ht.postCount}
            </span>
            {ht.trend === 'new' && (
              <span style={{ fontSize: '9px', fontWeight: '700', background: '#22c55e', color: '#fff', borderRadius: '4px', padding: '1px 4px', marginLeft: '2px' }}>NEW</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Code of the Day card
// ---------------------------------------------------------------------------

interface CodeOfTheDayProps {
  snippet: FeaturedSnippet | null
  loading: boolean
}

function CodeOfTheDay({ snippet, loading }: CodeOfTheDayProps) {
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(snippet?.likesCount ?? 0)

  useEffect(() => {
    setLikeCount(snippet?.likesCount ?? 0)
  }, [snippet])

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault()
    const next = !liked
    setLiked(next)
    setLikeCount((prev) => prev + (next ? 1 : -1))
    try {
      await api.post(`/snippets/${snippet?.id}/like`)
    } catch {
      setLiked(!next)
      setLikeCount((prev) => prev + (next ? -1 : 1))
    }
  }

  if (loading) {
    return (
      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <SkeletonBlock height="14px" width="200px" />
        <SkeletonBlock height="120px" />
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <SkeletonBlock height="32px" width="32px" radius="50%" />
          <SkeletonBlock height="12px" width="120px" />
        </div>
      </div>
    )
  }

  if (!snippet) return null

  const langDisplay = CODE_LANGUAGE_DISPLAY[snippet.language?.toLowerCase()] ?? snippet.language
  const langColor = LANGUAGE_COLORS[langDisplay] ?? '#6b7280'
  const codeLines = snippet.code.split('\n').slice(0, 10)

  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${COLORS.surface}, rgba(124,58,237,0.06))`,
        border: `1px solid rgba(124,58,237,0.35)`,
        borderRadius: '16px',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Glow accent */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: `linear-gradient(90deg, ${COLORS.primary}, #4F46E5, #06b6d4)` }} />

      <div style={{ padding: '20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>&#x2728;</span>
            <span style={{ fontSize: '13px', fontWeight: '700', color: COLORS.primary, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Code of the Day</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: langColor }} />
            <span style={{ fontSize: '12px', color: COLORS.textSecondary, fontWeight: '500' }}>{langDisplay}</span>
          </div>
        </div>

        {/* Title & description */}
        {snippet.title && (
          <div style={{ fontSize: '15px', fontWeight: '700', color: COLORS.text, marginBottom: '4px' }}>{snippet.title}</div>
        )}
        {snippet.description && (
          <div style={{ fontSize: '13px', color: COLORS.textSecondary, marginBottom: '12px', lineHeight: '1.5' }}>{snippet.description}</div>
        )}

        {/* Code preview */}
        <div
          style={{
            background: 'rgba(0,0,0,0.35)',
            borderRadius: '10px',
            padding: '14px',
            fontFamily: 'ui-monospace, SFMono-Regular, "Fira Code", monospace',
            fontSize: '12px',
            lineHeight: '1.65',
            color: '#e2e8f0',
            overflowX: 'auto',
            marginBottom: '14px',
            maxHeight: '200px',
            overflowY: 'hidden',
          }}
        >
          {codeLines.map((line, i) => (
            <div key={i} style={{ display: 'flex', gap: '12px' }}>
              <span style={{ color: '#475569', userSelect: 'none', minWidth: '18px', textAlign: 'right' }}>{i + 1}</span>
              <span>{line || ' '}</span>
            </div>
          ))}
          {snippet.code.split('\n').length > 10 && (
            <div style={{ color: '#475569', marginTop: '4px', fontSize: '11px' }}>… {snippet.code.split('\n').length - 10} more lines</div>
          )}
        </div>

        {/* Author + actions row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href={`/${snippet.user.username}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {snippet.user.avatar ? (
              <img src={snippet.user.avatar} alt={snippet.user.username} style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'linear-gradient(135deg, #7C3AED, #4F46E5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: '#fff' }}>
                {snippet.user.username.charAt(0).toUpperCase()}
              </div>
            )}
            <span style={{ fontSize: '13px', fontWeight: '500', color: COLORS.textSecondary }}>@{snippet.user.username}</span>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Like */}
            <button
              onClick={handleLike}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: liked ? '#f43f5e' : COLORS.textMuted,
                fontSize: '13px',
                fontWeight: '500',
                padding: '4px',
                transition: 'color 0.15s',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              {likeCount}
            </button>

            {/* View link */}
            <Link
              href={`/snippets/${snippet.id}`}
              style={{
                padding: '5px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: '600',
                color: COLORS.primary,
                background: COLORS.primaryLight,
                border: `1px solid rgba(124,58,237,0.3)`,
                textDecoration: 'none',
              }}
            >
              View Snippet
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Language Trending Tabs (lazy per-tab loading)
// ---------------------------------------------------------------------------

interface LangTrendingTabsProps {
  timeFilter: TimeFilter
}

function LangTrendingTabs({ timeFilter }: LangTrendingTabsProps) {
  const [activeTab, setActiveTab] = useState<LangTab>('TypeScript')
  const [reposMap, setReposMap] = useState<Record<string, TrendingRepo[]>>({})
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({})
  const fetchedRef = useRef<Set<string>>(new Set())
  const router = useRouter()

  const cacheKey = `${activeTab}-${timeFilter}`

  useEffect(() => {
    if (fetchedRef.current.has(cacheKey)) return
    fetchedRef.current.add(cacheKey)
    setLoadingMap((prev) => ({ ...prev, [cacheKey]: true }))

    api
      .get('/v1/trending/repos', {
        params: { language: activeTab.toLowerCase(), limit: 5, tier: timeFilter === 'today' ? 'TRENDING_TODAY' : timeFilter === 'week' ? 'THIS_WEEK' : 'THIS_MONTH' },
      })
      .then(({ data }) => {
        const repos: TrendingRepo[] = data?.repos ?? data?.entries ?? data?.data ?? []
        setReposMap((prev) => ({ ...prev, [cacheKey]: repos }))
      })
      .catch(() => {
        setReposMap((prev) => ({ ...prev, [cacheKey]: [] }))
      })
      .finally(() => {
        setLoadingMap((prev) => ({ ...prev, [cacheKey]: false }))
      })
  }, [cacheKey])

  const repos = reposMap[cacheKey] ?? []
  const isLoading = loadingMap[cacheKey] ?? true

  return (
    <div>
      {/* Tab pills */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
        {LANG_TABS.map((lang) => {
          const color = LANGUAGE_COLORS[lang] ?? '#6b7280'
          const isActive = lang === activeTab
          return (
            <button
              key={lang}
              onClick={() => setActiveTab(lang)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                border: `1px solid ${isActive ? color + '60' : COLORS.border}`,
                background: isActive ? color + '18' : 'transparent',
                color: isActive ? color : COLORS.textSecondary,
                transition: 'all 0.15s',
              }}
            >
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: color }} />
              {lang}
            </button>
          )
        })}
      </div>

      {/* Repo list */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {Array.from({ length: 5 }).map((_, i) => <RepoSkeleton key={i} />)}
        </div>
      ) : repos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: COLORS.textMuted, fontSize: '13px' }}>
          No {activeTab} repos trending right now
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {repos.slice(0, 5).map((repo, idx) => (
            <div
              key={repo.id}
              onClick={() => router.push(`/${repo.owner}/${repo.name}`)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                background: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                borderRadius: '10px',
                cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(124,58,237,0.4)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = COLORS.border }}
            >
              <span style={{ fontSize: '12px', fontWeight: '700', color: idx < 3 ? ['#EAB308', '#9CA3AF', '#F97316'][idx] : COLORS.textMuted, minWidth: '18px', textAlign: 'center' }}>
                #{idx + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: COLORS.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {repo.fullName}
                </div>
                {repo.description && (
                  <div style={{ fontSize: '11px', color: COLORS.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '1px' }}>
                    {repo.description}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: COLORS.textSecondary, flexShrink: 0 }}>
                <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                {repo.stars >= 1000 ? `${(repo.stars / 1000).toFixed(1)}k` : repo.stars}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '16px',
        paddingBottom: '12px',
        borderBottom: `1px solid ${COLORS.border}`,
      }}
    >
      <div style={{ color: COLORS.primary }}>{icon}</div>
      <h2 style={{ fontSize: '16px', fontWeight: '700', color: COLORS.text, margin: 0 }}>{title}</h2>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function TrendingPage() {
  const router = useRouter()
  const { isAuthenticated, isInitialized, initialize } = useAuthStore()

  const [timeFilter, setTimeFilter] = useState<TimeFilter>('today')
  const [language, setLanguage] = useState('All')

  // Posts state
  const [posts, setPosts] = useState<Post[]>([])
  const [postsLoading, setPostsLoading] = useState(true)
  const [postsError, setPostsError] = useState(false)

  // Repos state
  const [repos, setRepos] = useState<TrendingRepo[]>([])
  const [reposLoading, setReposLoading] = useState(true)

  // Developers state
  const [developers, setDevelopers] = useState<TrendingDeveloper[]>([])
  const [devsLoading, setDevsLoading] = useState(true)

  // Rising stars state
  const [risingStars, setRisingStars] = useState<RisingStar[]>([])
  const [risingStarsLoading, setRisingStarsLoading] = useState(true)

  // Trending hashtags state
  const [hashtags, setHashtags] = useState<TrendingHashtag[]>([])
  const [hashtagsLoading, setHashtagsLoading] = useState(true)

  // Code of the day state
  const [featuredSnippet, setFeaturedSnippet] = useState<FeaturedSnippet | null>(null)
  const [snippetLoading, setSnippetLoading] = useState(true)

  // Auth init
  useEffect(() => {
    initialize()
  }, [initialize])

  // Auth guard
  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      router.push('/login')
    }
  }, [isInitialized, isAuthenticated, router])

  // Map time filter to API param
  const tierMap: Record<TimeFilter, string> = {
    today: 'TRENDING_TODAY',
    week: 'THIS_WEEK',
    month: 'THIS_MONTH',
  }

  const limitParam: Record<TimeFilter, number> = {
    today: 10,
    week: 10,
    month: 10,
  }

  const fetchPosts = useCallback(async () => {
    setPostsLoading(true)
    setPostsError(false)
    try {
      const { data } = await api.get('/v1/trending/posts', {
        params: { tier: tierMap[timeFilter], limit: limitParam[timeFilter] },
      })
      const raw: TrendingPost[] = data?.posts ?? data?.entries ?? data?.data ?? []
      const mapped: Post[] = raw.map((p) => ({
        id: p.id,
        content: p.content ?? '',
        author: {
          username: p.user?.username ?? 'unknown',
          displayName: p.user?.username ?? 'Unknown',
          avatarUrl: p.user?.avatar,
        },
        likes: p.likesCount ?? 0,
        comments: p.commentsCount ?? 0,
        reposts: 0,
        createdAt: p.createdAt,
        repoOwner: p.repository?.fullName?.split('/')?.[0],
        repoName: p.repository?.fullName?.split('/')?.[1],
      }))
      setPosts(mapped)
    } catch {
      setPostsError(true)
      setPosts([])
    } finally {
      setPostsLoading(false)
    }
  }, [timeFilter])

  const fetchRepos = useCallback(async () => {
    setReposLoading(true)
    try {
      const langParam = language !== 'All' ? language.toLowerCase() : undefined
      const { data } = await api.get('/v1/trending/repos', {
        params: { tier: tierMap[timeFilter], language: langParam, limit: 10 },
      })
      setRepos(data?.repos ?? data?.entries ?? data?.data ?? [])
    } catch {
      setRepos([])
    } finally {
      setReposLoading(false)
    }
  }, [timeFilter, language])

  const fetchDevelopers = useCallback(async () => {
    setDevsLoading(true)
    try {
      const { data } = await api.get('/v1/trending/users', {
        params: { tier: tierMap[timeFilter], limit: 10 },
      })
      const raw = data?.users ?? data?.creators ?? data?.entries ?? data?.data ?? []
      const mapped: TrendingDeveloper[] = raw.map((u: TrendingCreator & { followersCount?: number }) => ({
        id: u.id,
        username: u.username,
        displayName: u.username,
        avatar: u.avatar,
        verified: u.verified,
        followersCount: u.followersCount ?? u._count?.followers ?? 0,
        isFollowing: false,
      }))
      setDevelopers(mapped)
    } catch {
      setDevelopers([])
    } finally {
      setDevsLoading(false)
    }
  }, [timeFilter])

  const fetchRisingStars = useCallback(async () => {
    setRisingStarsLoading(true)
    try {
      const { data } = await api.get('/v1/users/rising', { params: { period: 'week', limit: 10 } })
      const raw: Array<TrendingCreator & { newFollowers?: number; followersGained?: number }> =
        data?.users ?? data?.data ?? []
      const mapped: RisingStar[] = raw.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.username,
        avatar: u.avatar,
        verified: u.verified,
        newFollowers: u.newFollowers ?? u.followersGained ?? 0,
        isFollowing: false,
      }))
      setRisingStars(mapped)
    } catch {
      setRisingStars([])
    } finally {
      setRisingStarsLoading(false)
    }
  }, [])

  const fetchHashtags = useCallback(async () => {
    setHashtagsLoading(true)
    try {
      const { data } = await api.get('/v1/hashtags/trending', { params: { limit: 20 } })
      const raw: Array<{ tag?: string; name?: string; postCount?: number; count?: number; trend?: 'up' | 'stable' | 'new' }> =
        data?.hashtags ?? data?.data ?? []
      const mapped: TrendingHashtag[] = raw.map((h) => ({
        tag: h.tag ?? h.name ?? '',
        postCount: h.postCount ?? h.count ?? 0,
        trend: h.trend ?? 'stable',
      }))
      setHashtags(mapped)
    } catch {
      setHashtags([])
    } finally {
      setHashtagsLoading(false)
    }
  }, [])

  const fetchFeaturedSnippet = useCallback(async () => {
    setSnippetLoading(true)
    try {
      const { data } = await api.get('/v1/snippets/featured')
      const raw = data?.snippet ?? data?.data ?? data
      if (raw?.id) {
        setFeaturedSnippet(raw as FeaturedSnippet)
      } else {
        setFeaturedSnippet(null)
      }
    } catch {
      setFeaturedSnippet(null)
    } finally {
      setSnippetLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated) return
    fetchPosts()
    fetchRepos()
    fetchDevelopers()
    fetchRisingStars()
    fetchHashtags()
    fetchFeaturedSnippet()
  }, [isAuthenticated, fetchPosts, fetchRepos, fetchDevelopers, fetchRisingStars, fetchHashtags, fetchFeaturedSnippet])

  if (!isInitialized || !isAuthenticated) {
    return (
      <div style={{ minHeight: '100vh', background: COLORS.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '32px', height: '32px', border: `2px solid ${COLORS.primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, color: COLORS.text, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        * { box-sizing: border-box; }
      `}</style>

      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 16px' }}>

        {/* Page header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={COLORS.primary} strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <h1 style={{ fontSize: '28px', fontWeight: '800', margin: 0, background: `linear-gradient(135deg, ${COLORS.text}, ${COLORS.primary})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Trending on Gitgram
            </h1>
          </div>
          <p style={{ color: COLORS.textSecondary, fontSize: '14px', margin: 0 }}>
            Discover what developers are building and talking about right now
          </p>
        </div>

        {/* Filters bar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '24px',
            padding: '14px 16px',
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: '14px',
          }}
        >
          {/* Time filter tabs */}
          <div style={{ display: 'flex', gap: '4px', background: 'rgba(15,15,26,0.6)', borderRadius: '10px', padding: '3px' }}>
            {TIME_FILTER_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setTimeFilter(tab.value)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '7px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  border: 'none',
                  background: timeFilter === tab.value ? COLORS.primary : 'transparent',
                  color: timeFilter === tab.value ? '#FFFFFF' : COLORS.textSecondary,
                  transition: 'all 0.15s',
                  boxShadow: timeFilter === tab.value ? '0 2px 8px rgba(124,58,237,0.4)' : 'none',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Language filter */}
          <LanguageDropdown value={language} onChange={setLanguage} />

          {language !== 'All' && (
            <button
              onClick={() => setLanguage('All')}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                fontSize: '12px',
                cursor: 'pointer',
                border: `1px solid ${COLORS.border}`,
                background: 'transparent',
                color: COLORS.textMuted,
              }}
            >
              Clear
            </button>
          )}
        </div>

        {/* ===== Rising Stars row ===== */}
        <div
          style={{
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: '16px',
            padding: '18px 20px',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={COLORS.primary} strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              <h2 style={{ fontSize: '15px', fontWeight: '700', color: COLORS.text, margin: 0 }}>Rising Stars</h2>
              <span style={{ fontSize: '11px', color: COLORS.textMuted, fontWeight: '500' }}>Fastest-growing developers this week</span>
            </div>
            <Link
              href="/trending/developers"
              style={{ fontSize: '12px', fontWeight: '600', color: COLORS.primary, textDecoration: 'none' }}
            >
              See all
            </Link>
          </div>
          <RisingStarsRow stars={risingStars} loading={risingStarsLoading} />
        </div>

        {/* ===== Code of the Day + Hashtags row ===== */}
        <div
          className="cotd-hashtags-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '20px',
            marginBottom: '20px',
            alignItems: 'start',
          }}
        >
          {/* Code of the Day */}
          <div>
            <CodeOfTheDay snippet={featuredSnippet} loading={snippetLoading} />
          </div>

          {/* Trending Hashtags */}
          <div
            style={{
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: '16px',
              padding: '18px 20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={COLORS.primary} strokeWidth="2">
                <line x1="4" y1="9" x2="20" y2="9" />
                <line x1="4" y1="15" x2="20" y2="15" />
                <line x1="10" y1="3" x2="8" y2="21" />
                <line x1="16" y1="3" x2="14" y2="21" />
              </svg>
              <h2 style={{ fontSize: '15px', fontWeight: '700', color: COLORS.text, margin: 0 }}>Trending Hashtags</h2>
            </div>
            <TrendingHashtagsGrid hashtags={hashtags} loading={hashtagsLoading} />
          </div>
        </div>

        {/* ===== Language Breakdown ===== */}
        <div
          style={{
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: '16px',
            padding: '18px 20px',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={COLORS.primary} strokeWidth="2">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
            <h2 style={{ fontSize: '15px', fontWeight: '700', color: COLORS.text, margin: 0 }}>Trending by Language</h2>
            <span style={{ fontSize: '11px', color: COLORS.textMuted, fontWeight: '500' }}>Top repos per ecosystem</span>
          </div>
          <LangTrendingTabs timeFilter={timeFilter} />
        </div>

        {/* 3-column grid */}
        <div
          className="trending-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '20px',
            alignItems: 'start',
          }}
        >
          {/* ===== LEFT: Trending Posts ===== */}
          <div>
            <SectionHeader
              title="Trending Posts"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              }
            />

            {postsLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {Array.from({ length: 4 }).map((_, i) => <PostSkeleton key={i} />)}
              </div>
            ) : postsError ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: COLORS.textMuted }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>&#x26A0;&#xFE0F;</div>
                <p style={{ fontSize: '14px' }}>Failed to load posts</p>
                <button
                  onClick={fetchPosts}
                  style={{ marginTop: '10px', padding: '6px 16px', borderRadius: '8px', border: `1px solid ${COLORS.border}`, background: 'transparent', color: COLORS.primary, cursor: 'pointer', fontSize: '13px' }}
                >
                  Retry
                </button>
              </div>
            ) : posts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: COLORS.textMuted }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>&#x1F4AC;</div>
                <p style={{ fontSize: '14px' }}>No trending posts yet</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {posts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            )}
          </div>

          {/* ===== CENTER: Trending Repos ===== */}
          <div>
            <SectionHeader
              title="Trending Repositories"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                </svg>
              }
            />
            <TrendingRepos repos={repos} loading={reposLoading} language={language} />
          </div>

          {/* ===== RIGHT: Trending Developers ===== */}
          <div>
            <SectionHeader
              title="Trending Developers"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              }
            />

            {devsLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {Array.from({ length: 5 }).map((_, i) => <DevSkeleton key={i} />)}
              </div>
            ) : developers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: COLORS.textMuted }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>&#x1F465;</div>
                <p style={{ fontSize: '14px' }}>No trending developers yet</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {developers.map((dev) => (
                  <DeveloperCard key={dev.id} dev={dev} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Responsive overrides via a style tag */}
        <style>{`
          @media (max-width: 1024px) {
            .trending-grid {
              grid-template-columns: repeat(2, 1fr) !important;
            }
            .trending-grid > *:last-child {
              grid-column: 1 / -1;
            }
            .cotd-hashtags-grid {
              grid-template-columns: 1fr !important;
            }
          }
          @media (max-width: 640px) {
            .trending-grid {
              grid-template-columns: 1fr !important;
            }
            .trending-grid > *:last-child {
              grid-column: auto;
            }
            .cotd-hashtags-grid {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Internal type alias used in fetchDevelopers mapping
// ---------------------------------------------------------------------------

interface TrendingCreator {
  id: string
  username: string
  avatar?: string
  verified?: boolean
  _count?: { followers: number; posts: number }
}

interface TrendingPost {
  id: string
  content?: string
  mediaUrl?: string
  likesCount: number
  commentsCount: number
  createdAt: string
  user?: { id: string; username: string; avatar?: string; verified?: boolean }
  repository?: { id: string; fullName: string; language?: string }
}
