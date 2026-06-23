'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import api from '@/services/api'

export default function TagReelsPage() {
  const params = useParams()
  const tag = params.tag as string
  const [reels, setReels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadReels()
  }, [tag])

  const loadReels = async () => {
    try {
      const response = await api.get('/v1/tags/reels', {
        params: { tag },
      })
      setReels(response.data.reels || [])
    } catch (error) {
      console.error('Load reels error:', error)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">#{tag} - Reels</h1>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {reels.map((reel) => (
            <Link
              key={reel.id}
              href={`/reel/${reel.id}`}
              className="relative aspect-[9/16] group"
            >
              {reel.thumbnailUrl && (
                <>
                  <Image
                    src={reel.thumbnailUrl}
                    alt="Reel"
                    fill
                    className="object-cover rounded-lg"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-end p-2">
                    <span className="text-white text-sm font-semibold">
                      ❤️ {reel.likesCount}
                    </span>
                  </div>
                </>
              )}
            </Link>
          ))}
        </div>
        {reels.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No reels found for #{tag}
          </div>
        )}
      </div>
    </div>
  )
}
