'use client'

/**
 * OrganizationPage — /orgs/[org]
 *
 * Organization profile page modelled on the user profile shell. The page is a
 * client component so the FollowOrgButton island and tab-switching state can
 * live in one file. Data is fetched on the client; a 404 from the org endpoint
 * triggers notFound().
 *
 * Data sources:
 *   GET /v1/orgs/:org           -> organization metadata + overview
 *   GET /v1/orgs/:org/repos     -> organization repositories
 *   GET /v1/orgs/:org/members   -> organization members + roles
 *
 * Styling uses the dark-theme CSS custom properties defined in app/globals.css
 * (var(--surface), var(--border), etc.) so no raw hex values appear here.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_URL =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL) ||
  'http://localhost:4000/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Organization {
  id: string
  login: string
  name?: string
  description?: string
  avatar?: string
  location?: string
  website?: string
  email?: string
  readme?: string
  membersCount: number
  reposCount: number
  isFollowing: boolean
  pinnedRepos?: OrgRepo[]
  // role of the *current* viewer within the org, when authenticated
  viewerRole?: MemberRole
}

interface OrgRepo {
  id: string
  name: string
  fullName?: string
  description?: string
  stars: number
  forks?: number
  language?: string
  visibility?: 'public' | 'private'
  updatedAt?: string
}

type MemberRole = 'Owner' | 'Admin' | 'Member'

interface OrgMember {
  id: string
  username: string
  displayName?: string
  avatar?: string
  role: MemberRole
}

type TabId = 'overview' | 'repositories' | 'people' | 'projects'

type RepoTypeFilter = 'all' | 'public' | 'private'
type RepoSort = 'recent' | 'stars' | 'name'

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

function normalizeRole(value: unknown): MemberRole {
  if (value === 'Owner' || value === 'owner') return 'Owner'
  if (value === 'Admin' || value === 'admin') return 'Admin'
  return 'Member'
}

async function fetchOrg(
  org: string
): Promise<{ organization: Organization | null; is404: boolean }> {
  try {
    const res = await fetch(`${API_URL}/v1/orgs/${org}`, {
      next: { revalidate: 30 },
    })
    if (res.status === 404) return { organization: null, is404: true }
    if (!res.ok) return { organization: null, is404: false }
    const data = await res.json()
    const organization: Organization = {
      ...data,
      membersCount: data.membersCount ?? data.members ?? 0,
      reposCount: data.reposCount ?? data.repos ?? 0,
      isFollowing: data.isFollowing ?? false,
      viewerRole: data.viewerRole ? normalizeRole(data.viewerRole) : undefined,
    }
    return { organization, is404: false }
  } catch {
    return { organization: null, is404: false }
  }
}

async function fetchOrgRepos(org: string): Promise<OrgRepo[]> {
  try {
    const res = await fetch(`${API_URL}/v1/orgs/${org}/repos`)
    if (!res.ok) return []
    const data = await res.json()
    const repos: unknown = data.repositories ?? data.repos ?? data ?? []
    return Array.isArray(repos) ? (repos as OrgRepo[]) : []
  } catch {
    return []
  }
}

async function fetchOrgMembers(org: string): Promise<OrgMember[]> {
  try {
    const res = await fetch(`${API_URL}/v1/orgs/${org}/members`)
    if (!res.ok) return []
    const data = await res.json()
    const raw: unknown = data.members ?? data ?? []
    if (!Array.isArray(raw)) return []
    return raw.map((m): OrgMember => {
      const member = m as Record<string, unknown>
      return {
        id: String(member.id ?? ''),
        username: String(member.username ?? member.login ?? ''),
        displayName:
          typeof member.displayName === 'string'
            ? member.displayName
            : undefined,
        avatar: typeof member.avatar === 'string' ? member.avatar : undefined,
        role: normalizeRole(member.role),
      }
    })
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// FollowOrgButton — client island
// ---------------------------------------------------------------------------

interface FollowOrgButtonProps {
  orgId: string
  initialIsFollowing: boolean
}

function FollowOrgButton({ orgId, initialIsFollowing }: FollowOrgButtonProps) {
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing)
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    if (loading) return
    setLoading(true)
    const prev = isFollowing
    setIsFollowing(!prev) // optimistic
    try {
      const method = prev ? 'DELETE' : 'POST'
      const res = await fetch(`${API_URL}/v1/orgs/${orgId}/follow`, { method })
      if (!res.ok) throw new Error('Request failed')
    } catch {
      setIsFollowing(prev) // revert
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        padding: '6px 20px',
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 600,
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.6 : 1,
        transition: 'background 0.15s',
        background: isFollowing ? 'var(--surface-secondary)' : 'var(--primary)',
        color: isFollowing ? 'var(--foreground)' : '#0A0C10',
        border: isFollowing ? '1px solid var(--border)' : 'none',
      }}
    >
      {loading ? '…' : isFollowing ? 'Following' : 'Follow'}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Shared small components
// ---------------------------------------------------------------------------

interface StatItemProps {
  value: number
  label: string
}

function StatItem({ value, label }: StatItemProps) {
  return (
    <div style={{ textAlign: 'center', padding: '4px 8px' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--foreground)' }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontSize: 12, color: 'var(--foreground-secondary)' }}>
        {label}
      </div>
    </div>
  )
}

function StarIcon() {
  return (
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
  )
}

const ROLE_STYLES: Record<MemberRole, { bg: string; color: string }> = {
  Owner: { bg: 'rgba(210, 153, 34, 0.15)', color: 'var(--warning)' },
  Admin: { bg: 'rgba(88, 166, 255, 0.15)', color: 'var(--primary)' },
  Member: { bg: 'var(--surface-secondary)', color: 'var(--foreground-secondary)' },
}

function RoleBadge({ role }: { role: MemberRole }) {
  const s = ROLE_STYLES[role]
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 999,
        background: s.bg,
        color: s.color,
      }}
    >
      {role}
    </span>
  )
}

function Avatar({
  src,
  alt,
  size,
  fallback,
}: {
  src?: string
  alt: string
  size: number
  fallback: string
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        background: 'var(--surface-secondary)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {src ? (
        <Image src={src} alt={alt} fill sizes={`${size}px`} style={{ objectFit: 'cover' }} />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: size * 0.38,
            fontWeight: 700,
            color: 'var(--primary)',
          }}
        >
          {fallback.toUpperCase()}
        </div>
      )}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <p
      style={{
        textAlign: 'center',
        color: 'var(--foreground-secondary)',
        padding: '48px 0',
      }}
    >
      {message}
    </p>
  )
}

function SkeletonRows({ count, height }: { count: number; height: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            background: 'var(--surface-secondary)',
            borderRadius: 8,
            height,
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// RepoCard — used by overview pinned grid + repositories tab
// ---------------------------------------------------------------------------

function RepoCard({ org, repo }: { org: string; repo: OrgRepo }) {
  return (
    <Link
      href={`/${org}/${repo.name}`}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '14px 16px',
          height: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {repo.name}
          </span>
          {repo.visibility === 'private' && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: '1px 6px',
                borderRadius: 999,
                border: '1px solid var(--border)',
                color: 'var(--foreground-secondary)',
              }}
            >
              Private
            </span>
          )}
        </div>
        {repo.description && (
          <p
            style={{
              margin: '0 0 10px',
              fontSize: 13,
              color: 'var(--foreground-secondary)',
              lineHeight: 1.4,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {repo.description}
          </p>
        )}
        <div
          style={{
            display: 'flex',
            gap: 14,
            alignItems: 'center',
            fontSize: 12,
            color: 'var(--foreground-secondary)',
          }}
        >
          {repo.language && <span>{repo.language}</span>}
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <StarIcon />
            {repo.stars.toLocaleString()}
          </span>
        </div>
      </div>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

function OverviewTab({
  org,
  organization,
  repos,
  reposLoading,
}: {
  org: string
  organization: Organization
  repos: OrgRepo[]
  reposLoading: boolean
}) {
  const pinned =
    organization.pinnedRepos && organization.pinnedRepos.length > 0
      ? organization.pinnedRepos
      : repos.slice(0, 6)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Pinned repos */}
      <section>
        <h2
          style={{
            fontSize: 13,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            color: 'var(--foreground-secondary)',
            margin: '0 0 12px',
          }}
        >
          Pinned
        </h2>
        {reposLoading ? (
          <SkeletonRows count={4} height={92} />
        ) : pinned.length === 0 ? (
          <EmptyState message="No pinned repositories yet." />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 12,
            }}
          >
            {pinned.map((repo) => (
              <RepoCard key={repo.id} org={org} repo={repo} />
            ))}
          </div>
        )}
      </section>

      {/* README */}
      {organization.readme && (
        <section>
          <h2
            style={{
              fontSize: 13,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              color: 'var(--foreground-secondary)',
              margin: '0 0 12px',
            }}
          >
            README
          </h2>
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: 20,
              fontSize: 14,
              lineHeight: 1.6,
              color: 'var(--foreground)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {organization.readme}
          </div>
        </section>
      )}

      {/* Activity summary */}
      <section>
        <h2
          style={{
            fontSize: 13,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            color: 'var(--foreground-secondary)',
            margin: '0 0 12px',
          }}
        >
          Activity
        </h2>
        <div
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <SummaryStat
            value={organization.reposCount}
            label="Repositories"
          />
          <SummaryStat value={organization.membersCount} label="Members" />
          <SummaryStat
            value={repos.reduce((sum, r) => sum + (r.stars || 0), 0)}
            label="Total stars"
          />
        </div>
      </section>
    </div>
  )
}

