'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { storyService } from '@/services/storyService'

export default function StoryRepliesPage() {
  const params = useParams()
  const storyId = params.id as string
  const [replies, setReplies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadReplies()
  }, [storyId])

  const loadReplies = async () => {
    try {
      const response = await storyService.getStoryReplies(storyId)
      setReplies(response.replies || [])
    } catch (error) {
      console.error('Load replies error:', error)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Replies</h1>
        <div className="space-y-4">
          {replies.map((reply) => {
            const profileHref = `/profile/${reply.user?.username || reply.userId}`

            return (
              <div key={reply.id} className="flex gap-3 p-4 bg-surface rounded-lg">
                <Link href={profileHref}>
                  {reply.user?.avatar ? (
                    <Image
                      src={reply.user.avatar}
                      alt={reply.user.username}
                      width={40}
                      height={40}
                      className="rounded-full"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
                      <span className="text-white font-semibold">
                        {reply.user?.username?.[0]?.toUpperCase()}
                      </span>
                    </div>
                  )}
                </Link>
                <div className="flex-1">
                  <Link href={profileHref} className="font-semibold text-foreground hover:text-accent">
                    {reply.user?.username}
                  </Link>
                  <p className="text-foreground mt-1">{reply.content}</p>
                  <p className="text-sm text-foreground/50 mt-1">
                    {new Date(reply.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
        {replies.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No replies yet
          </div>
        )}
      </div>
    </div>
  )
}
