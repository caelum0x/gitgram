'use client'

/**
 * BadgesPage — /[username]/badges
 *
 * Displays a user's achievement badges grouped by category.
 * Earned badges are shown in full colour with a shimmer animation;
 * unearned badges are greyed out at 40% opacity with a progress bar
 * showing how close the user is to earning them.
 *
 * Data: GET /v1/users/:username/badges
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { notFound, useParams } from 'next/navigation'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_URL =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL) ||
  'http://localhost:4000/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BadgeCategory = 'contributor' | 'social' | 'content' | 'platform'

interface BadgeDefinition {
  id: string
  name: string
  description: string
  icon: string
  category: BadgeCategory
  xp: number
}

interface UserBadge {
  badgeId: string
  earnedAt: string
  progress: number
  threshold: number
}

interface BadgesPayload {
  badges: UserBadge[]
  totalXp: number
  currentStreak: number
  level: number
  levelName: string
  nextLevelXp: number
  currentLevelXp: number
}

interface BadgeDisplayItem extends BadgeDefinition {
  earned: boolean
  earnedAt: string | null
  progress: number
  threshold: number
}

// ---------------------------------------------------------------------------
// Badge catalogue (static definitions)
// ---------------------------------------------------------------------------

const BADGE_DEFINITIONS: BadgeDefinition[] = [
  // Contributor
  {
    id: 'first-commit',
    name: 'First Commit',
    description: 'Made your very first commit',
    icon: '🌱',
    category: 'contributor',
    xp: 50,
  },
  {
    id: '100-commits',
    name: '100 Commits',
    description: 'Reached 100 commits',
    icon: '💯',
    category: 'contributor',
    xp: 200,
  },
  {
    id: '1k-commits',
    name: '1K Commits',
    description: 'Reached 1,000 commits',
    icon: '🔥',
    category: 'contributor',
    xp: 800,
  },
  {
    id: 'open-source-hero',
    name: 'Open Source Hero',
    description: 'Had 50 or more pull requests merged',
    icon: '🦸',
    category: 'contributor',
    xp: 600,
  },
  // Social
  {
    id: 'popular-dev',
    name: 'Popular Dev',
    description: 'Gained 100 followers',
    icon: '⭐',
    category: 'social',
    xp: 300,
  },
  {
    id: 'influencer',
    name: 'Influencer',
    description: 'Gained 1,000 followers',
    icon: '📣',
    category: 'social',
    xp: 1000,
  },
  {
    id: 'star-power',
    name: 'Star Power',
    description: 'Your repositories were starred 1,000 times',
    icon: '✨',
    category: 'social',
    xp: 750,
  },
  // Content
  {
    id: 'storyteller',
    name: 'Storyteller',
    description: 'Created 10 stories',
    icon: '📖',
    category: 'content',
    xp: 250,
  },
  {
    id: 'code-poet',
    name: 'Code Poet',
    description: 'Had 5 featured code snippets',
    icon: '🎨',
    category: 'content',
    xp: 400,
  },
  {
    id: 'trending-author',
    name: 'Trending Author',
    description: 'A post of yours trended for 24 hours',
    icon: '📈',
    category: 'content',
    xp: 500,
  },
  // Platform
  {
    id: 'early-adopter',
    name: 'Early Adopter',
    description: 'Joined Gitgram in its first month',
    icon: '🚀',
    category: 'platform',
    xp: 150,
  },
  {
    id: 'power-user',
    name: 'Power User',
    description: 'Active on Gitgram for 365 days',
    icon: '⚡',
    category: 'platform',
    xp: 1200,
  },
  {
    id: 'bug-hunter',
    name: 'Bug Hunter',
    description: 'Reported 5 verified bugs',
    icon: '🐛',
    category: 'platform',
    xp: 350,
  },
]

const CATEGORY_LABELS: Record<BadgeCategory, string> = {
  contributor: 'Contributor',
  social: 'Social',
  content: 'Content',
  platform: 'Platform',
}

const CATEGORY_ORDER: BadgeCategory[] = ['contributor', 'social', 'content', 'platform']

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDisplayItems(payload: BadgesPayload): BadgeDisplayItem[] {
  return BADGE_DEFINITIONS.map((def) => {
    const userBadge = payload.badges.find((b) => b.badgeId === def.id)
    return {
      ...def,
      earned: userBadge !== undefined,
      earnedAt: userBadge?.earnedAt ?? null,
      progress: userBadge?.progress ?? 0,
      threshold: userBadge?.threshold ?? 1,
    }
  })
}

function getFeaturedBadges(items: BadgeDisplayItem[]): BadgeDisplayItem[] {
  return items.filter((b) => b.earned).slice(0, 4)
}

function levelProgressPercent(payload: BadgesPayload): number {
  const range = payload.nextLevelXp - payload.currentLevelXp
  if (range <= 0) return 100
  const gained = payload.totalXp - payload.currentLevelXp
  return Math.min(100, Math.max(0, Math.round((gained / range) * 100)))
}

async function fetchBadges(username: string): Promise<BadgesPayload | null> {
  try {
    const res = await fetch(`${API_URL}/v1/users/${username}/badges`)
    if (res.status === 404) return null
    if (!res.ok) return null
    return (await res.json()) as BadgesPayload
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ProgressBarProps {
  value: number
  max: number
  earned: boolean
}

function ProgressBar({ value, max, earned }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div
      style={{
        height: '4px',
        borderRadius: '2px',
        background: 'var(--border)',
        overflow: 'hidden',
        marginTop: '6px',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          borderRadius: '2px',
          background: earned ? 'var(--accent)' : 'var(--primary)',
          transition: 'width 0.6s ease',
        }}
      />
    </div>
  )
}

interface BadgeCardProps {
  badge: BadgeDisplayItem
  featured?: boolean
}

function BadgeCard({ badge, featured = false }: BadgeCardProps) {
  const cardSize = featured ? '140px' : '100%'
  const iconSize = featured ? '2.5rem' : '2rem'

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: `1px solid ${badge.earned ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: '12px',
        padding: featured ? '20px 16px' : '16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        minWidth: cardSize,
        opacity: badge.earned ? 1 : 0.4,
        filter: badge.earned ? 'none' : 'grayscale(100%)',
        position: 'relative',
        overflow: 'hidden',
        transition: 'transform 0.2s, box-shadow 0.2s',
        cursor: 'default',
      }}
      className={badge.earned ? 'badge-earned' : ''}
    >
      {badge.earned && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: '-75%',
            width: '50%',
            height: '100%',
            background:
              'linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.15) 50%, transparent 70%)',
            animation: 'shimmer 2.5s infinite',
            pointerEvents: 'none',
          }}
        />
      )}

      <span style={{ fontSize: iconSize, lineHeight: 1 }}>{badge.icon}</span>

      <span
        style={{
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'var(--foreground)',
          textAlign: 'center',
          lineHeight: 1.2,
        }}
      >
        {badge.name}
      </span>

      {!featured && (
        <>
          <span
            style={{
              fontSize: '0.65rem',
              color: 'var(--foreground-secondary)',
              textAlign: 'center',
              lineHeight: 1.3,
            }}
          >
            {badge.description}
          </span>

          {!badge.earned && (
            <div style={{ width: '100%' }}>
              <span
                style={{
                  fontSize: '0.6rem',
                  color: 'var(--foreground-secondary)',
                }}
              >
                {badge.progress} / {badge.threshold}
              </span>
              <ProgressBar
                value={badge.progress}
                max={badge.threshold}
                earned={badge.earned}
              />
            </div>
          )}

          {badge.earned && badge.earnedAt && (
            <span
              style={{
                fontSize: '0.6rem',
                color: 'var(--accent)',
                fontWeight: 500,
              }}
            >
              Earned{' '}
              {new Date(badge.earnedAt).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </span>
          )}

          <span
            style={{
              fontSize: '0.6rem',
              color: 'var(--primary)',
              fontWeight: 600,
            }}
          >
            +{badge.xp} XP
          </span>
        </>
      )}
    </div>
  )
}

interface StatsCardProps {
  payload: BadgesPayload
  earnedCount: number
  totalCount: number
}

function StatsCard({ payload, earnedCount, totalCount }: StatsCardProps) {
  const pct = levelProgressPercent(payload)

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: '0.85rem',
          fontWeight: 700,
          color: 'var(--foreground)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        Activity Stats
      </h2>

      {/* Level */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '6px',
          }}
        >
          <span style={{ fontSize: '0.75rem', color: 'var(--foreground-secondary)' }}>
            Level {payload.level}
          </span>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              color: 'var(--primary)',
              background: 'var(--background-light)',
              padding: '2px 8px',
              borderRadius: '12px',
            }}
          >
            {payload.levelName}
          </span>
        </div>
        <div
          style={{
            height: '6px',
            borderRadius: '3px',
            background: 'var(--border)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              background: 'linear-gradient(90deg, var(--primary), var(--accent))',
              borderRadius: '3px',
              transition: 'width 0.8s ease',
            }}
          />
        </div>
        <span
          style={{
            fontSize: '0.65rem',
            color: 'var(--foreground-secondary)',
            marginTop: '4px',
            display: 'block',
          }}
        >
          {payload.totalXp.toLocaleString()} / {payload.nextLevelXp.toLocaleString()} XP
        </span>
      </div>

      {/* Stat rows */}
      {[
        { label: 'Total XP', value: payload.totalXp.toLocaleString(), color: 'var(--primary)' },
        {
          label: 'Current Streak',
          value: `${payload.currentStreak} days`,
          color: '#f97316',
        },
        {
          label: 'Badges Earned',
          value: `${earnedCount} / ${totalCount}`,
          color: 'var(--accent)',
        },
      ].map(({ label, value, color }) => (
        <div
          key={label}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 0',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <span style={{ fontSize: '0.75rem', color: 'var(--foreground-secondary)' }}>
            {label}
          </span>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color }}>{value}</span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function PageSkeleton() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--background)',
        padding: '32px 24px',
        maxWidth: '1200px',
        margin: '0 auto',
      }}
    >
      <div
        style={{
          height: '36px',
          width: '240px',
          borderRadius: '8px',
          background: 'var(--surface)',
          marginBottom: '32px',
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
      />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
        }}
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            style={{
              height: '140px',
              borderRadius: '12px',
              background: 'var(--surface)',
              animation: 'pulse 1.5s ease-in-out infinite',
              animationDelay: `${i * 0.05}s`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BadgesPage() {
  const params = useParams<{ username: string }>()
  const username = params?.username ?? ''

  const [payload, setPayload] = useState<BadgesPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!username) return

    setLoading(true)
    fetchBadges(username)
      .then((data) => {
        if (data === null) {
          // Return a default payload so the page renders with all badges unearned
          setPayload({
            badges: [],
            totalXp: 0,
            currentStreak: 0,
            level: 1,
            levelName: 'Newcomer',
            nextLevelXp: 500,
            currentLevelXp: 0,
          })
        } else {
          setPayload(data)
        }
      })
      .catch(() => setError('Failed to load badges.'))
      .finally(() => setLoading(false))
  }, [username])

  if (loading) return <PageSkeleton />

  if (error) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--background)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--error)',
        }}
      >
        {error}
      </div>
    )
  }

  if (!payload) {
    notFound()
  }

  const allBadges = buildDisplayItems(payload)
  const featured = getFeaturedBadges(allBadges)
  const earnedCount = allBadges.filter((b) => b.earned).length
  const totalCount = allBadges.length

  return (
    <>
      {/* Keyframe styles injected once */}
      <style>{`
        @keyframes shimmer {
          0%   { left: -75%; }
          100% { left: 125%; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        .badge-earned:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(88, 166, 255, 0.18);
        }
      `}</style>

      <div
        style={{
          minHeight: '100vh',
          background: 'var(--background)',
          color: 'var(--foreground)',
          fontFamily: 'inherit',
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '40px 24px',
          }}
        >
          {/* Back link */}
          <Link
            href={`/${username}`}
            style={{
              fontSize: '0.8rem',
              color: 'var(--foreground-secondary)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              marginBottom: '24px',
            }}
          >
            ← @{username}
          </Link>

          {/* ---- Header ---- */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '32px',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: '1.75rem',
                  fontWeight: 800,
                  color: 'var(--foreground)',
                  letterSpacing: '-0.02em',
                }}
              >
                Achievements
              </h1>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: '0.875rem',
                  color: 'var(--foreground-secondary)',
                }}
              >
                @{username}
              </p>
            </div>

            <div
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '24px',
                padding: '8px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '1.1rem' }}>🏅</span>
              <span
                style={{
                  fontSize: '1rem',
                  fontWeight: 700,
                  color: 'var(--foreground)',
                }}
              >
                {earnedCount}
              </span>
              <span
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--foreground-secondary)',
                }}
              >
                / {totalCount} earned
              </span>
            </div>
          </div>

          {/* ---- Two-column layout ---- */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 260px',
              gap: '32px',
              alignItems: 'start',
            }}
          >
            {/* ---- Left: featured + categories ---- */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>

              {/* Featured row */}
              {featured.length > 0 && (
                <section>
                  <h2
                    style={{
                      margin: '0 0 16px',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      color: 'var(--foreground-secondary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}
                  >
                    Featured
                  </h2>
                  <div
                    style={{
                      display: 'flex',
                      gap: '12px',
                      flexWrap: 'wrap',
                    }}
                  >
                    {featured.map((b) => (
                      <BadgeCard key={b.id} badge={b} featured />
                    ))}
                  </div>
                </section>
              )}

              {/* Badge grid by category */}
              {CATEGORY_ORDER.map((cat) => {
                const items = allBadges.filter((b) => b.category === cat)
                return (
                  <section key={cat}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        marginBottom: '16px',
                      }}
                    >
                      <h2
                        style={{
                          margin: 0,
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          color: 'var(--foreground-secondary)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                        }}
                      >
                        {CATEGORY_LABELS[cat]}
                      </h2>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          color: 'var(--foreground-secondary)',
                          background: 'var(--background-light)',
                          borderRadius: '12px',
                          padding: '2px 8px',
                        }}
                      >
                        {items.filter((b) => b.earned).length} / {items.length}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '12px',
                      }}
                    >
                      {items.map((b) => (
                        <BadgeCard key={b.id} badge={b} />
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>

            {/* ---- Right: stats sidebar ---- */}
            <aside
              style={{ position: 'sticky', top: '24px' }}
            >
              <StatsCard
                payload={payload}
                earnedCount={earnedCount}
                totalCount={totalCount}
              />
            </aside>
          </div>
        </div>
      </div>
    </>
  )
}
