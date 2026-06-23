'use client'

import { useState } from 'react'
import api from '@/services/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CodeStructureResult {
  fileCount: number
  topLanguages: { name: string; percentage: number }[]
  moduleGraph: { nodes: number; edges: number }
}

interface ChangeImpactResult {
  highRiskFiles: { path: string; riskScore: number }[]
  blastRadius: number
  affectedModules: number
}

interface DependenciesResult {
  totalDependencies: number
  directDependencies: number
  devDependencies: number
  outdated: number
  vulnerabilities: number
}

interface ApiSurfaceResult {
  exportedFunctions: number
  routes: number
  publicClasses: number
  interfaces: number
}

interface AnalysisResults {
  codeStructure: CodeStructureResult
  changeImpact: ChangeImpactResult
  dependencies: DependenciesResult
  apiSurface: ApiSurfaceResult
}

type CardStatus = 'idle' | 'loading' | 'success' | 'error'

interface CardState {
  status: CardStatus
  error?: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CARD_CONFIGS = [
  {
    id: 'codeStructure' as const,
    title: 'Code Structure',
    icon: '🏗️',
    description: 'File count, top languages, module graph',
  },
  {
    id: 'changeImpact' as const,
    title: 'Change Impact',
    icon: '🔥',
    description: 'High-risk files, blast radius',
  },
  {
    id: 'dependencies' as const,
    title: 'Dependencies',
    icon: '🔗',
    description: 'Dependency graph summary',
  },
  {
    id: 'apiSurface' as const,
    title: 'API Surface',
    icon: '🌐',
    description: 'Exported functions, routes',
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Analysis failed. Please try again.'
}

function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin text-[#7C3AED]"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

interface StatusBadgeProps {
  status: CardStatus
}

function StatusBadge({ status }: StatusBadgeProps) {
  if (status === 'idle') {
    return (
      <span className="inline-flex items-center rounded-full border border-[#2D2D50] bg-[#1A1A2E] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        Pending
      </span>
    )
  }
  if (status === 'loading') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#7C3AED]/40 bg-[#7C3AED]/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#7C3AED]">
        <Spinner />
        Analyzing
      </span>
    )
  }
  if (status === 'success') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        Complete
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-400">
      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
      Error
    </span>
  )
}

interface MetricRowProps {
  label: string
  value: string | number
  highlight?: boolean
}

function MetricRow({ label, value, highlight = false }: MetricRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-xs text-slate-400">{label}</span>
      <span
        className={[
          'text-xs font-semibold tabular-nums',
          highlight ? 'text-rose-400' : 'text-slate-200',
        ].join(' ')}
      >
        {value}
      </span>
    </div>
  )
}

function SkeletonMetrics() {
  return (
    <div className="space-y-2 pt-1">
      {[60, 80, 45, 70].map((w, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-1.5">
          <div className="h-3 animate-pulse rounded bg-white/10" style={{ width: `${w}%` }} />
          <div className="h-3 w-10 animate-pulse rounded bg-white/10" />
        </div>
      ))}
    </div>
  )
}

interface CodeStructureCardContentProps {
  data: CodeStructureResult
}

