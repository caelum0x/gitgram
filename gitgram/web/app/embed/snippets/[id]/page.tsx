'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import api from '@/services/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmbedSnippet {
  id: string
  title?: string
  description?: string
  code: string
  language: string
  createdAt: string
  user: {
    id: string
    username: string
    avatar?: string
    displayName?: string
  }
}

type Theme = 'dark' | 'light'
type Size = 'compact' | 'normal'

// ─── Language label map ───────────────────────────────────────────────────────

const LANG_LABELS: Record<string, string> = {
  javascript: 'JavaScript', typescript: 'TypeScript', python: 'Python',
  go: 'Go', rust: 'Rust', java: 'Java', c: 'C', cpp: 'C++',
  csharp: 'C#', ruby: 'Ruby', php: 'PHP', swift: 'Swift',
  kotlin: 'Kotlin', bash: 'Bash', json: 'JSON', yaml: 'YAML',
  sql: 'SQL', css: 'CSS', scss: 'SCSS', jsx: 'JSX', tsx: 'TSX',
  markdown: 'Markdown', text: 'Plain Text',
}

function langLabel(lang: string): string {
  return LANG_LABELS[lang.toLowerCase()] ?? lang.toUpperCase()
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHr = Math.floor(diffMs / 3_600_000)
  const diffDay = Math.floor(diffMs / 86_400_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 30) return `${diffDay}d ago`
  return new Date(dateString).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ user, size }: { user: EmbedSnippet['user']; size: Size }) {
  const dim = size === 'compact' ? 24 : 28
  const fs = size === 'compact' ? 10 : 12
  const initial = user.username?.[0]?.toUpperCase() ?? '?'
  if (user.avatar) {
    return (
      <img
        src={user.avatar}
        alt={user.username}
        width={dim}
        height={dim}
        style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0, width: dim, height: dim }}
      />
    )
  }
  return (
    <div style={{
      width: dim, height: dim, borderRadius: '50%',
      background: 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: fs, fontWeight: 700, color: '#fff', flexShrink: 0,
    }}>
      {initial}
    </div>
  )
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ code, theme }: { code: string; theme: Theme }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = code
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isDark = theme === 'dark'

  return (
    <button
      onClick={handleCopy}
      title="Copy code"
      style={{
        position: 'absolute', top: 8, right: 8,
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '3px 8px', borderRadius: 5, cursor: 'pointer', border: 'none',
        fontSize: 11, fontWeight: 500, transition: 'all 0.15s',
        background: copied
          ? (isDark ? '#1a3a1a' : '#d1fae5')
          : (isDark ? '#21262d' : '#e1e4e8'),
        color: copied
          ? (isDark ? '#4ade80' : '#15803d')
          : (isDark ? '#8b949e' : '#57606a'),
      }}
    >
      {copied ? (
        <>
          <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Copy
        </>
      )}
    </button>
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

export default function EmbedSnippetPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const snippetId = params.id as string

  const theme: Theme = searchParams.get('theme') === 'light' ? 'light' : 'dark'
  const size: Size = searchParams.get('size') === 'compact' ? 'compact' : 'normal'

  const [snippet, setSnippet] = useState<EmbedSnippet | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const codeRef = useRef<HTMLElement>(null)

  useEffect(() => {
    let cancelled = false
    const fetchSnippet = async () => {
      try {
        const { data } = await api.get(`/v1/snippets/${snippetId}`)
        if (!cancelled) setSnippet(data?.data ?? data)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchSnippet()
    return () => { cancelled = true }
  }, [snippetId])

  // Prism highlighting after snippet loads
  useEffect(() => {
    if (!snippet || !codeRef.current) return
    // Dynamically load Prism if available (it may already be loaded by the main app)
    if (typeof window !== 'undefined' && (window as { Prism?: { highlightElement: (el: HTMLElement) => void } }).Prism) {
      ;(window as { Prism: { highlightElement: (el: HTMLElement) => void } }).Prism.highlightElement(codeRef.current)
    }
  }, [snippet])

  const isDark = theme === 'dark'
  const isCompact = size === 'compact'

  const s = buildStyles(isDark, isCompact)

  const snippetUrl = `https://gitgram.dev/snippets/${snippetId}`

  if (loading) {
    return (
      <div style={s.shell}>
        <div style={s.header}>
          <div style={{ ...s.skel, width: '30%' }} />
          <div style={{ ...s.skel, width: '15%' }} />
        </div>
        <div style={s.codeArea}>
          {[100, 80, 65, 90, 50].map((w, i) => (
            <div key={i} style={{ ...s.skel, width: `${w}%`, marginBottom: 8 }} />
          ))}
        </div>
        <div style={s.footer}><BrandLogo /></div>
      </div>
    )
  }

  if (error || !snippet) {
    return (
      <div style={s.shell}>
        <div style={{ ...s.codeArea, justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <p style={{ color: isDark ? '#64748B' : '#94a3b8', fontSize: 13, margin: 0 }}>Snippet not found</p>
        </div>
        <div style={s.footer}><BrandLogo /></div>
      </div>
    )
  }

  return (
    <div style={s.shell}>
      {/* Header: title + language badge */}
      <div style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <svg width="14" height="14" fill="none" stroke={isDark ? '#7C3AED' : '#6D28D9'} strokeWidth={2} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          <span style={{
            fontSize: isCompact ? 12 : 13, fontWeight: 600,
            color: isDark ? '#e2e8f0' : '#1e293b',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {snippet.title ?? 'Untitled Snippet'}
          </span>
        </div>
        <span style={s.langBadge}>{langLabel(snippet.language)}</span>
      </div>

      {/* Code block */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <CopyButton code={snippet.code} theme={theme} />
        <pre style={s.pre}>
          <code ref={codeRef} className={`language-${snippet.language}`} style={s.code}>
            {snippet.code}
          </code>
        </pre>
      </div>

      {/* Footer: author + view link */}
      <div style={s.footer}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BrandLogo />
          {!isCompact && (
            <span style={{ color: isDark ? '#475569' : '#94a3b8', fontSize: 11 }}>&middot;</span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Avatar user={snippet.user} size={size} />
            <span style={{ fontSize: 11, color: isDark ? '#8b949e' : '#57606a' }}>
              by <span style={{ color: isDark ? '#a78bfa' : '#6D28D9', fontWeight: 600 }}>@{snippet.user.username}</span>
            </span>
          </div>
        </div>
        <Link
          href={snippetUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 11, color: isDark ? '#7C3AED' : '#6D28D9', textDecoration: 'none', fontWeight: 500, whiteSpace: 'nowrap' }}
        >
          View on Gitgram
        </Link>
      </div>
    </div>
  )
}

// ─── Styles factory ───────────────────────────────────────────────────────────

function buildStyles(isDark: boolean, isCompact: boolean): Record<string, React.CSSProperties> {
  const bg = isDark ? '#0d1117' : '#ffffff'
  const surface = isDark ? '#161b22' : '#f6f8fa'
  const border = isDark ? '#21262d' : '#d0d7de'
  const codeText = isDark ? '#c9d1d9' : '#24292f'
  const headerPad = isCompact ? '8px 12px' : '10px 14px'
  const footerPad = isCompact ? '6px 12px' : '8px 14px'

  return {
    shell: {
      display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden',
      background: bg,
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    header: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: headerPad, borderBottom: `1px solid ${border}`, background: surface,
      gap: 8, flexShrink: 0,
    },
    langBadge: {
      fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999,
      background: isDark ? '#1a1a2e' : '#ede9fe',
      color: isDark ? '#a78bfa' : '#6D28D9',
      border: `1px solid ${isDark ? '#312e6b' : '#c4b5fd'}`,
      whiteSpace: 'nowrap' as const, flexShrink: 0,
    },
    pre: {
      margin: 0, padding: isCompact ? '10px 14px' : '14px 16px',
      overflow: 'auto', height: '100%',
      background: bg,
      fontSize: isCompact ? 11 : 12,
      lineHeight: 1.65,
    },
    code: {
      fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
      color: codeText, background: 'transparent',
      whiteSpace: 'pre' as const,
    },
    codeArea: {
      flex: 1, display: 'flex', flexDirection: 'column' as const,
      padding: isCompact ? '10px 14px' : '14px 16px',
    },
    footer: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: footerPad, borderTop: `1px solid ${border}`,
      background: surface, flexShrink: 0,
    },
    skel: {
      height: 10, borderRadius: 4,
      background: isDark ? '#21262d' : '#e1e4e8',
      marginBottom: 6,
    },
  }
}
