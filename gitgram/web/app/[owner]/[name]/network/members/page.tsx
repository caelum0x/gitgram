'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useQuery } from '@tanstack/react-query'
import api from '@/services/api'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface MemberRepo {
  id: string
  name: string
  fullName: string
  description: string | null
  language: string | null
  stargazersCount: number
  forksCount: number
  isPrivate: boolean
  pushedAt: string | null
}

interface OrgMember {
  login: string
  avatarUrl: string | null
  name: string | null
  publicRepos: MemberRepo[]
}

interface NetworkMembersApiResponse {
  data: {
    orgLogin: string
    orgAvatarUrl: string | null
    members: OrgMember[]
    totalMembers: number
  }
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Rust: '#dea584',
  Go: '#00ADD8',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#555555',
  Ruby: '#701516',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  PHP: '#4F5D95',
  'C#': '#178600',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Dart: '#00B4AB',
}

function getLanguageColor(language: string): string {
  return LANGUAGE_COLORS[language] ?? '#8b949e'
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

function formatCount(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

// ─── Icons ─────────────────────────────────────────────────────────────────────

function StarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 11.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
    </svg>
  )
}

function ForkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z" />
    </svg>
  )
}

function PeopleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function MemberSectionSkeleton() {
  return (
    <div className="mb-8 animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-[var(--surface-secondary)]" />
        <div className="h-4 bg-[var(--surface-secondary)] rounded w-32" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 space-y-2">
            <div className="h-4 bg-[var(--surface-secondary)] rounded w-2/3" />
            <div className="h-3 bg-[var(--surface-secondary)] rounded w-full" />
            <div className="h-3 bg-[var(--surface-secondary)] rounded w-3/4" />
          </div>
        ))}
      </div>
    </div>
  )
}

interface RepoCardProps {
  repo: MemberRepo
  ownerLogin: string
}

function RepoCard({ repo, ownerLogin }: RepoCardProps) {
  return (
    <Link
      href={`/${ownerLogin}/${repo.name}`}
      className="block rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-[var(--primary)] hover:bg-[var(--surface-secondary)] transition-colors duration-150 group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-[var(--primary)] text-sm font-semibold group-hover:underline truncate">
          {repo.name}
        </span>
        {repo.isPrivate && (
          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--foreground-secondary)] leading-tight">
            Private
          </span>
        )}
      </div>

      {repo.description && (
        <p className="text-[var(--foreground-secondary)] text-xs line-clamp-2 mb-3 leading-relaxed">
          {repo.description}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--foreground-secondary)] mt-auto">
        {repo.language && (
          <span className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: getLanguageColor(repo.language) }}
              aria-hidden="true"
            />
            {repo.language}
          </span>
        )}
        <span className="flex items-center gap-1">
          <StarIcon />
          {formatCount(repo.stargazersCount)}
        </span>
        <span className="flex items-center gap-1">
          <ForkIcon />
          {formatCount(repo.forksCount)}
        </span>
        {repo.pushedAt && (
          <span className="ml-auto text-[10px]">{timeAgo(repo.pushedAt)}</span>
        )}
      </div>
    </Link>
  )
}

interface MemberSectionProps {
  member: OrgMember
}

function MemberSection({ member }: MemberSectionProps) {
  return (
    <section className="mb-10" aria-labelledby={`member-${member.login}`}>
      {/* Member header */}
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[var(--border)]">
        <Link
          href={`/${member.login}`}
          className="shrink-0"
          aria-label={`${member.login}'s profile`}
        >
          {member.avatarUrl ? (
            <Image
              src={member.avatarUrl}
              alt={member.login}
              width={40}
              height={40}
              className="rounded-full border border-[var(--border)] hover:opacity-80 transition-opacity"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-[var(--surface-secondary)] border border-[var(--border)] flex items-center justify-center text-[var(--foreground-secondary)] text-sm font-semibold">
              {member.login.charAt(0).toUpperCase()}
            </div>
          )}
        </Link>
        <div>
          <Link
            href={`/${member.login}`}
            id={`member-${member.login}`}
            className="text-[var(--foreground)] font-semibold text-sm hover:text-[var(--primary)] transition-colors"
          >
            {member.name ?? member.login}
          </Link>
          {member.name && (
            <p className="text-[var(--foreground-secondary)] text-xs">@{member.login}</p>
          )}
        </div>
        <span className="ml-auto text-xs text-[var(--foreground-secondary)]">
          {member.publicRepos.length} repo{member.publicRepos.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Member repos */}
      {member.publicRepos.length === 0 ? (
        <p className="text-[var(--foreground-secondary)] text-sm italic pl-1">
          No public repositories.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {member.publicRepos.map((repo) => (
            <RepoCard key={repo.id} repo={repo} ownerLogin={member.login} />
          ))}
        </div>
      )}
    </section>
  )
}

