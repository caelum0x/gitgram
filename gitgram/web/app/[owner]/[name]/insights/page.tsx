'use client'

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import api from '@/services/api'

// ─── Types ──────────────────────────────────────────────────────────────────────

interface TimePoint {
  date: string // ISO date (YYYY-MM-DD)
  value: number
}

interface PulseInsights {
  rangeDays: number
  commits: number
  prsMerged: number
  prsOpened: number
  issuesClosed: number
  issuesOpened: number
  activeContributors: number
}

interface ContributorSeriesPoint {
  week: string // ISO date for start of week
  additions: number
  deletions: number
  commits: number
}

interface ContributorInsight {
  login: string
  avatarUrl: string | null
  totalCommits: number
  totalAdditions: number
  totalDeletions: number
  series: ContributorSeriesPoint[]
}

interface ReferrerRow {
  referrer: string
  count: number
  uniques: number
}

interface ContentPath {
  path: string
  title: string | null
  count: number
  uniques: number
}

interface TrafficInsights {
  views: TimePoint[]
  uniques: TimePoint[]
  totalViews: number
  totalUniques: number
  referrers: ReferrerRow[]
  paths: ContentPath[]
}

interface CommitActivityWeek {
  week: string // ISO date for start of week
  total: number
  days: number[] // length 7, Sun..Sat
}

interface CommitActivityInsights {
  weeks: CommitActivityWeek[]
}

interface CodeFrequencyPoint {
  week: string // ISO date for start of week
  additions: number
  deletions: number // stored as a positive number
}

interface CodeFrequencyInsights {
  weeks: CodeFrequencyPoint[]
}

interface LanguageBreakdown {
  name: string
  bytes: number
  percentage: number
  color: string
}

interface LanguagesInsights {
  total: number
  languages: LanguageBreakdown[]
}

type TabKey = 'pulse' | 'contributors' | 'traffic' | 'commits' | 'codeFrequency' | 'languages'

interface TabDef {
  key: TabKey
  label: string
}

// ─── Theme constants (CSS variable backed) ─────────────────────────────────────

const cssVars: Record<string, string> = {
  '--ins-bg': '#0d1117',
  '--ins-surface': '#161b22',
  '--ins-surface-alt': '#0d1117',
  '--ins-border': '#30363d',
  '--ins-border-muted': '#21262d',
  '--ins-text': '#e6edf3',
  '--ins-text-muted': '#8b949e',
  '--ins-text-soft': '#c9d1d9',
  '--ins-accent': '#238636',
  '--ins-accent-bright': '#2ea043',
  '--ins-blue': '#58a6ff',
  '--ins-purple': '#a371f7',
  '--ins-orange': '#db6d28',
  '--ins-danger': '#f85149',
  '--ins-add': '#2ea043',
  '--ins-del': '#f85149',
}

const TABS: readonly TabDef[] = [
  { key: 'pulse', label: 'Pulse' },
  { key: 'contributors', label: 'Contributors' },
  { key: 'traffic', label: 'Traffic' },
  { key: 'commits', label: 'Commits' },
  { key: 'codeFrequency', label: 'Code frequency' },
  { key: 'languages', label: 'Languages' },
]

const DAY_LABELS: readonly string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ─── Generic helpers ────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return n.toLocaleString('en-US')
}

function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return `${n}`
}

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function unwrap<T>(payload: { data?: T } | T): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as { data?: T })) {
    const inner = (payload as { data?: T }).data
    if (inner !== undefined) return inner
  }
  return payload as T
}

function buildPath(
  points: { x: number; y: number }[],
): string {
  if (points.length === 0) return ''
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ')
}

// ─── Chart primitives (inline SVG, no external lib) ─────────────────────────────

interface AreaChartProps {
  series: number[]
  width?: number
  height?: number
  stroke: string
  fill: string
  ariaLabel: string
}

