'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import api from '@/services/api'

export default function MessageMediaPage() {
  const searchParams = useSearchParams()
  const userId = searchParams.get('userId')
  const [media, setMedia] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadMedia()
  }, [userId])

  const loadMedia = async () => {
    try {
      const response = await api.get(`/v1/messages/${userId}/media`)
      setMedia(response.data.media || [])
    } catch (error) {
      console.error('Load media error:', error)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Media</h1>
        <div className="grid grid-cols-3 gap-1">
          {media.map((item) => (
            <div key={item.id} className="relative aspect-square">
              {item.mediaType === 'image' && item.mediaUrl && (
                <Image
                  src={item.mediaUrl}
                  alt="Media"
                  fill
                  className="object-cover rounded-lg"
                />
              )}
            </div>
          ))}
        </div>
        {media.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No media in this conversation
          </div>
        )}
      </div>
    </div>
  )
}