function CodeStructureCardContent({ data }: CodeStructureCardContentProps) {
  return (
    <div className="divide-y divide-[#2D2D50]">
      <MetricRow label="Total files" value={data.fileCount.toLocaleString()} />
      <MetricRow label="Module graph nodes" value={data.moduleGraph.nodes} />
      <MetricRow label="Module graph edges" value={data.moduleGraph.edges} />
      <div className="pt-2">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Top Languages
        </p>
        <div className="space-y-1.5">
          {data.topLanguages.map((lang) => (
            <div key={lang.name}>
              <div className="mb-0.5 flex items-center justify-between">
                <span className="text-xs text-slate-300">{lang.name}</span>
                <span className="text-xs font-semibold tabular-nums text-slate-400">
                  {lang.percentage}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#2D2D50]">
                <div
                  className="h-full rounded-full bg-[#7C3AED]"
                  style={{ width: `${lang.percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

interface ChangeImpactCardContentProps {
  data: ChangeImpactResult
}

function ChangeImpactCardContent({ data }: ChangeImpactCardContentProps) {
  return (
    <div className="divide-y divide-[#2D2D50]">
      <MetricRow label="Blast radius" value={`${data.blastRadius} files`} highlight={data.blastRadius > 20} />
      <MetricRow label="Affected modules" value={data.affectedModules} />
      <div className="pt-2">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          High-Risk Files
        </p>
        <div className="space-y-1">
          {data.highRiskFiles.map((file) => (
            <div key={file.path} className="flex items-center justify-between gap-2">
              <span
                className="max-w-[70%] truncate font-mono text-[11px] text-slate-300"
                title={file.path}
              >
                {file.path}
              </span>
              <span
                className={[
                  'rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                  file.riskScore >= 80
                    ? 'bg-rose-500/15 text-rose-400'
                    : file.riskScore >= 50
                      ? 'bg-amber-500/15 text-amber-400'
                      : 'bg-slate-500/15 text-slate-400',
                ].join(' ')}
              >
                {file.riskScore}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

interface DependenciesCardContentProps {
  data: DependenciesResult
}

function DependenciesCardContent({ data }: DependenciesCardContentProps) {
  return (
    <div className="divide-y divide-[#2D2D50]">
      <MetricRow label="Total dependencies" value={data.totalDependencies} />
      <MetricRow label="Direct dependencies" value={data.directDependencies} />
      <MetricRow label="Dev dependencies" value={data.devDependencies} />
      <MetricRow label="Outdated" value={data.outdated} highlight={data.outdated > 5} />
      <MetricRow label="Vulnerabilities" value={data.vulnerabilities} highlight={data.vulnerabilities > 0} />
    </div>
  )
}

interface ApiSurfaceCardContentProps {
  data: ApiSurfaceResult
}

function ApiSurfaceCardContent({ data }: ApiSurfaceCardContentProps) {
  return (
    <div className="divide-y divide-[#2D2D50]">
      <MetricRow label="Exported functions" value={data.exportedFunctions} />
      <MetricRow label="Routes" value={data.routes} />
      <MetricRow label="Public classes" value={data.publicClasses} />
      <MetricRow label="Interfaces / types" value={data.interfaces} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Analysis Card
// ---------------------------------------------------------------------------

interface AnalysisCardProps {
  title: string
  icon: string
  description: string
  cardState: CardState
  children?: React.ReactNode
}

function AnalysisCard({ title, icon, description, cardState, children }: AnalysisCardProps) {
  return (
    <div
      className={[
        'flex flex-col overflow-hidden rounded-2xl border bg-[#1A1A2E] transition-all duration-300',
        cardState.status === 'loading'
          ? 'border-[#7C3AED]/40 shadow-lg shadow-[#7C3AED]/10'
          : cardState.status === 'success'
            ? 'border-emerald-500/20'
            : cardState.status === 'error'
              ? 'border-rose-500/20'
              : 'border-[#2D2D50]',
      ].join(' ')}
    >
      {/* Card header */}
      <div className="flex items-start justify-between gap-3 border-b border-[#2D2D50] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xl leading-none" role="img" aria-label={title}>
            {icon}
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
            <p className="text-[11px] text-slate-500">{description}</p>
          </div>
        </div>
        <StatusBadge status={cardState.status} />
      </div>

      {/* Card body */}
      <div className="flex-1 px-4 py-3">
        {cardState.status === 'idle' && (
          <div className="flex h-full items-center justify-center py-6">
            <p className="text-xs text-slate-600">Waiting for analysis to start…</p>
          </div>
        )}
        {cardState.status === 'loading' && <SkeletonMetrics />}
        {cardState.status === 'error' && (
          <div className="flex h-full items-center justify-center py-4">
            <p className="text-center text-xs text-rose-400">{cardState.error ?? 'Analysis failed'}</p>
          </div>
        )}
        {cardState.status === 'success' && children}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function AnalyzePage() {
  const [repoUrl, setRepoUrl] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [results, setResults] = useState<AnalysisResults | null>(null)

  const [cardStates, setCardStates] = useState<Record<keyof AnalysisResults, CardState>>({
    codeStructure: { status: 'idle' },
    changeImpact: { status: 'idle' },
    dependencies: { status: 'idle' },
    apiSurface: { status: 'idle' },
  })

  const setCardStatus = (id: keyof AnalysisResults, state: CardState) => {
    setCardStates((prev) => ({ ...prev, [id]: state }))
  }

  const resetAll = () => {
    setResults(null)
    setCardStates({
      codeStructure: { status: 'idle' },
      changeImpact: { status: 'idle' },
      dependencies: { status: 'idle' },
      apiSurface: { status: 'idle' },
    })
  }

  const handleAnalyze = async () => {
    const trimmedUrl = repoUrl.trim()

    if (!trimmedUrl) {
      setInputError('Please enter a GitHub repository URL.')
      return
    }

    if (!trimmedUrl.includes('github.com')) {
      setInputError('Please enter a valid GitHub repository URL.')
      return
    }

    setInputError(null)
    setIsAnalyzing(true)
    resetAll()

    // Set all cards to loading immediately (concurrent)
    setCardStates({
      codeStructure: { status: 'loading' },
      changeImpact: { status: 'loading' },
      dependencies: { status: 'loading' },
      apiSurface: { status: 'loading' },
    })

    try {
      const response = await api.post<AnalysisResults>('/tools/gitnexus-analyze', {
        repoUrl: trimmedUrl,
      })

      const data = response.data

      setResults(data)
      setCardStates({
        codeStructure: { status: 'success' },
        changeImpact: { status: 'success' },
        dependencies: { status: 'success' },
        apiSurface: { status: 'success' },
      })
    } catch (err: unknown) {
      const message = getErrorMessage(err)
      setCardStates({
        codeStructure: { status: 'error', error: message },
        changeImpact: { status: 'error', error: message },
        dependencies: { status: 'error', error: message },
        apiSurface: { status: 'error', error: message },
      })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleExport = () => {
    if (!results) return
    const repoName = repoUrl.trim().split('/').pop() ?? 'repo'
    downloadJson({ repoUrl: repoUrl.trim(), results }, `gitnexus-analysis-${repoName}.json`)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !isAnalyzing) {
      void handleAnalyze()
    }
  }

  const hasResults = results !== null
  const allCardsIdle = Object.values(cardStates).every((s) => s.status === 'idle')

  return (
    <div
      className="min-h-screen text-white"
      style={{ backgroundColor: '#0F0F1A' }}
    >
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-10 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-[#7C3AED]/80">
            GitNexus Code Intelligence
          </p>
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Repository Analysis
          </h1>
          <p className="mx-auto max-w-2xl text-base text-slate-400">
            Deep-dive AI-powered analysis of any GitHub repository. Understand code structure,
            change impact, dependencies, and API surface in seconds.
          </p>
        </div>

        {/* Input card */}
        <div
          className="mb-8 rounded-2xl border p-6 shadow-2xl shadow-black/30"
          style={{ backgroundColor: '#1A1A2E', borderColor: '#2D2D50' }}
        >
          <label
            className="mb-2 block text-sm font-semibold text-slate-200"
            htmlFor="repo-url-analyze"
          >
            GitHub Repository URL
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="repo-url-analyze"
              type="url"
              placeholder="https://github.com/owner/repository"
              value={repoUrl}
              onChange={(e) => {
                setRepoUrl(e.target.value)
                if (inputError) setInputError(null)
              }}
              onKeyDown={handleKeyDown}
              disabled={isAnalyzing}
              className="flex-1 rounded-xl border px-4 py-3 text-sm text-white placeholder-slate-600 outline-none transition focus:ring-2 disabled:opacity-50"
              style={{
                backgroundColor: '#0F0F1A',
                borderColor: '#2D2D50',
              }}
            />
            <button
              type="button"
              onClick={() => void handleAnalyze()}
              disabled={isAnalyzing || !repoUrl.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: '#7C3AED' }}
            >
              {isAnalyzing ? (
                <>
                  <Spinner />
                  Analyzing…
                </>
              ) : (
                <>
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 001.357 2.059l.182.083M20.25 14.5l-4.091-4.091m0 0a2.25 2.25 0 01-.659-1.591V3.104m4.75 11.396a24.05 24.05 0 01-4.75-.396M5 14.5a24.05 24.05 0 004.75.396"
                    />
                  </svg>
                  Analyze
                </>
              )}
            </button>
          </div>

          {inputError && (
            <p className="mt-3 text-sm text-rose-400">{inputError}</p>
          )}

          {/* Export button row */}
          {hasResults && (
            <div className="mt-4 flex items-center justify-end border-t pt-4" style={{ borderColor: '#2D2D50' }}>
              <button
                type="button"
                onClick={handleExport}
                className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
                style={{ borderColor: '#2D2D50' }}
              >
                <svg
                  className="h-4 w-4 text-[#7C3AED]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
                Export Analysis
              </button>
            </div>
          )}
        </div>

        {/* Empty state */}
        {allCardsIdle && (
          <div
            className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center"
            style={{ borderColor: '#2D2D50', backgroundColor: 'rgba(26,26,46,0.4)' }}
          >
            <div className="mb-4 text-5xl" role="img" aria-label="Analysis">
              🔬
            </div>
            <p className="mb-1 text-sm font-medium text-slate-400">No analysis yet</p>
            <p className="text-xs text-slate-600">
              Enter a GitHub repository URL above and click Analyze
            </p>
          </div>
        )}

        {/* Analysis cards grid */}
        {!allCardsIdle && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {CARD_CONFIGS.map((card) => (
              <AnalysisCard
                key={card.id}
                title={card.title}
                icon={card.icon}
                description={card.description}
                cardState={cardStates[card.id]}
              >
                {results && card.id === 'codeStructure' && (
                  <CodeStructureCardContent data={results.codeStructure} />
                )}
                {results && card.id === 'changeImpact' && (
                  <ChangeImpactCardContent data={results.changeImpact} />
                )}
                {results && card.id === 'dependencies' && (
                  <DependenciesCardContent data={results.dependencies} />
                )}
                {results && card.id === 'apiSurface' && (
                  <ApiSurfaceCardContent data={results.apiSurface} />
                )}
              </AnalysisCard>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