/** Single-series filled area chart. */
function AreaChart({
  series,
  width = 320,
  height = 80,
  stroke,
  fill,
  ariaLabel,
}: AreaChartProps) {
  const pad = 4
  const max = Math.max(1, ...series)
  const innerW = width - pad * 2
  const innerH = height - pad * 2
  const step = series.length > 1 ? innerW / (series.length - 1) : 0

  const points = series.map((v, i) => ({
    x: pad + i * step,
    y: pad + innerH - (v / max) * innerH,
  }))

  const line = buildPath(points)
  const area =
    points.length > 0
      ? `${line} L ${(pad + innerW).toFixed(2)} ${(pad + innerH).toFixed(2)} L ${pad.toFixed(
          2,
        )} ${(pad + innerH).toFixed(2)} Z`
      : ''

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
    >
      {area && <path d={area} fill={fill} stroke="none" />}
      {line && <path d={line} fill="none" stroke={stroke} strokeWidth={1.5} />}
    </svg>
  )
}

interface LineSeries {
  values: number[]
  stroke: string
  label: string
}

interface MultiLineChartProps {
  series: LineSeries[]
  labels: string[]
  width?: number
  height?: number
  ariaLabel: string
}

/** Multi-series line chart with shared y-scale and x-axis ticks. */
function MultiLineChart({
  series,
  labels,
  width = 720,
  height = 240,
  ariaLabel,
}: MultiLineChartProps) {
  const padL = 44
  const padR = 12
  const padT = 12
  const padB = 28
  const innerW = width - padL - padR
  const innerH = height - padT - padB

  const allValues = series.flatMap((s) => s.values)
  const max = Math.max(1, ...allValues)
  const count = Math.max(1, ...series.map((s) => s.values.length))
  const step = count > 1 ? innerW / (count - 1) : 0

  const yTicks = useMemo(() => {
    const ticks: number[] = []
    const divisions = 4
    for (let i = 0; i <= divisions; i += 1) ticks.push((max / divisions) * i)
    return ticks
  }, [max])

  const labelStride = Math.max(1, Math.ceil(labels.length / 8))

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
    >
      {yTicks.map((t, i) => {
        const y = padT + innerH - (t / max) * innerH
        return (
          <g key={`y-${i}`}>
            <line
              x1={padL}
              y1={y}
              x2={width - padR}
              y2={y}
              stroke="var(--ins-border-muted)"
              strokeWidth={1}
            />
            <text
              x={padL - 8}
              y={y + 3}
              textAnchor="end"
              fontSize={10}
              fill="var(--ins-text-muted)"
            >
              {formatCompact(Math.round(t))}
            </text>
          </g>
        )
      })}

      {labels.map((lbl, i) => {
        if (i % labelStride !== 0 && i !== labels.length - 1) return null
        const x = padL + i * step
        return (
          <text
            key={`x-${i}`}
            x={x}
            y={height - 8}
            textAnchor="middle"
            fontSize={10}
            fill="var(--ins-text-muted)"
          >
            {formatShortDate(lbl)}
          </text>
        )
      })}

      {series.map((s, si) => {
        const points = s.values.map((v, i) => ({
          x: padL + i * step,
          y: padT + innerH - (v / max) * innerH,
        }))
        return (
          <path
            key={`line-${si}`}
            d={buildPath(points)}
            fill="none"
            stroke={s.stroke}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        )
      })}
    </svg>
  )
}

interface BarChartProps {
  values: number[]
  labels: string[]
  color: string
  width?: number
  height?: number
  ariaLabel: string
}

