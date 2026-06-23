'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import api from '@/services/api'

interface StoryUser {
  id: string
  username: string
  avatarUrl?: string
  profileImageUrl?: string
}

interface Story {
  id: string
  mediaUrl?: string
  mediaType?: 'image' | 'video'
  content?: string
  caption?: string
  createdAt?: string
  user?: StoryUser
}

interface UserStoriesResponse {
  stories: Story[]
  user?: StoryUser
}

const STORY_DURATION_MS = 5000

export default function StoryViewerPage() {
  const router = useRouter()
  const params = useParams()
  const userId = params?.userId as string

  const [stories, setStories] = useState<Story[]>([])
  const [storyUser, setStoryUser] = useState<StoryUser | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  const rafRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const pausedRef = useRef(false)

  const goBack = useCallback(() => {
    router.back()
  }, [router])

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev < stories.length - 1) {
        return prev + 1
      }
      router.back()
      return prev
    })
  }, [stories.length, router])

  const goToPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : 0))
  }, [])

  useEffect(() => {
    if (!userId) return

    const fetchStories = async () => {
      try {
        setLoading(true)
        setError(null)
        const { data } = await api.get<UserStoriesResponse>(`/v1/stories/user/${userId}`)
        const fetched: Story[] = Array.isArray(data?.stories) ? data.stories : []
        setStories(fetched)
        if (data?.user) {
          setStoryUser(data.user)
        } else if (fetched.length > 0 && fetched[0].user) {
          setStoryUser(fetched[0].user)
        }
      } catch (err: unknown) {
        setError('Failed to load stories.')
      } finally {
        setLoading(false)
      }
    }

    fetchStories()
  }, [userId])

  useEffect(() => {
    if (stories.length === 0) return

    const markViewed = async () => {
      const story = stories[currentIndex]
      if (!story) return
      try {
        await api.post(`/v1/stories/${story.id}/view`, {})
      } catch {
        // non-critical — ignore view tracking errors
      }
    }

    markViewed()
  }, [currentIndex, stories])

  // rAF-based progress animation
  useEffect(() => {
    if (stories.length === 0 || loading) return

    setProgress(0)
    startTimeRef.current = null
    pausedRef.current = false

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
    }

    const animate = (timestamp: number) => {
      if (pausedRef.current) {
        rafRef.current = requestAnimationFrame(animate)
        return
      }

      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp
      }

      const elapsed = timestamp - startTimeRef.current
      const nextProgress = Math.min((elapsed / STORY_DURATION_MS) * 100, 100)
      setProgress(nextProgress)

      if (nextProgress < 100) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        goToNext()
      }
    }

    rafRef.current = requestAnimationFrame(animate)

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [currentIndex, stories.length, loading, goToNext])

  const handleTap = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const { clientX, currentTarget } = e
      const { left, width } = currentTarget.getBoundingClientRect()
      const relativeX = clientX - left
      if (relativeX < width / 4) {
        goToPrev()
      } else {
        goToNext()
      }
    },
    [goToPrev, goToNext]
  )

  const formatTimeAgo = (dateStr?: string): string => {
    if (!dateStr) return ''
    const diff = Date.now() - new Date(dateStr).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  if (loading) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ backgroundColor: '#0F0F1A' }}
      >
        <div className="w-10 h-10 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error || stories.length === 0) {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center gap-4"
        style={{ backgroundColor: '#0F0F1A' }}
      >
        <p className="text-white text-lg">{error ?? 'No stories available.'}</p>
        <button
          onClick={goBack}
          className="px-6 py-2 rounded-full text-sm font-medium text-white"
          style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
        >
          Go back
        </button>
      </div>
    )
  }

  const currentStory = stories[currentIndex]
  const avatarUrl = storyUser?.avatarUrl ?? storyUser?.profileImageUrl
  const username = storyUser?.username ?? currentStory.user?.username ?? 'Unknown'
  const storyText = currentStory.caption ?? currentStory.content

  return (
    <div
      className="fixed inset-0 select-none overflow-hidden"
      style={{ backgroundColor: '#0F0F1A' }}
    >
      {/* Tap zones */}
      <div
        className="absolute inset-0 z-10 cursor-pointer"
        onClick={handleTap}
        aria-label="Navigate stories"
      />

      {/* Media layer */}
      <div className="absolute inset-0 flex items-center justify-center">
        {currentStory.mediaType === 'video' && currentStory.mediaUrl ? (
          <video
            key={currentStory.id}
            src={currentStory.mediaUrl}
            className="h-full w-full object-cover"
            autoPlay
            playsInline
            muted={false}
          />
        ) : currentStory.mediaUrl ? (
          <img
            key={currentStory.id}
            src={currentStory.mediaUrl}
            alt="Story content"
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="h-full w-full flex items-center justify-center"
            style={{ backgroundColor: '#1A1A2E' }}
          >
            {storyText && (
              <p className="text-white text-2xl font-medium px-8 text-center leading-relaxed">
                {storyText}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Gradient overlays */}
      <div
        className="absolute inset-x-0 top-0 h-32 z-20 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)',
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-40 z-20 pointer-events-none"
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)',
        }}
      />

      {/* Progress bars */}
      <div className="absolute top-3 inset-x-3 z-30 flex gap-1 pointer-events-none">
        {stories.map((_, i) => (
          <div
            key={i}
            className="h-0.5 flex-1 rounded-full overflow-hidden"
            style={{ backgroundColor: 'rgba(255,255,255,0.35)' }}
          >
            <div
              className="h-full rounded-full"
              style={{
                backgroundColor: '#ffffff',
                width:
                  i < currentIndex
                    ? '100%'
                    : i === currentIndex
                    ? `${progress}%`
                    : '0%',
                transition: i === currentIndex ? 'none' : undefined,
              }}
            />
          </div>
        ))}
      </div>

      {/* Header: avatar + username + close */}
      <div className="absolute top-8 inset-x-4 z-30 flex items-center gap-3">
        <div className="relative flex-shrink-0">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={username}
              className="w-10 h-10 rounded-full object-cover ring-2 ring-white/60"
            />
          ) : (
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center ring-2 ring-white/60"
              style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
            >
              <span className="text-white font-semibold text-base">
                {username[0]?.toUpperCase() ?? '?'}
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm truncate leading-tight">{username}</p>
          {currentStory.createdAt && (
            <p className="text-white/70 text-xs leading-tight">
              {formatTimeAgo(currentStory.createdAt)}
            </p>
          )}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation()
            goBack()
          }}
          className="z-40 flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition-colors"
          style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
          aria-label="Close"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Bottom text overlay (when media is present) */}
      {storyText && currentStory.mediaUrl && (
        <div className="absolute bottom-8 inset-x-4 z-30 pointer-events-none">
          <p className="text-white text-base font-medium leading-snug drop-shadow-lg">
            {storyText}
          </p>
        </div>
      )}

      {/* Story counter (small indicator) */}
      <div className="absolute bottom-4 inset-x-0 z-30 flex justify-center pointer-events-none">
        <span className="text-white/50 text-xs">
          {currentIndex + 1} / {stories.length}
        </span>
      </div>
    </div>
  )
}
