'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { adService } from '@/services/adService'

export default function AdsViewPage() {
  const [ads, setAds] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAds()
  }, [])

  const loadAds = async () => {
    try {
      const response = await adService.getActiveAds(1, 10)
      setAds(response.ads || [])
    } catch (error) {
      console.error('Load ads error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAdClick = async (adId: string, url: string) => {
    try {
      await adService.trackClick(adId)
      window.open(url, '_blank')
    } catch (error) {
      console.error('Track click error:', error)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Ads</h1>
        <div className="space-y-4">
          {ads.map((ad) => (
            <div
              key={ad.id}
              className="bg-surface rounded-lg overflow-hidden cursor-pointer hover:bg-surface/80"
              onClick={() => handleAdClick(ad.id, ad.url)}
            >
              {ad.imageUrl && (
                <div className="relative aspect-video">
                  <Image
                    src={ad.imageUrl}
                    alt={ad.title}
                    fill
                    className="object-cover"
                  />
                </div>
              )}
              <div className="p-4">
                <h3 className="font-semibold text-foreground mb-2">{ad.title}</h3>
                {ad.description && (
                  <p className="text-foreground/70 text-sm mb-2">{ad.description}</p>
                )}
                <p className="text-xs text-foreground/50">Ad</p>
              </div>
            </div>
          ))}
        </div>
        {ads.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No ads available
          </div>
        )}
      </div>
    </div>
  )
}

