'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {
  postService,
  normalizeReplyPermission,
  type ReplyPermission,
} from '@/services/postService'
import { WhoCanReplyNotice } from '@/components/WhoCanReply'

export default function PostCommentsPage() {
  const params = useParams()
  const postId = params.id as string
  const [comments, setComments] = useState<any[]>([])
  const [commentText, setCommentText] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [replyPermission, setReplyPermission] = useState<ReplyPermission>('everyone')

  useEffect(() => {
    loadComments()
    loadReplyPermission()
  }, [postId])

  const loadComments = async () => {
    try {
      const response = await postService.getComments(postId)
      setComments(response.comments || [])
    } catch (error) {
      console.error('Load comments error:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadReplyPermission = async () => {
    try {
      const post = await postService.getPost(postId)
      setReplyPermission(normalizeReplyPermission(post?.replyPermission))
    } catch (error) {
      console.error('Load reply permission error:', error)
    }
  }

  const repliesDisabled = replyPermission === 'nobody'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!commentText.trim()) return

    setSubmitting(true)
    try {
      const response = await postService.addComment(postId, commentText)
      setComments(prev => [response.comment, ...prev])
      setCommentText('')
    } catch (error) {
      console.error('Submit comment error:', error)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Comments</h1>

        {replyPermission !== 'everyone' && (
          <div className="mb-4">
            <WhoCanReplyNotice permission={replyPermission} />
          </div>
        )}

        {repliesDisabled ? (
          <p className="mb-6 rounded-lg bg-surface border border-border px-4 py-3 text-sm text-foreground-secondary">
            The author has turned off replies for this post.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mb-6">
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add a comment..."
              className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent mb-3"
              rows={3}
            />
            <button
              type="submit"
              disabled={submitting || !commentText.trim()}
              className="px-6 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Posting...' : 'Post Comment'}
            </button>
          </form>
        )}

        <div className="space-y-4">
          {comments.map((comment) => (
            <div key={comment.id} className="flex gap-3">
              <Link href={`/profile/${comment.userId}`}>
                {comment.user?.avatar ? (
                  <Image
                    src={comment.user.avatar}
                    alt={comment.user.username}
                    width={40}
                    height={40}
                    className="rounded-full"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
                    <span className="text-white font-semibold">
                      {comment.user?.username?.[0]?.toUpperCase()}
                    </span>
                  </div>
                )}
              </Link>
              <div className="flex-1">
                <Link
                  href={`/profile/${comment.userId}`}
                  className="font-semibold text-foreground hover:text-accent"
                >
                  {comment.user?.username}
                </Link>
                <p className="text-foreground mt-1">{comment.content}</p>
                <p className="text-sm text-foreground/50 mt-1">
                  {new Date(comment.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
          {comments.length === 0 && (
            <p className="text-foreground/70 text-center py-8">
              No comments yet. Be the first to comment!
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

