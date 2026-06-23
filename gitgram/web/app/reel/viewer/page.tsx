'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { reelService } from '@/services/reelService'

function ReelViewerContent() {
  const searchParams = useSearchParams()
  const reelId = searchParams.get('reelId')
  const [reel, setReel] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (reelId) {
      loadReel()
    }
  }, [reelId])

  const loadReel = async () => {
    try {
      const response = await reelService.getReel(reelId!)
      setReel(response.reel || response)
    } catch (error) {
      console.error('Load reel error:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading || !reelId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-md mx-auto py-8 px-4">
        {reel && (
          <div className="bg-surface rounded-lg overflow-hidden">
            <div className="relative aspect-[9/16]">
              {reel.videoUrl ? (
                <video
                  src={reel.videoUrl}
                  controls
                  className="w-full h-full"
                  poster={reel.thumbnailUrl}
                />
              ) : (
                <div className="w-full h-full bg-background flex items-center justify-center">
                  <span className="text-foreground/50">Video not available</span>
                </div>
              )}
            </div>
            <div className="p-4">
              <Link
                href={`/profile/${reel.user?.username || reel.userId}`}
                className="font-semibold text-foreground hover:text-accent"
              >
                @{reel.user?.username}
              </Link>
              {(reel.caption || reel.description) && (
                <p className="text-foreground mt-2">{reel.caption || reel.description}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ReelViewerPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <ReelViewerContent />
    </Suspense>
  )
}