function NotOrgState({ owner, name }: { owner: string; name: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-[var(--surface-secondary)] border border-[var(--border)] flex items-center justify-center mb-4 text-[var(--foreground-secondary)]">
        <PeopleIcon />
      </div>
      <h3 className="text-[var(--foreground)] font-semibold text-lg mb-2">
        Not an organization repository
      </h3>
      <p className="text-[var(--foreground-secondary)] text-sm max-w-sm mb-6">
        The network members graph is only available for repositories owned by organizations.
      </p>
      <Link
        href={`/${owner}/${name}`}
        className="px-4 py-2 text-sm font-medium rounded-md bg-[var(--primary)] text-white hover:opacity-90 transition-opacity"
      >
        Back to repository
      </Link>
    </div>
  )
}

function EmptyMembersState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-[var(--surface-secondary)] border border-[var(--border)] flex items-center justify-center mb-4 text-[var(--foreground-secondary)]">
        <PeopleIcon />
      </div>
      <h3 className="text-[var(--foreground)] font-semibold text-lg mb-2">No members found</h3>
      <p className="text-[var(--foreground-secondary)] text-sm max-w-sm">
        This organization does not have any public members with repositories.
      </p>
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function NetworkMembersPage() {
  const params = useParams<{ owner: string; name: string }>()
  const { owner, name } = params

  const { data, isLoading, isError } = useQuery<NetworkMembersApiResponse>({
    queryKey: ['network-members', owner, name],
    queryFn: async () => {
      const res = await api.get(`/v1/repositories/${owner}/${name}/network/members`)
      return res.data
    },
    retry: false,
  })

  const members = data?.data?.members ?? []
  const orgLogin = data?.data?.orgLogin ?? owner
  const orgAvatarUrl = data?.data?.orgAvatarUrl ?? null
  const totalMembers = data?.data?.totalMembers ?? 0

  // API returns 404 / empty when repo is not org-owned
  const isNotOrg = isError

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}
    >
      <div className="max-w-6xl mx-auto px-4 py-6">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm text-[var(--foreground-secondary)] mb-6" aria-label="Breadcrumb">
          <Link href={`/${owner}`} className="hover:text-[var(--primary)] transition-colors">
            {owner}
          </Link>
          <span>/</span>
          <Link href={`/${owner}/${name}`} className="hover:text-[var(--primary)] transition-colors">
            {name}
          </Link>
          <span>/</span>
          <span className="text-[var(--foreground)]">network members</span>
        </nav>

        {isNotOrg ? (
          <NotOrgState owner={owner} name={name} />
        ) : (
          <>
            {/* Page Header */}
            <div className="flex items-center gap-4 mb-8">
              {orgAvatarUrl && (
                <Image
                  src={orgAvatarUrl}
                  alt={orgLogin}
                  width={48}
                  height={48}
                  className="rounded-lg border border-[var(--border)]"
                />
              )}
              <div>
                <h1 className="text-2xl font-bold text-[var(--foreground)]">
                  Network Members
                </h1>
                <p className="text-[var(--foreground-secondary)] text-sm mt-0.5">
                  Public repositories owned by{' '}
                  <Link
                    href={`/${orgLogin}`}
                    className="text-[var(--primary)] hover:underline"
                  >
                    {orgLogin}
                  </Link>{' '}
                  organization members
                  {!isLoading && totalMembers > 0 && (
                    <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-[var(--surface-secondary)] border border-[var(--border)]">
                      {totalMembers} member{totalMembers !== 1 ? 's' : ''}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Content */}
            {isLoading ? (
              <div>
                {Array.from({ length: 3 }).map((_, i) => (
                  <MemberSectionSkeleton key={i} />
                ))}
              </div>
            ) : members.length === 0 ? (
              <EmptyMembersState />
            ) : (
              <div>
                {members.map((member) => (
                  <MemberSection key={member.login} member={member} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
