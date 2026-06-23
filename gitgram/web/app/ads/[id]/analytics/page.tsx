'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { adService } from '@/services/adService'

export default function AdAnalyticsPage() {
  const params = useParams()
  const adId = params.id as string
  const [analytics, setAnalytics] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAnalytics()
  }, [adId])

  const loadAnalytics = async () => {
    try {
      const response = await adService.getAdAnalytics(adId)
      setAnalytics(response.analytics || response)
    } catch (error) {
      console.error('Load analytics error:', error)
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
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Ad Analytics</h1>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-surface rounded-lg p-6">
            <p className="text-foreground/70 text-sm mb-2">Total Views</p>
            <p className="text-3xl font-bold text-foreground">{analytics?.views || 0}</p>
          </div>
          <div className="bg-surface rounded-lg p-6">
            <p className="text-foreground/70 text-sm mb-2">Total Clicks</p>
            <p className="text-3xl font-bold text-foreground">{analytics?.clicks || 0}</p>
          </div>
          <div className="bg-surface rounded-lg p-6">
            <p className="text-foreground/70 text-sm mb-2">Click Rate</p>
            <p className="text-3xl font-bold text-foreground">
              {analytics?.views ? ((analytics.clicks / analytics.views) * 100).toFixed(2) : 0}%
            </p>
          </div>
          <div className="bg-surface rounded-lg p-6">
            <p className="text-foreground/70 text-sm mb-2">Budget Spent</p>
            <p className="text-3xl font-bold text-foreground">${analytics?.spent || 0}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

