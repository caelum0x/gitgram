'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { postService } from '@/services/postService'

export default function DiscoverTrendingPage() {
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTrendingPosts()
  }, [])

  const loadTrendingPosts = async () => {
    try {
      const response = await postService.getFeed(1, 30)
      const sorted = (response.posts || []).sort((a: any, b: any) => {
        const engagementA = (a.likesCount || 0) + (a.commentsCount || 0)
        const engagementB = (b.likesCount || 0) + (b.commentsCount || 0)
        return engagementB - engagementA
      })
      setPosts(sorted.slice(0, 20))
    } catch (error) {
      console.error('Load trending posts error:', error)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Trending Now</h1>
        <div className="grid grid-cols-3 gap-1">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/post/${post.id}`}
              className="relative aspect-square group"
            >
              {post.mediaUrl && post.mediaType === 'image' && (
                <>
                  <Image
                    src={post.mediaUrl}
                    alt="Post"
                    fill
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-end p-2">
                    <span className="text-white text-sm font-semibold">
                      ❤️ {post.likesCount} 💬 {post.commentsCount}
                    </span>
                  </div>
                </>
              )}
            </Link>
          ))}
        </div>
        {posts.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No trending posts yet
          </div>
        )}
      </div>
    </div>
  )
}

