'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import api from '@/services/api'

export default function StoryHighlightsPage() {
  const [highlights, setHighlights] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadHighlights()
  }, [])

  const loadHighlights = async () => {
    try {
      const response = await api.get('/v1/stories/highlights')
      setHighlights(response.data.highlights || [])
    } catch (error) {
      console.error('Load highlights error:', error)
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
          <h1 className="text-2xl font-bold text-foreground">Story Highlights</h1>
          <Link
            href="/story/highlights/create"
            className="px-4 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90"
          >
            Create Highlight
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {highlights.map((highlight) => (
            <Link
              key={highlight.id}
              href={`/story/highlights/${highlight.id}`}
              className="text-center"
            >
              <div className="relative mx-auto mb-2 aspect-square w-24 overflow-hidden rounded-full border-2 border-accent bg-surface">
                {highlight.coverImage ? (
                  <Image
                    src={highlight.coverImage}
                    alt={highlight.name}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <span className="text-white text-2xl">⭐</span>
                  </div>
                )}
              </div>
              <p className="text-sm font-medium text-foreground">{highlight.name}</p>
              <p className="text-xs text-foreground/50">
                {highlight.storiesCount || 0} stories
              </p>
            </Link>
          ))}
        </div>

        {highlights.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No highlights yet. Create one from your archived stories.
          </div>
        )}
      </div>
    </div>
  )
}
