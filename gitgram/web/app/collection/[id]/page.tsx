'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import api from '@/services/api'

export default function CollectionPage() {
  const params = useParams()
  const collectionId = params.id as string
  const [collection, setCollection] = useState<any>(null)
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCollection()
  }, [collectionId])

  const loadCollection = async () => {
    try {
      const response = await api.get(`/v1/collections/${collectionId}`)
      setCollection(response.data.collection)
      setPosts(response.data.posts || [])
    } catch (error) {
      console.error('Load collection error:', error)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">
          {collection?.name || 'Collection'}
        </h1>
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
            No posts in this collection
          </div>
        )}
      </div>
    </div>
  )
}

