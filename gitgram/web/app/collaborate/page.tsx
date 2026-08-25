'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { githubService } from '@/services/githubService'
import {
  talentGraphService,
  type TalentGraph,
  type TalentProject,
  type TalentVerificationLevel,
} from '@/services/talentGraphService'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/components/ui/toast'

const verificationCopy: Record<TalentVerificationLevel, string> = {
  verified: 'WRITE ACCESS VERIFIED',
  linked: 'GITHUB LINKED',
  recorded: 'ACCOUNT RECORDED',
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function getErrorMessage(error: unknown) {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { data?: { error?: { message?: string } } } }).response
    if (response?.data?.error?.message) return response.data.error.message
  }
  return error instanceof Error ? error.message : 'Talent Graph could not be loaded.'
}

function ProjectFolio({ project, index }: { project: TalentProject; index: number }) {
  return (
    <article className="grid border-t border-black lg:grid-cols-[96px_1fr_300px]">
      <div className="border-b border-black px-4 py-5 font-mono text-xs lg:border-b-0 lg:border-r">
        P-{String(index + 1).padStart(2, '0')}
      </div>

      <div className="border-b border-black px-4 py-5 lg:border-b-0 lg:border-r lg:px-7 lg:py-7">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.16em] text-black/55">
              {project.role} · {project.source}
            </p>
            <h3 className="break-words text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
              {project.fullName}
            </h3>
          </div>
          <span className="bg-[#0038ff] px-3 py-2 font-mono text-[10px] font-semibold tracking-[0.12em] text-white">
            {verificationCopy[project.verificationLevel]}
          </span>
        </div>

        <p className="max-w-2xl text-sm leading-6 text-black/70">
          {project.description || 'No repository description has been recorded.'}
        </p>

        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-black/20 pt-4 font-mono text-[11px] uppercase tracking-[0.08em]">
          <span>{project.language || 'Language not recorded'}</span>
          <span>{project.stars.toLocaleString()} stars</span>
          <span>{project.forks.toLocaleString()} forks</span>
          <span>Checked {formatDate(project.lastVerifiedAt)}</span>
        </div>

        {project.topics.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {project.topics.slice(0, 8).map((topic) => (
              <span key={topic} className="border border-black px-2 py-1 font-mono text-[10px] uppercase">
                {topic}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-5 lg:px-5 lg:py-7">
        <p className="mb-4 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-black/55">
          Evidence trail
        </p>
        <ol className="space-y-4">
          {project.evidence.slice(0, 4).map((evidence, evidenceIndex) => (
            <li key={evidence.id} className="grid grid-cols-[22px_1fr] gap-2 text-xs leading-5">
              <span className="font-mono text-[#0038ff]">{String(evidenceIndex + 1).padStart(2, '0')}</span>
              <div>
                <p className="font-semibold uppercase tracking-[0.04em]">{evidence.label}</p>
                <p className="text-black/60">{evidence.detail}</p>
                <p className="mt-1 font-mono text-[10px] uppercase text-black/45">
                  {formatDate(evidence.occurredAt)}
                </p>
              </div>
            </li>
          ))}
        </ol>
        {project.url && (
          <a
            href={project.url}
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-block border-b border-black pb-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] hover:text-[#0038ff]"
          >
            Open source record
          </a>
        )}
      </div>
    </article>
  )
}

function LoadingDossier() {
  return (
    <div className="min-h-screen bg-[#f1f0eb] px-4 py-10 text-black">
      <div className="mx-auto max-w-7xl border border-black bg-[#faf9f5]">
        <div className="h-48 animate-pulse bg-black/5" />
        <div className="grid grid-cols-2 border-t border-black sm:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-28 animate-pulse border-r border-black bg-black/[0.03] last:border-r-0" />
          ))}
        </div>
        <div className="h-80 animate-pulse border-t border-black bg-black/5" />
      </div>
    </div>
  )
}

