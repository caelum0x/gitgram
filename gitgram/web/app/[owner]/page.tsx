'use client'

/**
 * UserProfilePage — /[username]
 *
 * Hybrid server/client page. The outer shell is a client component so that
 * the FollowButton island and tab-switching state can live in the same file.
 * Data is fetched on the client via SWR-style useEffect so the page stays
 * fully dynamic; the notFound() redirect is handled by checking the status
 * code in the fetch response.
 *
 * Architecture note: Next.js App Router allows async server components OR
 * client components at the page level. Because we need both ISR-style
 * revalidation (next: { revalidate: 30 }) AND interactive islands
 * (FollowButton, tabs), we keep the page as a client component and perform
 * the initial fetch inside a useEffect. The fetch options with
 * `{ next: { revalidate: 30 } }` are still forwarded so the Response is
 * cached at the edge for 30 s when running under Next.js edge runtime.
 */

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ProfileStats } from '@/components/ProfileStats'
import { ContributionGraph } from '@/components/ContributionGraph'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_URL =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL) ||
  'http://localhost:4000/api'

// Dark-theme colour tokens (inline — no Tailwind variables required)
const COLORS = {
  bg: '#0F0F1A',
  surface: '#1A1A2E',
  primary: '#7C3AED',
  primaryHover: '#6D28D9',
  border: '#2D2D4E',
  textPrimary: '#F1F0FF',
  textSecondary: '#9994C4',
  muted: '#252540',
  error: '#F87171',
} as const

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SocialLink {
  url: string
  platform: string
}

interface UserProfile {
  id: string
  username: string
  displayName?: string
  bio?: string
  avatar?: string
  location?: string
  website?: string
  postsCount: number
  snippetsCount: number
  followersCount: number
  followingCount: number
  reposCount: number
  starsCount: number
  isFollowing: boolean
  socialLinks: SocialLink[]
  // legacy field aliases accepted from the API
  posts?: number
  snippets?: number
  followers?: number
  following?: number
  repos?: number
  stars?: number
  links?: SocialLink[]
}

interface Contribution {
  date: string
  count: number
}

interface Post {
  id: string
  content?: string
  mediaUrl?: string
  mediaUrls?: string[]
  createdAt: string
  likesCount: number
  commentsCount: number
  user: { id: string; username: string; avatar?: string }
}

interface Repo {
  id: string
  name: string
  fullName?: string
  description?: string
  stars: number
  language?: string
  owner?: string
}

type TabId = 'posts' | 'repositories' | 'liked'

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

async function fetchProfile(username: string): Promise<{ profile: UserProfile | null; is404: boolean }> {
  try {
    const res = await fetch(`${API_URL}/v1/users/${username}`, {
      next: { revalidate: 30 },
    })
    if (res.status === 404) return { profile: null, is404: true }
    if (!res.ok) return { profile: null, is404: false }
    const data = await res.json()
    // normalise legacy field names
    const profile: UserProfile = {
      ...data,
      postsCount: data.postsCount ?? data.posts ?? 0,
      snippetsCount: data.snippetsCount ?? data.snippets ?? 0,
      followersCount: data.followersCount ?? data.followers ?? 0,
      followingCount: data.followingCount ?? data.following ?? 0,
      reposCount: data.reposCount ?? data.repos ?? 0,
      starsCount: data.starsCount ?? data.stars ?? 0,
      socialLinks: data.socialLinks ?? data.links ?? [],
    }
    return { profile, is404: false }
  } catch {
    return { profile: null, is404: false }
  }
}

async function fetchContributions(username: string, year: number): Promise<Contribution[]> {
  try {
    const res = await fetch(
      `${API_URL}/v1/users/${username}/contributions?year=${year}`,
    )
    if (!res.ok) return []
    const data = await res.json()
    const raw: unknown = data.contributions ?? data ?? []
    if (!Array.isArray(raw)) return []
    return raw
      .filter(
        (c): c is Contribution =>
          typeof c === 'object' &&
          c !== null &&
          typeof (c as Contribution).date === 'string' &&
          typeof (c as Contribution).count === 'number',
      )
      .map((c) => ({ date: c.date, count: c.count }))
  } catch {
    return []
  }
}

async function fetchUserPosts(username: string): Promise<Post[]> {
  try {
    const res = await fetch(`${API_URL}/v1/users/${username}/posts`)
    if (!res.ok) return []
    const data = await res.json()
    return data.posts ?? data ?? []
  } catch {
    return []
  }
}

