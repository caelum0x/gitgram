'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import api from '@/services/api'
import { useAuthStore } from '@/store/authStore'

export default function ArchivedPostsPage() {
  const { user } = useAuthStore()
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      loadArchivedPosts()
    }
  }, [user])

  const loadArchivedPosts = async () => {
    try {
      const response = await api.get('/v1/posts/archived')
      setPosts(response.data.posts || [])
    } catch (error) {
      console.error('Load archived posts error:', error)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Archived Posts</h1>
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
                      ❤️ {post.likesCount}
                    </span>
                  </div>
                </>
              )}
            </Link>
          ))}
        </div>
        {posts.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No archived posts
          </div>
        )}
      </div>
    </div>
  )
}

