'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import PostCard, { Post } from '@/components/PostCard'
import api from '@/services/api'

// ─── Extended Post type (adds server fields used for owner check) ─────────────
type PostWithMeta = Post & {
  userId?: string
  author?: { id?: string; username: string; displayName: string; avatarUrl?: string }
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface CommentUser {
  id: string
  username: string
  avatar?: string
}

interface Comment {
  id: string
  content: string
  createdAt: string
  likesCount: number
  isPinned?: boolean
  parentId?: string
  user?: CommentUser
  replies?: Comment[]
  _count?: {
    likes: number
    replies: number
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / (1000 * 60))
  const diffHr = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDay = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMin < 1) return 'now'
  if (diffMin < 60) return `${diffMin}m`
  if (diffHr < 24) return `${diffHr}h`
  if (diffDay < 7) return `${diffDay}d`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

function Avatar({ user, size = 32 }: { user?: CommentUser; size?: number }) {
  const initial = user?.username?.[0]?.toUpperCase() ?? '?'
  if (user?.avatar) {
    return (
      <img
        src={user.avatar}
        alt={user.username}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
          border: '2px solid #2D2D50',
        }}
      />
    )
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #7C3AED, #4F46E5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.4,
        fontWeight: 700,
        color: '#FFFFFF',
        flexShrink: 0,
        border: '2px solid #2D2D50',
      }}
    >
      {initial}
    </div>
  )
}

