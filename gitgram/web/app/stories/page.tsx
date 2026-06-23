'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { storyService } from '@/services/storyService'
import { useToast } from '@/components/ui/toast'

export default function StoriesPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const { showToast } = useToast()
  const [stories, setStories] = useState<any[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    loadStories()
  }, [isAuthenticated])

  const loadStories = async () => {
    try {
      const data = await storyService.getStories()
      const groups = Array.isArray(data?.stories) ? data.stories : []
      const flattened = groups.flatMap((group: any) =>
        Array.isArray(group?.stories)
          ? group.stories.map((story: any) => ({
              ...story,
              user: story.user ?? group.user,
            }))
          : []
      )
      setStories(flattened)
    } catch (error: unknown) {
      showToast('Failed to load stories', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleView = async (storyId: string) => {
    try {
      await storyService.viewStory(storyId)
    } catch (error) {
      console.error('Failed to mark story as viewed')
    }
  }

  useEffect(() => {
    if (stories[currentIndex]) {
      handleView(stories[currentIndex].id)
    }
  }, [currentIndex])

  if (!isAuthenticated || loading) return null

  const currentStory = stories[currentIndex]

  return (
    <div className="fixed inset-0 bg-black">
      {currentStory && (
        <div className="relative h-full flex items-center justify-center">
          {currentStory.mediaType === 'video' ? (
            <video
              src={currentStory.mediaUrl}
              className="h-full w-auto max-w-full object-contain"
              autoPlay
              playsInline
            />
          ) : (
            <img
              src={currentStory.mediaUrl}
              alt="Story"
              className="h-full w-auto max-w-full object-contain"
            />
          )}
          
          <div className="absolute top-4 left-4 right-4 flex items-center gap-3 text-white">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <span className="font-semibold">{currentStory.user?.username?.[0]?.toUpperCase()}</span>
            </div>
            <div className="flex-1">
              <p className="font-semibold">{currentStory.user?.username}</p>
              <p className="text-sm opacity-80">2h ago</p>
            </div>
            <button onClick={() => router.back()} className="text-white">✕</button>
          </div>

          <div className="absolute top-2 left-0 right-0 flex gap-1 px-4">
            {stories.map((_, i) => (
              <div key={i} className={`h-1 flex-1 rounded ${i === currentIndex ? 'bg-white' : 'bg-white/30'}`} />
            ))}
          </div>

          {currentIndex > 0 && (
            <button
              onClick={() => setCurrentIndex(currentIndex - 1)}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-white"
            >
              ←
            </button>
          )}
          {currentIndex < stories.length - 1 && (
            <button
              onClick={() => setCurrentIndex(currentIndex + 1)}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-white"
            >
              →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
