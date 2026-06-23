'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import api from '@/services/api'
import { getErrorMessage } from '@/utils/error'

// ============================================
// TYPES
// ============================================

type Period = '7d' | '30d' | '90d'

type SortKey = 'views' | 'likes' | 'comments' | 'shares' | 'date'
type SortDir = 'asc' | 'desc'

interface StatSummary {
  current: number
  previous: number
  changePercent: number
}

interface ImpressionsPoint {
  date: string
  views: number
}

interface TopPost {
  id: string
  title: string
  views: number
  likes: number
  comments: number
  shares: number
  date: string
}

interface LanguageStat {
  language: string
  count: number
  percentage: number
}

interface LocationStat {
  country: string
  count: number
}

interface ReferralStat {
  source: 'direct' | 'search' | 'social' | string
  count: number
  percentage: number
}

interface DashboardData {
  stats: {
    views: StatSummary
    likes: StatSummary
    comments: StatSummary
    followersGained: StatSummary
  }
  impressions: ImpressionsPoint[]
  topPosts: TopPost[]
  languages: LanguageStat[]
  audience: {
    locations: LocationStat[]
    referrals: ReferralStat[]
  }
}

// ============================================
// HELPERS
// ============================================

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function formatDate(iso: string, short = false): string {
  const d = new Date(iso)
  if (short) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ============================================
// STAT CARD
// ============================================

interface StatCardProps {
  title: string
  value: number
  changePercent: number
}

function StatCard({ title, value, changePercent }: StatCardProps) {
  const positive = changePercent >= 0
  const arrow = positive ? '↑' : '↓'
  const colorClass = positive ? 'text-[var(--accent)]' : 'text-[var(--error)]'
  const absChange = Math.abs(changePercent).toFixed(1)

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 flex flex-col gap-2">
      <p className="text-xs font-medium text-[var(--foreground-secondary)] uppercase tracking-wider">
        {title}
      </p>
      <p className="text-3xl font-bold text-[var(--foreground)]">{formatNum(value)}</p>
      <p className={`text-sm font-medium flex items-center gap-1 ${colorClass}`}>
        <span>{arrow}</span>
        <span>{absChange}% vs prior period</span>
      </p>
    </div>
  )
}

// ============================================
// SVG LINE CHART
// ============================================

interface TooltipState {
  x: number
  y: number
  date: string
  value: number
}

interface LineChartProps {
  data: ImpressionsPoint[]
}

