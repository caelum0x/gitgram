'use client'

import { type ReactElement } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useQuery } from '@tanstack/react-query'
import { userService } from '@/services/userService'
import { useAuthStore } from '@/store/authStore'
import { Tooltip } from './ui/tooltip'
import { FollowButton } from './FollowButton'

interface HoverProfile {
  id: string
  username: string
  displayName?: string
  bio?: string
  avatar?: string
  followersCount: number
  followingCount: number
  isFollowing: boolean
  githubUsername?: string
}

function normalize(raw: unknown): HoverProfile {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    id: String(r.id ?? ''),
    username: String(r.username ?? ''),
    displayName: (r.displayName as string) ?? (r.fullName as string) ?? undefined,
    bio: r.bio ? String(r.bio) : undefined,
    avatar: (r.avatar as string) ?? (r.avatarUrl as string) ?? undefined,
    followersCount: typeof r.followersCount === 'number' ? r.followersCount : 0,
    followingCount: typeof r.followingCount === 'number' ? r.followingCount : 0,
    isFollowing: Boolean(r.isFollowing),
    githubUsername: r.githubUsername ? String(r.githubUsername) : undefined,
  }
}

function formatCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`
  return String(count)
}

interface UserHoverCardProps {
  /** Username to preview. The card lazily fetches the full profile on hover. */
  username: string
  /** Trigger element (a link, avatar, etc.). */
  children: ReactElement
}

/**
 * Wraps a trigger element with a profile-preview hover card showing the user's
 * avatar, display name, bio, follower/following counts, and a follow button.
 *
 * Adapted from the source UserTooltip/UserLinkWithTooltip pair onto the
 * gitgram-web stack: data comes from `userService.getProfile` via React Query
 * (fetched lazily once on first hover and cached), the popover uses this
 * product's `ui/tooltip` primitive, and follow state reuses the existing
 * `FollowButton`.
 */
export function UserHoverCard({ username, children }: UserHoverCardProps) {
  const { user: currentUser } = useAuthStore()

  const { data, status } = useQuery({
    queryKey: ['hover-profile', username],
    queryFn: async () => normalize(await userService.getProfile(username)),
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(username),
    retry: false,
  })

  const isSelf = Boolean(currentUser?.username && currentUser.username === username)

  const card = (
    <span className="block w-72 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl">
      {status === 'pending' && (
        <span className="flex animate-pulse flex-col gap-3" aria-hidden="true">
          <span className="flex items-center justify-between">
            <span className="h-14 w-14 rounded-full bg-[var(--surface-secondary)]" />
          </span>
          <span className="h-3 w-1/2 rounded bg-[var(--surface-secondary)]" />
          <span className="h-3 w-3/4 rounded bg-[var(--surface-secondary)]" />
        </span>
      )}

      {status === 'error' && (
        <span className="block text-sm text-[var(--foreground-secondary)]">
          Couldn&apos;t load @{username}
        </span>
      )}

      {status === 'success' && data && (
        <span className="flex flex-col gap-3">
          <span className="flex items-start justify-between gap-2">
            <Link
              href={`/${data.username}`}
              onClick={(e) => e.stopPropagation()}
              aria-label={`View @${data.username}`}
            >
              {data.avatar ? (
                <Image
                  src={data.avatar}
                  alt={data.username}
                  width={56}
                  height={56}
                  unoptimized
                  className="h-14 w-14 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[var(--primary)]/60 to-purple-600/60 text-lg font-semibold text-white">
                  {data.username.slice(0, 2).toUpperCase()}
                </span>
              )}
            </Link>

            {!isSelf && data.id && (
              <FollowButton
                userId={data.id}
                username={data.username}
                initialFollowing={data.isFollowing}
                githubUsername={data.githubUsername}
              />
            )}
          </span>

          <Link
            href={`/${data.username}`}
            onClick={(e) => e.stopPropagation()}
            className="block min-w-0"
          >
            <span className="block truncate text-base font-semibold text-[var(--foreground)] hover:underline">
              {data.displayName ?? data.username}
            </span>
            <span className="block truncate text-sm text-[var(--foreground-secondary)]">
              @{data.username}
            </span>
          </Link>

          {data.bio && (
            <span className="block whitespace-pre-line text-sm text-[var(--foreground)] [overflow-wrap:anywhere] line-clamp-4">
              {data.bio}
            </span>
          )}

          <span className="flex items-center gap-4 text-sm text-[var(--foreground-secondary)]">
            <span>
              <span className="font-semibold text-[var(--foreground)]">
                {formatCount(data.followingCount)}
              </span>{' '}
              Following
            </span>
            <span>
              <span className="font-semibold text-[var(--foreground)]">
                {formatCount(data.followersCount)}
              </span>{' '}
              Followers
            </span>
          </span>
        </span>
      )}
    </span>
  )

  return (
    <Tooltip content={card} openDelay={350}>
      {children}
    </Tooltip>
  )
}

export default UserHoverCard
