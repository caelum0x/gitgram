'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSocket, useCommentTyping } from '@/hooks/useSocket'
import { useAuthStore } from '@/store/authStore'
import Link from 'next/link'
import api from '@/services/api'
import TypingIndicator from './TypingIndicator'
import MentionInput from './MentionInput'

interface Comment {
  id: string
  content: string
  createdAt: string
  likesCount: number
  user?: {
    id: string
    username: string
    avatar?: string
  }
}

interface RealTimeCommentsProps {
  postId: string
  initialComments?: Comment[]
  onCommentCountChange?: (count: number) => void
}

export default function RealTimeComments({
  postId,
  initialComments = [],
  onCommentCountChange,
}: RealTimeCommentsProps) {
  const { user, isAuthenticated } = useAuthStore()
  const {
    subscribeToPost,
    unsubscribeFromPost,
    onNewComment,
    onCommentUpdate,
    onCommentRemoved,
    onCommentLikeUpdate,
    isConnected,
  } = useSocket()
  const { typingUsers, handleTyping, stopTyping } = useCommentTyping(postId)

  const [comments, setComments] = useState<Comment[]>(initialComments)
  const [newComment, setNewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set())

  // Subscribe to post when component mounts
  useEffect(() => {
    if (isConnected) {
      subscribeToPost(postId)
      return () => unsubscribeFromPost(postId)
    }
  }, [postId, isConnected, subscribeToPost, unsubscribeFromPost])

  // Listen for real-time events
  useEffect(() => {
    const unsubNewComment = onNewComment((data) => {
      if (data.postId !== postId) return
      setComments((prev) => {
        // Avoid duplicates
        if (prev.some((c) => c.id === data.comment.id)) return prev
        const newList = [data.comment, ...prev]
        onCommentCountChange?.(newList.length)
        return newList
      })
    })

    const unsubUpdate = onCommentUpdate((data) => {
      if (data.postId !== postId) return
      setComments((prev) =>
        prev.map((c) =>
          c.id === data.commentId ? { ...c, content: data.content } : c
        )
      )
    })

    const unsubRemoved = onCommentRemoved((data) => {
      if (data.postId !== postId) return
      setComments((prev) => {
        const newList = prev.filter((c) => c.id !== data.commentId)
        onCommentCountChange?.(newList.length)
        return newList
      })
    })

    const unsubLike = onCommentLikeUpdate((data) => {
      if (data.postId !== postId) return
      setComments((prev) =>
        prev.map((c) =>
          c.id === data.commentId ? { ...c, likesCount: data.newCount } : c
        )
      )
      if (data.userId === user?.id) {
        setLikedComments((prev) => {
          const newSet = new Set(prev)
          if (data.liked) {
            newSet.add(data.commentId)
          } else {
            newSet.delete(data.commentId)
          }
          return newSet
        })
      }
    })

    return () => {
      unsubNewComment()
      unsubUpdate()
      unsubRemoved()
      unsubLike()
    }
  }, [postId, user?.id, onNewComment, onCommentUpdate, onCommentRemoved, onCommentLikeUpdate, onCommentCountChange])

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!newComment.trim() || submitting) return

    setSubmitting(true)
    stopTyping()

    try {
      const { data } = await api.post(`/posts/${postId}/comments`, {
        content: newComment,
      })

      // Optimistically add the comment (real-time will also broadcast it)
      setComments((prev) => [data, ...prev])
      onCommentCountChange?.(comments.length + 1)
      setNewComment('')
    } catch (error) {
      console.error('Failed to submit comment:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleLike = async (commentId: string) => {
    if (!isAuthenticated) return

    // Optimistic update
    const isLiked = likedComments.has(commentId)
    setLikedComments((prev) => {
      const newSet = new Set(prev)
      if (isLiked) {
        newSet.delete(commentId)
      } else {
        newSet.add(commentId)
      }
      return newSet
    })
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? { ...c, likesCount: c.likesCount + (isLiked ? -1 : 1) }
          : c
      )
    )

    try {
      await api.post(`/posts/${postId}/comments/${commentId}/like`)
    } catch (error) {
      // Rollback on error
      setLikedComments((prev) => {
        const newSet = new Set(prev)
        if (isLiked) {
          newSet.add(commentId)
        } else {
          newSet.delete(commentId)
        }
        return newSet
      })
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, likesCount: c.likesCount + (isLiked ? 1 : -1) }
            : c
        )
      )
    }
  }

  const handleDelete = async (commentId: string) => {
    if (!confirm('Delete this comment?')) return

    try {
      await api.delete(`/posts/${postId}/comments/${commentId}`)
      setComments((prev) => prev.filter((c) => c.id !== commentId))
      onCommentCountChange?.(comments.length - 1)
    } catch (error) {
      console.error('Failed to delete comment:', error)
    }
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

  return (
    <div className="space-y-4">
      {/* Comment Input */}
      {isAuthenticated && (
        <form onSubmit={handleSubmit} className="space-y-2">
          <MentionInput
            value={newComment}
            onChange={(value) => {
              setNewComment(value)
              handleTyping()
            }}
            placeholder="Write a comment..."
            maxLength={500}
            rows={2}
            onSubmit={handleSubmit}
          />
          <div className="flex justify-between items-center">
            <div className="flex-1">
              {typingUsers.length > 0 && (
                <TypingIndicator users={typingUsers} />
              )}
            </div>
            <button
              type="submit"
              disabled={!newComment.trim() || submitting}
              className="px-4 py-1.5 bg-primary text-white text-sm rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {submitting ? 'Posting...' : 'Post'}
            </button>
          </div>
        </form>
      )}

      {/* Connection Status */}
      {!isConnected && isAuthenticated && (
        <div className="text-xs text-warning flex items-center gap-2">
          <span className="w-2 h-2 bg-warning rounded-full animate-pulse" />
          Connecting for real-time updates...
        </div>
      )}

      {/* Comments List */}
      <div className="space-y-3">
        {comments.map((comment) => {
          const isLiked = likedComments.has(comment.id)
          const isOwner = user?.id === comment.user?.id

          return (
            <div key={comment.id} className="flex gap-3">
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
                  <span className="text-xs text-muted">
                    {formatTime(comment.createdAt)}
                  </span>
                </div>

                <p className="text-sm mt-0.5 whitespace-pre-wrap break-words">
                  {comment.content}
                </p>

                <div className="flex items-center gap-4 mt-1">
                  <button
                    onClick={() => handleLike(comment.id)}
                    className={`flex items-center gap-1 text-xs transition-colors ${
                      isLiked ? 'text-error' : 'text-muted hover:text-foreground'
                    }`}
                  >
                    <svg
                      className="w-3.5 h-3.5"
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
                    {comment.likesCount || 0}
                  </button>

                  {isOwner && (
                    <button
                      onClick={() => handleDelete(comment.id)}
                      className="text-xs text-muted hover:text-error transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {comments.length === 0 && (
        <p className="text-center text-muted text-sm py-4">
          No comments yet. Be the first to comment!
        </p>
      )}
    </div>
  )
}
