'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { adService } from '@/services/adService'

export default function MyAdsPage() {
  const [ads, setAds] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAds()
  }, [])

  const loadAds = async () => {
    try {
      const response = await adService.getMyAds()
      setAds(response.ads || [])
    } catch (error) {
      console.error('Load ads error:', error)
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
          <h1 className="text-2xl font-bold text-foreground">My Ads</h1>
          <Link
            href="/ads/create"
            className="px-4 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90"
          >
            Create Ad
          </Link>
        </div>

        <div className="space-y-4">
          {ads.map((ad) => (
            <div
              key={ad.id}
              className="p-4 bg-surface rounded-lg"
            >
              <div className="flex items-center gap-4">
                {ad.imageUrl && (
                  <div className="relative w-24 h-24">
                    <Image
                      src={ad.imageUrl}
                      alt={ad.title}
                      fill
                      className="object-cover rounded-lg"
                    />
                  </div>
                )}
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground mb-2">{ad.title}</h3>
                  {ad.description && (
                    <p className="text-sm text-foreground/70 mb-2">{ad.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-sm text-foreground/70">
                    <span>Views: {ad.views || 0}</span>
                    <span>Clicks: {ad.clicks || 0}</span>
                    <span>Budget: ${ad.budget || 0}</span>
                  </div>
                </div>
                <Link
                  href={`/ads/${ad.id}/analytics`}
                  className="px-4 py-2 bg-surface border border-border rounded-lg text-foreground hover:bg-surface/80 text-sm"
                >
                  Analytics
                </Link>
              </div>
            </div>
          ))}
        </div>

        {ads.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No ads yet. <Link href="/ads/create" className="text-accent hover:underline">Create your first ad</Link>
          </div>
        )}
      </div>
    </div>
  )
}

