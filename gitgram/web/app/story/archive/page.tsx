'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { storyService } from '@/services/storyService'

export default function StoryArchivePage() {
  const [stories, setStories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStories()
  }, [])

  const loadStories = async () => {
    try {
      const response = await storyService.getArchivedStories()
      setStories(response.archives || [])
    } catch (error) {
      console.error('Load stories error:', error)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Story Archive</h1>
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {stories.map((story) => (
            <div
              key={story.id}
              className="relative aspect-[9/16] overflow-hidden rounded-lg bg-surface"
            >
              {story.mediaUrl && story.mediaType === 'image' ? (
                <Image
                  src={story.mediaUrl}
                  alt={story.caption || 'Archived story'}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-black/80 text-white">
                  <span className="text-sm font-semibold">Video Archive</span>
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
            No archived stories
          </div>
        )}
      </div>
    </div>
  )
}
