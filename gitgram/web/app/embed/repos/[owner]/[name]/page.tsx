'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import api from '@/services/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmbedRepo {
  id: string
  owner: string
  name: string
  fullName: string
  description?: string
  stars: number
  forks: number
  language?: string
  updatedAt?: string
  pushedAt?: string
  topics?: string[]
  isPrivate?: boolean
}

type Theme = 'dark' | 'light'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatRelativeTime(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHr = Math.floor(diffMs / 3_600_000)
  const diffDay = Math.floor(diffMs / 86_400_000)
  const diffMonth = Math.floor(diffDay / 30)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 30) return `${diffDay}d ago`
  if (diffMonth < 12) return `${diffMonth}mo ago`
  return new Date(dateString).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

// ─── Language colours ─────────────────────────────────────────────────────────

const LANG_COLORS: Record<string, string> = {
  typescript: '#3178c6', javascript: '#f7df1e', python: '#3572a5',
  go: '#00add8', rust: '#dea584', java: '#b07219', kotlin: '#a97bff',
  swift: '#f05138', ruby: '#701516', php: '#4f5d95', csharp: '#178600',
  cpp: '#f34b7d', c: '#555555', css: '#563d7c', html: '#e34c26',
}

function langColor(lang: string): string {
  return LANG_COLORS[lang.toLowerCase()] ?? '#7C3AED'
}

// ─── Brand logo ───────────────────────────────────────────────────────────────

