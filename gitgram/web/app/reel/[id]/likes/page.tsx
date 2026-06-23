'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { reelService } from '@/services/reelService'

export default function ReelLikesPage() {
  const params = useParams()
  const reelId = params.id as string
  const [likes, setLikes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadLikes()
  }, [reelId])

  const loadLikes = async () => {
    try {
      const response = await reelService.getReelLikes(reelId)
      setLikes(response.likes || [])
    } catch (error) {
      console.error('Load likes error:', error)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Likes</h1>
        <div className="space-y-2">
          {likes.map((like) => {
            const profileHref = `/profile/${like.user?.username || like.userId}`

            return (
              <Link
                key={like.id}
                href={profileHref}
                className="flex items-center gap-4 p-4 bg-surface rounded-lg hover:bg-surface/80"
              >
                {like.user?.avatar ? (
                  <Image
                    src={like.user.avatar}
                    alt={like.user.username}
                    width={50}
                    height={50}
                    className="rounded-full"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center">
                    <span className="text-white font-semibold">
                      {like.user?.username?.[0]?.toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex-1">
                  <p className="font-semibold text-foreground">@{like.user?.username}</p>
                </div>
              </Link>
            )
          })}
        </div>
        {likes.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No likes yet
          </div>
        )}
      </div>
    </div>
  )
}
