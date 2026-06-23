'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import api from '@/services/api'

export default function SavedCollectionsPage() {
  const [collections, setCollections] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCollections()
  }, [])

  const loadCollections = async () => {
    try {
      const response = await api.get('/v1/collections')
      setCollections(response.data.collections || [])
    } catch (error) {
      console.error('Load collections error:', error)
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
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-foreground">Collections</h1>
          <Link
            href="/collection/create"
            className="px-4 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90"
          >
            Create Collection
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {collections.map((collection) => (
            <Link
              key={collection.id}
              href={`/collection/${collection.id}`}
              className="bg-surface rounded-lg p-6 hover:bg-surface/80"
            >
              <h3 className="font-semibold text-foreground mb-2">{collection.name}</h3>
              {collection.description && (
                <p className="text-foreground/70 text-sm mb-2">{collection.description}</p>
              )}
              <p className="text-foreground/50 text-sm">
                {collection.postsCount || 0} posts
              </p>
            </Link>
          ))}
        </div>

        {collections.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No collections yet. Create one to organize your saved posts!
          </div>
        )}
      </div>
    </div>
  )
}

