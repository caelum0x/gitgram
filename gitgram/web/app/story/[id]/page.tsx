'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { storyService } from '@/services/storyService'

export default function StoryViewPage() {
  const params = useParams()
  const storyId = params.id as string
  const [story, setStory] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStory()
    markAsViewed()
  }, [storyId])

  const loadStory = async () => {
    try {
      const response = await storyService.getStory(storyId)
      setStory(response.story)
    } catch (error) {
      console.error('Load story error:', error)
    } finally {
      setLoading(false)
    }
  }

  const markAsViewed = async () => {
    try {
      await storyService.viewStory(storyId, {
        source: 'web_story_page',
        deviceType: 'web',
      })
    } catch (error) {
      console.error('Mark as viewed error:', error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground">Loading...</div>
      </div>
    )
  }

  if (!story) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground">Story not found</div>
      </div>
    )
  }

  const profileHref = `/profile/${story.user?.username || story.userId}`

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-md mx-auto py-8 px-4">
        <div className="bg-surface rounded-lg overflow-hidden">
          <div className="p-4 flex items-center gap-3 border-b border-border">
            <Link href={profileHref}>
              {story.user?.avatar ? (
                <Image
                  src={story.user.avatar}
                  alt={story.user.username}
                  width={40}
                  height={40}
                  className="rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
                  <span className="text-white font-semibold">
                    {story.user?.username?.[0]?.toUpperCase()}
                  </span>
                </div>
              )}
            </Link>
            <Link href={profileHref} className="font-semibold text-foreground hover:text-accent">
              {story.user?.username}
            </Link>
          </div>

          <div className="relative aspect-[9/16]">
            {story.mediaType === 'image' && story.mediaUrl && (
              <Image
                src={story.mediaUrl}
                alt="Story"
                fill
                className="object-cover"
              />
            )}
            {story.mediaType === 'video' && story.mediaUrl && (
              <video
                src={story.mediaUrl}
                controls
                className="w-full h-full"
                autoPlay
              />
            )}
          </div>

          {story.caption && (
            <div className="border-t border-border p-4">
              <p className="text-sm text-foreground">{story.caption}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
