'use client'
import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useRouter } from 'next/navigation'
import { userService } from '@/services/userService'
import { useToast } from '@/components/ui/toast'

interface TopPost {
  id: string
  content: string
  mediaUrls: string[]
  createdAt: string
  engagementScore: number
  _count: {
    likes: number
    comments: number
  }
}

interface Demographics {
  newFollowers: number
  activeFollowers: number
  influencers: number
  avgFollowerCount: number
}

interface Performance {
  totalPosts: number
  withMedia: {
    count: number
    avgEngagement: number
  }
  withoutMedia: {
    count: number
    avgEngagement: number
  }
  topHashtags: Array<{ name: string; count: number }>
}

export default function InsightsPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const { showToast } = useToast()

  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState(30)
  const [topPosts, setTopPosts] = useState<TopPost[]>([])
  const [demographics, setDemographics] = useState<Demographics | null>(null)
  const [performance, setPerformance] = useState<Performance | null>(null)

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth')
      return
    }
    fetchInsights()
  }, [isAuthenticated, timeRange])

  const fetchInsights = async () => {
    setLoading(true)
    try {
      const data = await userService.getInsightsOverview(timeRange)
      setTopPosts(data.topPosts || [])
      setDemographics(data.demographics || null)
      setPerformance(data.performance || null)
    } catch (error: unknown) {
      showToast('Failed to load insights', 'error')
    } finally {
      setLoading(false)
    }
  }

  if (!isAuthenticated) return null

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Content Insights</h1>

        <select
          value={timeRange}
          onChange={(e) => setTimeRange(Number(e.target.value))}
          className="px-4 py-2 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {/* Overview Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard
              title="Total Posts"
              value={performance?.totalPosts || 0}
              icon="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
            />
            <StatCard
              title="Avg Engagement"
              value={performance?.withMedia.avgEngagement || 0}
              subtitle="with media"
              icon="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
            />
            <StatCard
              title="New Followers"
              value={demographics?.newFollowers || 0}
              subtitle="last 30 days"
              icon="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
            />
            <StatCard
              title="Influencer Followers"
              value={demographics?.influencers || 0}
              subtitle="1k+ followers"
              icon="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
            />
          </div>

          {/* Content Performance */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Media vs No Media */}
            <div className="p-6 bg-card border border-border rounded-xl">
              <h3 className="text-lg font-semibold mb-4">Content Type Performance</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-background rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-semibold">With Media</p>
                      <p className="text-sm text-muted">{performance?.withMedia.count || 0} posts</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-primary">{performance?.withMedia.avgEngagement || 0}</p>
                    <p className="text-xs text-muted">avg engagement</p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-background rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-semibold">Text Only</p>
                      <p className="text-sm text-muted">{performance?.withoutMedia.count || 0} posts</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{performance?.withoutMedia.avgEngagement || 0}</p>
                    <p className="text-xs text-muted">avg engagement</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Top Hashtags */}
            <div className="p-6 bg-card border border-border rounded-xl">
              <h3 className="text-lg font-semibold mb-4">Top Hashtags</h3>
              {performance?.topHashtags && performance.topHashtags.length > 0 ? (
                <div className="space-y-3">
                  {performance.topHashtags.map((tag, index) => (
                    <div key={tag.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-muted text-sm w-6">{index + 1}</span>
                        <span className="text-primary font-medium">#{tag.name}</span>
                      </div>
                      <span className="text-muted text-sm">{tag.count} posts</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted text-center py-8">No hashtags used yet</p>
              )}
            </div>
          </div>

          {/* Audience Demographics */}
          <div className="p-6 bg-card border border-border rounded-xl">
            <h3 className="text-lg font-semibold mb-4">Audience Demographics</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-background rounded-lg text-center">
                <p className="text-3xl font-bold text-green-500">{demographics?.newFollowers || 0}</p>
                <p className="text-sm text-muted mt-1">New (30d)</p>
              </div>
              <div className="p-4 bg-background rounded-lg text-center">
                <p className="text-3xl font-bold text-blue-500">{demographics?.activeFollowers || 0}</p>
                <p className="text-sm text-muted mt-1">Active Posters</p>
              </div>
              <div className="p-4 bg-background rounded-lg text-center">
                <p className="text-3xl font-bold text-purple-500">{demographics?.influencers || 0}</p>
                <p className="text-sm text-muted mt-1">Influencers</p>
              </div>
              <div className="p-4 bg-background rounded-lg text-center">
                <p className="text-3xl font-bold text-amber-500">{demographics?.avgFollowerCount || 0}</p>
                <p className="text-sm text-muted mt-1">Avg Followers</p>
              </div>
            </div>
          </div>

          {/* Top Performing Posts */}
          <div className="p-6 bg-card border border-border rounded-xl">
            <h3 className="text-lg font-semibold mb-4">Top Performing Posts</h3>
            {topPosts.length > 0 ? (
              <div className="space-y-4">
                {topPosts.slice(0, 5).map((post, index) => (
                  <div
                    key={post.id}
                    onClick={() => router.push(`/post/${post.id}`)}
                    className="flex items-start gap-4 p-4 bg-background rounded-lg hover:bg-muted cursor-pointer transition-colors"
                  >
                    <span className="text-2xl font-bold text-muted w-8">{index + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="line-clamp-2 mb-2">{post.content || '(Media post)'}</p>
                      <div className="flex items-center gap-4 text-sm text-muted">
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                          </svg>
                          {post._count?.likes || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                          {post._count?.comments || 0}
                        </span>
                        <span className="text-primary font-medium">Score: {post.engagementScore}</span>
                      </div>
                    </div>
                    {post.mediaUrls?.[0] && (
                      <img
                        src={post.mediaUrls[0]}
                        alt=""
                        className="w-16 h-16 object-cover rounded-lg"
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted text-center py-8">No posts yet. Start creating content to see insights!</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  title,
  value,
  subtitle,
  icon
}: {
  title: string
  value: number
  subtitle?: string
  icon: string
}) {
  return (
    <div className="p-6 bg-card border border-border rounded-xl">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted mb-1">{title}</p>
          <p className="text-3xl font-bold">{value.toLocaleString()}</p>
          {subtitle && <p className="text-xs text-muted mt-1">{subtitle}</p>}
        </div>
        <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
          <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
          </svg>
        </div>
      </div>
    </div>
  )
}