async function fetchUserRepos(username: string): Promise<Repo[]> {
  try {
    const res = await fetch(`${API_URL}/v1/users/${username}/repositories`)
    if (!res.ok) return []
    const data = await res.json()
    return data.repositories ?? data ?? []
  } catch {
    return []
  }
}

async function fetchLikedPosts(username: string): Promise<Post[]> {
  try {
    const res = await fetch(`${API_URL}/v1/users/${username}/liked-posts`)
    if (!res.ok) return []
    const data = await res.json()
    return data.posts ?? data ?? []
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// FollowButton — client component island (co-located per spec)
// ---------------------------------------------------------------------------

interface FollowButtonProps {
  profileId: string
  username: string
  initialIsFollowing: boolean
}

function FollowButton({ profileId, username: _username, initialIsFollowing }: FollowButtonProps) {
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing)
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    if (loading) return
    setLoading(true)
    const prev = isFollowing
    setIsFollowing(!prev) // optimistic
    try {
      const method = prev ? 'DELETE' : 'POST'
      const res = await fetch(`${API_URL}/v1/users/${profileId}/follow`, { method })
      if (!res.ok) throw new Error('Request failed')
    } catch {
      setIsFollowing(prev) // revert
    } finally {
      setLoading(false)
    }
  }

  const base: React.CSSProperties = {
    padding: '6px 20px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.6 : 1,
    border: 'none',
    transition: 'background 0.15s',
  }

  const style: React.CSSProperties = isFollowing
    ? { ...base, background: COLORS.muted, color: COLORS.textPrimary, border: `1px solid ${COLORS.border}` }
    : { ...base, background: COLORS.primary, color: '#fff' }

  return (
    <button onClick={handleClick} disabled={loading} style={style}>
      {loading ? '…' : isFollowing ? 'Following' : 'Follow'}
    </button>
  )
}

// ---------------------------------------------------------------------------
// PostGrid — used by Posts and Liked tabs
// ---------------------------------------------------------------------------

