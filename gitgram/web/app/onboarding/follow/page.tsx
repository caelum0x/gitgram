'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import api from '@/services/api'
import { userService } from '@/services/userService'

interface SuggestedUser {
  id: string
  username: string
  bio?: string
  avatar?: string
  followers_count?: number
}

interface SuggestedUsersResponse {
  users: SuggestedUser[]
}

const TOTAL_STEPS = 3
const CURRENT_STEP = 3
const SUGGESTED_LIMIT = 12
const MIN_FOLLOWS = 1

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Something went wrong. Please try again.'
}

function UserAvatar({ user }: { user: SuggestedUser }) {
  if (user.avatar) {
    return (
      <Image
        src={user.avatar}
        alt={user.username}
        width={52}
        height={52}
        className="rounded-full object-cover"
        style={{ width: 52, height: 52 }}
      />
    )
  }
  return (
    <div
      className="flex items-center justify-center rounded-full text-white font-bold text-lg select-none"
      style={{
        width: 52,
        height: 52,
        backgroundColor: 'var(--primary)',
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      {user.username[0]?.toUpperCase() ?? '?'}
    </div>
  )
}

export default function FollowPage() {
  const router = useRouter()
  const [users, setUsers] = useState<SuggestedUser[]>([])
  const [following, setFollowing] = useState<Set<string>>(new Set())
  const [pendingFollows, setPendingFollows] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [finishError, setFinishError] = useState<string | null>(null)

  const progressPercent = Math.round((CURRENT_STEP / TOTAL_STEPS) * 100)
  const canFinish = following.size >= MIN_FOLLOWS && !finishing

  const loadSuggestedUsers = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const { data } = await api.get<SuggestedUsersResponse>('/users/suggested', {
        params: { limit: SUGGESTED_LIMIT },
      })
      setUsers(data?.users ?? [])
    } catch (err: unknown) {
      setLoadError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSuggestedUsers()
  }, [loadSuggestedUsers])

  const toggleFollow = async (userId: string) => {
    // Optimistic update
    setFollowing(prev => {
      const next = new Set(prev)
      if (next.has(userId)) {
        next.delete(userId)
      } else {
        next.add(userId)
      }
      return next
    })

    // Track as pending if not yet confirmed
    setPendingFollows(prev => new Set(prev).add(userId))

    try {
      if (following.has(userId)) {
        await userService.unfollow(userId)
      } else {
        await userService.follow(userId)
      }
    } catch (err: unknown) {
      // Roll back on failure
      setFollowing(prev => {
        const next = new Set(prev)
        if (next.has(userId)) {
          next.delete(userId)
        } else {
          next.add(userId)
        }
        return next
      })
    } finally {
      setPendingFollows(prev => {
        const next = new Set(prev)
        next.delete(userId)
        return next
      })
    }
  }

  const handleFollowAll = async () => {
    const unfollowed = users.filter(u => !following.has(u.id))
    // Optimistic: mark all as followed immediately
    setFollowing(prev => {
      const next = new Set(prev)
      unfollowed.forEach(u => next.add(u.id))
      return next
    })
    // Fire follow requests in parallel — failures are silent (best-effort)
    await Promise.allSettled(unfollowed.map(u => userService.follow(u.id)))
  }

  const handleFinish = async () => {
    if (!canFinish) return
    setFinishing(true)
    setFinishError(null)
    try {
      // Ensure any in-flight follows are resolved — we already fired them in toggleFollow
      // Mark onboarding complete
      await api.patch('/users/preferences', { onboarding_complete: true })
    } catch {
      // Non-fatal — proceed to feed regardless
    } finally {
      setFinishing(false)
    }
    router.push('/feed')
  }

  const handleBack = () => {
    router.push('/onboarding/interests')
  }

  const allFollowed = users.length > 0 && users.every(u => following.has(u.id))

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start py-10 px-4"
      style={{ backgroundColor: 'var(--background)' }}
    >
      <div className="w-full max-w-2xl">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-sm font-medium"
              style={{ color: 'var(--foreground-secondary)' }}
            >
              Step {CURRENT_STEP} of {TOTAL_STEPS}
            </span>
            <span
              className="text-sm tabular-nums"
              style={{ color: 'var(--foreground-secondary)' }}
            >
              {following.size} following
            </span>
          </div>
          <div
            className="w-full h-1.5 rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--surface)' }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${progressPercent}%`,
                backgroundColor: 'var(--primary)',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>

        {/* Heading + Follow All */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1
              className="text-3xl font-bold mb-2"
              style={{ color: 'var(--foreground)' }}
            >
              Follow some developers to get started
            </h1>
            <p style={{ color: 'var(--foreground-secondary)' }} className="text-base">
              Your feed will come alive once you follow a few people.
            </p>
          </div>
          {!loading && users.length > 0 && !allFollowed && (
            <button
              type="button"
              onClick={handleFollowAll}
              className="shrink-0 px-4 py-2 rounded-lg text-sm font-semibold focus:outline-none focus-visible:ring-2"
              style={{
                backgroundColor: 'rgba(88, 166, 255, 0.12)',
                border: '1px solid var(--primary)',
                color: 'var(--primary)',
              }}
            >
              Follow all
            </button>
          )}
        </div>

        {/* Counter badge */}
        <div className="mb-5">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
            style={{
              backgroundColor: following.size >= MIN_FOLLOWS
                ? 'rgba(88, 166, 255, 0.12)'
                : 'var(--surface)',
              color: following.size >= MIN_FOLLOWS
                ? 'var(--primary)'
                : 'var(--foreground-secondary)',
              border: '1px solid',
              borderColor: following.size >= MIN_FOLLOWS ? 'var(--primary)' : 'var(--border)',
              transition: 'all 0.2s ease',
            }}
          >
            {following.size >= MIN_FOLLOWS ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="7" fill="var(--primary)" fillOpacity="0.2" />
                <path
                  d="M4 7l2 2 4-4"
                  stroke="var(--primary)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : null}
            {following.size} following · follow at least {MIN_FOLLOWS} to continue
          </span>
        </div>

        {/* Load error */}
        {loadError !== null && (
          <div
            className="flex items-center gap-3 rounded-xl px-4 py-3 mb-5 text-sm"
            style={{
              backgroundColor: 'rgba(218, 54, 51, 0.1)',
              border: '1px solid rgba(218, 54, 51, 0.3)',
              color: 'var(--error)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0" aria-hidden="true">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 4.5v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="8" cy="11" r="0.75" fill="currentColor" />
            </svg>
            <span className="flex-1">{loadError}</span>
            <button
              type="button"
              onClick={loadSuggestedUsers}
              className="font-medium underline focus:outline-none"
            >
              Retry
            </button>
          </div>
        )}

        {/* User grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 p-4 rounded-2xl animate-pulse"
                style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
                aria-hidden="true"
              >
                <div className="rounded-full shrink-0" style={{ width: 52, height: 52, backgroundColor: 'var(--surface-secondary)' }} />
                <div className="flex-1 space-y-2">
                  <div className="h-3 rounded" style={{ backgroundColor: 'var(--surface-secondary)', width: '60%' }} />
                  <div className="h-2.5 rounded" style={{ backgroundColor: 'var(--surface-secondary)', width: '80%' }} />
                </div>
                <div className="rounded-lg h-8 w-20 shrink-0" style={{ backgroundColor: 'var(--surface-secondary)' }} />
              </div>
            ))}
          </div>
        ) : users.length === 0 && loadError === null ? (
          <div
            className="text-center py-12 rounded-2xl mb-8"
            style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <p style={{ color: 'var(--foreground-secondary)' }} className="text-sm">
              No suggested users found right now. You can follow people from the feed later.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
            {users.map(user => {
              const isFollowing = following.has(user.id)
              const isPending = pendingFollows.has(user.id)
              return (
                <div
                  key={user.id}
                  className="flex items-center gap-4 p-4 rounded-2xl"
                  style={{
                    backgroundColor: 'var(--surface)',
                    border: '1px solid',
                    borderColor: isFollowing ? 'var(--border)' : 'var(--border)',
                    transition: 'border-color 0.2s ease',
                  }}
                >
                  <div className="shrink-0">
                    <UserAvatar user={user} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className="font-semibold text-sm truncate"
                      style={{ color: 'var(--foreground)' }}
                    >
                      @{user.username}
                    </p>
                    {user.bio && (
                      <p
                        className="text-xs leading-relaxed mt-0.5 line-clamp-2"
                        style={{ color: 'var(--foreground-secondary)' }}
                      >
                        {user.bio}
                      </p>
                    )}
                    {typeof user.followers_count === 'number' && (
                      <p
                        className="text-xs mt-1"
                        style={{ color: 'var(--foreground-secondary)' }}
                      >
                        {user.followers_count.toLocaleString()} followers
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleFollow(user.id)}
                    disabled={isPending}
                    className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold focus:outline-none focus-visible:ring-2"
                    style={{
                      backgroundColor: isFollowing
                        ? 'var(--surface-secondary)'
                        : 'var(--primary)',
                      color: isFollowing ? 'var(--foreground-secondary)' : '#fff',
                      border: isFollowing ? '1px solid var(--border)' : 'none',
                      opacity: isPending ? 0.6 : 1,
                      cursor: isPending ? 'wait' : 'pointer',
                      transition: 'background-color 0.15s ease, color 0.15s ease',
                      minWidth: 72,
                    }}
                  >
                    {isPending ? '…' : isFollowing ? 'Following' : 'Follow'}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Finish error */}
        {finishError !== null && (
          <div
            className="flex items-center gap-3 rounded-xl px-4 py-3 mb-5 text-sm"
            style={{
              backgroundColor: 'rgba(218, 54, 51, 0.1)',
              border: '1px solid rgba(218, 54, 51, 0.3)',
              color: 'var(--error)',
            }}
          >
            {finishError}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="flex-none px-5 py-3.5 rounded-xl font-semibold text-base focus:outline-none focus-visible:ring-2"
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--foreground-secondary)',
            }}
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleFinish}
            disabled={!canFinish}
            className="flex-1 py-3.5 rounded-xl font-semibold text-base focus:outline-none focus-visible:ring-2"
            style={{
              backgroundColor: canFinish ? 'var(--accent)' : 'var(--surface)',
              color: canFinish ? '#fff' : 'var(--foreground-secondary)',
              border: canFinish ? 'none' : '1px solid var(--border)',
              cursor: canFinish ? 'pointer' : 'not-allowed',
              opacity: canFinish ? 1 : 0.6,
              transition: 'background-color 0.15s ease, opacity 0.15s ease',
            }}
          >
            {finishing ? 'Setting up your feed…' : 'Finish — go to my feed'}
          </button>
        </div>

        {/* Skip */}
        <div className="text-center mt-4">
          <button
            type="button"
            onClick={() => router.push('/feed')}
            className="text-sm hover:underline focus:outline-none"
            style={{ color: 'var(--foreground-secondary)' }}
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  )
}