export default function CollaboratePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const publicUsername = searchParams.get('profile')?.trim() || null
  const { isAuthenticated, isInitialized } = useAuthStore()
  const { showToast } = useToast()
  const [graph, setGraph] = useState<TalentGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!publicUsername && isInitialized && !isAuthenticated) router.replace('/login')
  }, [isAuthenticated, isInitialized, publicUsername, router])

  const loadGraph = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      setGraph(
        publicUsername
          ? await talentGraphService.getPublic(publicUsername)
          : await talentGraphService.getMine(),
      )
    } catch (loadError) {
      setError(getErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [publicUsername])

  useEffect(() => {
    if (publicUsername || isAuthenticated) void loadGraph()
  }, [isAuthenticated, loadGraph, publicUsername])

  const handleSync = async () => {
    try {
      setSyncing(true)
      await githubService.syncProjects()
      await loadGraph()
      showToast('GitHub project evidence refreshed.', 'success')
    } catch (syncError) {
      showToast(getErrorMessage(syncError), 'error')
    } finally {
      setSyncing(false)
    }
  }

  const handleCopyShareLink = async () => {
    if (!graph.profile.username) return

    try {
      const url = new URL('/collaborate', window.location.origin)
      url.searchParams.set('profile', graph.profile.username)
      await navigator.clipboard.writeText(url.toString())
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
      showToast('Public dossier link copied.', 'success')
    } catch {
      showToast('The public link could not be copied.', 'error')
    }
  }

  const initials = useMemo(() => {
    const name = graph?.profile.displayName || graph?.profile.username || graph?.profile.githubUsername || 'G'
    return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  }, [graph])

  if ((!publicUsername && !isInitialized) || loading) return <LoadingDossier />
  if (!publicUsername && !isAuthenticated) return null

  if (error || !graph) {
    return (
      <main className="min-h-screen bg-[#f1f0eb] px-4 py-16 text-black">
        <section className="mx-auto max-w-3xl border border-black bg-[#faf9f5] p-8 sm:p-12">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#0038ff]">Talent Graph / unavailable</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em]">The dossier could not be assembled.</h1>
          <p className="mt-5 max-w-xl text-black/65">{error || 'No Talent Graph data was returned.'}</p>
          <button onClick={() => void loadGraph()} className="mt-8 bg-black px-5 py-3 font-mono text-xs uppercase tracking-[0.12em] text-white">
            Try again
          </button>
        </section>
      </main>
    )
  }

  const displayName = graph.profile.displayName || graph.profile.username || graph.profile.githubUsername || 'Gitgram member'
  const isOwnerView = !publicUsername
  const summary = [
    ['Projects', graph.summary.projectCount],
    ['Write verified', graph.summary.verifiedProjectCount],
    ['GitHub events', graph.summary.recordedActivityCount],
    ['Collaborators', graph.summary.collaboratorCount],
  ] as const

  return (
    <main className="min-h-screen bg-[#f1f0eb] px-3 py-6 text-[#111] sm:px-6 sm:py-10">
      <div className="mx-auto max-w-7xl border border-black bg-[#faf9f5]">
        <header className="grid lg:grid-cols-[1fr_320px]">
          <div className="border-b border-black p-5 sm:p-8 lg:border-b-0 lg:border-r lg:p-12">
            <div className="mb-14 flex flex-wrap items-center justify-between gap-4 font-mono text-[10px] uppercase tracking-[0.18em]">
              <span>Gitgram / Talent Graph / {isOwnerView ? 'Owner dossier' : 'Public dossier'}</span>
              <span>Generated {formatDate(graph.generatedAt)}</span>
            </div>
            <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#0038ff]">
              Verifiable builder dossier
            </p>
            <h1 className="max-w-4xl text-5xl font-semibold leading-[0.94] tracking-[-0.065em] sm:text-7xl lg:text-8xl">
              Work that speaks for itself.
            </h1>
            <p className="mt-8 max-w-2xl text-base leading-7 text-black/65 sm:text-lg">
              Repository access, connected GitHub projects, recorded activity, and collaboration paths—assembled from evidence already held by Gitgram.
            </p>
          </div>

          <aside className="flex flex-col justify-between border-b border-black bg-[#0038ff] p-6 text-white lg:border-b-0 lg:p-8">
            <div>
              <div className="flex h-16 w-16 items-center justify-center border border-white font-mono text-lg font-semibold">
                {initials}
              </div>
              <h2 className="mt-6 text-3xl font-semibold tracking-[-0.04em]">{displayName}</h2>
              <p className="mt-2 font-mono text-xs uppercase tracking-[0.12em] text-white/70">
                {graph.profile.githubUsername ? `github.com/${graph.profile.githubUsername}` : 'GitHub not connected'}
              </p>
              {graph.profile.bio && <p className="mt-5 text-sm leading-6 text-white/80">{graph.profile.bio}</p>}
            </div>
            <div className="mt-10 border-t border-white/50 pt-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/70">Evidence source</p>
              <p className="mt-2 text-sm font-semibold">
                {graph.profile.githubConnected ? 'CONNECTED GITHUB ACCOUNT' : 'GITGRAM RECORDS ONLY'}
              </p>
            </div>
          </aside>
        </header>

        <section aria-label="Talent summary" className="grid grid-cols-2 border-b border-black sm:grid-cols-4">
          {summary.map(([label, value], index) => (
            <div key={label} className={`p-5 sm:p-7 ${index < summary.length - 1 ? 'border-r border-black' : ''} ${index === 1 ? 'max-sm:border-r-0' : ''} ${index < 2 ? 'max-sm:border-b' : ''}`}>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/55">{label}</p>
              <p className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">{value}</p>
            </div>
          ))}
        </section>

        <section>
          <div className="flex flex-wrap items-end justify-between gap-5 p-5 sm:p-8">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#0038ff]">01 / Project evidence</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em] sm:text-5xl">Verified work</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {isOwnerView && (
                <>
                  {graph.profile.githubConnected ? (
                    <button
                      onClick={handleSync}
                      disabled={syncing}
                      className="border border-black bg-black px-4 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-white disabled:opacity-50"
                    >
                      {syncing ? 'Syncing records' : 'Refresh GitHub records'}
                    </button>
                  ) : (
                    <button
                      onClick={() => githubService.connectGitHub()}
                      className="border border-black bg-black px-4 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-white"
                    >
                      Connect GitHub
                    </button>
                  )}
                  <Link href="/claim" className="border border-black px-4 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] hover:bg-[#0038ff] hover:text-white">
                    Verify a repository
                  </Link>
                  {graph.profile.username && (
                    <button
                      onClick={handleCopyShareLink}
                      className="border border-black px-4 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] hover:bg-[#0038ff] hover:text-white"
                    >
                      {copied ? 'Link copied' : 'Copy public dossier'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {graph.projects.length > 0 ? (
            graph.projects.map((project, index) => <ProjectFolio key={`${project.source}:${project.id}`} project={project} index={index} />)
          ) : (
            <div className="border-t border-black px-5 py-16 sm:px-8">
              <p className="max-w-xl text-2xl font-semibold tracking-[-0.04em]">No project evidence is recorded yet.</p>
              <p className="mt-3 max-w-xl text-sm leading-6 text-black/60">
                Connect and refresh GitHub to import projects, or verify write access by claiming a repository.
              </p>
            </div>
          )}
        </section>

        <section className="border-t border-black">
          <div className="grid lg:grid-cols-[330px_1fr]">
            <div className="border-b border-black p-5 sm:p-8 lg:border-b-0 lg:border-r">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#0038ff]">02 / Collaboration graph</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">Shared maintenance</h2>
              <p className="mt-5 text-sm leading-6 text-black/60">
                Each connection below is backed by a shared repository manager record. No inferred relationships are shown.
              </p>
            </div>

            <div>
              {graph.collaborators.length > 0 ? graph.collaborators.map((collaborator, index) => {
                const name = collaborator.displayName || collaborator.username || collaborator.githubUsername || 'Gitgram collaborator'
                return (
                  <article key={collaborator.id} className={`${index > 0 ? 'border-t border-black' : ''} p-5 sm:p-7`}>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/50">
                          C-{String(index + 1).padStart(2, '0')} · {collaborator.sharedProjects.length} shared {collaborator.sharedProjects.length === 1 ? 'repository' : 'repositories'}
                        </p>
                        <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{name}</h3>
                        {collaborator.githubUsername && <p className="mt-1 font-mono text-xs text-[#0038ff]">@{collaborator.githubUsername}</p>}
                      </div>
                      {collaborator.username && (
                        <Link href={`/${collaborator.username}`} className="border-b border-black pb-1 font-mono text-[10px] uppercase tracking-[0.12em] hover:text-[#0038ff]">
                          View Gitgram profile
                        </Link>
                      )}
                    </div>
                    <div className="mt-5 grid gap-px bg-black sm:grid-cols-2">
                      {collaborator.sharedProjects.map((project) => (
                        <a key={`${collaborator.id}:${project.id}`} href={project.url} target="_blank" rel="noreferrer" className="bg-[#faf9f5] p-4 hover:bg-[#0038ff] hover:text-white">
                          <p className="font-semibold">{project.fullName}</p>
                          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.1em] opacity-65">
                            You: {project.yourRole} / Them: {project.theirRole}
                          </p>
                        </a>
                      ))}
                    </div>
                  </article>
                )
              }) : (
                <div className="p-5 sm:p-8">
                  <p className="text-xl font-semibold tracking-[-0.03em]">No shared-maintainer links are recorded.</p>
                  <p className="mt-3 text-sm leading-6 text-black/60">Collaboration edges appear after more than one Gitgram member manages the same repository.</p>
                </div>
              )}
            </div>
          </div>
        </section>

        <footer className="flex flex-wrap justify-between gap-3 border-t border-black bg-black px-5 py-4 font-mono text-[9px] uppercase tracking-[0.14em] text-white sm:px-8">
          <span>Evidence over self-report</span>
          <span>Member since {formatDate(graph.profile.memberSince)}</span>
        </footer>
      </div>
    </main>
  )
}
