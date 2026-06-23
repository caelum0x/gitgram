'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import api from '@/services/api'

export default function ReelAnalyticsPage() {
  const params = useParams()
  const reelId = params.id as string
  const [analytics, setAnalytics] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAnalytics()
  }, [reelId])

  const loadAnalytics = async () => {
    try {
      const response = await api.get(`/v1/reels/${reelId}/analytics`)
      setAnalytics(response.data.analytics || response.data)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Reel Analytics</h1>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-surface rounded-lg p-6">
            <p className="text-foreground/70 text-sm mb-2">Views</p>
            <p className="text-3xl font-bold text-foreground">{analytics?.views || 0}</p>
          </div>
          <div className="bg-surface rounded-lg p-6">
            <p className="text-foreground/70 text-sm mb-2">Likes</p>
            <p className="text-3xl font-bold text-foreground">{analytics?.likes || 0}</p>
          </div>
          <div className="bg-surface rounded-lg p-6">
            <p className="text-foreground/70 text-sm mb-2">Comments</p>
            <p className="text-3xl font-bold text-foreground">{analytics?.comments || 0}</p>
          </div>
          <div className="bg-surface rounded-lg p-6">
            <p className="text-foreground/70 text-sm mb-2">Shares</p>
            <p className="text-3xl font-bold text-foreground">{analytics?.shares || 0}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

