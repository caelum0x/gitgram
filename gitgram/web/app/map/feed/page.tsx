'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import api from '@/services/api'

export default function MapFeedPage() {
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          })
        },
        () => {
          setLocation(null)
        }
      )
    }
    loadPosts()
  }, [])

  const loadPosts = async () => {
    try {
      if (location) {
        const response = await api.get('/v1/location/posts/nearby', {
          params: { latitude: location.lat, longitude: location.lng, radiusKm: 10 },
        })
        setPosts(response.data.posts || [])
      } else {
        const response = await api.get('/v1/posts', { params: { page: 1, limit: 20 } })
        setPosts(response.data.posts || [])
      }
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
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Nearby Posts</h1>
        <div className="space-y-6">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/post/${post.id}`}
              className="block p-4 bg-surface rounded-lg hover:bg-surface/80"
            >
              {post.mediaUrl && post.mediaType === 'image' && (
                <div className="relative aspect-video mb-4">
                  <Image
                    src={post.mediaUrl}
                    alt="Post"
                    fill
                    className="object-cover rounded-lg"
                  />
                </div>
              )}
              <p className="text-foreground">{post.content}</p>
              {post.location && (
                <p className="text-sm text-foreground/70 mt-2">📍 {post.location}</p>
              )}
            </Link>
          ))}
        </div>
        {posts.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No nearby posts
          </div>
        )}
      </div>
    </div>
  )
}

