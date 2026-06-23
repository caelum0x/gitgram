'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import api from '@/services/api'

export default function SharePostPage() {
  const params = useParams()
  const router = useRouter()
  const postId = params.id as string
  const [post, setPost] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPost()
  }, [postId])

  const loadPost = async () => {
    try {
      const response = await api.get(`/v1/posts/${postId}`)
      setPost(response.data.post || response.data)
    } catch (error) {
      console.error('Load post error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCopyLink = () => {
    const url = `${window.location.origin}/post/${postId}`
    navigator.clipboard.writeText(url)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Share Post</h1>
        <div className="space-y-4">
          <button
            onClick={handleCopyLink}
            className="w-full px-6 py-3 bg-surface border border-border rounded-lg text-foreground hover:bg-surface/80"
          >
            Copy Link
          </button>
          <Link
            href={`/messages/share-post?postId=${postId}`}
            className="block w-full px-6 py-3 bg-surface border border-border rounded-lg text-foreground hover:bg-surface/80 text-center"
          >
            Share to Messages
          </Link>
          <button
            onClick={() => router.back()}
            className="w-full px-6 py-2 bg-surface border border-border rounded-lg text-foreground hover:bg-surface/80"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