function SummaryStat({ value, label }: { value: number; label: string }) {
  return (
    <div
      style={{
        flex: '1 1 140px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '16px',
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--foreground)' }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontSize: 12, color: 'var(--foreground-secondary)', marginTop: 2 }}>
        {label}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Repositories tab
// ---------------------------------------------------------------------------

function RepositoriesTab({
  org,
  repos,
  loading,
}: {
  org: string
  repos: OrgRepo[]
  loading: boolean
}) {
  const [language, setLanguage] = useState<string>('all')
  const [type, setType] = useState<RepoTypeFilter>('all')
  const [sort, setSort] = useState<RepoSort>('recent')

  const languages = useMemo(() => {
    const set = new Set<string>()
    repos.forEach((r) => {
      if (r.language) set.add(r.language)
    })
    return Array.from(set).sort()
  }, [repos])

  const filtered = useMemo(() => {
    let list = repos.slice()
    if (language !== 'all') list = list.filter((r) => r.language === language)
    if (type !== 'all') list = list.filter((r) => (r.visibility ?? 'public') === type)
    list.sort((a, b) => {
      if (sort === 'stars') return (b.stars || 0) - (a.stars || 0)
      if (sort === 'name') return a.name.localeCompare(b.name)
      // recent
      return (
        new Date(b.updatedAt ?? 0).getTime() -
        new Date(a.updatedAt ?? 0).getTime()
      )
    })
    return list
  }, [repos, language, type, sort])

  if (loading) return <SkeletonRows count={5} height={92} />

  const selectStyle: React.CSSProperties = {
    background: 'var(--surface)',
    color: 'var(--foreground)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '6px 10px',
    fontSize: 13,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select
          aria-label="Filter by language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          style={selectStyle}
        >
          <option value="all">All languages</option>
          {languages.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by type"
          value={type}
          onChange={(e) => setType(e.target.value as RepoTypeFilter)}
          style={selectStyle}
        >
          <option value="all">All types</option>
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
        <select
          aria-label="Sort repositories"
          value={sort}
          onChange={(e) => setSort(e.target.value as RepoSort)}
          style={selectStyle}
        >
          <option value="recent">Recently updated</option>
          <option value="stars">Most stars</option>
          <option value="name">Name</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState message="No repositories match these filters." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((repo) => (
            <RepoCard key={repo.id} org={org} repo={repo} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// People tab
// ---------------------------------------------------------------------------

const ROLE_ORDER: Record<MemberRole, number> = { Owner: 0, Admin: 1, Member: 2 }

function PeopleTab({
  members,
  loading,
}: {
  members: OrgMember[]
  loading: boolean
}) {
  if (loading) return <SkeletonRows count={4} height={64} />
  if (members.length === 0) return <EmptyState message="No members to show." />

  const sorted = members
    .slice()
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role])

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 12,
      }}
    >
      {sorted.map((member) => (
        <Link
          key={member.id}
          href={`/${member.username}`}
          style={{ textDecoration: 'none' }}
        >
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <Avatar
              src={member.avatar}
              alt={`${member.username} avatar`}
              size={44}
              fallback={(member.displayName ?? member.username ?? '?')[0] ?? '?'}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--foreground)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {member.displayName ?? member.username}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--foreground-secondary)',
                  marginBottom: 6,
                }}
              >
                @{member.username}
              </div>
              <RoleBadge role={member.role} />
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
  params: { org: string }
}

export default function OrganizationPage({ params }: PageProps) {
  const { org } = params

  const [organization, setOrganization] = useState<Organization | null>(null)
  const [loadingOrg, setLoadingOrg] = useState(true)
  const [is404, setIs404] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  const [repos, setRepos] = useState<OrgRepo[]>([])
  const [reposLoaded, setReposLoaded] = useState(false)
  const [loadingRepos, setLoadingRepos] = useState(false)

  const [members, setMembers] = useState<OrgMember[]>([])
  const [membersLoaded, setMembersLoaded] = useState(false)
  const [loadingMembers, setLoadingMembers] = useState(false)

  // Load org metadata
  useEffect(() => {
    setLoadingOrg(true)
    fetchOrg(org).then(({ organization: o, is404: missing }) => {
      setIs404(missing)
      setOrganization(o)
      setLoadingOrg(false)
    })
  }, [org])

  if (is404) notFound()

  const loadRepos = useCallback(async () => {
    if (reposLoaded) return
    setLoadingRepos(true)
    const data = await fetchOrgRepos(org)
    setRepos(data)
    setReposLoaded(true)
    setLoadingRepos(false)
  }, [org, reposLoaded])

  const loadMembers = useCallback(async () => {
    if (membersLoaded) return
    setLoadingMembers(true)
    const data = await fetchOrgMembers(org)
    setMembers(data)
    setMembersLoaded(true)
    setLoadingMembers(false)
  }, [org, membersLoaded])

  // Overview needs repos for the pinned grid + activity summary
  useEffect(() => {
    loadRepos()
  }, [loadRepos])

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab)
    if (tab === 'overview' || tab === 'repositories') loadRepos()
    if (tab === 'people') loadMembers()
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'repositories', label: 'Repositories' },
    { id: 'people', label: 'People' },
    { id: 'projects', label: 'Projects' },
  ]

  const canManage =
    organization?.viewerRole === 'Owner' || organization?.viewerRole === 'Admin'

  // Loading skeleton for the hero
  if (loadingOrg) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--background)', padding: '32px 16px' }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <div
            style={{
              background: 'var(--surface-secondary)',
              borderRadius: 16,
              width: 96,
              height: 96,
              marginBottom: 16,
            }}
          />
          <div style={{ background: 'var(--surface-secondary)', borderRadius: 6, height: 28, width: 240, marginBottom: 8 }} />
          <div style={{ background: 'var(--surface-secondary)', borderRadius: 6, height: 16, width: 360 }} />
        </div>
      </div>
    )
  }

  if (!organization) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--background)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <p style={{ color: 'var(--foreground-secondary)' }}>Could not load organization.</p>
      </div>
    )
  }

  const title = organization.name ?? organization.login

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', color: 'var(--foreground)' }}>
      {/* Header */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 880, margin: '0 auto', padding: '32px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
            <Avatar
              src={organization.avatar}
              alt={`${title} logo`}
              size={96}
              fallback={title[0] ?? '?'}
            />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                  marginBottom: 4,
                }}
              >
                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--foreground)' }}>
                  {title}
                </h1>
                <FollowOrgButton
                  orgId={organization.id}
                  initialIsFollowing={organization.isFollowing}
                />
                {canManage && (
                  <Link
                    href={`/orgs/${organization.login}/settings`}
                    style={{
                      padding: '6px 16px',
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                      textDecoration: 'none',
                      background: 'var(--surface-secondary)',
                    }}
                  >
                    Settings
                  </Link>
                )}
              </div>

              <p style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--foreground-secondary)' }}>
                @{organization.login}
              </p>

              {organization.description && (
                <p style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--foreground)', lineHeight: 1.5 }}>
                  {organization.description}
                </p>
              )}

              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {organization.location && (
                  <span
                    style={{
                      fontSize: 13,
                      color: 'var(--foreground-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    {organization.location}
                  </span>
                )}
                {organization.website && (
                  <a
                    href={organization.website.startsWith('http') ? organization.website : `https://${organization.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 13,
                      color: 'var(--primary)',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                    {organization.website.replace(/^https?:\/\//, '')}
                  </a>
                )}
              </div>
            </div>

            {/* Stats */}
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <StatItem value={organization.reposCount} label="Repos" />
              <StatItem value={organization.membersCount} label="Members" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ maxWidth: 880, margin: '0 auto', display: 'flex' }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              style={{
                padding: '14px 20px',
                fontSize: 14,
                fontWeight: activeTab === tab.id ? 700 : 500,
                color: activeTab === tab.id ? 'var(--primary)' : 'var(--foreground-secondary)',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'color 0.15s, border-color 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '24px 16px 64px' }}>
        {activeTab === 'overview' && (
          <OverviewTab
            org={organization.login}
            organization={organization}
            repos={repos}
            reposLoading={loadingRepos}
          />
        )}
        {activeTab === 'repositories' && (
          <RepositoriesTab org={organization.login} repos={repos} loading={loadingRepos} />
        )}
        {activeTab === 'people' && (
          <PeopleTab members={members} loading={loadingMembers} />
        )}
        {activeTab === 'projects' && (
          <EmptyState message="No projects yet." />
        )}
      </div>
    </div>
  )
}