// ─── Heart Icon ──────────────────────────────────────────────────────────────

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? '#EF4444' : 'none'}
      stroke={filled ? '#EF4444' : 'currentColor'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

// ─── Single Comment Row ───────────────────────────────────────────────────────

interface CommentRowProps {
  comment: Comment
  postId: string
  depth?: number
  isAuthenticated: boolean
  currentUserId?: string
  onReplySubmitted: (reply: Comment) => void
  onLikeToggle: (commentId: string) => void
  likedIds: Set<string>
}

function CommentRow({
  comment,
  postId,
  depth = 0,
  isAuthenticated,
  currentUserId,
  onReplySubmitted,
  onLikeToggle,
  likedIds,
}: CommentRowProps) {
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyContent, setReplyContent] = useState('')
  const [repliesExpanded, setRepliesExpanded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const replyInputRef = useRef<HTMLTextAreaElement>(null)

  const isLiked = likedIds.has(comment.id)
  const replyCount = comment._count?.replies ?? comment.replies?.length ?? 0
  const likeCount = comment.likesCount ?? comment._count?.likes ?? 0

  const openReply = () => {
    setReplyOpen(true)
    setTimeout(() => replyInputRef.current?.focus(), 50)
  }

  const cancelReply = () => {
    setReplyOpen(false)
    setReplyContent('')
  }

  const submitReply = async () => {
    const trimmed = replyContent.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    try {
      const { data } = await api.post(
        `/posts/${postId}/comments/${comment.id}/reply`,
        { content: trimmed },
      )
      setReplyContent('')
      setReplyOpen(false)
      setRepliesExpanded(true)
      onReplySubmitted(data)
    } catch (err) {
      console.error('Reply submit error:', err)
    } finally {
      setSubmitting(false)
    }
  }

  const isDeep = depth >= 1

  return (
    <div
      style={{
        marginLeft: isDeep ? 40 : 0,
        borderLeft: isDeep ? '2px solid #2D2D50' : 'none',
        paddingLeft: isDeep ? 16 : 0,
      }}
    >
      {/* Comment body */}
      <div style={{ display: 'flex', gap: 12, paddingTop: 12, paddingBottom: 4 }}>
        <Link href={`/profile/${comment.user?.username ?? ''}`} style={{ flexShrink: 0 }}>
          <Avatar user={comment.user} size={32} />
        </Link>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Meta row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Link
              href={`/profile/${comment.user?.username ?? ''}`}
              style={{ color: '#E2E8F0', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}
            >
              {comment.user?.username ?? 'Unknown'}
            </Link>
            {comment.isPinned && (
              <span
                style={{
                  padding: '1px 8px',
                  background: 'rgba(124,58,237,0.15)',
                  color: '#A78BFA',
                  fontSize: 11,
                  borderRadius: 20,
                  border: '1px solid rgba(124,58,237,0.3)',
                }}
              >
                Pinned
              </span>
            )}
            <span style={{ color: '#64748B', fontSize: 12 }}>
              {formatRelativeTime(comment.createdAt)}
            </span>
          </div>

          {/* Content */}
          <p
            style={{
              margin: '4px 0 8px',
              fontSize: 14,
              color: '#CBD5E1',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {comment.content}
          </p>

          {/* Action row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Like */}
            <button
              onClick={() => onLikeToggle(comment.id)}
              disabled={!isAuthenticated}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: 'none',
                border: 'none',
                cursor: isAuthenticated ? 'pointer' : 'default',
                color: isLiked ? '#EF4444' : '#64748B',
                fontSize: 13,
                padding: 0,
                transition: 'color 0.15s',
              }}
            >
              <HeartIcon filled={isLiked} />
              <span>{likeCount}</span>
            </button>

            {/* Reply — only 1 level deep */}
            {isAuthenticated && depth < 1 && (
              <button
                onClick={replyOpen ? cancelReply : openReply}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748B',
                  fontSize: 13,
                  padding: 0,
                  transition: 'color 0.15s',
                }}
              >
                {replyOpen ? 'Cancel' : 'Reply'}
              </button>
            )}

            {/* Expand / hide replies */}
            {replyCount > 0 && (
              <button
                onClick={() => setRepliesExpanded((v) => !v)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#7C3AED',
                  fontSize: 13,
                  padding: 0,
                }}
              >
                {repliesExpanded ? 'Hide' : 'View'} {replyCount}{' '}
                {replyCount === 1 ? 'reply' : 'replies'}
              </button>
            )}
          </div>

          {/* Inline reply input */}
          {replyOpen && (
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <textarea
                ref={replyInputRef}
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder={`Reply to @${comment.user?.username ?? ''}…`}
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    submitReply()
                  }
                }}
                style={{
                  flex: 1,
                  background: '#0F0F1A',
                  border: '1px solid #2D2D50',
                  borderRadius: 8,
                  padding: '8px 12px',
                  color: '#E2E8F0',
                  fontSize: 13,
                  resize: 'none',
                  outline: 'none',
                  lineHeight: 1.5,
                }}
              />
              <button
                onClick={submitReply}
                disabled={!replyContent.trim() || submitting}
                style={{
                  alignSelf: 'flex-end',
                  padding: '8px 14px',
                  background: '#7C3AED',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: !replyContent.trim() || submitting ? 'not-allowed' : 'pointer',
                  opacity: !replyContent.trim() || submitting ? 0.5 : 1,
                  transition: 'opacity 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                {submitting ? '…' : 'Reply'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Nested replies (1 level deep) */}
      {repliesExpanded && comment.replies && comment.replies.length > 0 && (
        <div>
          {comment.replies.map((reply) => (
            <CommentRow
              key={reply.id}
              comment={reply}
              postId={postId}
              depth={depth + 1}
              isAuthenticated={isAuthenticated}
              currentUserId={currentUserId}
              onReplySubmitted={onReplySubmitted}
              onLikeToggle={onLikeToggle}
              likedIds={likedIds}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PostDetailPage() {
  const params = useParams()
  const router = useRouter()
  const postId = params.id as string

  const { user, isAuthenticated } = useAuthStore()

  const [post, setPost] = useState<PostWithMeta | null>(null)
  const [postLoading, setPostLoading] = useState(true)
  const [postError, setPostError] = useState<string | null>(null)

  const [comments, setComments] = useState<Comment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(true)

  const [newComment, setNewComment] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [likedCommentIds, setLikedCommentIds] = useState<Set<string>>(new Set())

  // ── Post action UI state ────────────────────────────────────────────────────
  const [isSaved, setIsSaved] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [embedOpen, setEmbedOpen] = useState(false)
  const [copyToast, setCopyToast] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // ── Fetch post ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    const fetchPost = async () => {
      setPostLoading(true)
      setPostError(null)
      try {
        const { data } = await api.get(`/posts/${postId}`)
        if (!cancelled) {
          setPost(data?.data ?? data)
        }
      } catch (err) {
        if (!cancelled) {
          setPostError('Post not found.')
        }
      } finally {
        if (!cancelled) setPostLoading(false)
      }
    }

    fetchPost()
    return () => { cancelled = true }
  }, [postId])

  // ── Fetch comments (with polling) ───────────────────────────────────────────
  const fetchComments = useCallback(async () => {
    try {
      const { data } = await api.get(`/posts/${postId}/comments`)
      const list: Comment[] = data?.data ?? data ?? []
      setComments(list)
    } catch (err) {
      console.error('Fetch comments error:', err)
    } finally {
      setCommentsLoading(false)
    }
  }, [postId])

  useEffect(() => {
    fetchComments()
    const interval = setInterval(fetchComments, 15_000)
    return () => clearInterval(interval)
  }, [fetchComments])

  // ── Submit top-level comment ────────────────────────────────────────────────
  const submitComment = async () => {
    const trimmed = newComment.trim()
    if (!trimmed || submittingComment) return

    setSubmittingComment(true)
    try {
      const { data } = await api.post(`/posts/${postId}/comments`, { content: trimmed })
      const created: Comment = data?.data ?? data
      setComments((prev) => [created, ...prev])
      setNewComment('')
    } catch (err) {
      console.error('Submit comment error:', err)
    } finally {
      setSubmittingComment(false)
    }
  }

  // ── Like / unlike comment ───────────────────────────────────────────────────
  const handleLikeToggle = useCallback(
    async (commentId: string) => {
      if (!isAuthenticated) return

      // Optimistic toggle
      setLikedCommentIds((prev) => {
        const next = new Set(prev)
        if (next.has(commentId)) {
          next.delete(commentId)
        } else {
          next.add(commentId)
        }
        return next
      })

      try {
        await api.post(`/posts/${postId}/comments/${commentId}/like`)
      } catch (err) {
        // Roll back on failure
        setLikedCommentIds((prev) => {
          const next = new Set(prev)
          if (next.has(commentId)) {
            next.delete(commentId)
          } else {
            next.add(commentId)
          }
          return next
        })
        console.error('Like comment error:', err)
      }
    },
    [isAuthenticated, postId],
  )

  // ── Handle reply added from nested CommentRow ───────────────────────────────
  const handleReplySubmitted = useCallback((reply: Comment) => {
    if (!reply.parentId) return
    setComments((prev) =>
      prev.map((c) => {
        if (c.id !== reply.parentId) return c
        const existingReplies = c.replies ?? []
        return {
          ...c,
          replies: [...existingReplies, reply],
          _count: {
            likes: c._count?.likes ?? 0,
            replies: (c._count?.replies ?? existingReplies.length) + 1,
          },
        }
      }),
    )
  }, [])

  // ── Close menu on outside click ─────────────────────────────────────────────
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  // ── Show a brief toast notification ─────────────────────────────────────────
  const showToast = useCallback((msg: string) => {
    setCopyToast(msg)
    setTimeout(() => setCopyToast(null), 2200)
  }, [])

  // ── Share — copies URL to clipboard ─────────────────────────────────────────
  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/posts/${postId}`
    try {
      await navigator.clipboard.writeText(url)
      showToast('Link copied to clipboard')
    } catch {
      showToast('Could not copy link')
    }
  }, [postId, showToast])

  // ── Bookmark (simple save toggle, no collection picker) ──────────────────────
  const handleBookmark = useCallback(async () => {
    if (!isAuthenticated) return
    const next = !isSaved
    setIsSaved(next)
    try {
      if (next) {
        await api.post(`/post-actions/save/${postId}`)
        showToast('Post saved')
      } else {
        await api.delete(`/post-actions/save/${postId}`)
        showToast('Removed from saved')
      }
    } catch {
      setIsSaved(!next)
      showToast('Something went wrong')
    }
  }, [isAuthenticated, isSaved, postId, showToast])

  // ── Delete post ──────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!confirm('Delete this post? This cannot be undone.')) return
    try {
      await api.delete(`/posts/${postId}`)
      router.push('/')
    } catch {
      showToast('Could not delete post')
    }
  }, [postId, router, showToast])

  // ── Ownership check ──────────────────────────────────────────────────────────
  const isOwner = !!post && !!user && (
    post.userId === user.id || post.author?.id === user.id
  )

  // ── Embed code ───────────────────────────────────────────────────────────────
  const embedCode = `<iframe src="${typeof window !== 'undefined' ? window.location.origin : ''}/embed/posts/${postId}" width="560" height="320" frameborder="0" allowfullscreen loading="lazy"></iframe>`

  // ── Sort: pinned first, then newest ────────────────────────────────────────
  const sortedComments = [...comments]
    .filter((c) => !c.parentId)
    .sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1
      if (!a.isPinned && b.isPinned) return 1
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

  // ─────────────────────────────────────────────────────────────────────────
  // Render
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
    section: {
      background: '#1A1A2E',
      border: '1px solid #2D2D50',
      borderRadius: 12,
      overflow: 'hidden',
      marginTop: 20,
    } as React.CSSProperties,
    sectionHeader: {
      padding: '14px 16px',
      borderBottom: '1px solid #2D2D50',
      fontSize: 14,
      fontWeight: 600,
      color: '#94A3B8',
    } as React.CSSProperties,
    commentInputArea: {
      padding: 16,
      borderBottom: '1px solid #2D2D50',
    } as React.CSSProperties,
    textarea: {
      width: '100%',
      background: '#0F0F1A',
      border: '1px solid #2D2D50',
      borderRadius: 8,
      padding: '10px 14px',
      color: '#E2E8F0',
      fontSize: 14,
      resize: 'none',
      outline: 'none',
      lineHeight: 1.6,
      boxSizing: 'border-box',
    } as React.CSSProperties,
    submitBtn: {
      marginTop: 10,
      padding: '8px 20px',
      background: '#7C3AED',
      color: '#FFFFFF',
      border: 'none',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'opacity 0.15s',
      float: 'right',
    } as React.CSSProperties,
    authNotice: {
      padding: '12px 16px',
      fontSize: 14,
      color: '#64748B',
      borderBottom: '1px solid #2D2D50',
    } as React.CSSProperties,
    commentsList: {
      padding: '0 16px',
    } as React.CSSProperties,
    divider: {
      borderTop: '1px solid #1E1E38',
      margin: '0',
    } as React.CSSProperties,
    emptyState: {
      padding: 32,
      textAlign: 'center' as const,
      color: '#475569',
      fontSize: 14,
    } as React.CSSProperties,
    errorMsg: {
      padding: 32,
      textAlign: 'center' as const,
      color: '#EF4444',
      fontSize: 14,
    } as React.CSSProperties,
    actionsBar: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginTop: 12,
      marginBottom: 4,
      justifyContent: 'flex-end',
    } as React.CSSProperties,
    actionBtn: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      background: '#1A1A2E',
      border: '1px solid #2D2D50',
      borderRadius: 8,
      padding: '6px 12px',
      color: '#94A3B8',
      fontSize: 13,
      fontWeight: 500,
      cursor: 'pointer',
      transition: 'background 0.15s, color 0.15s',
      whiteSpace: 'nowrap' as const,
      textDecoration: 'none',
    } as React.CSSProperties,
    menuWrap: {
      position: 'relative' as const,
    } as React.CSSProperties,
    dropdownMenu: {
      position: 'absolute' as const,
      top: 'calc(100% + 6px)',
      right: 0,
      background: '#1A1A2E',
      border: '1px solid #2D2D50',
      borderRadius: 8,
      minWidth: 160,
      zIndex: 50,
      overflow: 'hidden',
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    } as React.CSSProperties,
    menuItem: {
      display: 'block',
      width: '100%',
      padding: '10px 14px',
      background: 'none',
      border: 'none',
      textAlign: 'left' as const,
      fontSize: 14,
      cursor: 'pointer',
      color: '#CBD5E1',
      textDecoration: 'none',
      transition: 'background 0.12s',
    } as React.CSSProperties,
    menuItemDanger: {
      display: 'block',
      width: '100%',
      padding: '10px 14px',
      background: 'none',
      border: 'none',
      textAlign: 'left' as const,
      fontSize: 14,
      cursor: 'pointer',
      color: '#EF4444',
      transition: 'background 0.12s',
    } as React.CSSProperties,
    toast: {
      position: 'fixed' as const,
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      background: '#1A1A2E',
      border: '1px solid #2D2D50',
      borderRadius: 8,
      padding: '10px 20px',
      color: '#E2E8F0',
      fontSize: 14,
      fontWeight: 500,
      zIndex: 100,
      pointerEvents: 'none' as const,
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    } as React.CSSProperties,
    embedModal: {
      position: 'fixed' as const,
      inset: 0,
      background: 'rgba(0,0,0,0.7)',
      zIndex: 80,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    } as React.CSSProperties,
    embedBox: {
      background: '#1A1A2E',
      border: '1px solid #2D2D50',
      borderRadius: 12,
      padding: 24,
      width: '100%',
      maxWidth: 520,
    } as React.CSSProperties,
  }

  return (
    <div style={S.page}>
      <div style={S.inner}>
        {/* Back button */}
        <button onClick={() => router.back()} style={S.backBtn}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>

        {/* Post */}
        {postLoading && (
          <div style={{ color: '#64748B', fontSize: 14, textAlign: 'center', padding: 32 }}>
            Loading post…
          </div>
        )}

        {!postLoading && postError && (
          <div style={S.errorMsg}>{postError}</div>
        )}

        {!postLoading && !postError && post && (
          <PostCard post={post} />
        )}

        {/* Post actions toolbar */}
        {!postLoading && !postError && post && (
          <div style={S.actionsBar}>
            {/* Share */}
            <button onClick={handleShare} style={S.actionBtn} type="button" title="Copy link">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              Share
            </button>

            {/* Embed */}
            <button
              onClick={() => setEmbedOpen(true)}
              style={S.actionBtn}
              type="button"
              title="Embed this post"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
              </svg>
              Embed
            </button>

            {/* Bookmark */}
            {isAuthenticated && (
              <button
                onClick={handleBookmark}
                style={{
                  ...S.actionBtn,
                  color: isSaved ? '#7C3AED' : '#94A3B8',
                  borderColor: isSaved ? 'rgba(124,58,237,0.4)' : '#2D2D50',
                  background: isSaved ? 'rgba(124,58,237,0.1)' : '#1A1A2E',
                }}
                type="button"
                aria-pressed={isSaved}
                title={isSaved ? 'Remove from saved' : 'Save post'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
                </svg>
                {isSaved ? 'Saved' : 'Save'}
              </button>
            )}

            {/* Owner 3-dot menu */}
            {isOwner && (
              <div ref={menuRef} style={S.menuWrap}>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  style={S.actionBtn}
                  type="button"
                  aria-label="Post options"
                  aria-expanded={menuOpen}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
                  </svg>
                </button>
                {menuOpen && (
                  <div style={S.dropdownMenu}>
                    <Link
                      href={`/posts/${postId}/edit`}
                      style={S.menuItem}
                      onClick={() => setMenuOpen(false)}
                    >
                      Edit post
                    </Link>
                    <button
                      style={S.menuItemDanger}
                      type="button"
                      onClick={() => { setMenuOpen(false); handleDelete() }}
                    >
                      Delete post
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Comments section */}
        {!postLoading && !postError && post && (
          <div style={S.section}>
            <div style={S.sectionHeader}>
              Comments{comments.length > 0 ? ` · ${sortedComments.length}` : ''}
            </div>

            {/* Comment input */}
            {isAuthenticated ? (
              <div style={S.commentInputArea}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Avatar user={user ? { id: user.id, username: user.username, avatar: user.avatar } : undefined} size={32} />
                  <div style={{ flex: 1 }}>
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Write a comment…"
                      rows={3}
                      style={S.textarea}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.metaKey) {
                          e.preventDefault()
                          submitComment()
                        }
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#475569' }}>
                        {newComment.length > 0 ? `${newComment.length} chars · ⌘↵ to submit` : ''}
                      </span>
                      <button
                        onClick={submitComment}
                        disabled={!newComment.trim() || submittingComment}
                        style={{
                          ...S.submitBtn,
                          float: 'none',
                          opacity: !newComment.trim() || submittingComment ? 0.5 : 1,
                          cursor: !newComment.trim() || submittingComment ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {submittingComment ? 'Posting…' : 'Submit'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={S.authNotice}>
                <Link
                  href="/login"
                  style={{ color: '#7C3AED', textDecoration: 'none', fontWeight: 600 }}
                >
                  Sign in
                </Link>{' '}
                to leave a comment.
              </div>
            )}

            {/* Comments list */}
            <div style={S.commentsList}>
              {commentsLoading && (
                <div style={{ padding: 24, textAlign: 'center', color: '#475569', fontSize: 13 }}>
                  Loading comments…
                </div>
              )}

              {!commentsLoading && sortedComments.length === 0 && (
                <div style={S.emptyState}>No comments yet. Be the first!</div>
              )}

              {!commentsLoading &&
                sortedComments.map((comment, idx) => (
                  <div key={comment.id}>
                    <CommentRow
                      comment={comment}
                      postId={postId}
                      depth={0}
                      isAuthenticated={isAuthenticated}
                      currentUserId={user?.id}
                      onReplySubmitted={handleReplySubmitted}
                      onLikeToggle={handleLikeToggle}
                      likedIds={likedCommentIds}
                    />
                    {idx < sortedComments.length - 1 && <hr style={S.divider} />}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Embed modal */}
      {embedOpen && (
        <div style={S.embedModal} onClick={() => setEmbedOpen(false)}>
          <div style={S.embedBox} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: '#E2E8F0' }}>
              Embed this post
            </h2>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#94A3B8' }}>
              Copy the code below and paste it into your HTML page.
            </p>
            <textarea
              readOnly
              value={embedCode}
              rows={3}
              style={{
                width: '100%',
                background: '#0F0F1A',
                border: '1px solid #2D2D50',
                borderRadius: 8,
                padding: '10px 12px',
                color: '#A78BFA',
                fontSize: 12,
                fontFamily: 'monospace',
                resize: 'none',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
              <button
                onClick={() => setEmbedOpen(false)}
                style={{ padding: '8px 18px', background: 'transparent', border: '1px solid #2D2D50', borderRadius: 8, color: '#94A3B8', fontSize: 14, cursor: 'pointer' }}
                type="button"
              >
                Close
              </button>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(embedCode)
                  showToast('Embed code copied')
                  setEmbedOpen(false)
                }}
                style={{ padding: '8px 18px', background: '#7C3AED', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                type="button"
              >
                Copy code
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clipboard toast */}
      {copyToast && (
        <div style={S.toast}>{copyToast}</div>
      )}
    </div>
  )
}
