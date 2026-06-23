'use client'

import { useState, useEffect } from 'react'
import { adService } from '@/services/adService'

export default function AdAnalyticsPage() {
  const [ads, setAds] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAd, setSelectedAd] = useState<string | null>(null)
  const [analytics, setAnalytics] = useState<any>(null)

  useEffect(() => {
    loadAds()
  }, [])

  useEffect(() => {
    if (selectedAd) {
      loadAnalytics()
    }
  }, [selectedAd])

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

  const loadAnalytics = async () => {
    if (!selectedAd) return
    try {
      const response = await adService.getAdAnalytics(selectedAd)
      setAnalytics(response.analytics || response)
    } catch (error) {
      console.error('Load analytics error:', error)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Ad Analytics</h1>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">Your Ads</h2>
            <div className="space-y-2">
              {ads.map((ad) => (
                <button
                  key={ad.id}
                  onClick={() => setSelectedAd(ad.id)}
                  className={`w-full text-left p-4 rounded-lg ${
                    selectedAd === ad.id ? 'bg-accent text-white' : 'bg-surface text-foreground hover:bg-surface/80'
                  }`}
                >
                  <p className="font-semibold">{ad.title}</p>
                  <p className="text-sm opacity-70">
                    Views: {ad.views || 0} | Clicks: {ad.clicks || 0}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {analytics && (
            <div>
              <h2 className="text-lg font-semibold text-foreground mb-4">Analytics</h2>
              <div className="bg-surface rounded-lg p-6 space-y-4">
                <div>
                  <p className="text-foreground/70 text-sm mb-1">Views</p>
                  <p className="text-2xl font-bold text-foreground">{analytics.views || 0}</p>
                </div>
                <div>
                  <p className="text-foreground/70 text-sm mb-1">Clicks</p>
                  <p className="text-2xl font-bold text-foreground">{analytics.clicks || 0}</p>
                </div>
                <div>
                  <p className="text-foreground/70 text-sm mb-1">Click-Through Rate</p>
                  <p className="text-2xl font-bold text-foreground">
                    {analytics.clickThroughRate?.toFixed(2) || 0}%
                  </p>
                </div>
                <div>
                  <p className="text-foreground/70 text-sm mb-1">Cost Per Click</p>
                  <p className="text-2xl font-bold text-foreground">
                    ${analytics.costPerClick?.toFixed(2) || 0}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {ads.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No ads created yet
          </div>
        )}
      </div>
    </div>
  )
}

