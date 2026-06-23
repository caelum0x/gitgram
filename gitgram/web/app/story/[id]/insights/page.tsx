'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { storyService } from '@/services/storyService'

export default function StoryInsightsPage() {
  const params = useParams()
  const storyId = params.id as string
  const [insights, setInsights] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadInsights()
  }, [storyId])

  const loadInsights = async () => {
    try {
      const response = await storyService.getStoryAnalytics(storyId, { limit: 25 })
      setInsights(response)
    } catch (error) {
      console.error('Load insights error:', error)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Story Insights</h1>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-surface rounded-lg p-6">
            <p className="text-foreground/70 text-sm mb-2">Total Views</p>
            <p className="text-3xl font-bold text-foreground">{insights?.metrics?.totalViews || 0}</p>
          </div>
          <div className="bg-surface rounded-lg p-6">
            <p className="text-foreground/70 text-sm mb-2">Unique Viewers</p>
            <p className="text-3xl font-bold text-foreground">{insights?.metrics?.uniqueViewers || 0}</p>
          </div>
          <div className="bg-surface rounded-lg p-6">
            <p className="text-foreground/70 text-sm mb-2">Replies</p>
            <p className="text-3xl font-bold text-foreground">{insights?.metrics?.repliesCount || 0}</p>
          </div>
          <div className="bg-surface rounded-lg p-6">
            <p className="text-foreground/70 text-sm mb-2">Reactions</p>
            <p className="text-3xl font-bold text-foreground">{insights?.metrics?.reactionsCount || 0}</p>
          </div>
          <div className="bg-surface rounded-lg p-6">
            <p className="text-foreground/70 text-sm mb-2">Engagement Rate</p>
            <p className="text-3xl font-bold text-foreground">{insights?.metrics?.engagementRate || 0}%</p>
          </div>
          <div className="bg-surface rounded-lg p-6">
            <p className="text-foreground/70 text-sm mb-2">Completion Rate</p>
            <p className="text-3xl font-bold text-foreground">{insights?.metrics?.completionRate || 0}%</p>
          </div>
        </div>
      </div>
    </div>
  )
}
