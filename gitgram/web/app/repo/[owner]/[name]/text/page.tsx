'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { repoService } from '@/services/repoService'
import { buildRepoPath, buildRepoTextRawPath } from '@/utils/repositoryRouting'
import {
  DEFAULT_REPO_TEXT_MAX_FILE_BYTES,
  DEFAULT_REPO_TEXT_MAX_FILES,
  buildRepoTextExportSearchParams,
  normalizeRepoTextExportOptions,
} from '@/utils/repoTextExport'

export default function RepositoryTextPage() {
  const params = useParams()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const owner = (params.owner ?? params.username) as string
  const name = (params.name ?? params.repo) as string

  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [draftMaxFiles, setDraftMaxFiles] = useState(String(DEFAULT_REPO_TEXT_MAX_FILES))
  const [draftMaxFileBytes, setDraftMaxFileBytes] = useState(String(DEFAULT_REPO_TEXT_MAX_FILE_BYTES))

  const activeOptions = normalizeRepoTextExportOptions({
    maxFiles: searchParams.get('maxFiles'),
    maxFileBytes: searchParams.get('maxFileBytes'),
  })

  useEffect(() => {
    let mounted = true

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const text = await repoService.exportToText(owner, name, activeOptions)
        if (mounted) {
          setContent(text)
        }
      } catch (loadError) {
        console.error('Failed to load repo text export', loadError)
        if (mounted) {
          setError('Repo text export could not be loaded.')
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      mounted = false
    }
  }, [owner, name, activeOptions.maxFiles, activeOptions.maxFileBytes])

  useEffect(() => {
    setDraftMaxFiles(String(activeOptions.maxFiles))
    setDraftMaxFileBytes(String(activeOptions.maxFileBytes))
  }, [activeOptions.maxFiles, activeOptions.maxFileBytes])

  const handleCopy = async () => {
    if (!content) {
      return
    }

    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch (copyError) {
      console.error('Failed to copy repo text export', copyError)
    }
  }

  const handleDownload = () => {
    if (!content) {
      return
    }

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${owner}-${name}-repo-to-text.txt`
    link.click()
    URL.revokeObjectURL(url)
  }

  const applyLimits = () => {
    const nextOptions = normalizeRepoTextExportOptions({
      maxFiles: draftMaxFiles,
      maxFileBytes: draftMaxFileBytes,
    })
    const nextSearchParams = buildRepoTextExportSearchParams(nextOptions)
    const nextUrl = nextSearchParams.toString() ? `${pathname}?${nextSearchParams.toString()}` : pathname
    router.replace(nextUrl, { scroll: false })
  }

  const resetLimits = () => {
    setDraftMaxFiles(String(DEFAULT_REPO_TEXT_MAX_FILES))
    setDraftMaxFileBytes(String(DEFAULT_REPO_TEXT_MAX_FILE_BYTES))
    router.replace(pathname, { scroll: false })
  }

  const rawSearchParams = buildRepoTextExportSearchParams(activeOptions)
  const rawHref = rawSearchParams.toString()
    ? `${buildRepoTextRawPath(owner, name)}?${rawSearchParams.toString()}`
    : buildRepoTextRawPath(owner, name)

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(252,211,77,0.18),_transparent_30%),linear-gradient(180deg,_#0b0f19_0%,_#111827_45%,_#0b1220_100%)] text-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20 backdrop-blur">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-amber-300/80">
                Repo Text Export
              </p>
              <h1 className="text-3xl font-semibold tracking-tight">
                {owner}/{name}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                LLM-friendly repository snapshot with directory structure and filtered text files.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" size="sm" onClick={handleCopy} disabled={!content || loading}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button variant="secondary" size="sm" onClick={handleDownload} disabled={!content || loading}>
                Download
              </Button>
              <a
                href={rawHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Raw
              </a>
              <Link
                href={buildRepoPath(owner, name)}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Repo Page
              </Link>
              <a
                href={`https://github.com/${owner}/${name}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center justify-center rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/20"
              >
                GitHub
              </a>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-slate-300">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              Active limits: {activeOptions.maxFiles} files, {activeOptions.maxFileBytes.toLocaleString()} bytes per file
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              Canonical URL: /{owner}/{name}/text
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              Raw URL: /{owner}/{name}/text/raw
            </span>
          </div>
        </div>

        <div className="mb-6 rounded-3xl border border-white/10 bg-white/5 p-5 shadow-xl shadow-black/20 backdrop-blur">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Export Controls</h2>
              <p className="mt-1 text-sm text-slate-300">
                Tune the output size and keep the exact export in the URL.
              </p>
            </div>
            <div className="text-xs text-slate-400">
              Query params: <span className="font-mono text-slate-200">maxFiles</span>,{' '}
              <span className="font-mono text-slate-200">maxFileBytes</span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">Max files</span>
              <input
                type="number"
                min={1}
                max={200}
                value={draftMaxFiles}
                onChange={(event) => setDraftMaxFiles(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-[#0a1324] px-4 py-3 text-sm text-white outline-none transition focus:border-amber-300/40 focus:ring-2 focus:ring-amber-300/20"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">Max bytes per file</span>
              <input
                type="number"
                min={1000}
                max={100000}
                step={1000}
                value={draftMaxFileBytes}
                onChange={(event) => setDraftMaxFileBytes(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-[#0a1324] px-4 py-3 text-sm text-white outline-none transition focus:border-amber-300/40 focus:ring-2 focus:ring-amber-300/20"
              />
            </label>

            <div className="flex items-end gap-3">
              <Button variant="secondary" size="sm" onClick={applyLimits}>
                Apply
              </Button>
              <Button variant="ghost" size="sm" onClick={resetLimits}>
                Reset
              </Button>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#08101f]/85 shadow-2xl shadow-black/30">
          <div className="border-b border-white/10 bg-white/[0.03] px-5 py-3 text-xs uppercase tracking-[0.24em] text-slate-400">
            Plain Text View
          </div>

          {loading ? (
            <div className="space-y-3 px-5 py-6 font-mono text-sm text-slate-400">
              <div className="h-4 w-40 animate-pulse rounded bg-white/10" />
              <div className="h-4 w-72 animate-pulse rounded bg-white/10" />
              <div className="h-4 w-full animate-pulse rounded bg-white/10" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-white/10" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-white/10" />
            </div>
          ) : error ? (
            <div className="px-5 py-8">
              <p className="text-sm text-rose-300">{error}</p>
            </div>
          ) : (
            <pre className="overflow-x-auto px-5 py-6 text-[13px] leading-6 text-slate-100">
              <code>{content}</code>
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