/** Vertical bar chart. */
function BarChart({
  values,
  labels,
  color,
  width = 720,
  height = 220,
  ariaLabel,
}: BarChartProps) {
  const padL = 44
  const padR = 12
  const padT = 12
  const padB = 28
  const innerW = width - padL - padR
  const innerH = height - padT - padB
  const max = Math.max(1, ...values)
  const slot = values.length > 0 ? innerW / values.length : innerW
  const barW = Math.max(1, slot * 0.6)
  const labelStride = Math.max(1, Math.ceil(labels.length / 10))

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
        const y = padT + innerH - frac * innerH
        return (
          <g key={`grid-${i}`}>
            <line
              x1={padL}
              y1={y}
              x2={width - padR}
              y2={y}
              stroke="var(--ins-border-muted)"
              strokeWidth={1}
            />
            <text
              x={padL - 8}
              y={y + 3}
              textAnchor="end"
              fontSize={10}
              fill="var(--ins-text-muted)"
            >
              {formatCompact(Math.round(max * frac))}
            </text>
          </g>
        )
      })}

      {values.map((v, i) => {
        const h = (v / max) * innerH
        const x = padL + i * slot + (slot - barW) / 2
        const y = padT + innerH - h
        return <rect key={`bar-${i}`} x={x} y={y} width={barW} height={h} rx={2} fill={color} />
      })}

      {labels.map((lbl, i) => {
        if (i % labelStride !== 0 && i !== labels.length - 1) return null
        const x = padL + i * slot + slot / 2
        return (
          <text
            key={`lbl-${i}`}
            x={x}
            y={height - 8}
            textAnchor="middle"
            fontSize={10}
            fill="var(--ins-text-muted)"
          >
            {formatShortDate(lbl)}
          </text>
        )
      })}
    </svg>
  )
}

/** Heatmap of commits by day-of-week across weeks. */
function DayOfWeekHeatmap({ weeks }: { weeks: CommitActivityWeek[] }) {
  const byDay = useMemo(() => {
    const totals = new Array<number>(7).fill(0)
    for (const w of weeks) {
      for (let d = 0; d < 7; d += 1) {
        totals[d] += w.days[d] ?? 0
      }
    }
    return totals
  }, [weeks])

  const max = Math.max(1, ...byDay)

  function intensity(value: number): string {
    const ratio = value / max
    if (ratio <= 0) return 'var(--ins-border-muted)'
    if (ratio < 0.25) return '#0e4429'
    if (ratio < 0.5) return '#006d32'
    if (ratio < 0.75) return '#26a641'
    return '#39d353'
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {byDay.map((value, d) => (
        <div key={d} style={{ textAlign: 'center', flex: '1 0 auto', minWidth: 72 }}>
          <div
            title={`${DAY_LABELS[d]}: ${formatNumber(value)} commits`}
            style={{
              height: 40,
              borderRadius: 6,
              background: intensity(value),
              border: '1px solid var(--ins-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ins-text)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {formatCompact(value)}
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--ins-text-muted)' }}>
            {DAY_LABELS[d]}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Shared UI fragments ────────────────────────────────────────────────────────

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section
      style={{
        background: 'var(--ins-surface)',
        border: '1px solid var(--ins-border)',
        borderRadius: 10,
        padding: 20,
        marginBottom: 20,
      }}
    >
      <header style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--ins-text)' }}>
          {title}
        </h2>
        {subtitle && (
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ins-text-muted)' }}>
            {subtitle}
          </p>
        )}
      </header>
      {children}
    </section>
  )
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent: string
}) {
  return (
    <div
      style={{
        background: 'var(--ins-surface-alt)',
        border: '1px solid var(--ins-border)',
        borderRadius: 8,
        padding: 16,
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 700, color: accent }}>{formatNumber(value)}</div>
      <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ins-text-muted)' }}>{label}</div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      <span
        style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block' }}
      />
      <span style={{ color: 'var(--ins-text-soft)' }}>{label}</span>
    </span>
  )
}

function StateMessage({ kind, children }: { kind: 'loading' | 'error' | 'empty'; children: React.ReactNode }) {
  const color =
    kind === 'error' ? 'var(--ins-danger)' : 'var(--ins-text-muted)'
  return (
    <div style={{ padding: 32, textAlign: 'center', color, fontSize: 14 }}>{children}</div>
  )
}

// ─── Data fetching hooks ────────────────────────────────────────────────────────

function useInsight<T>(owner: string, name: string, resource: string, enabled: boolean) {
  return useQuery<T>({
    queryKey: ['insights', owner, name, resource],
    enabled: enabled && Boolean(owner) && Boolean(name),
    queryFn: async () => {
      const res = await api.get<{ data?: T } | T>(
        `/v1/repositories/${owner}/${name}/insights/${resource}`,
      )
      return unwrap<T>(res.data)
    },
    staleTime: 60_000,
  })
}

