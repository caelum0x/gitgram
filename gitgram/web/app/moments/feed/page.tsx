'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { momentService } from '@/services/momentService'

export default function MomentsFeedPage() {
  const [moments, setMoments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadMoments()
  }, [])

  const loadMoments = async () => {
    try {
      const response = await momentService.getMoments(1, 20)
      setMoments(response.moments || [])
    } catch (error) {
      console.error('Load moments error:', error)
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
          <h1 className="text-2xl font-bold text-foreground">Moments</h1>
          <Link
            href="/moments/create"
            className="px-4 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90"
          >
            Create Moment
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {moments.map((moment) => (
            <Link
              key={moment.id}
              href={`/moments/${moment.id}`}
              className="bg-surface rounded-lg overflow-hidden hover:bg-surface/80"
            >
              <div className="relative aspect-[4/3]">
                {moment.screenshotUrl && (
                  <Image
                    src={moment.screenshotUrl}
                    alt="Moment"
                    fill
                    className="object-cover"
                  />
                )}
                {moment.selfieUrl && (
                  <div className="absolute bottom-2 right-2 w-16 h-16 rounded-full border-2 border-background overflow-hidden">
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
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-foreground/70 text-sm">@{moment.user?.username}</span>
                </div>
                {moment.caption && (
                  <p className="text-foreground text-sm line-clamp-2">{moment.caption}</p>
                )}
                <div className="flex items-center gap-4 mt-2 text-sm text-foreground/70">
                  <span>❤️ {moment.likesCount || 0}</span>
                  <span>💬 {moment.commentsCount || 0}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {moments.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No moments yet. Create your first moment!
          </div>
        )}
      </div>
    </div>
  )
}

