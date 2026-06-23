'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PostData {
  id: string
  content: string
  tags?: string[]
  repositoryId?: string
  author?: {
    id?: string
    username: string
  }
  userId?: string
}

// ─── Markdown Preview ─────────────────────────────────────────────────────────

function renderMarkdownPreview(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (block) => {
      const inner = block.replace(/^```[^\n]*\n?/, '').replace(/```$/, '')
      return `<pre style="background:#0F0F1A;border:1px solid #2D2D50;border-radius:6px;padding:12px;overflow-x:auto;font-size:13px;line-height:1.5;margin:8px 0"><code style="color:#A78BFA;font-family:monospace">${inner.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`
    })
    .replace(/`([^`]+)`/g, '<code style="background:#1A1A2E;color:#A78BFA;padding:2px 6px;border-radius:4px;font-size:13px;font-family:monospace">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/#{1,3} (.+)/g, '<strong style="font-size:16px">$1</strong>')
    .replace(/(#[a-zA-Z0-9_]+)/g, '<span style="color:#7C3AED">$1</span>')
    .replace(/\n/g, '<br />')
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const CONTENT_MAX = 3000
const HASHTAG_MAX = 10

export default function EditPostPage() {
  const params = useParams()
  const router = useRouter()
  const postId = params.id as string

  const { user, isAuthenticated } = useAuthStore()

  const [post, setPost] = useState<PostData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [content, setContent] = useState('')
  const [hashtagInput, setHashtagInput] = useState('')
  const [hashtags, setHashtags] = useState<string[]>([])
  const [repositoryId, setRepositoryId] = useState('')
  const [previewMode, setPreviewMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── Load post ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    const fetchPost = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const { data } = await api.get(`/posts/${postId}`)
        const p: PostData = data?.data ?? data
        if (!cancelled) {
          setPost(p)
          setContent(p.content ?? '')
          setHashtags(p.tags ?? [])
          setRepositoryId(p.repositoryId ?? '')
        }
      } catch {
        if (!cancelled) setLoadError('Could not load post.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchPost()
    return () => {
      cancelled = true
    }
  }, [postId])

  // ── Ownership check — redirect if not the author ────────────────────────────
  useEffect(() => {
    if (!post || !isAuthenticated) return
    const authorId = post.userId ?? post.author?.id
    if (authorId && user?.id && authorId !== user.id) {
      router.replace(`/posts/${postId}`)
    }
  }, [post, isAuthenticated, user, postId, router])

  // ── Auto-resize textarea ────────────────────────────────────────────────────
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [content])

  // ── Hashtag helpers ──────────────────────────────────────────────────────────
  const addHashtag = () => {
    const cleaned = hashtagInput.trim().replace(/^#/, '').replace(/\s+/g, '_')
    if (!cleaned || hashtags.includes(cleaned) || hashtags.length >= HASHTAG_MAX) return
    setHashtags((prev) => [...prev, cleaned])
    setHashtagInput('')
  }

  const removeHashtag = (tag: string) => {
    setHashtags((prev) => prev.filter((t) => t !== tag))
  }

  const handleHashtagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addHashtag()
    }
    if (e.key === 'Backspace' && !hashtagInput && hashtags.length > 0) {
      setHashtags((prev) => prev.slice(0, -1))
    }
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const trimmed = content.trim()
    if (!trimmed || saving) return
    setSaveError(null)
    setSaving(true)
    try {
      await api.put(`/posts/${postId}`, {
        content: trimmed,
        hashtags,
        ...(repositoryId.trim() ? { repositoryId: repositoryId.trim() } : {}),
      })
      router.push(`/posts/${postId}`)
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Failed to save. Please try again.'
      setSaveError(msg)
    } finally {
      setSaving(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Styles
  // ─────────────────────────────────────────────────────────────────────────

  const S = {
    page: {
      minHeight: '100vh',
      background: '#0F0F1A',
      color: '#E2E8F0',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    } as React.CSSProperties,
    inner: {
      maxWidth: 680,
      margin: '0 auto',
      padding: '24px 16px 80px',
    } as React.CSSProperties,
    backBtn: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      color: '#94A3B8',
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      fontSize: 14,
      padding: '4px 0',
      marginBottom: 20,
      textDecoration: 'none',
    } as React.CSSProperties,
    card: {
      background: '#1A1A2E',
      border: '1px solid #2D2D50',
      borderRadius: 12,
      overflow: 'hidden',
    } as React.CSSProperties,
    cardHeader: {
      padding: '16px 20px',
      borderBottom: '1px solid #2D2D50',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    } as React.CSSProperties,
    cardTitle: {
      fontSize: 16,
      fontWeight: 700,
      color: '#E2E8F0',
      margin: 0,
    } as React.CSSProperties,
    cardBody: {
      padding: '20px',
    } as React.CSSProperties,
    fieldLabel: {
      display: 'block',
      fontSize: 13,
      fontWeight: 600,
      color: '#94A3B8',
      marginBottom: 8,
      letterSpacing: '0.04em',
      textTransform: 'uppercase' as const,
    } as React.CSSProperties,
    fieldGroup: {
      marginBottom: 20,
    } as React.CSSProperties,
    textarea: {
      width: '100%',
      minHeight: 160,
      background: '#0F0F1A',
      border: '1px solid #2D2D50',
      borderRadius: 8,
      padding: '12px 14px',
      color: '#E2E8F0',
      fontSize: 15,
      lineHeight: 1.7,
      resize: 'none',
      outline: 'none',
      boxSizing: 'border-box' as const,
      transition: 'border-color 0.15s',
      fontFamily: 'inherit',
      overflow: 'hidden',
    } as React.CSSProperties,
    previewBox: {
      width: '100%',
      minHeight: 160,
      background: '#0F0F1A',
      border: '1px solid #2D2D50',
      borderRadius: 8,
      padding: '12px 14px',
      fontSize: 15,
      lineHeight: 1.7,
      color: '#CBD5E1',
      boxSizing: 'border-box' as const,
      overflowX: 'auto' as const,
      wordBreak: 'break-word' as const,
    } as React.CSSProperties,
    charCount: {
      fontSize: 12,
      color: content.length > CONTENT_MAX * 0.9 ? '#EF4444' : '#475569',
      textAlign: 'right' as const,
      marginTop: 6,
    } as React.CSSProperties,
    tagInput: {
      background: '#0F0F1A',
      border: '1px solid #2D2D50',
      borderRadius: 8,
      padding: '8px 12px',
      color: '#E2E8F0',
      fontSize: 14,
      outline: 'none',
      width: '100%',
      boxSizing: 'border-box' as const,
      fontFamily: 'inherit',
    } as React.CSSProperties,
    tagRow: {
      display: 'flex',
      flexWrap: 'wrap' as const,
      gap: 6,
      marginTop: 8,
      minHeight: 28,
    } as React.CSSProperties,
    tag: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '3px 10px',
      background: 'rgba(124,58,237,0.15)',
      color: '#A78BFA',
      border: '1px solid rgba(124,58,237,0.3)',
      borderRadius: 20,
      fontSize: 13,
      fontWeight: 500,
    } as React.CSSProperties,
    tagRemove: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: '#7C3AED',
      padding: 0,
      lineHeight: 1,
      fontSize: 16,
      display: 'flex',
      alignItems: 'center',
    } as React.CSSProperties,
    repoInput: {
      background: '#0F0F1A',
      border: '1px solid #2D2D50',
      borderRadius: 8,
      padding: '8px 12px',
      color: '#E2E8F0',
      fontSize: 14,
      outline: 'none',
      width: '100%',
      boxSizing: 'border-box' as const,
      fontFamily: 'inherit',
    } as React.CSSProperties,
    repoHint: {
      fontSize: 12,
      color: '#475569',
      marginTop: 4,
    } as React.CSSProperties,
    errorBanner: {
      background: 'rgba(239,68,68,0.1)',
      border: '1px solid rgba(239,68,68,0.3)',
      borderRadius: 8,
      padding: '10px 14px',
      color: '#EF4444',
      fontSize: 14,
      marginBottom: 16,
    } as React.CSSProperties,
    footer: {
      padding: '16px 20px',
      borderTop: '1px solid #2D2D50',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 10,
    } as React.CSSProperties,
    cancelBtn: {
      padding: '9px 20px',
      background: 'transparent',
      color: '#94A3B8',
      border: '1px solid #2D2D50',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 600,
      cursor: 'pointer',
      textDecoration: 'none',
      display: 'inline-flex',
      alignItems: 'center',
    } as React.CSSProperties,
    saveBtn: {
      padding: '9px 24px',
      background: '#7C3AED',
      color: '#FFFFFF',
      border: 'none',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'opacity 0.15s',
    } as React.CSSProperties,
    previewToggle: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      background: 'none',
      border: '1px solid #2D2D50',
      borderRadius: 6,
      padding: '4px 12px',
      color: '#94A3B8',
      fontSize: 13,
      cursor: 'pointer',
    } as React.CSSProperties,
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={S.page}>
        <div style={S.inner}>
          <div style={{ color: '#64748B', fontSize: 14, textAlign: 'center', padding: 48 }}>
            Loading post…
          </div>
        </div>
      </div>
    )
  }

  if (loadError || !post) {
    return (
      <div style={S.page}>
        <div style={S.inner}>
          <div style={{ color: '#EF4444', fontSize: 14, textAlign: 'center', padding: 48 }}>
            {loadError ?? 'Post not found.'}
          </div>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Link href={`/posts/${postId}`} style={{ color: '#7C3AED', fontSize: 14 }}>
              Back to post
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const isOverLimit = content.length > CONTENT_MAX
  const canSave = content.trim().length > 0 && !isOverLimit && !saving

  return (
    <div style={S.page}>
      <div style={S.inner}>
        {/* Back */}
        <Link href={`/posts/${postId}`} style={S.backBtn}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to post
        </Link>

        {/* Card */}
        <div style={S.card}>
          {/* Header */}
          <div style={S.cardHeader}>
            <h1 style={S.cardTitle}>Edit Post</h1>
            <button
              onClick={() => setPreviewMode((v) => !v)}
              style={S.previewToggle}
              type="button"
              aria-pressed={previewMode}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              {previewMode ? 'Edit' : 'Preview'}
            </button>
          </div>

          {/* Body */}
          <div style={S.cardBody}>
            {saveError && <div style={S.errorBanner}>{saveError}</div>}

            {/* Content field */}
            <div style={S.fieldGroup}>
              <label style={S.fieldLabel} htmlFor="post-content">
                Content
              </label>

              {previewMode ? (
                <div
                  style={S.previewBox}
                  dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(content) || '<span style="color:#475569">Nothing to preview.</span>' }}
                />
              ) : (
                <textarea
                  id="post-content"
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="What's on your mind? Markdown is supported."
                  style={{
                    ...S.textarea,
                    borderColor: isOverLimit ? '#EF4444' : '#2D2D50',
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.metaKey) {
                      e.preventDefault()
                      handleSubmit()
                    }
                  }}
                />
              )}

              <div style={S.charCount}>
                {content.length} / {CONTENT_MAX}
                {isOverLimit && ' — too long'}
              </div>
            </div>

            {/* Hashtags */}
            <div style={S.fieldGroup}>
              <label style={S.fieldLabel} htmlFor="post-hashtags">
                Hashtags{' '}
                <span style={{ color: '#475569', fontWeight: 400, textTransform: 'none' }}>
                  (up to {HASHTAG_MAX})
                </span>
              </label>
              <input
                id="post-hashtags"
                type="text"
                value={hashtagInput}
                onChange={(e) => setHashtagInput(e.target.value)}
                onKeyDown={handleHashtagKeyDown}
                onBlur={addHashtag}
                placeholder="Type a tag and press Enter or comma…"
                style={S.tagInput}
                disabled={hashtags.length >= HASHTAG_MAX}
              />
              {hashtags.length > 0 && (
                <div style={S.tagRow}>
                  {hashtags.map((tag) => (
                    <span key={tag} style={S.tag}>
                      #{tag}
                      <button
                        onClick={() => removeHashtag(tag)}
                        style={S.tagRemove}
                        type="button"
                        aria-label={`Remove ${tag}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Repository ID */}
            <div style={{ ...S.fieldGroup, marginBottom: 0 }}>
              <label style={S.fieldLabel} htmlFor="post-repo">
                Repository{' '}
                <span style={{ color: '#475569', fontWeight: 400, textTransform: 'none' }}>
                  (optional)
                </span>
              </label>
              <input
                id="post-repo"
                type="text"
                value={repositoryId}
                onChange={(e) => setRepositoryId(e.target.value)}
                placeholder="Repository ID"
                style={S.repoInput}
              />
              <p style={S.repoHint}>
                Link this post to a repository to show it on the repo page.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div style={S.footer}>
            <Link href={`/posts/${postId}`} style={S.cancelBtn}>
              Cancel
            </Link>
            <button
              onClick={handleSubmit}
              disabled={!canSave}
              style={{
                ...S.saveBtn,
                opacity: canSave ? 1 : 0.5,
                cursor: canSave ? 'pointer' : 'not-allowed',
              }}
              type="button"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