// ─── Tab panels ─────────────────────────────────────────────────────────────────

function PulsePanel({ owner, name, active }: { owner: string; name: string; active: boolean }) {
  const { data, isLoading, isError } = useInsight<PulseInsights>(owner, name, 'pulse', active)

  if (isLoading) return <StateMessage kind="loading">Loading pulse…</StateMessage>
  if (isError || !data) return <StateMessage kind="error">Could not load pulse data.</StateMessage>

  return (
    <SectionCard
      title="Pulse"
      subtitle={`Summary of activity over the last ${data.rangeDays} days`}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
        }}
      >
        <StatTile label="Commits" value={data.commits} accent="var(--ins-blue)" />
        <StatTile label="PRs merged" value={data.prsMerged} accent="var(--ins-purple)" />
        <StatTile label="PRs opened" value={data.prsOpened} accent="var(--ins-accent-bright)" />
        <StatTile label="Issues closed" value={data.issuesClosed} accent="var(--ins-accent)" />
        <StatTile label="Issues opened" value={data.issuesOpened} accent="var(--ins-orange)" />
        <StatTile
          label="Active contributors"
          value={data.activeContributors}
          accent="var(--ins-text)"
        />
      </div>
    </SectionCard>
  )
}

function ContributorsPanel({ owner, name, active }: { owner: string; name: string; active: boolean }) {
  const { data, isLoading, isError } = useInsight<ContributorInsight[]>(
    owner,
    name,
    'contributors',
    active,
  )

  if (isLoading) return <StateMessage kind="loading">Loading contributors…</StateMessage>
  if (isError || !data) return <StateMessage kind="error">Could not load contributors.</StateMessage>
  if (data.length === 0) return <StateMessage kind="empty">No contributor activity yet.</StateMessage>

  const ranked = [...data].sort((a, b) => b.totalCommits - a.totalCommits)
  const top = ranked.slice(0, 10)

  return (
    <SectionCard title="Contributors" subtitle="Ranked by total commits, with contribution-over-time">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {top.map((c, idx) => (
          <article
            key={c.login}
            style={{
              display: 'grid',
              gridTemplateColumns: '40px 1fr 340px',
              gap: 16,
              alignItems: 'center',
              padding: '12px 0',
              borderTop: idx === 0 ? 'none' : '1px solid var(--ins-border-muted)',
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ins-text-muted)' }}>
              {idx + 1}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              {c.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.avatarUrl}
                  alt={c.login}
                  width={36}
                  height={36}
                  style={{ borderRadius: '50%', border: '1px solid var(--ins-border)' }}
                />
              ) : (
                <div
                  aria-hidden
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: 'var(--ins-surface-alt)',
                    border: '1px solid var(--ins-border)',
                  }}
                />
              )}
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    color: 'var(--ins-text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.login}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ins-text-muted)' }}>
                  {formatNumber(c.totalCommits)} commits ·{' '}
                  <span style={{ color: 'var(--ins-add)' }}>+{formatCompact(c.totalAdditions)}</span>{' '}
                  <span style={{ color: 'var(--ins-del)' }}>-{formatCompact(c.totalDeletions)}</span>
                </div>
              </div>
            </div>
            <AreaChart
              series={c.series.map((s) => s.commits)}
              stroke="var(--ins-accent-bright)"
              fill="rgba(46, 160, 67, 0.18)"
              ariaLabel={`Commit activity over time for ${c.login}`}
            />
          </article>
        ))}
      </div>
    </SectionCard>
  )
}

