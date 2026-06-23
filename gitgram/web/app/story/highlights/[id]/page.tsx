'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import api from '@/services/api'

export default function StoryHighlightDetailPage() {
  const params = useParams()
  const highlightId = params.id as string
  const [highlight, setHighlight] = useState<any>(null)
  const [stories, setStories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadHighlight()
  }, [highlightId])

  const loadHighlight = async () => {
    try {
      const response = await api.get(`/v1/stories/highlights/${highlightId}`)
      const data = response.data.highlight || response.data
      setHighlight(data)
      setStories(data.stories || [])
    } catch (error) {
      console.error('Load highlight error:', error)
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

  if (!highlight) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground">Highlight not found</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto py-8 px-4">
        <div className="mb-6 flex items-center gap-4">
          <div className="relative h-20 w-20 overflow-hidden rounded-full border-2 border-accent bg-surface">
            {highlight.coverImage ? (
              <Image
                src={highlight.coverImage}
                alt={highlight.name}
                fill
                className="object-cover"
              />
            ) : null}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{highlight.name}</h1>
            <p className="text-sm text-foreground/60">{highlight.storiesCount || 0} stories</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {stories.map((story) => (
            <div
              key={story.id}
              className="relative aspect-[9/16] overflow-hidden rounded-lg bg-surface"
            >
              {story.mediaUrl && story.mediaType === 'image' ? (
                <Image
                  src={story.mediaUrl}
                  alt={story.caption || 'Story'}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-black/80 text-white text-sm font-semibold">
                  Video Archive
                </div>
              )}
              {story.caption && (
                <div className="absolute inset-x-0 bottom-0 bg-black/60 p-2">
                  <p className="line-clamp-3 text-xs text-white">{story.caption}</p>
                </div>
              )}
            </div>
          ))}
        </div>
        {stories.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No stories in this highlight
          </div>
        )}
      </div>
    </div>
  )
}
