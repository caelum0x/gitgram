'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'

interface TrendingTag {
  id: string
  name: string
  count: number
}

function normalizeTag(raw: unknown): TrendingTag {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    id: (r.id as string) || (r.name as string) || '',
    name: (r.name as string) || '',
    count: Number(r.count ?? r.postsCount ?? 0),
  }
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export default function ExploreTagsPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()

  const [tags, setTags] = useState<TrendingTag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated) router.replace('/login')
  }, [isAuthenticated, router])

  const loadTags = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const { data } = await api.get('/v1/tags/trending', { params: { limit: 50 } })
      const raw: unknown[] = Array.isArray(data) ? data : (data?.tags ?? [])
      setTags(raw.map(normalizeTag).filter((t) => t.name))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load trending tags')
      setTags([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated) loadTags()
  }, [isAuthenticated, loadTags])

  if (!isAuthenticated) return null

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2 text-foreground">Trending Tags</h1>
      <p className="text-sm text-foreground/60 mb-8">
        Popular hashtags across the Gitgram community
      </p>

      {error && (
        <div className="mb-6 rounded-lg border border-[var(--error)]/40 bg-[var(--error)]/10 px-4 py-3 text-sm text-[var(--error)]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-border bg-surface p-5">
              <div className="h-4 w-32 rounded bg-surface-secondary mb-3" />
              <div className="h-3 w-20 rounded bg-surface-secondary" />
            </div>
          ))}
        </div>
      ) : tags.length === 0 ? (
        <div className="text-center py-20 text-foreground/50">No trending tags yet.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tags.map((tag) => (
            <Link
              key={tag.id}
              href={`/search?q=${encodeURIComponent(`#${tag.name}`)}&type=posts`}
              className="group rounded-xl border border-border bg-surface p-5 transition hover:border-primary"
            >
              <p className="text-lg font-semibold text-primary group-hover:underline">
                #{tag.name}
              </p>
              <p className="mt-1 text-sm text-foreground/50">
                {formatCount(tag.count)} {tag.count === 1 ? 'post' : 'posts'}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
