'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import api from '@/services/api'

export default function PostAnalyticsPage() {
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPosts()
  }, [])

  const loadPosts = async () => {
    try {
      const response = await api.get('/v1/posts', { params: { page: 1, limit: 20 } })
      setPosts(response.data.posts || [])
    } catch (error) {
      console.error('Load posts error:', error)
    } finally {
      setLoading(false)
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
      <div className="max-w-4xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Post Analytics</h1>
        <div className="space-y-4">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/analytics/posts/${post.id}`}
              className="block p-4 bg-surface rounded-lg hover:bg-surface/80"
            >
              <div className="flex items-center gap-4">
                {post.mediaUrl && post.mediaType === 'image' && (
                  <div className="relative w-20 h-20">
                    <Image
                      src={post.mediaUrl}
                      alt="Post"
                      fill
                      className="object-cover rounded-lg"
                    />
                  </div>
                )}
                <div className="flex-1">
                  <p className="font-semibold text-foreground mb-2">
                    {post.content || 'Post'}
                  </p>
                  <div className="flex gap-4 text-sm text-foreground/70">
                    <span>❤️ {post.likesCount || 0}</span>
                    <span>💬 {post.commentsCount || 0}</span>
                    <span>👁️ {post.views || 0}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
        {posts.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No posts yet
          </div>
        )}
      </div>
    </div>
  )
}
