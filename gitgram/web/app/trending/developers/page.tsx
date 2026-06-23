'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Period = 'today' | 'week' | 'month'

interface TrendingDev {
  id: string
  username: string
  displayName?: string
  bio?: string
  location?: string
  avatar?: string
  verified?: boolean
  newFollowers: number
  totalFollowers: number
  topLanguages: string[]
  isFollowing?: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PERIOD_TABS: { label: string; value: Period }[] = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
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
  Shell: '#89e051',
  Dart: '#00B4AB',
}

const RANK_STYLES: Record<number, { bg: string; color: string; label: string }> = {
  1: { bg: 'rgba(234,179,8,0.15)', color: '#EAB308', label: '#1' },
  2: { bg: 'rgba(156,163,175,0.12)', color: '#9CA3AF', label: '#2' },
  3: { bg: 'rgba(249,115,22,0.12)', color: '#F97316', label: '#3' },
}

const COLORS = {
  bg: '#0F0F1A',
  surface: '#1A1A2E',
  border: '#2D2D50',
  primary: '#7C3AED',
  primaryLight: 'rgba(124,58,237,0.15)',
  text: '#E2E8F0',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
}

const PAGE_SIZE = 20

// ---------------------------------------------------------------------------
// Internal mapper type
// ---------------------------------------------------------------------------

interface RawDev {
  id: string
  username: string
  displayName?: string
  bio?: string
  location?: string
  avatar?: string
  verified?: boolean
  newFollowers?: number
  followersGained?: number
  followersCount?: number
  topLanguages?: string[]
  languages?: string[]
  isFollowing?: boolean
  _count?: { followers?: number }
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function DevRowSkeleton() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '16px 20px',
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: '14px',
        animation: 'pulse 1.5s ease-in-out infinite',
      }}
    >
      <div style={{ width: '42px', height: '42px', borderRadius: '8px', background: 'rgba(45,45,80,0.6)', flexShrink: 0 }} />
      <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(45,45,80,0.6)', flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ height: '13px', width: '160px', borderRadius: '6px', background: 'rgba(45,45,80,0.6)' }} />
        <div style={{ height: '11px', width: '220px', borderRadius: '6px', background: 'rgba(45,45,80,0.5)' }} />
      </div>
      <div style={{ height: '36px', width: '80px', borderRadius: '8px', background: 'rgba(45,45,80,0.6)', flexShrink: 0 }} />
      <div style={{ height: '40px', width: '72px', borderRadius: '8px', background: 'rgba(45,45,80,0.6)', flexShrink: 0 }} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Developer row card
// ---------------------------------------------------------------------------

interface DevRowProps {
  dev: TrendingDev
  rank: number
  period: Period
}

