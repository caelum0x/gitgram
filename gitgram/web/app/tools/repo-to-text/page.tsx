'use client'

import { useState } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OutputFormat = 'xml' | 'markdown' | 'json'

interface ConvertPayload {
  url: string
  patterns: string[]
  maxSize: number
  format: OutputFormat
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Conversion failed. Please check the URL and try again.'
}

function triggerDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/plain' })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(objectUrl)
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PATTERNS = '**/*.ts,**/*.tsx,**/*.js,**/*.py'
const DEFAULT_MAX_SIZE = 100
const DEFAULT_FORMAT: OutputFormat = 'xml'

const FORMAT_OPTIONS: { value: OutputFormat; label: string }[] = [
  { value: 'xml', label: 'XML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'json', label: 'JSON' },
]

// ---------------------------------------------------------------------------
// Styles (dark theme tokens)
// ---------------------------------------------------------------------------

const BG_PAGE = '#0F0F1A'
const BG_SURFACE = '#1A1A2E'
const COLOR_PRIMARY = '#7C3AED'
const COLOR_PRIMARY_HOVER = '#6D28D9'
const COLOR_TEXT = '#E2E8F0'
const COLOR_TEXT_MUTED = '#94A3B8'
const COLOR_BORDER = 'rgba(255,255,255,0.1)'
const COLOR_ERROR_BG = 'rgba(239,68,68,0.12)'
const COLOR_ERROR_BORDER = 'rgba(239,68,68,0.4)'
const COLOR_ERROR_TEXT = '#FCA5A5'

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function RepoToTextPage() {
  const [url, setUrl] = useState('')
  const [patterns, setPatterns] = useState(DEFAULT_PATTERNS)
  const [maxSize, setMaxSize] = useState<number>(DEFAULT_MAX_SIZE)
  const [format, setFormat] = useState<OutputFormat>(DEFAULT_FORMAT)
  const [result, setResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const charCount = result?.length ?? 0
  const tokenEstimate = Math.ceil(charCount / 4)

  const handleConvert = async () => {
    const trimmedUrl = url.trim()

    if (!trimmedUrl) {
      setError('Please enter a GitHub repository URL.')
      return
    }

    if (!trimmedUrl.includes('github.com')) {
      setError('Please enter a valid GitHub repository URL (e.g. https://github.com/owner/repo).')
      return
    }

    const patternList = patterns
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)

    if (patternList.length === 0) {
      setError('Please enter at least one file pattern.')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const payload: ConvertPayload = {
        url: trimmedUrl,
        patterns: patternList,
        maxSize,
        format,
      }

      const response = await fetch('/api/tools/repo-to-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        let message = `Request failed with status ${response.status}`
        try {
          const body = (await response.json()) as { error?: string; message?: string }
          message = body.error ?? body.message ?? message
        } catch {
          // Ignore JSON parse errors; keep the status-based message
        }
        throw new Error(message)
      }

      const data = (await response.json()) as { content?: string; result?: string }
      const content = data.content ?? data.result ?? ''
      setResult(content)
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = result
      textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    if (!result) return
    const ext = format === 'xml' ? 'xml' : format === 'json' ? 'json' : 'md'
    const repoSlug = url.trim().replace(/https?:\/\/github\.com\//, '').replace(/\//g, '-') || 'repo'
    triggerDownload(result, `${repoSlug}.${ext}`)
  }

  const handleUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !loading) void handleConvert()
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: BG_PAGE,
        color: COLOR_TEXT,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '48px 24px' }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: COLOR_PRIMARY }}>
            Developer Tools
          </p>
          <h1 style={{ margin: '0 0 12px', fontSize: 36, fontWeight: 800, lineHeight: 1.1 }}>
            Repo to Text
          </h1>
          <p style={{ margin: 0, fontSize: 15, color: COLOR_TEXT_MUTED, maxWidth: 520, marginInline: 'auto' }}>
            Convert any public GitHub repository into a single LLM-friendly text context.
          </p>
        </div>

        {/* ── URL Input ──────────────────────────────────────────────────── */}
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <label style={labelStyle} htmlFor="repo-url">
            GitHub Repository URL
          </label>
          <input
            id="repo-url"
            type="url"
            placeholder="https://github.com/owner/repository"
            value={url}
            onChange={(e) => { setUrl(e.target.value); if (error) setError(null) }}
            onKeyDown={handleUrlKeyDown}
            disabled={loading}
            style={inputStyle(loading)}
          />
        </div>

        {/* ── Options ────────────────────────────────────────────────────── */}
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <h2 style={{ margin: '0 0 20px', fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: COLOR_TEXT_MUTED }}>
            Options
          </h2>

          {/* Patterns */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle} htmlFor="patterns">
              File Patterns
              <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: COLOR_TEXT_MUTED }}>
                comma-separated glob patterns
              </span>
            </label>
            <textarea
              id="patterns"
              value={patterns}
              onChange={(e) => setPatterns(e.target.value)}
              disabled={loading}
              rows={3}
              style={{
                ...inputStyle(loading),
                resize: 'vertical',
                fontFamily: 'ui-monospace, monospace',
                fontSize: 13,
              } as React.CSSProperties}
            />
          </div>

          {/* Max file size + Format side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Max Size */}
            <div>
              <label style={labelStyle} htmlFor="max-size">
                Max File Size (KB)
              </label>
              <input
                id="max-size"
                type="number"
                min={1}
                max={10000}
                value={maxSize}
                onChange={(e) => setMaxSize(Math.max(1, Number(e.target.value)))}
                disabled={loading}
                style={inputStyle(loading)}
              />
            </div>

            {/* Format */}
            <div>
              <p style={{ ...labelStyle, marginBottom: 10 }}>Output Format</p>
              <div style={{ display: 'flex', gap: 16 }}>
                {FORMAT_OPTIONS.map(({ value, label }) => (
                  <label
                    key={value}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      fontSize: 14,
                      color: format === value ? COLOR_TEXT : COLOR_TEXT_MUTED,
                      fontWeight: format === value ? 600 : 400,
                      opacity: loading ? 0.5 : 1,
                    }}
                  >
                    <input
                      type="radio"
                      name="format"
                      value={value}
                      checked={format === value}
                      onChange={() => setFormat(value)}
                      disabled={loading}
                      style={{ accentColor: COLOR_PRIMARY }}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Convert Button ─────────────────────────────────────────────── */}
        <button
          type="button"
          onClick={() => void handleConvert()}
          disabled={loading || !url.trim()}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            padding: '14px 24px',
            marginBottom: 16,
            borderRadius: 12,
            border: 'none',
            backgroundColor: loading || !url.trim() ? '#4B3B8C' : COLOR_PRIMARY,
            color: '#fff',
            fontSize: 15,
            fontWeight: 700,
            cursor: loading || !url.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !url.trim() ? 0.65 : 1,
            transition: 'background-color 0.15s',
          }}
          onMouseEnter={(e) => {
            if (!loading && url.trim()) {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = COLOR_PRIMARY_HOVER
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor =
              loading || !url.trim() ? '#4B3B8C' : COLOR_PRIMARY
          }}
        >
          {loading ? (
            <>
              <SpinnerIcon />
              Analyzing repository…
            </>
          ) : (
            'Convert'
          )}
        </button>

        {/* ── Error ──────────────────────────────────────────────────────── */}
        {error && (
          <div
            role="alert"
            style={{
              marginBottom: 16,
              padding: '12px 16px',
              borderRadius: 10,
              border: `1px solid ${COLOR_ERROR_BORDER}`,
              backgroundColor: COLOR_ERROR_BG,
              color: COLOR_ERROR_TEXT,
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        {/* ── Result ─────────────────────────────────────────────────────── */}
        {result !== null && !loading && (
          <div style={{ ...cardStyle }}>
            {/* Result toolbar */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 12,
              }}
            >
              {/* Stats */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <StatBadge label={`${charCount.toLocaleString()} chars`} />
                <StatBadge label={`~${tokenEstimate.toLocaleString()} tokens`} />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8 }}>
                <ActionButton onClick={() => void handleCopy()} disabled={!result}>
                  {copied ? <CheckIcon /> : <CopyIcon />}
                  {copied ? 'Copied!' : 'Copy'}
                </ActionButton>
                <ActionButton onClick={handleDownload} disabled={!result}>
                  <DownloadIcon />
                  Download
                </ActionButton>
              </div>
            </div>

            {/* Output textarea */}
            <textarea
              readOnly
              value={result}
              aria-label="Converted repository text"
              style={{
                display: 'block',
                width: '100%',
                boxSizing: 'border-box',
                height: 400,
                resize: 'vertical',
                backgroundColor: BG_PAGE,
                border: `1px solid ${COLOR_BORDER}`,
                borderRadius: 10,
                padding: '14px 16px',
                color: COLOR_TEXT,
                fontFamily: 'ui-monospace, monospace',
                fontSize: 12,
                lineHeight: 1.6,
                outline: 'none',
              }}
            />
          </div>
        )}

        {/* ── Empty state ─────────────────────────────────────────────────── */}
        {result === null && !loading && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '56px 24px',
              borderRadius: 16,
              border: `1px dashed ${COLOR_BORDER}`,
              textAlign: 'center',
            }}
          >
            <RepoIcon />
            <p style={{ margin: '12px 0 4px', fontSize: 14, fontWeight: 500, color: COLOR_TEXT_MUTED }}>
              No output yet
            </p>
            <p style={{ margin: 0, fontSize: 13, color: '#475569' }}>
              Enter a GitHub URL above and click Convert
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatBadge({ label }: { label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        borderRadius: 20,
        border: `1px solid ${COLOR_BORDER}`,
        backgroundColor: 'rgba(255,255,255,0.04)',
        fontSize: 12,
        color: COLOR_TEXT_MUTED,
      }}
    >
      {label}
    </span>
  )
}

function ActionButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 14px',
        borderRadius: 8,
        border: `1px solid ${COLOR_BORDER}`,
        backgroundColor: 'rgba(255,255,255,0.06)',
        color: COLOR_TEXT,
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background-color 0.12s',
      }}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function SpinnerIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      style={{ animation: 'spin 0.75s linear infinite' }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <circle cx={12} cy={12} r={10} stroke="currentColor" strokeWidth={4} style={{ opacity: 0.25 }} />
      <path fill="currentColor" style={{ opacity: 0.75 }} d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg width={14} height={14} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width={14} height={14} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width={14} height={14} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  )
}

function RepoIcon() {
  return (
    <svg width={40} height={40} fill="none" stroke="#475569" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 22v-4a4.8 4.8 0 00-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 004 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

const cardStyle: React.CSSProperties = {
  padding: 24,
  borderRadius: 16,
  border: `1px solid ${COLOR_BORDER}`,
  backgroundColor: BG_SURFACE,
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 8,
  fontSize: 13,
  fontWeight: 600,
  color: COLOR_TEXT,
}

function inputStyle(disabled: boolean): React.CSSProperties {
  return {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 14px',
    borderRadius: 10,
    border: `1px solid ${COLOR_BORDER}`,
    backgroundColor: BG_PAGE,
    color: COLOR_TEXT,
    fontSize: 14,
    outline: 'none',
    opacity: disabled ? 0.5 : 1,
  }
}