function TrafficPanel({ owner, name, active }: { owner: string; name: string; active: boolean }) {
  const { data, isLoading, isError } = useInsight<TrafficInsights>(owner, name, 'traffic', active)

  if (isLoading) return <StateMessage kind="loading">Loading traffic…</StateMessage>
  if (isError || !data) return <StateMessage kind="error">Could not load traffic data.</StateMessage>

  const labels = data.views.map((p) => p.date)

  return (
    <>
      <SectionCard
        title="Traffic"
        subtitle={`${formatNumber(data.totalViews)} views · ${formatNumber(
          data.totalUniques,
        )} unique visitors`}
      >
        <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
          <LegendDot color="var(--ins-blue)" label="Views" />
          <LegendDot color="var(--ins-purple)" label="Unique visitors" />
        </div>
        <MultiLineChart
          labels={labels}
          series={[
            { values: data.views.map((p) => p.value), stroke: 'var(--ins-blue)', label: 'Views' },
            {
              values: data.uniques.map((p) => p.value),
              stroke: 'var(--ins-purple)',
              label: 'Unique visitors',
            },
          ]}
          ariaLabel="Views and unique visitors over time"
        />
      </SectionCard>

      <SectionCard title="Referring sites">
        {data.referrers.length === 0 ? (
          <StateMessage kind="empty">No referrers recorded.</StateMessage>
        ) : (
          <DataTable
            head={['Referrer', 'Views', 'Uniques']}
            rows={data.referrers.map((r) => [r.referrer, formatNumber(r.count), formatNumber(r.uniques)])}
          />
        )}
      </SectionCard>

      <SectionCard title="Popular content">
        {data.paths.length === 0 ? (
          <StateMessage kind="empty">No content views recorded.</StateMessage>
        ) : (
          <DataTable
            head={['Path', 'Views', 'Uniques']}
            rows={data.paths.map((p) => [
              p.title ? `${p.title} (${p.path})` : p.path,
              formatNumber(p.count),
              formatNumber(p.uniques),
            ])}
          />
        )}
      </SectionCard>
    </>
  )
}

function DataTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={h}
                style={{
                  textAlign: i === 0 ? 'left' : 'right',
                  padding: '8px 12px',
                  color: 'var(--ins-text-muted)',
                  borderBottom: '1px solid var(--ins-border)',
                  fontWeight: 600,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    textAlign: ci === 0 ? 'left' : 'right',
                    padding: '8px 12px',
                    color: ci === 0 ? 'var(--ins-text)' : 'var(--ins-text-soft)',
                    borderBottom: '1px solid var(--ins-border-muted)',
                    maxWidth: ci === 0 ? 420 : undefined,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CommitsPanel({ owner, name, active }: { owner: string; name: string; active: boolean }) {
  const { data, isLoading, isError } = useInsight<CommitActivityInsights>(
    owner,
    name,
    'commit-activity',
    active,
  )

  if (isLoading) return <StateMessage kind="loading">Loading commit activity…</StateMessage>
  if (isError || !data) return <StateMessage kind="error">Could not load commit activity.</StateMessage>
  if (data.weeks.length === 0) return <StateMessage kind="empty">No commit activity yet.</StateMessage>

  return (
    <>
      <SectionCard title="Commits per week" subtitle="Total commits grouped by week">
        <BarChart
          values={data.weeks.map((w) => w.total)}
          labels={data.weeks.map((w) => w.week)}
          color="var(--ins-accent-bright)"
          ariaLabel="Commits per week"
        />
      </SectionCard>

      <SectionCard
        title="Commit frequency by day of week"
        subtitle="Aggregated across the reported weeks"
      >
        <DayOfWeekHeatmap weeks={data.weeks} />
      </SectionCard>
    </>
  )
}

function CodeFrequencyPanel({ owner, name, active }: { owner: string; name: string; active: boolean }) {
  const { data, isLoading, isError } = useInsight<CodeFrequencyInsights>(
    owner,
    name,
    'code-frequency',
    active,
  )

  if (isLoading) return <StateMessage kind="loading">Loading code frequency…</StateMessage>
  if (isError || !data) return <StateMessage kind="error">Could not load code frequency.</StateMessage>
  if (data.weeks.length === 0) return <StateMessage kind="empty">No code-frequency data yet.</StateMessage>

  const labels = data.weeks.map((w) => w.week)
  const totalAdd = data.weeks.reduce((acc, w) => acc + w.additions, 0)
  const totalDel = data.weeks.reduce((acc, w) => acc + w.deletions, 0)

  return (
    <SectionCard
      title="Code frequency"
      subtitle={`Additions and deletions over time · +${formatCompact(totalAdd)} / -${formatCompact(
        totalDel,
      )}`}
    >
      <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
        <LegendDot color="var(--ins-add)" label="Additions" />
        <LegendDot color="var(--ins-del)" label="Deletions" />
      </div>
      <MultiLineChart
        labels={labels}
        series={[
          { values: data.weeks.map((w) => w.additions), stroke: 'var(--ins-add)', label: 'Additions' },
          { values: data.weeks.map((w) => w.deletions), stroke: 'var(--ins-del)', label: 'Deletions' },
        ]}
        ariaLabel="Additions and deletions over time"
      />
    </SectionCard>
  )
}

function LanguagesPanel({ owner, name, active }: { owner: string; name: string; active: boolean }) {
  const { data, isLoading, isError } = useInsight<LanguagesInsights>(owner, name, 'languages', active)

  if (isLoading) return <StateMessage kind="loading">Loading languages…</StateMessage>
  if (isError || !data) return <StateMessage kind="error">Could not load languages.</StateMessage>
  if (data.languages.length === 0) return <StateMessage kind="empty">No language data yet.</StateMessage>

  return (
    <SectionCard title="Languages" subtitle="Breakdown by bytes of code">
      <div
        style={{
          display: 'flex',
          height: 12,
          borderRadius: 6,
          overflow: 'hidden',
          border: '1px solid var(--ins-border)',
          marginBottom: 16,
        }}
      >
        {data.languages.map((lang) => (
          <div
            key={lang.name}
            title={`${lang.name} ${lang.percentage.toFixed(1)}%`}
            style={{ width: `${lang.percentage}%`, background: lang.color || 'var(--ins-text-muted)' }}
          />
        ))}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {data.languages.map((lang) => (
          <li
            key={lang.name}
            style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: lang.color || 'var(--ins-text-muted)',
                display: 'inline-block',
              }}
            />
            <span style={{ color: 'var(--ins-text)', fontWeight: 600 }}>{lang.name}</span>
            <span style={{ color: 'var(--ins-text-muted)' }}>{lang.percentage.toFixed(1)}%</span>
            <span style={{ marginLeft: 'auto', color: 'var(--ins-text-muted)' }}>
              {formatCompact(lang.bytes)} B
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function RepositoryInsightsPage() {
  const params = useParams<{ owner: string; name: string }>()
  const owner = params?.owner ?? ''
  const name = params?.name ?? ''
  const [activeTab, setActiveTab] = useState<TabKey>('pulse')

  return (
    <div
      style={{
        ...cssVars,
        background: 'var(--ins-bg)',
        minHeight: '100vh',
        color: 'var(--ins-text)',
        padding: '24px 0 64px',
      }}
    >
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 24px' }}>
        <header style={{ marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Insights</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--ins-text-muted)' }}>
            {owner}/{name}
          </p>
        </header>

        <nav
          role="tablist"
          aria-label="Insights sections"
          style={{
            display: 'flex',
            gap: 4,
            flexWrap: 'wrap',
            borderBottom: '1px solid var(--ins-border)',
            marginBottom: 24,
          }}
        >
          {TABS.map((tab) => {
            const selected = tab.key === activeTab
            return (
              <button
                key={tab.key}
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  appearance: 'none',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${selected ? 'var(--ins-orange)' : 'transparent'}`,
                  padding: '10px 14px',
                  marginBottom: -1,
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: selected ? 600 : 500,
                  color: selected ? 'var(--ins-text)' : 'var(--ins-text-muted)',
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </nav>

        <div role="tabpanel">
          {activeTab === 'pulse' && <PulsePanel owner={owner} name={name} active />}
          {activeTab === 'contributors' && (
            <ContributorsPanel owner={owner} name={name} active />
          )}
          {activeTab === 'traffic' && <TrafficPanel owner={owner} name={name} active />}
          {activeTab === 'commits' && <CommitsPanel owner={owner} name={name} active />}
          {activeTab === 'codeFrequency' && (
            <CodeFrequencyPanel owner={owner} name={name} active />
          )}
          {activeTab === 'languages' && <LanguagesPanel owner={owner} name={name} active />}
        </div>
      </div>
    </div>
  )
}
