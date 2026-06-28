'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'

interface SuggestedUser {
  id: string
  username: string
  displayName?: string
  avatar?: string
  bio?: string
  verified?: boolean
  followersCount?: number
}

interface SuggestedResponse {
  users?: unknown[]
  total?: number
}

function normalizeUser(raw: unknown): SuggestedUser {
  const r = (raw ?? {}) as Record<string, unknown>
  const countObj = r._count as Record<string, unknown> | undefined
  return {
    id: (r.id as string) || (r.username as string) || '',
    username: (r.username as string) || '',
    displayName: (r.displayName as string) || (r.name as string) || undefined,
    avatar: (r.avatar as string) || (r.avatarUrl as string) || undefined,
    bio: (r.bio as string) || undefined,
    verified: Boolean(r.verified ?? r.isVerified),
    followersCount: Number(r.followersCount ?? countObj?.followers ?? 0),
  }
}

export default function ExploreSuggestedPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()

  const [users, setUsers] = useState<SuggestedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!isAuthenticated) router.replace('/login')
  }, [isAuthenticated, router])

  const loadSuggestions = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const { data } = await api.get<SuggestedResponse>('/v1/social/suggested-users', {
        params: { limit: 24 },
      })
      const raw = (data?.users as unknown[]) ?? []
      setUsers(raw.map(normalizeUser).filter((u) => u.username))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load suggestions')
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated) loadSuggestions()
  }, [isAuthenticated, loadSuggestions])

  const handleFollow = useCallback(
    async (username: string, userId: string) => {
      const isFollowing = followingSet.has(username)
      setFollowingSet((prev) => {
        const next = new Set(prev)
        if (next.has(username)) next.delete(username)
        else next.add(username)
        return next
      })
      try {
        if (isFollowing) {
          await api.delete(`/v1/users/${userId}/follow`)
        } else {
          await api.post(`/v1/users/${userId}/follow`)
        }
      } catch {
        setFollowingSet((prev) => {
          const next = new Set(prev)
          if (next.has(username)) next.delete(username)
          else next.add(username)
          return next
        })
      }
    },
    [followingSet],
  )

  if (!isAuthenticated) return null

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2 text-foreground">Suggested for You</h1>
      <p className="text-sm text-foreground/60 mb-8">
        People you might want to follow based on your network
      </p>

      {error && (
        <div className="mb-6 rounded-lg border border-[var(--error)]/40 bg-[var(--error)]/10 px-4 py-3 text-sm text-[var(--error)]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-xl border border-border bg-surface p-5 flex items-center gap-4"
            >
              <div className="h-12 w-12 rounded-full bg-surface-secondary" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-24 rounded bg-surface-secondary" />
                <div className="h-3 w-40 rounded bg-surface-secondary" />
              </div>
            </div>
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-20 text-foreground/50">
          No suggestions right now. Follow more developers to get personalized picks.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map((u) => {
            const isFollowing = followingSet.has(u.username)
            return (
              <div
                key={u.id}
                className="group flex items-center gap-4 rounded-xl border border-border bg-surface p-5 transition hover:border-primary"
              >
                <Link href={`/${u.username}`} className="flex-shrink-0">
                  {u.avatar ? (
                    <Image
                      src={u.avatar}
                      alt={u.username}
                      width={48}
                      height={48}
                      className="h-12 w-12 rounded-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-lg font-bold text-primary">
                      {(u.displayName || u.username).charAt(0).toUpperCase()}
                    </div>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/${u.username}`}
                    className="block truncate font-semibold text-foreground hover:text-primary"
                  >
                    {u.displayName || u.username}
                  </Link>
                  <p className="truncate text-xs text-foreground/50">
                    {u.bio ? u.bio : `@${u.username}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleFollow(u.username, u.id)}
                  className={`flex-shrink-0 rounded-lg border px-4 py-1.5 text-xs font-medium transition ${
                    isFollowing
                      ? 'border-border bg-surface-secondary text-foreground/50'
                      : 'border-accent bg-accent text-white hover:opacity-90'
                  }`}
                >
                  {isFollowing ? 'Following' : 'Follow'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
