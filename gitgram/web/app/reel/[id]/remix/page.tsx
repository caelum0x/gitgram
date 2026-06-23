'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { reelService } from '@/services/reelService'

export default function RemixReelPage() {
  const params = useParams()
  const router = useRouter()
  const reelId = params.id as string
  const [reel, setReel] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadReel()
  }, [reelId])

  const loadReel = async () => {
    try {
      const response = await reelService.getReel(reelId)
      setReel(response.reel || response)
    } catch (error) {
      console.error('Load reel error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRemix = () => {
    // Navigate to create reel with remix option
    router.push(`/reels/create?remix=${reelId}`)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Remix Reel</h1>
        <div className="bg-surface rounded-lg p-6 mb-6">
          <p className="text-foreground mb-4">
            Create your own version of this reel by adding your own video or effects.
          </p>
          <button
            onClick={handleRemix}
            className="w-full px-6 py-3 bg-accent text-white rounded-lg font-semibold hover:opacity-90"
          >
            Create Remix
          </button>
        </div>
      </div>
    </div>
  )
}