function BrandLogo() {
  return (
    <Link
      href="https://gitgram.dev"
      target="_blank"
      rel="noopener noreferrer"
      style={{ display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#7C3AED" />
        <path d="M7 17V9.5L12 7l5 2.5V17" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M9.5 17v-4.5h5V17" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#A78BFA', letterSpacing: '-0.01em' }}>Gitgram</span>
    </Link>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EmbedRepoPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const owner = params.owner as string
  const repoName = params.name as string

  const theme: Theme = searchParams.get('theme') === 'light' ? 'light' : 'dark'
  const isDark = theme === 'dark'

  const [repo, setRepo] = useState<EmbedRepo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    const fetchRepo = async () => {
      try {
        const { data } = await api.get(`/repositories/${owner}/${repoName}`)
        const payload = data?.data ?? data
        if (!cancelled) setRepo(payload)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchRepo()
    return () => { cancelled = true }
  }, [owner, repoName])

  const repoUrl = `https://gitgram.dev/${owner}/${repoName}`
  const s = buildStyles(isDark)

  if (loading) {
    return (
      <div style={s.shell}>
        <div style={s.body}>
          <div style={{ ...s.skel, width: '55%', height: 14, marginBottom: 10 }} />
          <div style={{ ...s.skel, width: '100%', marginBottom: 6 }} />
          <div style={{ ...s.skel, width: '75%', marginBottom: 16 }} />
          <div style={{ display: 'flex', gap: 16 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ ...s.skel, width: 48, height: 20 }} />
            ))}
          </div>
        </div>
        <div style={s.footer}><BrandLogo /></div>
      </div>
    )
  }

  if (error || !repo) {
    return (
      <div style={s.shell}>
        <div style={{ ...s.body, justifyContent: 'center', alignItems: 'center' }}>
          <svg width="24" height="24" fill="none" stroke={isDark ? '#475569' : '#94a3b8'} strokeWidth={1.5} viewBox="0 0 24 24" style={{ marginBottom: 8 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M3.055 11C3.548 6.956 7.33 4 12 4s8.452 2.956 8.945 7M12 4v1M3 12h1m17 0h-1" />
          </svg>
          <p style={{ color: isDark ? '#64748B' : '#94a3b8', fontSize: 13, margin: 0 }}>Repository not found</p>
        </div>
        <div style={s.footer}><BrandLogo /></div>
      </div>
    )
  }

  const lastActivity = repo.pushedAt ?? repo.updatedAt

  return (
    <div style={s.shell}>
      <div style={s.body}>
        {/* Repo name + icon */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <svg width="16" height="16" fill="none" stroke={isDark ? '#8b949e' : '#57606a'} strokeWidth={1.8} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7l9 6 9-6" />
          </svg>
          <span style={{ fontSize: 15, fontWeight: 700, color: isDark ? '#58a6ff' : '#0969da', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {repo.fullName ?? `${owner}/${repoName}`}
          </span>
          {repo.isPrivate && (
            <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 999, border: `1px solid ${isDark ? '#30363d' : '#d0d7de'}`, color: isDark ? '#8b949e' : '#57606a', flexShrink: 0 }}>
              Private
            </span>
          )}
        </div>

        {/* Description */}
        {repo.description ? (
          <p style={{ fontSize: 12, color: isDark ? '#94a3b8' : '#475569', lineHeight: 1.6, margin: '0 0 14px', wordBreak: 'break-word' }}>
            {repo.description.length > 140 ? repo.description.slice(0, 140).trimEnd() + '…' : repo.description}
          </p>
        ) : (
          <p style={{ fontSize: 12, color: isDark ? '#475569' : '#94a3b8', fontStyle: 'italic', margin: '0 0 14px' }}>
            No description provided.
          </p>
        )}

        {/* Stats row: stars, forks, language */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
          {/* Stars */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="14" height="14" fill={isDark ? '#e3b341' : '#9a6700'} viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            <span style={{ fontSize: 12, fontWeight: 600, color: isDark ? '#e3b341' : '#9a6700' }}>
              {formatCount(repo.stars ?? 0)}
            </span>
          </div>

          {/* Forks */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="14" height="14" fill="none" stroke={isDark ? '#8b949e' : '#57606a'} strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 5a2 2 0 100 4 2 2 0 000-4zm10 0a2 2 0 100 4 2 2 0 000-4zm-5 10a2 2 0 100 4 2 2 0 000-4zM7 9v2a5 5 0 0010 0V9M12 15v-4" />
            </svg>
            <span style={{ fontSize: 12, color: isDark ? '#8b949e' : '#57606a' }}>
              {formatCount(repo.forks ?? 0)}
            </span>
          </div>

          {/* Language */}
          {repo.language && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: langColor(repo.language), display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: isDark ? '#8b949e' : '#57606a' }}>{repo.language}</span>
            </div>
          )}
        </div>

        {/* Last activity */}
        {lastActivity && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 14 }}>
            <svg width="12" height="12" fill="none" stroke={isDark ? '#475569' : '#94a3b8'} strokeWidth={1.8} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span style={{ fontSize: 11, color: isDark ? '#475569' : '#94a3b8' }}>
              Updated {formatRelativeTime(lastActivity)}
            </span>
          </div>
        )}

        {/* Topics */}
        {repo.topics && repo.topics.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
            {repo.topics.slice(0, 4).map((topic) => (
              <span key={topic} style={{
                fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 999,
                background: isDark ? '#0d1117' : '#ddf4ff',
                color: isDark ? '#58a6ff' : '#0969da',
                border: `1px solid ${isDark ? '#1f3a5c' : '#b6e3ff'}`,
              }}>
                {topic}
              </span>
            ))}
          </div>
        )}

        {/* CTA button */}
        <Link
          href={repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'block', textAlign: 'center', padding: '7px 14px',
            borderRadius: 8, textDecoration: 'none', fontSize: 12, fontWeight: 600,
            background: isDark
              ? 'linear-gradient(135deg, #238636 0%, #196127 100%)'
              : 'linear-gradient(135deg, #2da44e 0%, #1a7f37 100%)',
            color: '#fff', marginTop: 'auto',
          }}
        >
          View Repository
        </Link>
      </div>

      {/* Footer */}
      <div style={s.footer}>
        <BrandLogo />
        <span style={{ fontSize: 10, color: isDark ? '#475569' : '#94a3b8' }}>
          {owner}/{repoName}
        </span>
      </div>
    </div>
  )
}

// ─── Styles factory ───────────────────────────────────────────────────────────

function buildStyles(isDark: boolean): Record<string, React.CSSProperties> {
  const bg = isDark ? '#0F0F1A' : '#ffffff'
  const surface = isDark ? '#161b22' : '#f6f8fa'
  const border = isDark ? '#21262d' : '#d0d7de'

  return {
    shell: {
      display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden',
      background: bg,
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    body: {
      flex: 1, padding: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column',
    },
    footer: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '7px 14px', borderTop: `1px solid ${border}`,
      background: surface, flexShrink: 0,
    },
    skel: {
      height: 10, borderRadius: 4,
      background: isDark ? '#21262d' : '#e1e4e8',
      marginBottom: 6,
    },
  }
}
