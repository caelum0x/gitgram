'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { momentService } from '@/services/momentService'
import { useAuthStore } from '@/store/authStore'

export default function MomentDetailPage() {
  const params = useParams()
  const momentId = params.id as string
  const { user } = useAuthStore()
  const [moment, setMoment] = useState<any>(null)
  const [isLiked, setIsLiked] = useState(false)
  const [likesCount, setLikesCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadMoment()
  }, [momentId])

  const loadMoment = async () => {
    try {
      const response = await momentService.getMoment(momentId)
      const momentData = response.moment || response
      setMoment(momentData)
      setIsLiked(momentData.isLiked || false)
      setLikesCount(momentData.likesCount || 0)
    } catch (error) {
      console.error('Load moment error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleLike = async () => {
    try {
      await momentService.likeMoment(momentId)
      setIsLiked(!isLiked)
      setLikesCount(prev => isLiked ? prev - 1 : prev + 1)
    } catch (error) {
      console.error('Like moment error:', error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground">Loading...</div>
      </div>
    )
  }

  if (!moment) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground">Moment not found</div>
      </div>
    )
  }

  const isOwner = user?.id === moment.userId

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="bg-surface rounded-lg overflow-hidden">
          <div className="p-4 flex items-center gap-3 border-b border-border">
            <Link href={`/profile/${moment.userId}`}>
              {moment.user?.avatar ? (
                <Image
                  src={moment.user.avatar}
                  alt={moment.user.username}
                  width={40}
                  height={40}
                  className="rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
                  <span className="text-white font-semibold">
                    {moment.user?.username?.[0]?.toUpperCase()}
                  </span>
                </div>
              )}
            </Link>
            <Link href={`/profile/${moment.userId}`} className="font-semibold text-foreground hover:text-accent">
              {moment.user?.username}
            </Link>
          </div>

          <div className="relative aspect-[4/3]">
            {moment.screenshotUrl && (
              <Image
                src={moment.screenshotUrl}
                alt="Moment screenshot"
                fill
                className="object-cover"
              />
            )}
            {moment.selfieUrl && (
              <div className="absolute bottom-4 right-4 w-24 h-24 rounded-full border-4 border-background overflow-hidden">
                <Image
                  src={moment.selfieUrl}
                  alt="Selfie"
                  fill
                  className="object-cover"
                />
              </div>
            )}
          </div>

          <div className="p-4">
            {moment.caption && (
              <p className="text-foreground mb-4">{moment.caption}</p>
            )}

            <div className="flex items-center gap-6">
              <button
                onClick={handleLike}
                className={`flex items-center gap-2 ${isLiked ? 'text-red-500' : 'text-foreground/70'}`}
              >
                <span className="text-2xl">{isLiked ? '❤️' : '🤍'}</span>
                <span>{likesCount}</span>
              </button>
              <Link href={`/moments/${momentId}/share`} className="flex items-center gap-2 text-foreground/70">
                <span className="text-2xl">📤</span>
                <span>Share</span>
              </Link>
              {isOwner && (
                <Link href={`/moments/${momentId}/delete`} className="flex items-center gap-2 text-red-500">
                  <span className="text-2xl">🗑️</span>
                  <span>Delete</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
