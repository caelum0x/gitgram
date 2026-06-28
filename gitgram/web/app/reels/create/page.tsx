'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useMutation } from '@tanstack/react-query'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreateReelPayload {
  title: string
  description: string
  language: string
  codeSnippet: string
  repositoryUrl: string
  hashtags: string
}

interface CreateReelResponse {
  id?: string
  reel?: { id: string }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPPORTED_LANGUAGES = [
  'TypeScript',
  'JavaScript',
  'Python',
  'Rust',
  'Go',
  'Java',
  'C++',
  'C',
  'Ruby',
  'Swift',
  'Kotlin',
  'PHP',
  'HTML',
  'CSS',
  'Shell',
  'SQL',
  'GraphQL',
  'YAML',
  'JSON',
] as const

const LANGUAGE_COLOURS: Record<string, string> = {
  typescript: '#3178c6',
  javascript: '#f7df1e',
  python: '#3572A5',
  rust: '#dea584',
  go: '#00ADD8',
  java: '#b07219',
  'c++': '#f34b7d',
  c: '#555555',
  ruby: '#701516',
  swift: '#ffac45',
  kotlin: '#A97BFF',
  php: '#4F5D95',
  html: '#e34c26',
  css: '#563d7c',
  shell: '#89e051',
  sql: '#e38c00',
  graphql: '#e10098',
  yaml: '#cb171e',
  json: '#8bc34a',
}

const PLACEHOLDER_SNIPPETS: Record<string, string> = {
  typescript: `// Binary search in TypeScript
function binarySearch<T>(
  arr: readonly T[],
  target: T,
  compare: (a: T, b: T) => number
): number {
  let lo = 0
  let hi = arr.length - 1

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    const cmp = compare(arr[mid], target)
    if (cmp === 0) return mid
    if (cmp < 0) lo = mid + 1
    else hi = mid - 1
  }

  return -1
}`,
  python: `# Fibonacci with memoization
from functools import lru_cache

@lru_cache(maxsize=None)
def fib(n: int) -> int:
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)

print([fib(i) for i in range(10)])`,
  rust: `// Zero-cost iterator chain
fn main() {
    let sum: u64 = (1..=1_000_000)
        .filter(|n| n % 2 == 0)
        .map(|n| n * n)
        .sum();

    println!("Sum of even squares: {sum}");
}`,
  go: `// Concurrent fan-out with WaitGroup
package main

import (
    "fmt"
    "sync"
)

func worker(id int, wg *sync.WaitGroup) {
    defer wg.Done()
    fmt.Printf("worker %d done\\n", id)
}

func main() {
    var wg sync.WaitGroup
    for i := 1; i <= 5; i++ {
        wg.Add(1)
        go worker(i, &wg)
    }
    wg.Wait()
}`,
}

function getDefaultSnippet(language: string): string {
  return PLACEHOLDER_SNIPPETS[language.toLowerCase()] ?? `// Write your ${language} code here\n`
}

function getLangColour(lang: string): string {
  return LANGUAGE_COLOURS[lang.toLowerCase()] ?? '#8b949e'
}

/**
 * Engagement controls shown in the create-time preview. Mirrors the icons in
 * the published reel viewer (like / comment / share) so creators see the real
 * layout before publishing. Counts are 0 until the reel goes live.
 */
const ENGAGEMENT_PREVIEW_ICONS: ReadonlyArray<{ label: string; d: string }> = [
  {
    label: 'Likes',
    d: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  },
  {
    label: 'Comments',
    d: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  },
  {
    label: 'Share',
    d: 'M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z',
  },
]

// ─── Mini code preview ────────────────────────────────────────────────────────

interface MiniCodePreviewProps {
  code: string
  language: string
  title: string
  description: string
  hashtags: string
}

function MiniCodePreview({ code, language, title, description, hashtags }: MiniCodePreviewProps) {
  const langColour = getLangColour(language)
  const lines = code.split('\n')
  const tags = hashtags
    .split(',')
    .map((t) => t.trim().replace(/^#/, ''))
    .filter(Boolean)

  return (
    <div
      className="relative rounded-2xl overflow-hidden flex flex-col"
      style={{
        background: '#0d1117',
        border: '1px solid #30363d',
        height: 560,
        width: '100%',
        maxWidth: 280,
      }}
    >
      {/* Language bar */}
      <div className="h-1 w-full flex-shrink-0" style={{ background: langColour }} />

      {/* Language badge */}
      <div className="px-3 pt-2.5 pb-1 flex items-center gap-2 flex-shrink-0">
        <span
          className="px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide"
          style={{
            background: `${langColour}22`,
            color: langColour,
            border: `1px solid ${langColour}44`,
          }}
        >
          {language || 'code'}
        </span>
      </div>

      {/* Code block — ~60% height */}
      <div className="flex-1 overflow-hidden px-3 pb-2" style={{ maxHeight: 320 }}>
        <pre
          className="text-xs leading-relaxed font-mono overflow-hidden"
          style={{ color: '#c9d1d9' }}
        >
          {lines.slice(0, 22).map((line, i) => (
            <div key={i} className="flex gap-3">
              <span className="select-none w-4 text-right flex-shrink-0" style={{ color: '#30363d' }}>
                {i + 1}
              </span>
              <span className="flex-1 whitespace-pre truncate">{line || ' '}</span>
            </div>
          ))}
          {lines.length > 22 && (
            <div className="flex gap-3 opacity-30">
              <span className="w-4 text-right flex-shrink-0" style={{ color: '#30363d' }}>…</span>
              <span className="flex-1" style={{ color: '#58a6ff' }}>+{lines.length - 22} more lines</span>
            </div>
          )}
        </pre>
      </div>

      {/* Divider */}
      <div className="h-px mx-3 flex-shrink-0" style={{ background: '#21262d' }} />

      {/* Bottom info */}
      <div className="px-3 pt-2 pb-3 flex-shrink-0 space-y-1">
        {/* Fake author row */}
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{ background: '#238636' }}
          >
            Y
          </div>
          <span className="text-white/70 text-xs">@you</span>
        </div>

        <h3 className="text-white text-sm font-bold leading-snug line-clamp-1">
          {title || 'Reel title'}
        </h3>

        {description && (
          <p className="text-white/50 text-xs line-clamp-2">{description}</p>
        )}

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-xs" style={{ color: '#58a6ff' }}>
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Engagement controls preview — mirrors the published reel viewer.
          Counts start at 0 for a new reel; controls become interactive
          once the reel is published. */}
      <div
        className="absolute right-2 flex flex-col items-center gap-3"
        style={{ top: '34%' }}
        aria-label="Engagement controls preview"
      >
        {ENGAGEMENT_PREVIEW_ICONS.map((icon) => (
          <div key={icon.label} className="flex flex-col items-center gap-0.5">
            <div className="p-2 rounded-full text-white/70">
              <svg className="w-5 h-5 drop-shadow" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d={icon.d} />
              </svg>
            </div>
            <span className="text-white/60 text-[10px] font-medium drop-shadow">0</span>
            <span className="sr-only">{icon.label}</span>
          </div>
        ))}
      </div>

      {/* Watermark */}
      <div
        className="absolute bottom-14 right-2 text-[9px] font-mono uppercase tracking-widest opacity-10 pointer-events-none"
        style={{ color: langColour }}
      >
        {language || 'code'}
      </div>
    </div>
  )
}

// ─── Create Reel Page ─────────────────────────────────────────────────────────

async function submitCodeReel(payload: CreateReelPayload): Promise<CreateReelResponse> {
  const response = await fetch('/api/v1/reels', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: payload.title,
      description: payload.description,
      language: payload.language,
      codeSnippet: payload.codeSnippet,
      caption: payload.description,
      hashtags: payload.hashtags
        .split(',')
        .map((t) => t.trim().replace(/^#/, ''))
        .filter(Boolean),
      repositoryUrl: payload.repositoryUrl || undefined,
      // videoUrl is not required for code reels — backend fills a placeholder
      videoUrl: 'code_reel',
      thumbnailUrl: 'code_reel',
    }),
  })

