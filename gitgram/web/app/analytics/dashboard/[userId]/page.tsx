'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  analyticsService,
  UserFollowerAnalytics,
  UserEngagementAnalytics,
  UserContentAnalytics,
  FollowerGrowthPoint,
  ContentPerformancePost,
} from '@/services/analyticsService'
import { getErrorMessage } from '@/utils/error'

// ============================================
// CHART COMPONENTS
// ============================================

function FollowerGrowthChart({ data, color = '#22c55e' }: {
  data: FollowerGrowthPoint[]
  color?: string
}) {
  if (!data || data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-foreground/50">
        No follower data available
      </div>
    )
  }

  const maxValue = Math.max(...data.map(d => d.cumulativeTotal), 1)
  const minValue = Math.min(...data.map(d => d.cumulativeTotal), 0)
  const range = maxValue - minValue || 1

  const points = data.map((d, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * 100
    const y = 100 - ((d.cumulativeTotal - minValue) / range) * 90 - 5
    return { x, y, value: d.cumulativeTotal, date: d.date, netChange: d.netChange }
  })

  const pathD = points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
  ).join(' ')

  const areaD = pathD + ` L ${points[points.length - 1]?.x || 0} 100 L ${points[0]?.x || 0} 100 Z`

  return (
    <div className="h-48 relative">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-40">
        <defs>
          <linearGradient id="follower-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#follower-gradient)" />
        <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="1.5" fill={color} className="hover:r-3 transition-all">
            <title>{`${p.date}: ${p.value} total (${p.netChange >= 0 ? '+' : ''}${p.netChange})`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between mt-2 text-[10px] text-foreground/50">
        {data.length > 0 && <span>{data[0]?.date?.split('-').slice(1).join('/')}</span>}
        {data.length > 1 && <span>{data[data.length - 1]?.date?.split('-').slice(1).join('/')}</span>}
      </div>
    </div>
  )
}

function EngagementTrendChart({ data, color = '#3b82f6' }: {
  data: { date: string; engagementRate: number }[]
  color?: string
}) {
  if (!data || data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-foreground/50">
        No engagement data available
      </div>
    )
  }

  const maxValue = Math.max(...data.map(d => d.engagementRate), 1)

  const points = data.map((d, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * 100
    const y = 100 - (d.engagementRate / maxValue) * 90 - 5
    return { x, y, value: d.engagementRate, date: d.date }
  })

  const pathD = points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
  ).join(' ')

  const areaD = pathD + ` L ${points[points.length - 1]?.x || 0} 100 L ${points[0]?.x || 0} 100 Z`

  return (
    <div className="h-48 relative">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-40">
        <defs>
          <linearGradient id="engagement-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#engagement-gradient)" />
        <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="1.5" fill={color}>
            <title>{`${p.date}: ${p.value}%`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between mt-2 text-[10px] text-foreground/50">
        {data.length > 0 && <span>{data[0]?.date?.split('-').slice(1).join('/')}</span>}
        {data.length > 1 && <span>{data[data.length - 1]?.date?.split('-').slice(1).join('/')}</span>}
      </div>
    </div>
  )
}

