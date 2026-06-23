'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { analyticsService, AnalyticsOverview } from '@/services/analyticsService'
import { getErrorMessage } from '@/utils/error'

export default function AnalyticsOverviewPage() {
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadAnalytics()
  }, [])

  const loadAnalytics = async () => {
    try {
      const data = await analyticsService.getAnalyticsOverview()
      setAnalytics(data)
    } catch (err: unknown) {
      console.error('Load analytics error:', err)
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-foreground">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={loadAnalytics}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-foreground">Analytics Overview</h1>
          <Link
            href="/analytics"
            className="text-blue-500 hover:text-blue-400 text-sm"
          >
            View detailed analytics
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-surface rounded-lg p-6 border border-border">
            <p className="text-foreground/70 text-sm mb-2">Total Posts</p>
            <p className="text-3xl font-bold text-foreground">{analytics?.totalPosts?.toLocaleString() || 0}</p>
          </div>
          <div className="bg-surface rounded-lg p-6 border border-border">
            <p className="text-foreground/70 text-sm mb-2">Total Reels</p>
            <p className="text-3xl font-bold text-foreground">{analytics?.totalReels?.toLocaleString() || 0}</p>
          </div>
          <div className="bg-surface rounded-lg p-6 border border-border">
            <p className="text-foreground/70 text-sm mb-2">Followers</p>
            <p className="text-3xl font-bold text-foreground">{analytics?.totalFollowers?.toLocaleString() || 0}</p>
          </div>
          <div className="bg-surface rounded-lg p-6 border border-border">
            <p className="text-foreground/70 text-sm mb-2">Following</p>
            <p className="text-3xl font-bold text-foreground">{analytics?.totalFollowing?.toLocaleString() || 0}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-surface rounded-lg p-6 border border-border">
            <p className="text-foreground/70 text-sm mb-2">Total Views</p>
            <p className="text-3xl font-bold text-foreground">{analytics?.totalViews?.toLocaleString() || 0}</p>
          </div>
          <div className="bg-surface rounded-lg p-6 border border-border">
            <p className="text-foreground/70 text-sm mb-2">Total Likes</p>
            <p className="text-3xl font-bold text-foreground">{analytics?.totalLikes?.toLocaleString() || 0}</p>
          </div>
          <div className="bg-surface rounded-lg p-6 border border-border">
            <p className="text-foreground/70 text-sm mb-2">Total Comments</p>
            <p className="text-3xl font-bold text-foreground">{analytics?.totalComments?.toLocaleString() || 0}</p>
          </div>
          <div className="bg-surface rounded-lg p-6 border border-border">
            <p className="text-foreground/70 text-sm mb-2">Engagement Rate</p>
            <p className="text-3xl font-bold text-foreground">{analytics?.engagementRate || 0}%</p>
          </div>
        </div>
      </div>
    </div>
  )
}
