'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import api from '@/services/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmbedUserProfile {
  id: string
  username: string
  displayName?: string
  bio?: string
  avatar?: string
  postsCount: number
  followersCount: number
  followingCount: number
  topLanguages?: string[]
  isVerified?: boolean
}

type Theme = 'dark' | 'light'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function truncateBio(bio: string, max: number): string {
  if (bio.length <= max) return bio
  return bio.slice(0, max).trimEnd() + '…'
}

// ─── Language badge colours ───────────────────────────────────────────────────

const LANG_COLORS: Record<string, string> = {
  typescript: '#3178c6', javascript: '#f7df1e', python: '#3572a5',
  go: '#00add8', rust: '#dea584', java: '#b07219', kotlin: '#a97bff',
  swift: '#f05138', ruby: '#701516', php: '#4f5d95', csharp: '#178600',
  cpp: '#f34b7d', c: '#555555', css: '#563d7c', html: '#e34c26',
}

function langColor(lang: string): string {
  return LANG_COLORS[lang.toLowerCase()] ?? '#7C3AED'
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ user, isDark }: { user: EmbedUserProfile; isDark: boolean }) {
  const initial = user.username?.[0]?.toUpperCase() ?? '?'
  if (user.avatar) {
    return (
      <img
        src={user.avatar}
        alt={user.username}
        width={56}
        height={56}
        style={{
          width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', flexShrink: 0,
          border: `2px solid ${isDark ? '#7C3AED' : '#a78bfa'}`,
        }}
      />
    )
  }
  return (
    <div style={{
      width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 22, fontWeight: 700, color: '#fff',
      border: `2px solid ${isDark ? '#7C3AED' : '#a78bfa'}`,
    }}>
      {initial}
    </div>
  )
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

export default function EmbedUserPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const username = params.username as string

  const theme: Theme = searchParams.get('theme') === 'light' ? 'light' : 'dark'
  const isDark = theme === 'dark'

  const [user, setUser] = useState<EmbedUserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    const fetchUser = async () => {
      try {
        const { data } = await api.get(`/users/${username}`)
        const payload = data?.data ?? data
        if (!cancelled) setUser(payload)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchUser()
    return () => { cancelled = true }
  }, [username])

  const profileUrl = `https://gitgram.dev/${username}`
  const s = buildStyles(isDark)

  if (loading) {
    return (
      <div style={s.shell}>
        <div style={s.body}>
          <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: s.skel.background as string, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ ...s.skel, width: '50%', marginBottom: 8 }} />
              <div style={{ ...s.skel, width: '35%' }} />
            </div>
          </div>
          <div style={{ ...s.skel, width: '90%', marginBottom: 6 }} />
          <div style={{ ...s.skel, width: '70%' }} />
        </div>
        <div style={s.footer}><BrandLogo /></div>
      </div>
    )
  }

  if (error || !user) {
    return (
      <div style={s.shell}>
        <div style={{ ...s.body, justifyContent: 'center', alignItems: 'center' }}>
          <p style={{ color: isDark ? '#64748B' : '#94a3b8', fontSize: 13, margin: 0 }}>User not found</p>
        </div>
        <div style={s.footer}><BrandLogo /></div>
      </div>
    )
  }

  const stats = [
    { label: 'Posts', value: formatCount(user.postsCount ?? 0) },
    { label: 'Followers', value: formatCount(user.followersCount ?? 0) },
    { label: 'Following', value: formatCount(user.followingCount ?? 0) },
  ]

  return (
    <div style={s.shell}>
      <div style={s.body}>
        {/* Avatar + name row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 12 }}>
          <Avatar user={user} isDark={isDark} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: isDark ? '#e2e8f0' : '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.displayName ?? user.username}
              </span>
              {user.isVerified && (
                <svg width="14" height="14" fill={isDark ? '#58a6ff' : '#1d4ed8'} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span style={{ fontSize: 12, color: isDark ? '#8b949e' : '#57606a' }}>@{user.username}</span>
          </div>
        </div>

        {/* Bio */}
        {user.bio && (
          <p style={{ fontSize: 12, color: isDark ? '#94a3b8' : '#475569', lineHeight: 1.6, margin: '0 0 12px', wordBreak: 'break-word' }}>
            {truncateBio(user.bio, 120)}
          </p>
        )}

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderTop: `1px solid ${isDark ? '#21262d' : '#e2e8f0'}`, borderBottom: `1px solid ${isDark ? '#21262d' : '#e2e8f0'}`, padding: '8px 0' }}>
          {stats.map(({ label, value }) => (
            <div key={label} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: isDark ? '#e2e8f0' : '#1e293b' }}>{value}</div>
              <div style={{ fontSize: 10, color: isDark ? '#8b949e' : '#57606a', marginTop: 1 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Top languages */}
        {user.topLanguages && user.topLanguages.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
            {user.topLanguages.slice(0, 5).map((lang) => (
              <span key={lang} style={{
                fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                background: isDark ? '#0d1117' : '#f1f5f9',
                color: langColor(lang),
                border: `1px solid ${isDark ? '#30363d' : '#e2e8f0'}`,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: langColor(lang), display: 'inline-block', flexShrink: 0 }} />
                {lang.charAt(0).toUpperCase() + lang.slice(1)}
              </span>
            ))}
          </div>
        )}

        {/* CTA button */}
        <Link
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'block', textAlign: 'center', padding: '7px 14px',
            borderRadius: 8, textDecoration: 'none', fontSize: 12, fontWeight: 600,
            background: 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)',
            color: '#fff', transition: 'opacity 0.15s',
          }}
        >
          Follow on Gitgram
        </Link>
      </div>

      {/* Footer */}
      <div style={s.footer}>
        <BrandLogo />
        <span style={{ fontSize: 10, color: isDark ? '#475569' : '#94a3b8' }}>
          gitgram.dev/{username}
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