  if (!response.ok) {
    const err = (await response.json().catch(() => ({}))) as { message?: string; error?: string }
    throw new Error(err.message ?? err.error ?? `Server error ${response.status}`)
  }

  return response.json() as Promise<CreateReelResponse>
}

export default function CreateCodeReelPage() {
  const router = useRouter()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [language, setLanguage] = useState('TypeScript')
  const [code, setCode] = useState(() => getDefaultSnippet('TypeScript'))
  const [hashtags, setHashtags] = useState('')
  const [repositoryUrl, setRepositoryUrl] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleLanguageChange = useCallback((lang: string) => {
    setLanguage(lang)
    // Only replace code if it's still the placeholder for the previous language
    setCode((prev) => {
      const prevDefault = getDefaultSnippet(language)
      if (prev === prevDefault || prev.trim() === '') {
        return getDefaultSnippet(lang)
      }
      return prev
    })
  }, [language])

  const createMutation = useMutation<CreateReelResponse, Error, CreateReelPayload>({
    mutationFn: submitCodeReel,
    onSuccess: (data) => {
      const id = data.id ?? data.reel?.id
      if (id) {
        router.push(`/reel/${id}`)
      } else {
        router.push('/reels')
      }
    },
    onError: (err) => {
      setSubmitError(err.message)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)

    if (!title.trim()) {
      setSubmitError('Title is required')
      return
    }
    if (!code.trim()) {
      setSubmitError('Code snippet is required')
      return
    }

    createMutation.mutate({ title, description, language, codeSnippet: code, hashtags, repositoryUrl })
  }

  const isSubmitting = createMutation.isPending
  const langColour = getLangColour(language)

  return (
    <div
      className="min-h-screen"
      style={{ background: '#0a0c10', color: '#c9d1d9' }}
    >
      {/* Top bar */}
      <div
        className="sticky top-0 z-30 flex items-center justify-between px-4 py-3"
        style={{ background: '#0a0c10', borderBottom: '1px solid #21262d' }}
      >
        <div className="flex items-center gap-3">
          <Link
            href="/reels"
            className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Reels
          </Link>
          <span className="text-white/20">/</span>
          <h1 className="text-sm font-semibold text-white">Create Code Reel</h1>
        </div>

        <button
          form="create-reel-form"
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-all"
          style={{ background: '#238636', border: '1px solid #2ea043' }}
        >
          {isSubmitting ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Publishing...
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Publish
            </>
          )}
        </button>
      </div>

      {/* Error banner */}
      {submitError && (
        <div
          className="mx-4 mt-3 px-4 py-3 rounded-lg text-sm flex items-start gap-2"
          style={{ background: '#da363322', border: '1px solid #da363355', color: '#ff7b72' }}
        >
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {submitError}
        </div>
      )}

      {/* Main layout: form left, preview right */}
      <div className="flex flex-col lg:flex-row gap-0 min-h-[calc(100vh-56px)]">
        {/* ── Form ── */}
        <form
          id="create-reel-form"
          onSubmit={handleSubmit}
          className="flex-1 px-4 py-5 space-y-5 max-w-3xl"
        >
          {/* Title */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider">
              Title <span style={{ color: '#da3633' }}>*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Binary search in TypeScript"
              maxLength={120}
              required
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
              style={{
                background: '#161b22',
                border: '1px solid #30363d',
                color: '#c9d1d9',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = langColour)}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#30363d')}
            />
            <p className="text-xs text-white/30">{title.length}/120</p>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this code do? What's the key insight?"
              rows={3}
              maxLength={500}
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none resize-none transition-colors"
              style={{
                background: '#161b22',
                border: '1px solid #30363d',
                color: '#c9d1d9',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = langColour)}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#30363d')}
            />
            <p className="text-xs text-white/30">{description.length}/500</p>
          </div>

          {/* Language select */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider">
              Language <span style={{ color: '#da3633' }}>*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {SUPPORTED_LANGUAGES.map((lang) => {
                const isSelected = language === lang
                const colour = getLangColour(lang)
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => handleLanguageChange(lang)}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                    style={
                      isSelected
                        ? {
                            background: `${colour}22`,
                            color: colour,
                            border: `1px solid ${colour}`,
                          }
                        : {
                            background: '#161b22',
                            color: '#8b949e',
                            border: '1px solid #30363d',
                          }
                    }
                  >
                    {lang}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Code textarea */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider">
                Code Snippet <span style={{ color: '#da3633' }}>*</span>
              </label>
              <span className="text-xs text-white/30 font-mono">
                {code.split('\n').length} lines
              </span>
            </div>
            <div
              className="relative rounded-lg overflow-hidden"
              style={{ border: `1px solid #30363d` }}
            >
              {/* Editor header bar */}
              <div
                className="flex items-center justify-between px-3 py-2"
                style={{ background: '#161b22', borderBottom: '1px solid #21262d' }}
              >
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#ff5f57' }} />
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#febc2e' }} />
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#28c840' }} />
                </div>
                <span
                  className="text-xs font-mono uppercase tracking-wider"
                  style={{ color: langColour, opacity: 0.7 }}
                >
                  {language}
                </span>
              </div>

              {/* Code input */}
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                spellCheck={false}
                rows={20}
                placeholder={`// Paste your ${language} code here`}
                className="w-full px-4 py-3 text-sm font-mono resize-none outline-none"
                style={{
                  background: '#0d1117',
                  color: '#c9d1d9',
                  lineHeight: '1.6',
                  tabSize: 2,
                }}
              />
            </div>
          </div>

          {/* Repository URL */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider">
              Repository (optional)
            </label>
            <input
              type="text"
              value={repositoryUrl}
              onChange={(e) => setRepositoryUrl(e.target.value)}
              placeholder="owner/repo"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none font-mono transition-colors"
              style={{
                background: '#161b22',
                border: '1px solid #30363d',
                color: '#c9d1d9',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = langColour)}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#30363d')}
            />
          </div>

          {/* Hashtags */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-white/60 uppercase tracking-wider">
              Hashtags
            </label>
            <input
              type="text"
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="react, typescript, algorithms"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
              style={{
                background: '#161b22',
                border: '1px solid #30363d',
                color: '#c9d1d9',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = langColour)}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#30363d')}
            />
            <p className="text-xs text-white/30">Comma-separated, e.g. react, hooks, typescript</p>
          </div>

          {/* Tips */}
          <div
            className="rounded-lg p-4 space-y-2"
            style={{ background: '#161b22', border: '1px solid #21262d' }}
          >
            <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider">Tips for a great code reel</h3>
            <ul className="space-y-1.5">
              {[
                'Keep snippets under 30 lines for maximum readability',
                'Add a clear description explaining the key concept',
                'Use proper indentation — viewers read on mobile',
                'Link the repo so people can explore further',
              ].map((tip) => (
                <li key={tip} className="flex items-start gap-2 text-xs text-white/40">
                  <span style={{ color: langColour, flexShrink: 0 }}>›</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>

          {/* Bottom publish button (mobile) */}
          <div className="lg:hidden pt-2 pb-8">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              style={{ background: '#238636', border: '1px solid #2ea043' }}
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Publishing...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  Publish Reel
                </>
              )}
            </button>
          </div>
        </form>

        {/* ── Live Preview ── */}
        <div
          className="hidden lg:flex flex-col items-center justify-start px-8 py-6 gap-4 sticky top-14 self-start"
          style={{
            width: 340,
            flexShrink: 0,
            borderLeft: '1px solid #21262d',
            minHeight: 'calc(100vh - 56px)',
          }}
        >
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wider self-start">
            Live Preview
          </p>

          <MiniCodePreview
            code={code}
            language={language}
            title={title}
            description={description}
            hashtags={hashtags}
          />

          <p className="text-xs text-white/25 text-center leading-relaxed">
            This is how your reel will appear in the feed.
            <br />
            Viewers see the first ~22 lines on mobile.
          </p>
        </div>
      </div>
    </div>
  )
}