function LineChart({ data }: LineChartProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const W = 800
  const H = 200
  const PAD_LEFT = 50
  const PAD_RIGHT = 20
  const PAD_TOP = 16
  const PAD_BOTTOM = 30

  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-[var(--foreground-secondary)]">
        No impression data available
      </div>
    )
  }

  const maxVal = Math.max(...data.map((d) => d.views), 1)
  const minVal = 0

  const chartW = W - PAD_LEFT - PAD_RIGHT
  const chartH = H - PAD_TOP - PAD_BOTTOM

  const toX = (i: number) =>
    PAD_LEFT + (i / Math.max(data.length - 1, 1)) * chartW
  const toY = (v: number) =>
    PAD_TOP + chartH - ((v - minVal) / (maxVal - minVal)) * chartH

  const linePath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(d.views)}`)
    .join(' ')

  const areaPath =
    linePath +
    ` L ${toX(data.length - 1)} ${PAD_TOP + chartH} L ${toX(0)} ${PAD_TOP + chartH} Z`

  // Y-axis labels (4 ticks)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(minVal + t * maxVal))

  // X-axis: show up to 7 evenly-spaced labels
  const xLabelIndices: number[] = []
  const step = Math.max(1, Math.floor((data.length - 1) / 6))
  for (let i = 0; i < data.length; i += step) xLabelIndices.push(i)
  if (xLabelIndices[xLabelIndices.length - 1] !== data.length - 1)
    xLabelIndices.push(data.length - 1)

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const relX = ((e.clientX - rect.left) / rect.width) * W
    const chartRelX = relX - PAD_LEFT
    const index = Math.round(
      (chartRelX / chartW) * (data.length - 1)
    )
    const clamped = Math.max(0, Math.min(data.length - 1, index))
    const point = data[clamped]
    setTooltip({
      x: toX(clamped),
      y: toY(point.views),
      date: point.date,
      value: point.views,
    })
  }

  const handleMouseLeave = () => setTooltip(null)

  return (
    <div className="relative select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 200 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#7C3AED" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD_LEFT}
              x2={W - PAD_RIGHT}
              y1={toY(tick)}
              y2={toY(tick)}
              stroke="var(--border)"
              strokeWidth="0.5"
              strokeDasharray="4 4"
            />
            <text
              x={PAD_LEFT - 6}
              y={toY(tick) + 4}
              textAnchor="end"
              fontSize="10"
              fill="var(--foreground-secondary)"
            >
              {formatNum(tick)}
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {xLabelIndices.map((idx) => (
          <text
            key={idx}
            x={toX(idx)}
            y={H - 4}
            textAnchor="middle"
            fontSize="10"
            fill="var(--foreground-secondary)"
          >
            {formatDate(data[idx].date, true)}
          </text>
        ))}

        {/* Area fill */}
        <path d={areaPath} fill="url(#area-grad)" />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke="#7C3AED"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Tooltip dot */}
        {tooltip && (
          <>
            <line
              x1={tooltip.x}
              x2={tooltip.x}
              y1={PAD_TOP}
              y2={PAD_TOP + chartH}
              stroke="#7C3AED"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <circle cx={tooltip.x} cy={tooltip.y} r="5" fill="#7C3AED" />
            <circle
              cx={tooltip.x}
              cy={tooltip.y}
              r="8"
              fill="#7C3AED"
              fillOpacity="0.25"
            />
          </>
        )}
      </svg>

      {/* Floating tooltip box */}
      {tooltip && (
        <div
          className="pointer-events-none absolute bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${(tooltip.x / W) * 100}%`,
            top: `${(tooltip.y / H) * 100}%`,
            transform: 'translate(-50%, -130%)',
          }}
        >
          <p className="text-[var(--foreground-secondary)]">
            {formatDate(tooltip.date, true)}
          </p>
          <p className="text-[var(--foreground)] font-semibold">
            {tooltip.value.toLocaleString()} views
          </p>
        </div>
      )}
    </div>
  )
}

// ============================================
// LANGUAGE BAR CHART
// ============================================

interface LanguageBarChartProps {
  data: LanguageStat[]
}

const LANG_COLORS = [
  '#7C3AED',
  '#2563EB',
  '#059669',
  '#D97706',
  '#DC2626',
  '#0891B2',
  '#7C3AED',
]

