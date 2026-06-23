'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { messageService } from '@/services/messageService'
import { reelService } from '@/services/reelService'

export default function ShareReelToMessagePage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const reelId = searchParams.get('reelId')
  const [conversations, setConversations] = useState<any[]>([])
  const [reel, setReel] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (reelId) {
      loadData()
    }
  }, [reelId])

  const loadData = async () => {
    try {
      const [conversationsResponse, reelResponse] = await Promise.all([
        messageService.getConversations(),
        reelService.getReel(reelId!),
      ])
      setConversations(conversationsResponse.conversations || [])
      setReel(reelResponse.reel || reelResponse)
    } catch (error) {
      console.error('Load data error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleShare = async (userId: string) => {
    try {
      await messageService.sendMessage(userId, `Check out this reel: ${reel?.caption || ''}`)
      router.back()
    } catch (error) {
      console.error('Share error:', error)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Share Reel</h1>
        <div className="space-y-2">
          {conversations.map((conv) => (
            <button
              key={conv.user.id}
              onClick={() => handleShare(conv.user.id)}
              className="w-full flex items-center gap-4 p-4 bg-surface rounded-lg hover:bg-surface/80 text-left"
            >
              {conv.user.avatar ? (
                <Image
                  src={conv.user.avatar}
                  alt={conv.user.username}
                  width={50}
                  height={50}
                  className="rounded-full"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center">
                  <span className="text-white font-semibold">
                    {conv.user.username[0].toUpperCase()}
                  </span>
                </div>
              )}
              <div className="flex-1">
                <p className="font-semibold text-foreground">@{conv.user.username}</p>
              </div>
            </button>
          ))}
        </div>
        {conversations.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No conversations yet
          </div>
        )}
      </div>
    </div>
  )
}