function PostGrid({ posts, loading }: { posts: Post[]; loading: boolean }) {
  if (loading) {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 4,
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            style={{
              background: COLORS.muted,
              borderRadius: 6,
              aspectRatio: '1',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
        ))}
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <p style={{ textAlign: 'center', color: COLORS.textSecondary, padding: '48px 0' }}>
        Nothing here yet.
      </p>
    )
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 4,
      }}
    >
      {posts.map((post) => (
        <Link
          key={post.id}
          href={`/post/${post.id}`}
          style={{ textDecoration: 'none' }}
        >
          <div
            style={{
              background: COLORS.surface,
              borderRadius: 6,
              aspectRatio: '1',
              overflow: 'hidden',
              position: 'relative',
              border: `1px solid ${COLORS.border}`,
            }}
          >
            {post.mediaUrl || (post.mediaUrls && post.mediaUrls[0]) ? (
              <Image
                src={post.mediaUrl ?? post.mediaUrls![0]}
                alt="Post media"
                fill
                sizes="(max-width: 768px) 33vw, 200px"
                style={{ objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  padding: 12,
                  fontSize: 13,
                  color: COLORS.textSecondary,
                  overflow: 'hidden',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'flex-start',
                }}
              >
                <p
                  style={{
                    margin: 0,
                    display: '-webkit-box',
                    WebkitLineClamp: 4,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {post.content ?? ''}
                </p>
              </div>
            )}
          </div>
        </Link>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// RepoList — Repositories tab
// ---------------------------------------------------------------------------

function RepoList({ repos, loading }: { repos: Repo[]; loading: boolean }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              background: COLORS.muted,
              borderRadius: 8,
              height: 72,
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
        ))}
      </div>
    )
  }

  if (repos.length === 0) {
    return (
      <p style={{ textAlign: 'center', color: COLORS.textSecondary, padding: '48px 0' }}>
        No repositories yet.
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {repos.map((repo) => (
        <Link
          key={repo.id}
          href={`/${repo.owner ?? 'unknown'}/${repo.name}`}
          style={{ textDecoration: 'none' }}
        >
          <div
            style={{
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 10,
              padding: '14px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 15,
                  fontWeight: 600,
                  color: COLORS.primary,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {repo.name}
              </p>
              {repo.description && (
                <p
                  style={{
                    margin: '4px 0 0',
                    fontSize: 13,
                    color: COLORS.textSecondary,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {repo.description}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 12, flexShrink: 0, alignItems: 'center' }}>
              {repo.language && (
                <span style={{ fontSize: 12, color: COLORS.textSecondary }}>{repo.language}</span>
              )}
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 13,
                  color: COLORS.textSecondary,
                }}
              >
                <svg
                  width="14"
                  height="14"
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
                {repo.stars.toLocaleString()}
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  params: { owner: string }
}

export default function UserProfilePage({ params }: PageProps) {
  const { owner: username } = params

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>('posts')

  const [posts, setPosts] = useState<Post[]>([])
  const [repos, setRepos] = useState<Repo[]>([])
  const [liked, setLiked] = useState<Post[]>([])
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [loadingLiked, setLoadingLiked] = useState(false)
  const [postsLoaded, setPostsLoaded] = useState(false)
  const [reposLoaded, setReposLoaded] = useState(false)
  const [likedLoaded, setLikedLoaded] = useState(false)
  const [is404, setIs404] = useState(false)

  // Contribution graph state
  const CURRENT_YEAR = new Date().getFullYear()
  const CONTRIBUTION_YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i)
  const [contributionYear, setContributionYear] = useState<number>(CURRENT_YEAR)
  const [contributions, setContributions] = useState<Contribution[]>([])
  const [loadingContributions, setLoadingContributions] = useState(false)

  // Load profile
  useEffect(() => {
    setLoadingProfile(true)
    fetchProfile(username).then(({ profile: p, is404: missing }) => {
      setIs404(missing)
      setProfile(p)
      setLoadingProfile(false)
    })
  }, [username])

  // Trigger notFound() when 404 detected
  if (is404) notFound()

  // Lazy-load tab data
  const loadPosts = useCallback(async () => {
    if (postsLoaded) return
    setLoadingPosts(true)
    const data = await fetchUserPosts(username)
    setPosts(data)
    setPostsLoaded(true)
    setLoadingPosts(false)
  }, [username, postsLoaded])

  const loadRepos = useCallback(async () => {
    if (reposLoaded) return
    setLoadingRepos(true)
    const data = await fetchUserRepos(username)
    setRepos(data)
    setReposLoaded(true)
    setLoadingRepos(false)
  }, [username, reposLoaded])

  const loadLiked = useCallback(async () => {
    if (likedLoaded) return
    setLoadingLiked(true)
    const data = await fetchLikedPosts(username)
    setLiked(data)
    setLikedLoaded(true)
    setLoadingLiked(false)
  }, [username, likedLoaded])

  // Load initial tab
  useEffect(() => { loadPosts() }, [loadPosts])

  // Load contribution graph data (re-fetches when username or selected year changes)
  useEffect(() => {
    let cancelled = false
    setLoadingContributions(true)
    fetchContributions(username, contributionYear).then((data) => {
      if (cancelled) return
      setContributions(data)
      setLoadingContributions(false)
    })
    return () => {
      cancelled = true
    }
  }, [username, contributionYear])

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab)
    if (tab === 'posts') loadPosts()
    if (tab === 'repositories') loadRepos()
    if (tab === 'liked') loadLiked()
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'posts', label: 'Posts' },
    { id: 'repositories', label: 'Repositories' },
    { id: 'liked', label: 'Liked' },
  ]

  // ---------------------------------------------------------------------------
  // Loading skeleton for profile hero
  // ---------------------------------------------------------------------------
  if (loadingProfile) {
    return (
      <div style={{ minHeight: '100vh', background: COLORS.bg, padding: '32px 16px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <div
            style={{
              background: COLORS.muted,
              borderRadius: '50%',
              width: 100,
              height: 100,
              marginBottom: 16,
            }}
          />
          <div style={{ background: COLORS.muted, borderRadius: 6, height: 28, width: 200, marginBottom: 8 }} />
          <div style={{ background: COLORS.muted, borderRadius: 6, height: 16, width: 120, marginBottom: 8 }} />
          <div style={{ background: COLORS.muted, borderRadius: 6, height: 16, width: 300 }} />
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div style={{ minHeight: '100vh', background: COLORS.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: COLORS.textSecondary }}>Could not load profile.</p>
      </div>
    )
  }

  const displayName = profile.displayName ?? profile.username

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, color: COLORS.textPrimary }}>
      {/* ------------------------------------------------------------------ */}
      {/* Hero section                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div
        style={{
          background: COLORS.surface,
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
            {/* Avatar */}
            <div
              style={{
                width: 100,
                height: 100,
                borderRadius: '50%',
                background: COLORS.muted,
                border: `3px solid ${COLORS.primary}`,
                overflow: 'hidden',
                flexShrink: 0,
                position: 'relative',
              }}
            >
              {profile.avatar ? (
                <Image
                  src={profile.avatar}
                  alt={`${displayName} avatar`}
                  fill
                  sizes="100px"
                  style={{ objectFit: 'cover' }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 36,
                    fontWeight: 700,
                    color: COLORS.primary,
                    background: COLORS.muted,
                  }}
                >
                  {displayName[0].toUpperCase()}
                </div>
              )}
            </div>

            {/* Info block */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Display name + follow button row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                  marginBottom: 6,
                }}
              >
                <h1
                  style={{
                    margin: 0,
                    fontSize: 22,
                    fontWeight: 700,
                    color: COLORS.textPrimary,
                  }}
                >
                  {displayName}
                </h1>
                <FollowButton
                  profileId={profile.id}
                  username={profile.username}
                  initialIsFollowing={profile.isFollowing}
                />
              </div>

              {/* @username */}
              <p
                style={{
                  margin: '0 0 10px',
                  fontSize: 14,
                  color: COLORS.textSecondary,
                }}
              >
                @{profile.username}
              </p>

              {/* Bio */}
              {profile.bio && (
                <p
                  style={{
                    margin: '0 0 10px',
                    fontSize: 14,
                    color: COLORS.textPrimary,
                    lineHeight: 1.5,
                  }}
                >
                  {profile.bio}
                </p>
              )}

              {/* Location */}
              {profile.location && (
                <p
                  style={{
                    margin: '0 0 6px',
                    fontSize: 13,
                    color: COLORS.textSecondary,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  {profile.location}
                </p>
              )}

              {/* Website */}
              {profile.website && (
                <a
                  href={
                    profile.website.startsWith('http')
                      ? profile.website
                      : `https://${profile.website}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 13,
                    color: COLORS.primary,
                    textDecoration: 'none',
                  }}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  {profile.website.replace(/^https?:\/\//, '')}
                </a>
              )}
            </div>
          </div>

          {/* Stats row — posts / snippets / repos / followers / following / stars + social links */}
          <div
            style={{
              marginTop: 24,
              borderTop: `1px solid ${COLORS.border}`,
              paddingTop: 20,
            }}
          >
            <ProfileStats
              posts={profile.postsCount}
              snippets={profile.snippetsCount}
              repositories={profile.reposCount}
              followers={profile.followersCount}
              following={profile.followingCount}
              stars={profile.starsCount}
              links={profile.socialLinks}
              variant="full"
            />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Activity — contribution graph                                        */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px 0' }}>
        <section aria-label="Activity">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 12,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: COLORS.textPrimary }}>
              Activity
            </h2>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                color: COLORS.textSecondary,
              }}
            >
              <span>Year</span>
              <select
                value={contributionYear}
                onChange={(e) => setContributionYear(Number(e.target.value))}
                aria-label="Select contribution year"
                style={{
                  background: COLORS.muted,
                  color: COLORS.textPrimary,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  padding: '4px 8px',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {CONTRIBUTION_YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div
            style={{
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 10,
              padding: '16px',
            }}
          >
            {loadingContributions ? (
              <div
                style={{
                  height: 120,
                  borderRadius: 8,
                  background: COLORS.muted,
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              />
            ) : (
              <ContributionGraph
                contributions={contributions}
                year={contributionYear}
              />
            )}
          </div>
        </section>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Tabs                                                                 */}
      {/* ------------------------------------------------------------------ */}
      <div
        style={{
          background: COLORS.surface,
          borderBottom: `1px solid ${COLORS.border}`,
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: 640,
            margin: '0 auto',
            display: 'flex',
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              style={{
                flex: 1,
                padding: '14px 0',
                fontSize: 14,
                fontWeight: activeTab === tab.id ? 700 : 500,
                color: activeTab === tab.id ? COLORS.primary : COLORS.textSecondary,
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.id
                  ? `2px solid ${COLORS.primary}`
                  : '2px solid transparent',
                cursor: 'pointer',
                transition: 'color 0.15s, border-color 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Tab content                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 16px' }}>
        {activeTab === 'posts' && (
          <PostGrid posts={posts} loading={loadingPosts} />
        )}
        {activeTab === 'repositories' && (
          <RepoList repos={repos} loading={loadingRepos} />
        )}
        {activeTab === 'liked' && (
          <PostGrid posts={liked} loading={loadingLiked} />
        )}
      </div>
    </div>
  )
}
