'use client'

import { useState, useCallback } from 'react'
import { useAuthStore } from '@/store/authStore'
import Link from 'next/link'
import api from '@/services/api'
import { linkifyText } from '@/utils/linkify'
import { WhoCanReplyNotice } from '@/components/WhoCanReply'
import { normalizeReplyPermission, type ReplyPermission } from '@/services/postService'

interface Comment {
  id: string
  content: string
  createdAt: string
  likesCount: number
  isPinned?: boolean
  parentId?: string
  user?: {
    id: string
    username: string
    avatar?: string
  }
  replies?: Comment[]
  _count?: {
    likes: number
    replies: number
  }
}

interface CommentThreadProps {
  postId: string
  comments: Comment[]
  onCommentAdded?: (comment: Comment) => void
  onCommentDeleted?: (commentId: string) => void
  /** Threadgate — who may reply. Defaults to everyone when unset. */
  replyPermission?: ReplyPermission
}

export default function CommentThread({
  postId,
  comments,
  onCommentAdded,
  onCommentDeleted,
  replyPermission,
}: CommentThreadProps) {
  const { user, isAuthenticated } = useAuthStore()
  const effectiveReplyPermission = normalizeReplyPermission(replyPermission)
  const repliesDisabled = effectiveReplyPermission === 'nobody'
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set())
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set())

  const handleLike = useCallback(async (commentId: string) => {
    if (!isAuthenticated) return

    try {
      await api.post(`/posts/${postId}/comments/${commentId}/like`)
      setLikedComments(prev => {
        const newSet = new Set(prev)
        if (newSet.has(commentId)) {
          newSet.delete(commentId)
        } else {
          newSet.add(commentId)
        }
        return newSet
      })
    } catch (error) {
      console.error('Like comment error:', error)
    }
  }, [isAuthenticated, postId])

  const handleReply = async (parentId: string) => {
    if (!replyContent.trim() || submitting) return

    setSubmitting(true)
    try {
      const { data } = await api.post(`/posts/${postId}/comments/${parentId}/reply`, {
        content: replyContent,
      })
      setReplyContent('')
      setReplyingTo(null)
      if (onCommentAdded) {
        onCommentAdded(data)
      }
      // Expand replies to show the new one
      setExpandedReplies(prev => new Set(prev).add(parentId))
    } catch (error) {
      console.error('Reply error:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (commentId: string) => {
    if (!confirm('Delete this comment?')) return

    try {
      await api.delete(`/posts/${postId}/comments/${commentId}`)
      if (onCommentDeleted) {
        onCommentDeleted(commentId)
      }
    } catch (error) {
      console.error('Delete comment error:', error)
    }
  }

  const toggleReplies = (commentId: string) => {
    setExpandedReplies(prev => {
      const newSet = new Set(prev)
      if (newSet.has(commentId)) {
        newSet.delete(commentId)
      } else {
        newSet.add(commentId)
      }
      return newSet
    })
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 1) return 'now'
    if (diffMins < 60) return `${diffMins}m`
    if (diffHours < 24) return `${diffHours}h`
    if (diffDays < 7) return `${diffDays}d`
    return date.toLocaleDateString()
  }

  const renderComment = (comment: Comment, depth = 0) => {
    const isLiked = likedComments.has(comment.id)
    const hasReplies = (comment._count?.replies || comment.replies?.length || 0) > 0
    const isExpanded = expandedReplies.has(comment.id)
    const isOwner = user?.id === comment.user?.id

    return (
      <div
        key={comment.id}
        className={`${depth > 0 ? 'ml-8 border-l-2 border-border pl-4' : ''}`}
      >
        <div className="flex gap-3 py-3">
          <Link href={`/profile/${comment.user?.username}`} className="flex-shrink-0">
            {comment.user?.avatar ? (
              <img
                src={comment.user.avatar}
                alt={comment.user.username}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-primary text-sm font-semibold">
                  {comment.user?.username?.[0]?.toUpperCase() || '?'}
                </span>
              </div>
            )}
          </Link>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`/profile/${comment.user?.username}`}
                className="font-semibold text-sm hover:underline"
              >
                {comment.user?.username || 'Unknown'}
              </Link>
              {comment.isPinned && (
                <span className="px-1.5 py-0.5 bg-primary/10 text-primary text-xs rounded">
                  Pinned
                </span>
              )}
              <span className="text-xs text-muted">{formatTime(comment.createdAt)}</span>
            </div>

            <p className="text-sm mt-1 whitespace-pre-wrap break-words">
              {linkifyText(comment.content)}
            </p>

            <div className="flex items-center gap-4 mt-2">
              <button
                onClick={() => handleLike(comment.id)}
                className={`flex items-center gap-1 text-xs transition-colors ${
                  isLiked ? 'text-error' : 'text-muted hover:text-foreground'
                }`}
              >
                <svg
                  className="w-4 h-4"
                  fill={isLiked ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                  />
                </svg>
                {comment.likesCount || comment._count?.likes || 0}
              </button>

              {isAuthenticated && depth < 3 && !repliesDisabled && (
                <button
                  onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                  className="text-xs text-muted hover:text-foreground transition-colors"
                >
                  Reply
                </button>
              )}

              {hasReplies && (
                <button
                  onClick={() => toggleReplies(comment.id)}
                  className="text-xs text-primary hover:underline"
                >
                  {isExpanded ? 'Hide' : 'View'} {comment._count?.replies || comment.replies?.length} {(comment._count?.replies || comment.replies?.length) === 1 ? 'reply' : 'replies'}
                </button>
              )}

              {isOwner && (
                <button
                  onClick={() => handleDelete(comment.id)}
                  className="text-xs text-muted hover:text-error transition-colors"
                >
                  Delete
                </button>
              )}
            </div>

            {/* Reply input */}
            {replyingTo === comment.id && (
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder={`Reply to @${comment.user?.username}...`}
                  className="flex-1 px-3 py-2 bg-muted rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleReply(comment.id)
                    }
                  }}
                  autoFocus
                />
                <button
                  onClick={() => handleReply(comment.id)}
                  disabled={!replyContent.trim() || submitting}
                  className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors"
                >
                  {submitting ? '...' : 'Reply'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Render replies */}
        {isExpanded && comment.replies && comment.replies.length > 0 && (
          <div className="space-y-0">
            {comment.replies.map(reply => renderComment(reply, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  // Sort comments: pinned first, then by date
  const sortedComments = [...comments].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1
    if (!a.isPinned && b.isPinned) return 1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  // Filter to only root comments (no parentId)
  const rootComments = sortedComments.filter(c => !c.parentId)

  return (
    <div>
      {effectiveReplyPermission !== 'everyone' && (
        <div className="mb-3">
          <WhoCanReplyNotice permission={effectiveReplyPermission} />
        </div>
      )}
      <div className="divide-y divide-border">
        {rootComments.map(comment => renderComment(comment))}
      </div>
    </div>
  )
}