function InteractionBreakdownChart({ data }: {
  data: { type: string; count: number; percentage: number }[]
}) {
  if (!data || data.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-foreground/50">
        No interaction data
      </div>
    )
  }

  const colors: Record<string, string> = {
    likes: '#ef4444',
    comments: '#3b82f6',
    saves: '#f59e0b',
    shares: '#8b5cf6',
  }

  const totalCount = data.reduce((sum, d) => sum + d.count, 0)

  return (
    <div className="space-y-4">
      {/* Stacked bar */}
      <div className="w-full h-6 rounded-full overflow-hidden flex bg-background">
        {data.filter(d => d.count > 0).map((item, i) => (
          <div
            key={i}
            className="h-full transition-all"
            style={{
              width: `${item.percentage}%`,
              backgroundColor: colors[item.type] || '#6b7280',
            }}
            title={`${item.type}: ${item.count} (${item.percentage}%)`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-3">
        {data.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: colors[item.type] || '#6b7280' }}
            />
            <span className="text-sm text-foreground/70 capitalize">{item.type}</span>
            <span className="text-sm font-medium text-foreground ml-auto">{item.count}</span>
            <span className="text-xs text-foreground/50">({item.percentage}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DailyBarChart({ data, dataKey, label, color = '#3b82f6' }: {
  data: any[]
  dataKey: string
  label: string
  color?: string
}) {
  if (!data || data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-foreground/50">
        No data available
      </div>
    )
  }

  const displayData = data.slice(-14)
  const maxValue = Math.max(...displayData.map(d => d[dataKey] || 0), 1)

  return (
    <div className="h-48">
      <div className="flex items-end gap-1 h-40">
        {displayData.map((day, i) => (
          <div key={i} className="flex-1 flex flex-col items-center group relative">
            <div className="hidden group-hover:block absolute -top-8 bg-surface border border-border rounded px-2 py-1 text-xs text-foreground whitespace-nowrap z-10">
              {day[dataKey] || 0} {label}
            </div>
            <div
              className="w-full rounded-t transition-all hover:opacity-80"
              style={{
                height: `${((day[dataKey] || 0) / maxValue) * 100}%`,
                minHeight: day[dataKey] > 0 ? '4px' : '0',
                backgroundColor: color,
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1 mt-2">
        {displayData.map((day, i) => (
          <div key={i} className="flex-1 text-center text-[10px] text-foreground/50">
            {day.date ? new Date(day.date).getDate() : i + 1}
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================
// STAT CARD COMPONENT
// ============================================

function StatCard({ title, value, change, subtitle }: {
  title: string
  value: string | number
  change?: string
  subtitle?: string
}) {
  const isPositive = change?.startsWith('+')
  const isNegative = change?.startsWith('-')

  return (
    <div className="bg-surface rounded-xl p-5 border border-border">
      <p className="text-foreground/60 text-sm mb-1">{title}</p>
      <p className="text-2xl font-bold text-foreground">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {change && (
        <p className={`text-sm mt-1 ${isPositive ? 'text-green-500' : isNegative ? 'text-red-500' : 'text-foreground/50'}`}>
          {change}
        </p>
      )}
      {subtitle && <p className="text-xs text-foreground/40 mt-1">{subtitle}</p>}
    </div>
  )
}

// ============================================
// CONTENT PERFORMANCE TABLE
// ============================================

function ContentPerformanceTable({ posts }: { posts: ContentPerformancePost[] }) {
  if (!posts || posts.length === 0) {
    return (
      <div className="py-8 text-center text-foreground/50">
        No posts to show
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-2 text-foreground/60 font-medium text-sm">#</th>
            <th className="text-left py-3 px-2 text-foreground/60 font-medium text-sm">Post</th>
            <th className="text-left py-3 px-2 text-foreground/60 font-medium text-sm">Type</th>
            <th className="text-right py-3 px-2 text-foreground/60 font-medium text-sm">Likes</th>
            <th className="text-right py-3 px-2 text-foreground/60 font-medium text-sm">Comments</th>
            <th className="text-right py-3 px-2 text-foreground/60 font-medium text-sm">Saves</th>
            <th className="text-right py-3 px-2 text-foreground/60 font-medium text-sm">Views</th>
            <th className="text-right py-3 px-2 text-foreground/60 font-medium text-sm">Rate</th>
            <th className="text-right py-3 px-2 text-foreground/60 font-medium text-sm">Score</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((post, i) => (
            <tr key={post.id} className="border-b border-border/50 hover:bg-background transition-colors">
              <td className="py-3 px-2 text-foreground/50 font-mono">{i + 1}</td>
              <td className="py-3 px-2 text-foreground max-w-[200px]">
                <div className="truncate">{post.content || 'Media post'}</div>
                <span className="text-xs text-foreground/40">
                  {new Date(post.createdAt).toLocaleDateString()}
                </span>
              </td>
              <td className="py-3 px-2">
                <span className="text-xs bg-blue-500/10 text-blue-500 px-2 py-1 rounded-full">
                  {post.type}
                </span>
              </td>
              <td className="py-3 px-2 text-right text-foreground">{post.likes}</td>
              <td className="py-3 px-2 text-right text-foreground">{post.comments}</td>
              <td className="py-3 px-2 text-right text-foreground">{post.saves}</td>
              <td className="py-3 px-2 text-right text-foreground">{post.views.toLocaleString()}</td>
              <td className="py-3 px-2 text-right text-foreground">{post.engagementRate}%</td>
              <td className="py-3 px-2 text-right font-medium text-foreground">{post.engagementScore}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============================================
// MAIN DASHBOARD PAGE
// ============================================

export default function UserAnalyticsDashboard() {
  const params = useParams()
  const userId = params.userId as string

  const [days, setDays] = useState(30)
  const [activeTab, setActiveTab] = useState<'followers' | 'engagement' | 'content'>('followers')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Data states
  const [followerData, setFollowerData] = useState<UserFollowerAnalytics | null>(null)
  const [engagementData, setEngagementData] = useState<UserEngagementAnalytics | null>(null)
  const [contentData, setContentData] = useState<UserContentAnalytics | null>(null)

  const fetchAnalytics = useCallback(async () => {
    if (!userId) return

    setLoading(true)
    setError(null)

    try {
      const [followers, engagement, content] = await Promise.all([
        analyticsService.getUserFollowers(userId, days).catch(() => null),
        analyticsService.getUserEngagement(userId, days).catch(() => null),
        analyticsService.getUserContent(userId, days).catch(() => null),
      ])

      setFollowerData(followers)
      setEngagementData(engagement)
      setContentData(content)
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [userId, days])

  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-foreground/60">Loading analytics...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={fetchAnalytics}
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
      <div className="max-w-7xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <Link href="/analytics" className="text-foreground/50 hover:text-foreground transition-colors">
                Analytics
              </Link>
              <span className="text-foreground/30">/</span>
              <h1 className="text-3xl font-bold text-foreground">User Dashboard</h1>
            </div>
            <p className="text-foreground/60 mt-1">Follow, follower, and engagement analytics</p>
          </div>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 mb-8 bg-surface rounded-lg p-1 border border-border overflow-x-auto">
          {(['followers', 'engagement', 'content'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? 'bg-blue-500 text-white'
                  : 'text-foreground/60 hover:text-foreground hover:bg-background'
              }`}
            >
              {tab === 'followers' ? 'Followers' :
               tab === 'engagement' ? 'Engagement' : 'Content'}
            </button>
          ))}
        </div>

        {/* ========== FOLLOWERS TAB ========== */}
        {activeTab === 'followers' && followerData && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard
                title="Total Followers"
                value={followerData.totalFollowers}
              />
              <StatCard
                title="Total Following"
                value={followerData.totalFollowing}
              />
              <StatCard
                title="Net Change"
                value={followerData.periodNetChange}
                change={`${followerData.periodNetChange >= 0 ? '+' : ''}${followerData.followerGrowthRate}% growth`}
                subtitle={`Last ${days} days`}
              />
              <StatCard
                title="Retention Rate"
                value={`${followerData.retentionRate}%`}
                change={
                  followerData.retentionRate >= 90
                    ? 'Excellent'
                    : followerData.retentionRate >= 70
                    ? 'Good'
                    : 'Needs attention'
                }
              />
            </div>

            {/* New vs Unfollows */}
            <div className="grid grid-cols-2 gap-4 mb-8">
              <StatCard
                title="New Followers"
                value={followerData.periodNewFollowers}
                subtitle={`Last ${days} days`}
              />
              <StatCard
                title="Unfollows"
                value={followerData.periodUnfollows}
                subtitle={`Last ${days} days`}
              />
            </div>

            {/* Follower Growth Chart */}
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <div className="bg-surface rounded-xl p-6 border border-border">
                <h3 className="text-lg font-semibold text-foreground mb-4">Follower Growth (Cumulative)</h3>
                <FollowerGrowthChart
                  data={followerData.dailyGrowth}
                  color="#22c55e"
                />
              </div>
              <div className="bg-surface rounded-xl p-6 border border-border">
                <h3 className="text-lg font-semibold text-foreground mb-4">Daily New Followers</h3>
                <DailyBarChart
                  data={followerData.dailyGrowth}
                  dataKey="newFollowers"
                  label="new followers"
                  color="#3b82f6"
                />
              </div>
            </div>

            {/* Top Followers */}
            {followerData.topFollowers.length > 0 && (
              <div className="bg-surface rounded-xl p-6 border border-border">
                <h3 className="text-lg font-semibold text-foreground mb-4">Top Followers by Reach</h3>
                <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {followerData.topFollowers.map((follower) => (
                    <div
                      key={follower.userId}
                      className="flex items-center gap-3 p-3 bg-background rounded-lg"
                    >
                      <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-500 font-bold text-sm">
                        {follower.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground text-sm font-medium truncate">
                          {follower.displayName || follower.username}
                        </p>
                        <p className="text-foreground/50 text-xs">
                          {follower.followerCount.toLocaleString()} followers
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ========== ENGAGEMENT TAB ========== */}
        {activeTab === 'engagement' && engagementData && (
          <>
            {/* Engagement Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard
                title="Engagement Rate"
                value={`${engagementData.engagementRate}%`}
                change={engagementData.periodComparison.engagementRateChange}
              />
              <StatCard
                title="Total Interactions"
                value={engagementData.totalInteractions}
              />
              <StatCard
                title="Total Views"
                value={engagementData.totalViews}
                change={engagementData.periodComparison.viewsChange}
              />
              <StatCard
                title="Avg Likes/Post"
                value={engagementData.avgLikesPerPost}
              />
            </div>

            {/* Per-metric cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard
                title="Likes"
                value={engagementData.totalLikes}
                change={engagementData.periodComparison.likesChange}
              />
              <StatCard
                title="Comments"
                value={engagementData.totalComments}
                change={engagementData.periodComparison.commentsChange}
              />
              <StatCard
                title="Saves"
                value={engagementData.totalSaves}
              />
              <StatCard
                title="Shares"
                value={engagementData.totalShares}
              />
            </div>

            {/* Charts Row */}
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <div className="bg-surface rounded-xl p-6 border border-border">
                <h3 className="text-lg font-semibold text-foreground mb-4">Engagement Rate Trend</h3>
                <EngagementTrendChart
                  data={engagementData.dailyEngagement}
                  color="#8b5cf6"
                />
              </div>
              <div className="bg-surface rounded-xl p-6 border border-border">
                <h3 className="text-lg font-semibold text-foreground mb-4">Daily Likes</h3>
                <DailyBarChart
                  data={engagementData.dailyEngagement}
                  dataKey="likes"
                  label="likes"
                  color="#ef4444"
                />
              </div>
            </div>

            {/* Interaction Breakdown */}
            <div className="bg-surface rounded-xl p-6 border border-border mb-8">
              <h3 className="text-lg font-semibold text-foreground mb-4">Interaction Breakdown</h3>
              <InteractionBreakdownChart data={engagementData.interactionBreakdown} />
            </div>

            {/* Period Comparison */}
            <div className="bg-surface rounded-xl p-6 border border-border">
              <h3 className="text-lg font-semibold text-foreground mb-4">Period Comparison</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <p className="text-foreground/60 text-sm">Likes</p>
                  <p className="text-xl font-bold text-foreground">{engagementData.periodComparison.current.likes}</p>
                  <p className="text-sm text-foreground/50">vs {engagementData.periodComparison.previous.likes} prev</p>
                  <p className={`text-sm ${engagementData.periodComparison.likesChange.startsWith('+') ? 'text-green-500' : engagementData.periodComparison.likesChange.startsWith('-') ? 'text-red-500' : 'text-foreground/50'}`}>
                    {engagementData.periodComparison.likesChange}
                  </p>
                </div>
                <div>
                  <p className="text-foreground/60 text-sm">Comments</p>
                  <p className="text-xl font-bold text-foreground">{engagementData.periodComparison.current.comments}</p>
                  <p className="text-sm text-foreground/50">vs {engagementData.periodComparison.previous.comments} prev</p>
                  <p className={`text-sm ${engagementData.periodComparison.commentsChange.startsWith('+') ? 'text-green-500' : engagementData.periodComparison.commentsChange.startsWith('-') ? 'text-red-500' : 'text-foreground/50'}`}>
                    {engagementData.periodComparison.commentsChange}
                  </p>
                </div>
                <div>
                  <p className="text-foreground/60 text-sm">Views</p>
                  <p className="text-xl font-bold text-foreground">{engagementData.periodComparison.current.views.toLocaleString()}</p>
                  <p className="text-sm text-foreground/50">vs {engagementData.periodComparison.previous.views.toLocaleString()} prev</p>
                  <p className={`text-sm ${engagementData.periodComparison.viewsChange.startsWith('+') ? 'text-green-500' : engagementData.periodComparison.viewsChange.startsWith('-') ? 'text-red-500' : 'text-foreground/50'}`}>
                    {engagementData.periodComparison.viewsChange}
                  </p>
                </div>
                <div>
                  <p className="text-foreground/60 text-sm">Eng. Rate</p>
                  <p className="text-xl font-bold text-foreground">{engagementData.periodComparison.current.engagementRate}%</p>
                  <p className="text-sm text-foreground/50">vs {engagementData.periodComparison.previous.engagementRate}% prev</p>
                  <p className={`text-sm ${engagementData.periodComparison.engagementRateChange.startsWith('+') ? 'text-green-500' : engagementData.periodComparison.engagementRateChange.startsWith('-') ? 'text-red-500' : 'text-foreground/50'}`}>
                    {engagementData.periodComparison.engagementRateChange}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ========== CONTENT TAB ========== */}
        {activeTab === 'content' && contentData && (
          <>
            {/* Content Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard
                title="Total Posts"
                value={contentData.totalPosts}
                subtitle={`Last ${days} days`}
              />
              <StatCard
                title="Avg Engagement/Post"
                value={contentData.avgEngagementPerPost}
              />
              <StatCard
                title="Best Day"
                value={contentData.bestPerformingDay || 'N/A'}
              />
              <StatCard
                title="Best Hour"
                value={contentData.bestPerformingHour !== null
                  ? `${contentData.bestPerformingHour.toString().padStart(2, '0')}:00`
                  : 'N/A'
                }
              />
            </div>

            {/* Performance by Type */}
            {contentData.performanceByType.length > 0 && (
              <div className="bg-surface rounded-xl p-6 border border-border mb-8">
                <h3 className="text-lg font-semibold text-foreground mb-4">Performance by Content Type</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-2 text-foreground/60 font-medium text-sm">Type</th>
                        <th className="text-right py-3 px-2 text-foreground/60 font-medium text-sm">Count</th>
                        <th className="text-right py-3 px-2 text-foreground/60 font-medium text-sm">Avg Likes</th>
                        <th className="text-right py-3 px-2 text-foreground/60 font-medium text-sm">Avg Comments</th>
                        <th className="text-right py-3 px-2 text-foreground/60 font-medium text-sm">Avg Views</th>
                        <th className="text-right py-3 px-2 text-foreground/60 font-medium text-sm">Avg Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contentData.performanceByType.map((type) => (
                        <tr key={type.type} className="border-b border-border/50 hover:bg-background transition-colors">
                          <td className="py-3 px-2">
                            <span className="text-xs bg-blue-500/10 text-blue-500 px-2 py-1 rounded-full">
                              {type.type}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-right text-foreground">{type.count}</td>
                          <td className="py-3 px-2 text-right text-foreground">{type.avgLikes}</td>
                          <td className="py-3 px-2 text-right text-foreground">{type.avgComments}</td>
                          <td className="py-3 px-2 text-right text-foreground">{type.avgViews.toLocaleString()}</td>
                          <td className="py-3 px-2 text-right text-foreground font-medium">{type.avgEngagementRate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Posting Frequency */}
            {contentData.postingFrequency.length > 0 && (
              <div className="bg-surface rounded-xl p-6 border border-border mb-8">
                <h3 className="text-lg font-semibold text-foreground mb-4">Posting Frequency</h3>
                <DailyBarChart
                  data={contentData.postingFrequency}
                  dataKey="count"
                  label="posts"
                  color="#22c55e"
                />
              </div>
            )}

            {/* Content Performance Table */}
            <div className="bg-surface rounded-xl p-6 border border-border">
              <h3 className="text-lg font-semibold text-foreground mb-4">Top Performing Content</h3>
              <ContentPerformanceTable posts={contentData.topPosts} />
            </div>
          </>
        )}

        {/* No Data State */}
        {!loading && !followerData && !engagementData && !contentData && (
          <div className="bg-surface rounded-xl p-12 border border-border text-center mt-8">
            <p className="text-foreground/60 text-lg mb-2">No analytics data available</p>
            <p className="text-foreground/40">Analytics will appear once this user has activity</p>
          </div>
        )}
      </div>
    </div>
  )
}