function DevRow({ dev, rank, period }: DevRowProps) {
  const [isFollowing, setIsFollowing] = useState(dev.isFollowing ?? false)
  const [followPending, setFollowPending] = useState(false)
  const rankStyle = RANK_STYLES[rank]
  const initials = (dev.displayName ?? dev.username).charAt(0).toUpperCase()

  const handleFollow = async (e: React.MouseEvent) => {
    e.preventDefault()
    if (followPending) return
    const next = !isFollowing
    setIsFollowing(next)
    setFollowPending(true)
    try {
      if (next) {
        await api.post(`/users/${dev.username}/follow`)
      } else {
        await api.delete(`/users/${dev.username}/follow`)
      }
    } catch {
      setIsFollowing(!next)
    } finally {
      setFollowPending(false)
    }
  }

  const periodLabel = period === 'today' ? 'today' : period === 'week' ? 'this week' : 'this month'

  return (
    <Link href={`/${dev.username}`} style={{ textDecoration: 'none' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          padding: '14px 18px',
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: '14px',
          transition: 'border-color 0.15s, background 0.15s',
          cursor: 'pointer',
          flexWrap: 'wrap',
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLDivElement
          el.style.borderColor = 'rgba(124,58,237,0.45)'
          el.style.background = 'rgba(26,26,46,0.95)'
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLDivElement
          el.style.borderColor = COLORS.border
          el.style.background = COLORS.surface
        }}
      >
        {/* Rank badge */}
        <div
          style={{
            minWidth: '40px',
            height: '40px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: rankStyle ? rankStyle.bg : 'rgba(45,45,80,0.3)',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: rank <= 3 ? '13px' : '14px',
              fontWeight: '800',
              color: rankStyle ? rankStyle.color : COLORS.textMuted,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {rankStyle ? rankStyle.label : `#${rank}`}
          </span>
        </div>

        {/* Avatar */}
        {dev.avatar ? (
          <img
            src={dev.avatar}
            alt={dev.displayName ?? dev.username}
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              objectFit: 'cover',
              border: `2px solid ${rank <= 3 ? (rankStyle?.color ?? COLORS.border) + '60' : COLORS.border}`,
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #7C3AED, #4F46E5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              fontWeight: '700',
              color: '#FFFFFF',
              border: `2px solid ${COLORS.border}`,
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
        )}

        {/* Identity + bio + location */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '15px', fontWeight: '700', color: COLORS.text, whiteSpace: 'nowrap' }}>
              {dev.displayName ?? dev.username}
            </span>
            <span style={{ fontSize: '13px', color: COLORS.textMuted }}>@{dev.username}</span>
            {dev.verified && (
              <svg width="14" height="14" viewBox="0 0 20 20" fill={COLORS.primary} style={{ flexShrink: 0 }}>
                <path
                  fillRule="evenodd"
                  d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </div>

          {dev.bio && (
            <div
              style={{
                fontSize: '12px',
                color: COLORS.textSecondary,
                marginTop: '2px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '360px',
              }}
            >
              {dev.bio}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px', flexWrap: 'wrap' }}>
            {dev.location && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: COLORS.textMuted }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {dev.location}
              </span>
            )}

            {/* Top language dots */}
            {dev.topLanguages.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                {dev.topLanguages.slice(0, 3).map((lang) => (
                  <span
                    key={lang}
                    title={lang}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                      fontSize: '11px',
                      color: COLORS.textMuted,
                    }}
                  >
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: LANGUAGE_COLORS[lang] ?? '#6b7280',
                        flexShrink: 0,
                      }}
                    />
                    {lang}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* New followers stat */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '2px',
            padding: '8px 14px',
            background: 'rgba(34,197,94,0.08)',
            borderRadius: '10px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
              <polyline points="18 15 12 9 6 15" />
            </svg>
            <span style={{ fontSize: '18px', fontWeight: '800', color: '#22c55e', fontVariantNumeric: 'tabular-nums' }}>
              {dev.newFollowers >= 1000
                ? `${(dev.newFollowers / 1000).toFixed(1)}k`
                : `+${dev.newFollowers}`}
            </span>
          </div>
          <span style={{ fontSize: '10px', color: COLORS.textMuted, fontWeight: '500', whiteSpace: 'nowrap' }}>
            new followers {periodLabel}
          </span>
        </div>

        {/* Follow button */}
        <button
          onClick={handleFollow}
          disabled={followPending}
          style={{
            padding: '8px 18px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: followPending ? 'wait' : 'pointer',
            border: `1px solid ${isFollowing ? COLORS.border : COLORS.primary}`,
            background: isFollowing ? 'transparent' : COLORS.primaryLight,
            color: isFollowing ? COLORS.textSecondary : COLORS.primary,
            flexShrink: 0,
            transition: 'all 0.15s',
            opacity: followPending ? 0.6 : 1,
          }}
        >
          {isFollowing ? 'Following' : 'Follow'}
        </button>
      </div>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function TrendingDevelopersPage() {
  const router = useRouter()
  const { isAuthenticated, isInitialized, initialize } = useAuthStore()

  const [period, setPeriod] = useState<Period>('week')
  const [developers, setDevelopers] = useState<TrendingDev[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(0)
  const observerRef = useRef<HTMLDivElement>(null)

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

  const mapDev = (u: RawDev): TrendingDev => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    bio: u.bio,
    location: u.location,
    avatar: u.avatar,
    verified: u.verified,
    newFollowers: u.newFollowers ?? u.followersGained ?? 0,
    totalFollowers: u.followersCount ?? u._count?.followers ?? 0,
    topLanguages: u.topLanguages ?? u.languages ?? [],
    isFollowing: u.isFollowing ?? false,
  })

  const fetchDevelopers = useCallback(
    async (nextPage: number, replace: boolean) => {
      if (replace) {
        setLoading(true)
        setDevelopers([])
        setHasMore(true)
      } else {
        setLoadingMore(true)
      }

      try {
        const { data } = await api.get('/v1/trending/developers', {
          params: { period, limit: PAGE_SIZE, offset: nextPage * PAGE_SIZE },
        })
        const raw: RawDev[] = data?.developers ?? data?.users ?? data?.data ?? []
        const mapped = raw.map(mapDev)

        setDevelopers((prev) => (replace ? mapped : [...prev, ...mapped]))
        setPage(nextPage)
        setHasMore(mapped.length === PAGE_SIZE)
      } catch {
        if (replace) setDevelopers([])
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [period],
  )

  // Refetch when period changes
  useEffect(() => {
    if (!isAuthenticated) return
    fetchDevelopers(0, true)
  }, [isAuthenticated, fetchDevelopers])

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    if (!observerRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          fetchDevelopers(page + 1, false)
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(observerRef.current)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, loading, page, fetchDevelopers])

  if (!isInitialized || !isAuthenticated) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: COLORS.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            border: `2px solid ${COLORS.primary}`,
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.7s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        * { box-sizing: border-box; }
      `}</style>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '24px 16px' }}>

        {/* Back + title */}
        <div style={{ marginBottom: '24px' }}>
          <Link
            href="/trending"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              color: COLORS.textMuted,
              textDecoration: 'none',
              marginBottom: '12px',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to Trending
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={COLORS.primary} strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <h1
              style={{
                fontSize: '26px',
                fontWeight: '800',
                margin: 0,
                background: `linear-gradient(135deg, ${COLORS.text}, ${COLORS.primary})`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Trending Developers
            </h1>
          </div>
          <p style={{ color: COLORS.textSecondary, fontSize: '14px', margin: 0 }}>
            Developers gaining the most followers on Gitgram
          </p>
        </div>

        {/* Period tabs */}
        <div
          style={{
            display: 'flex',
            gap: '4px',
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: '12px',
            padding: '4px',
            marginBottom: '24px',
            width: 'fit-content',
          }}
        >
          {PERIOD_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setPeriod(tab.value)}
              style={{
                padding: '7px 20px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                border: 'none',
                background: period === tab.value ? COLORS.primary : 'transparent',
                color: period === tab.value ? '#FFFFFF' : COLORS.textSecondary,
                transition: 'all 0.15s',
                boxShadow: period === tab.value ? '0 2px 8px rgba(124,58,237,0.35)' : 'none',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Developer list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {loading ? (
            Array.from({ length: 10 }).map((_, i) => <DevRowSkeleton key={i} />)
          ) : developers.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '60px 0',
                color: COLORS.textMuted,
              }}
            >
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>&#x1F465;</div>
              <p style={{ fontSize: '15px', fontWeight: '600', color: COLORS.textSecondary, marginBottom: '6px' }}>
                No trending developers yet
              </p>
              <p style={{ fontSize: '13px' }}>Check back soon — rankings update hourly.</p>
            </div>
          ) : (
            developers.map((dev, idx) => (
              <DevRow key={dev.id} dev={dev} rank={idx + 1} period={period} />
            ))
          )}

          {/* Load-more skeleton rows (infinite scroll) */}
          {loadingMore && Array.from({ length: 5 }).map((_, i) => <DevRowSkeleton key={`more-${i}`} />)}

          {/* Sentinel for IntersectionObserver */}
          {!loading && hasMore && (
            <div ref={observerRef} style={{ height: '1px' }} aria-hidden="true" />
          )}

          {/* End-of-list message */}
          {!loading && !hasMore && developers.length > 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: '24px 0',
                fontSize: '13px',
                color: COLORS.textMuted,
              }}
            >
              You&apos;ve seen all {developers.length} trending developers.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
