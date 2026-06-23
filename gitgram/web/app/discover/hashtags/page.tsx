'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import api from '@/services/api'

export default function DiscoverHashtagsPage() {
  const [hashtags, setHashtags] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadHashtags()
  }, [])

  const loadHashtags = async () => {
    try {
      const response = await api.get('/v1/tags/trending')
      setHashtags(response.data.tags || [])
    } catch (error) {
      console.error('Load hashtags error:', error)
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
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Trending Hashtags</h1>
        <div className="space-y-2">
          {hashtags.map((tag) => (
            <Link
              key={tag.name}
              href={`/hashtag/${tag.name}`}
              className="flex items-center justify-between p-4 bg-surface rounded-lg hover:bg-surface/80"
            >
              <div>
                <p className="font-semibold text-foreground">#{tag.name}</p>
                <p className="text-sm text-foreground/70">
                  {tag.postsCount || 0} posts
                </p>
              </div>
              <span className="text-accent">→</span>
            </Link>
          ))}
        </div>
        {hashtags.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No trending hashtags yet
          </div>
        )}
      </div>
    </div>
  )
}

