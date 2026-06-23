'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { analyticsService, PostAnalytics } from '@/services/analyticsService'
import { getErrorMessage } from '@/utils/error'

export default function PostAnalyticsDetailPage() {
  const params = useParams()
  const router = useRouter()
  const postId = params.id as string
  const [analytics, setAnalytics] = useState<PostAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadAnalytics()
  }, [postId])

  const loadAnalytics = async () => {
    try {
      const data = await analyticsService.getPostAnalytics(postId)
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
          <div className="flex gap-4 justify-center">
            <button
              onClick={loadAnalytics}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Retry
            </button>
            <button
              onClick={() => router.back()}
              className="px-4 py-2 bg-surface border border-border text-foreground rounded-lg hover:bg-background"
            >
              Go back
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => router.back()}
            className="text-foreground/60 hover:text-foreground"
          >
            Back
          </button>
          <h1 className="text-2xl font-bold text-foreground">Post Analytics</h1>
        </div>

        {/* Post Preview */}
        {analytics && (
          <div className="bg-surface rounded-xl p-6 border border-border mb-6">
            {analytics.mediaUrls && analytics.mediaUrls.length > 0 && (
              <div className="relative w-full h-48 mb-4 rounded-lg overflow-hidden">
                <Image
                  src={analytics.mediaUrls[0]}
                  alt="Post media"
                  fill
                  className="object-cover"
                />
              </div>
            )}
            <p className="text-foreground mb-2">{analytics.content || 'No caption'}</p>
            <p className="text-foreground/50 text-sm">
              Posted on {new Date(analytics.createdAt).toLocaleDateString()}
            </p>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-surface rounded-xl p-6 border border-border">
            <p className="text-foreground/70 text-sm mb-2">Views</p>
            <p className="text-3xl font-bold text-foreground">{analytics?.viewsCount?.toLocaleString() || 0}</p>
          </div>
          <div className="bg-surface rounded-xl p-6 border border-border">
            <p className="text-foreground/70 text-sm mb-2">Likes</p>
            <p className="text-3xl font-bold text-foreground">{analytics?.likesCount?.toLocaleString() || 0}</p>
          </div>
          <div className="bg-surface rounded-xl p-6 border border-border">
            <p className="text-foreground/70 text-sm mb-2">Comments</p>
            <p className="text-3xl font-bold text-foreground">{analytics?.commentsCount?.toLocaleString() || 0}</p>
          </div>
          <div className="bg-surface rounded-xl p-6 border border-border">
            <p className="text-foreground/70 text-sm mb-2">Saves</p>
            <p className="text-3xl font-bold text-foreground">{analytics?.savesCount?.toLocaleString() || 0}</p>
          </div>
        </div>

        {/* Additional Stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-surface rounded-xl p-6 border border-border">
            <p className="text-foreground/70 text-sm mb-2">Shares</p>
            <p className="text-3xl font-bold text-foreground">{analytics?.sharesCount?.toLocaleString() || 0}</p>
          </div>
          <div className="bg-surface rounded-xl p-6 border border-border">
            <p className="text-foreground/70 text-sm mb-2">Engagement Rate</p>
            <p className="text-3xl font-bold text-foreground">{analytics?.engagementRate || 0}%</p>
          </div>
        </div>

        {/* View Post Link */}
        <div className="text-center">
          <Link
            href={`/post/${postId}`}
            className="text-blue-500 hover:text-blue-400 text-sm"
          >
            View original post
          </Link>
        </div>
      </div>
    </div>
  )
}

