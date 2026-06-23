'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { postService } from '@/services/postService'

export default function RetweetPostPage() {
  const params = useParams()
  const router = useRouter()
  const postId = params.id as string
  const [comment, setComment] = useState('')
  const [retweeting, setRetweeting] = useState(false)

  const handleRetweet = async (e: React.FormEvent) => {
    e.preventDefault()
    setRetweeting(true)
    try {
      await postService.retweetPost(postId, comment || undefined)
      router.push(`/post/${postId}`)
    } catch (error) {
      console.error('Retweet error:', error)
    } finally {
      setRetweeting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Retweet</h1>

        <form onSubmit={handleRetweet} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Add a comment (optional)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="Add your thoughts..."
            />
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={retweeting}
              className="px-6 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {retweeting ? 'Retweeting...' : 'Retweet'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-2 bg-surface border border-border rounded-lg text-foreground hover:bg-surface/80"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

