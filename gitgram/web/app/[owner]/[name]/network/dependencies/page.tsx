'use client'

import { useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import api from '@/services/api'

// ─── Types ─────────────────────────────────────────────────────────────────────

type DependencyGroup = 'production' | 'development' | 'peer'
type Severity = 'critical' | 'high' | 'moderate' | 'low'

interface Dependency {
  id: string
  name: string
  group: DependencyGroup
  version: string
  latestVersion: string | null
  license: string | null
  isOutdated: boolean
  registryUrl: string | null
  repoUrl: string | null
  vulnerabilitySeverity: Severity | null
}

interface DependenciesApiResponse {
  data: {
    dependencies: Dependency[]
    totalCount: number
    vulnerableCount: number
    severityCounts: Record<Severity, number>
  }
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const GROUPS: { value: DependencyGroup; label: string }[] = [
  { value: 'production', label: 'Production' },
  { value: 'development', label: 'Development' },
  { value: 'peer', label: 'Peer' },
]

const SEVERITY_META: Record<Severity, { label: string; color: string }> = {
  critical: { label: 'Critical', color: 'var(--error)' },
  high: { label: 'High', color: '#f85149' },
  moderate: { label: 'Moderate', color: 'var(--warning)' },
  low: { label: 'Low', color: 'var(--foreground-secondary)' },
}

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'moderate', 'low']

// ─── Icons ─────────────────────────────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M7.467.133a1.748 1.748 0 0 1 1.066 0l5.25 1.68A1.75 1.75 0 0 1 15 3.48V7c0 1.566-.32 3.182-1.303 4.682-.983 1.498-2.585 2.813-5.032 3.855a1.7 1.7 0 0 1-1.33 0c-2.447-1.042-4.049-2.357-5.032-3.855C1.32 10.182 1 8.566 1 7V3.48a1.75 1.75 0 0 1 1.217-1.667Zm.61 1.429a.25.25 0 0 0-.153 0l-5.25 1.68a.25.25 0 0 0-.174.238V7c0 1.358.275 2.666 1.057 3.86.784 1.194 2.121 2.34 4.366 3.297a.2.2 0 0 0 .154 0c2.245-.957 3.582-2.103 4.366-3.297C13.225 9.666 13.5 8.358 13.5 7V3.48a.25.25 0 0 0-.174-.237Z" />
    </svg>
  )
}

function PackageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="m8.878.392 5.25 3.045c.54.314.872.89.872 1.514v6.098a1.75 1.75 0 0 1-.872 1.514l-5.25 3.045a1.75 1.75 0 0 1-1.756 0l-5.25-3.045A1.75 1.75 0 0 1 1 11.049V4.951c0-.624.332-1.201.872-1.514L7.122.392a1.75 1.75 0 0 1 1.756 0ZM7.875 1.69l-4.63 2.685L8 7.133l4.755-2.758-4.63-2.685a.248.248 0 0 0-.25 0ZM2.5 5.677v5.372c0 .09.047.171.125.216l4.625 2.683V8.432Zm6.25 8.271 4.625-2.683a.25.25 0 0 0 .125-.216V5.677L8.75 8.432Z" />
    </svg>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

interface DependencyRowProps {
  dep: Dependency
}

function DependencyRow({ dep }: DependencyRowProps) {
  const href = dep.repoUrl ?? dep.registryUrl
  const sev = dep.vulnerabilitySeverity

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] hover:bg-[var(--surface-secondary)] transition-colors duration-150 last:border-b-0">
      <span className="text-[var(--foreground-secondary)] shrink-0" aria-hidden="true">
        <PackageIcon />
      </span>

      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-[var(--primary)] hover:underline truncate min-w-0"
        >
          {dep.name}
        </a>
      ) : (
        <span className="text-sm font-semibold text-[var(--foreground)] truncate min-w-0">{dep.name}</span>
      )}

      <code className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--surface-secondary)] border border-[var(--border)] text-[var(--foreground-secondary)] shrink-0">
        {dep.version}
      </code>

      {dep.isOutdated && (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 border"
          style={{ color: 'var(--warning)', borderColor: 'var(--warning)' }}
          title={dep.latestVersion ? `Latest: ${dep.latestVersion}` : 'A newer version is available'}
        >
          Outdated{dep.latestVersion ? ` → ${dep.latestVersion}` : ''}
        </span>
      )}

      {sev && (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 border"
          style={{ color: SEVERITY_META[sev].color, borderColor: SEVERITY_META[sev].color }}
        >
          {SEVERITY_META[sev].label} vuln
        </span>
      )}

      <span className="ml-auto text-xs text-[var(--foreground-secondary)] shrink-0">
        {dep.license ?? 'No license'}
      </span>
    </div>
  )
}

interface GroupSectionProps {
  group: DependencyGroup
  label: string
  deps: Dependency[]
}