function LanguageBarChart({ data }: LanguageBarChartProps) {
  if (data.length === 0) {
    return (
      <p className="text-[var(--foreground-secondary)] text-sm">
        No language data available
      </p>
    )
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1)

  return (
    <ul className="space-y-3">
      {data.map((lang, i) => (
        <li key={lang.language}>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-[var(--foreground)] font-medium capitalize">
              {lang.language}
            </span>
            <span className="text-[var(--foreground-secondary)]">
              {lang.count.toLocaleString()} &middot; {lang.percentage.toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-[var(--background)] rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all duration-500"
              style={{
                width: `${(lang.count / maxCount) * 100}%`,
                backgroundColor: LANG_COLORS[i % LANG_COLORS.length],
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

// ============================================
// TOP POSTS TABLE
// ============================================

interface TopPostsTableProps {
  posts: TopPost[]
}

function TopPostsTable({ posts }: TopPostsTableProps) {
  const router = useRouter()
  const [sortKey, setSortKey] = useState<SortKey>('views')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sorted = [...posts].sort((a, b) => {
    let av: number | string = a[sortKey]
    let bv: number | string = b[sortKey]
    if (sortKey === 'date') {
      av = new Date(a.date).getTime()
      bv = new Date(b.date).getTime()
    }
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const colClass =
    'py-3 px-3 text-xs font-semibold uppercase tracking-wider text-[var(--foreground-secondary)] select-none cursor-pointer hover:text-[var(--foreground)] transition-colors'

  const indicator = (key: SortKey) => {
    if (key !== sortKey) return <span className="opacity-30 ml-1">↕</span>
    return (
      <span className="ml-1 text-[#7C3AED]">{sortDir === 'asc' ? '↑' : '↓'}</span>
    )
  }

  if (posts.length === 0) {
    return (
      <p className="text-[var(--foreground-secondary)] text-sm py-4 text-center">
        No posts to display
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className={`${colClass} text-left`}>Post</th>
            <th
              className={`${colClass} text-right`}
              onClick={() => handleSort('views')}
            >
              Views{indicator('views')}
            </th>
            <th
              className={`${colClass} text-right`}
              onClick={() => handleSort('likes')}
            >
              Likes{indicator('likes')}
            </th>
            <th
              className={`${colClass} text-right`}
              onClick={() => handleSort('comments')}
            >
              Comments{indicator('comments')}
            </th>
            <th
              className={`${colClass} text-right`}
              onClick={() => handleSort('shares')}
            >
              Shares{indicator('shares')}
            </th>
            <th
              className={`${colClass} text-right`}
              onClick={() => handleSort('date')}
            >
              Date{indicator('date')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((post) => (
            <tr
              key={post.id}
              className="border-b border-[var(--border)] hover:bg-[var(--surface-secondary)] cursor-pointer transition-colors"
              onClick={() => router.push(`/posts/${post.id}`)}
            >
              <td className="py-3 px-3 text-[var(--foreground)] max-w-xs">
                <p className="truncate font-medium">{post.title || 'Untitled post'}</p>
              </td>
              <td className="py-3 px-3 text-right text-[var(--foreground)]">
                {formatNum(post.views)}
              </td>
              <td className="py-3 px-3 text-right text-[var(--foreground)]">
                {formatNum(post.likes)}
              </td>
              <td className="py-3 px-3 text-right text-[var(--foreground)]">
                {formatNum(post.comments)}
              </td>
              <td className="py-3 px-3 text-right text-[var(--foreground)]">
                {formatNum(post.shares)}
              </td>
              <td className="py-3 px-3 text-right text-[var(--foreground-secondary)] whitespace-nowrap">
                {formatDate(post.date, true)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============================================
// AUDIENCE SECTION
// ============================================

interface AudienceProps {
  locations: LocationStat[]
  referrals: ReferralStat[]
}

function AudienceSection({ locations, referrals }: AudienceProps) {
  const maxLoc = Math.max(...locations.map((l) => l.count), 1)
  const maxRef = Math.max(...referrals.map((r) => r.count), 1)

  const referralColor = (source: string) => {
    if (source === 'direct') return '#7C3AED'
    if (source === 'search') return '#2563EB'
    if (source === 'social') return '#059669'
    return '#6B7280'
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Top locations */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
        <h3 className="text-base font-semibold text-[var(--foreground)] mb-4">
          Top Locations
        </h3>
        {locations.length === 0 ? (
          <p className="text-[var(--foreground-secondary)] text-sm">
            No location data yet
          </p>
        ) : (
          <ul className="space-y-3">
            {locations.map((loc) => (
              <li key={loc.country} className="flex items-center gap-3">
                <span className="text-sm text-[var(--foreground)] w-32 truncate">
                  {loc.country}
                </span>
                <div className="flex-1 bg-[var(--background)] rounded-full h-2">
                  <div
                    className="h-2 rounded-full bg-[#7C3AED] transition-all duration-500"
                    style={{ width: `${(loc.count / maxLoc) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-[var(--foreground-secondary)] w-12 text-right">
                  {formatNum(loc.count)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Referral sources */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
        <h3 className="text-base font-semibold text-[var(--foreground)] mb-4">
          Referral Sources
        </h3>
        {referrals.length === 0 ? (
          <p className="text-[var(--foreground-secondary)] text-sm">
            No referral data yet
          </p>
        ) : (
          <ul className="space-y-3">
            {referrals.map((ref) => (
              <li key={ref.source} className="flex items-center gap-3">
                <span
                  className="text-sm font-medium capitalize w-20 truncate"
                  style={{ color: referralColor(ref.source) }}
                >
                  {ref.source}
                </span>
                <div className="flex-1 bg-[var(--background)] rounded-full h-2">
                  <div
                    className="h-2 rounded-full transition-all duration-500"
                    style={{
                      width: `${(ref.count / maxRef) * 100}%`,
                      backgroundColor: referralColor(ref.source),
                    }}
                  />
                </div>
                <span className="text-xs text-[var(--foreground-secondary)] w-20 text-right">
                  {formatNum(ref.count)} · {ref.percentage.toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ============================================
// MAIN PAGE
// ============================================

export default function AnalyticsDashboardPage() {
  const [period, setPeriod] = useState<Period>('7d')
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDashboard = useCallback(async (p: Period) => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<DashboardData>(`/v1/analytics/dashboard?period=${p}`)
      setData(res.data)
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboard(period)
  }, [fetchDashboard, period])

  const handlePeriodChange = (p: Period) => {
    setPeriod(p)
  }

  const periods: { value: Period; label: string }[] = [
    { value: '7d', label: '7d' },
    { value: '30d', label: '30d' },
    { value: '90d', label: '90d' },
  ]

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 space-y-8">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">Analytics</h1>
            <p className="text-sm text-[var(--foreground-secondary)] mt-1">
              Post performance and audience insights
            </p>
          </div>

          {/* Period selector */}
          <div className="flex items-center gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-1">
            {periods.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => handlePeriodChange(value)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  period === value
                    ? 'bg-[#7C3AED] text-white'
                    : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Loading ── */}
        {loading && (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* ── Error ── */}
        {!loading && error && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8 text-center space-y-3">
            <p className="text-[var(--error)]">{error}</p>
            <button
              onClick={() => fetchDashboard(period)}
              className="px-4 py-2 bg-[#7C3AED] text-white rounded-lg text-sm hover:bg-[#6D28D9] transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* ── Content ── */}
        {!loading && !error && data && (
          <>
            {/* Stats cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Total Views"
                value={data.stats.views.current}
                changePercent={data.stats.views.changePercent}
              />
              <StatCard
                title="Total Likes"
                value={data.stats.likes.current}
                changePercent={data.stats.likes.changePercent}
              />
              <StatCard
                title="Total Comments"
                value={data.stats.comments.current}
                changePercent={data.stats.comments.changePercent}
              />
              <StatCard
                title="Followers Gained"
                value={data.stats.followersGained.current}
                changePercent={data.stats.followersGained.changePercent}
              />
            </div>

            {/* Impressions chart */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
              <h2 className="text-base font-semibold text-[var(--foreground)] mb-4">
                Impressions Over Time
              </h2>
              <LineChart data={data.impressions} />
            </div>

            {/* Top posts table */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
              <h2 className="text-base font-semibold text-[var(--foreground)] mb-4">
                Top Posts
              </h2>
              <TopPostsTable posts={data.topPosts} />
            </div>

            {/* Language breakdown */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
              <h2 className="text-base font-semibold text-[var(--foreground)] mb-4">
                Language Breakdown
              </h2>
              <LanguageBarChart data={data.languages} />
            </div>

            {/* Audience */}
            <div>
              <h2 className="text-base font-semibold text-[var(--foreground)] mb-4">
                Audience
              </h2>
              <AudienceSection
                locations={data.audience.locations}
                referrals={data.audience.referrals}
              />
            </div>
          </>
        )}

        {/* ── Empty state ── */}
        {!loading && !error && !data && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-12 text-center">
            <p className="text-[var(--foreground-secondary)]">
              No analytics data available yet. Start posting to see your stats.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
