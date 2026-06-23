'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { reelService } from '@/services/reelService'

export default function ShareReelPage() {
  const params = useParams()
  const router = useRouter()
  const reelId = params.id as string
  const [reel, setReel] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

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

  const handleCopyLink = async () => {
    try {
      const response = await reelService.shareReel(reelId, 'copy_link')
      const shareUrl = response.shareUrl || `${window.location.origin}/reel/${reelId}`
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
    } catch (error) {
      console.error('Copy reel link error:', error)
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
        <h1 className="text-2xl font-bold text-foreground mb-2">Share Reel</h1>
        <p className="mb-6 text-sm text-foreground/70">
          {reel?.title || reel?.description || 'Share this reel using a tracked copy link.'}
        </p>
        <div className="space-y-4">
          <button
            onClick={handleCopyLink}
            className="w-full px-6 py-3 bg-surface border border-border rounded-lg text-foreground hover:bg-surface/80"
          >
            {copied ? 'Link Copied' : 'Copy Link'}
          </button>
          <button
            onClick={() => router.back()}
            className="w-full px-6 py-2 bg-surface border border-border rounded-lg text-foreground hover:bg-surface/80"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