function GroupSection({ group, label, deps }: GroupSectionProps) {
  if (deps.length === 0) return null

  return (
    <section className="mb-6" aria-labelledby={`group-${group}`}>
      <div className="flex items-center gap-2 mb-2">
        <h2 id={`group-${group}`} className="text-sm font-semibold text-[var(--foreground)]">
          {label}
        </h2>
        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--surface-secondary)] border border-[var(--border)] text-[var(--foreground-secondary)]">
          {deps.length}
        </span>
      </div>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
        {deps.map((dep) => (
          <DependencyRow key={dep.id} dep={dep} />
        ))}
      </div>
    </section>
  )
}

interface SecurityBannerProps {
  vulnerableCount: number
  severityCounts: Record<Severity, number>
}

function SecurityBanner({ vulnerableCount, severityCounts }: SecurityBannerProps) {
  if (vulnerableCount === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 mb-6 text-sm" style={{ color: 'var(--accent)' }}>
        <ShieldIcon />
        No known vulnerable dependencies detected.
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-[var(--surface)] px-4 py-3 mb-6" style={{ borderColor: 'var(--error)' }}>
      <div className="flex items-center gap-2 text-sm font-semibold mb-2" style={{ color: 'var(--error)' }}>
        <ShieldIcon />
        {vulnerableCount} vulnerable {vulnerableCount === 1 ? 'dependency' : 'dependencies'} found
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {SEVERITY_ORDER.filter((s) => severityCounts[s] > 0).map((s) => (
          <span
            key={s}
            className="text-xs px-2 py-0.5 rounded-full border"
            style={{ color: SEVERITY_META[s].color, borderColor: SEVERITY_META[s].color }}
          >
            {severityCounts[s]} {SEVERITY_META[s].label}
          </span>
        ))}
      </div>
    </div>
  )
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] animate-pulse last:border-b-0">
      <div className="w-4 h-4 rounded bg-[var(--surface-secondary)] shrink-0" />
      <div className="h-4 bg-[var(--surface-secondary)] rounded w-1/3" />
      <div className="ml-auto h-3 bg-[var(--surface-secondary)] rounded w-16" />
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function DependenciesPage() {
  const params = useParams<{ owner: string; name: string }>()
  const { owner, name } = params

  const [search, setSearch] = useState('')

  const { data, isLoading, isError } = useQuery<DependenciesApiResponse>({
    queryKey: ['dependencies', owner, name],
    queryFn: async () => {
      const res = await api.get(`/v1/repositories/${owner}/${name}/dependencies`)
      return res.data
    },
  })

  const allDeps = data?.data?.dependencies ?? []
  const totalCount = data?.data?.totalCount ?? 0
  const vulnerableCount = data?.data?.vulnerableCount ?? 0
  const severityCounts = data?.data?.severityCounts ?? { critical: 0, high: 0, moderate: 0, low: 0 }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allDeps
    return allDeps.filter((d) => d.name.toLowerCase().includes(q))
  }, [allDeps, search])

  const grouped = useMemo(() => {
    return {
      production: filtered.filter((d) => d.group === 'production'),
      development: filtered.filter((d) => d.group === 'development'),
      peer: filtered.filter((d) => d.group === 'peer'),
    }
  }, [filtered])

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm text-[var(--foreground-secondary)] mb-6" aria-label="Breadcrumb">
          <Link href={`/${owner}`} className="hover:text-[var(--primary)] transition-colors">{owner}</Link>
          <span>/</span>
          <Link href={`/${owner}/${name}`} className="hover:text-[var(--primary)] transition-colors">{name}</Link>
          <span>/</span>
          <span className="text-[var(--foreground)]">dependencies</span>
        </nav>

        {/* Header */}
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Dependencies</h1>
          {!isLoading && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--surface-secondary)] border border-[var(--border)] text-[var(--foreground-secondary)]">
              {totalCount.toLocaleString()}
            </span>
          )}
        </div>
        <p className="text-[var(--foreground-secondary)] text-sm mb-6">
          Packages this repository depends on.
        </p>

        {/* Error */}
        {isError && (
          <div className="rounded-lg border border-[var(--error)] bg-[var(--surface)] p-4 text-[var(--error)] text-sm mb-6">
            Failed to load dependencies. Please try again.
          </div>
        )}

        {/* Security summary */}
        {!isLoading && !isError && (
          <SecurityBanner vulnerableCount={vulnerableCount} severityCounts={severityCounts} />
        )}

        {/* Search */}
        <div className="relative mb-6">
          <span className="absolute inset-y-0 left-3 flex items-center text-[var(--foreground-secondary)] pointer-events-none">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search dependencies…"
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] placeholder:text-[var(--foreground-secondary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-colors"
          />
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
            {Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-[var(--surface-secondary)] border border-[var(--border)] flex items-center justify-center mb-4 text-[var(--foreground-secondary)]">
              <PackageIcon />
            </div>
            <h3 className="text-[var(--foreground)] font-semibold text-lg mb-2">
              {search ? 'No dependencies match your search' : 'No dependencies found'}
            </h3>
            <p className="text-[var(--foreground-secondary)] text-sm max-w-sm">
              {search
                ? 'Try searching for a different package name.'
                : 'This repository does not declare any dependencies, or none could be detected.'}
            </p>
          </div>
        ) : (
          <div>
            {GROUPS.map((g) => (
              <GroupSection key={g.value} group={g.value} label={g.label} deps={grouped[g.value]} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
