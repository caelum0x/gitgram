'use client'

import Image from 'next/image'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/services/api'

export interface GitHubProfileCardProps {
  login: string
  name?: string
  bio?: string
  avatarUrl?: string
  followers?: number
  following?: number
  publicRepos?: number
  company?: string
  location?: string
  websiteUrl?: string
  isLoading?: boolean
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function normalizeWebsiteUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

function GitHubProfileCardSkeleton() {
  return (
    <div
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 w-full max-w-sm animate-pulse"
      aria-label="Loading GitHub profile"
    >
      <div className="flex items-center gap-4 mb-4">
        <div className="w-16 h-16 rounded-full bg-gray-300 dark:bg-gray-700 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-32" />
          <div className="h-3 bg-gray-300 dark:bg-gray-700 rounded w-24" />
        </div>
      </div>
      <div className="space-y-2 mb-4">
        <div className="h-3 bg-gray-300 dark:bg-gray-700 rounded w-full" />
        <div className="h-3 bg-gray-300 dark:bg-gray-700 rounded w-4/5" />
      </div>
      <div className="flex gap-4 mb-4">
        <div className="h-3 bg-gray-300 dark:bg-gray-700 rounded w-16" />
        <div className="h-3 bg-gray-300 dark:bg-gray-700 rounded w-16" />
        <div className="h-3 bg-gray-300 dark:bg-gray-700 rounded w-16" />
      </div>
      <div className="h-9 bg-gray-300 dark:bg-gray-700 rounded-lg w-full" />
    </div>
  )
}

export default function GitHubProfileCard({
  login,
  name,
  bio,
  avatarUrl,
  followers = 0,
  following = 0,
  publicRepos = 0,
  company,
  location,
  websiteUrl,
  isLoading = false,
}: GitHubProfileCardProps) {
  const queryClient = useQueryClient()

  const followMutation = useMutation({
    mutationFn: () => api.post<void>(`/users/${login}/follow`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', login] })
    },
  })

  if (isLoading) {
    return <GitHubProfileCardSkeleton />
  }

  const displayName = name || login
  const avatarSrc = avatarUrl || `https://avatars.githubusercontent.com/${login}`
  const githubUrl = `https://github.com/${login}`

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 w-full max-w-sm">
      {/* Avatar + names */}
      <div className="flex items-center gap-4 mb-4">
        <div className="relative w-16 h-16 shrink-0">
          <Image
            src={avatarSrc}
            alt={`${displayName} avatar`}
            fill
            sizes="64px"
            className="rounded-full object-cover"
            unoptimized={avatarSrc.startsWith('https://avatars.githubusercontent.com')}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{displayName}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">@{login}</p>
        </div>
      </div>

      {/* Bio */}
      {bio && (
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-4 line-clamp-3">{bio}</p>
      )}

      {/* Stats row */}
      <div className="flex gap-5 mb-4 text-sm">
        <span className="text-gray-700 dark:text-gray-300">
          <span className="font-semibold text-gray-900 dark:text-gray-100">{formatCount(followers)}</span>{' '}
          <span className="text-gray-500">followers</span>
        </span>
        <span className="text-gray-700 dark:text-gray-300">
          <span className="font-semibold text-gray-900 dark:text-gray-100">{formatCount(following)}</span>{' '}
          <span className="text-gray-500">following</span>
        </span>
        <span className="text-gray-700 dark:text-gray-300">
          <span className="font-semibold text-gray-900 dark:text-gray-100">{formatCount(publicRepos)}</span>{' '}
          <span className="text-gray-500">repos</span>
        </span>
      </div>

      {/* Meta: company / location / website */}
      {(company || location || websiteUrl) && (
        <ul className="space-y-1 mb-4 text-sm text-gray-600 dark:text-gray-400">
          {company && (
            <li className="flex items-center gap-1.5 truncate">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-4 h-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
              <span className="truncate">{company}</span>
            </li>
          )}
          {location && (
            <li className="flex items-center gap-1.5 truncate">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-4 h-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span className="truncate">{location}</span>
            </li>
          )}
          {websiteUrl && (
            <li className="flex items-center gap-1.5 truncate">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-4 h-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <a
                href={normalizeWebsiteUrl(websiteUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-blue-500 hover:underline"
              >
                {websiteUrl}
              </a>
            </li>
          )}
        </ul>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => followMutation.mutate()}
          disabled={followMutation.isPending || followMutation.isSuccess}
          className="flex-1 py-2 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          aria-label={`Follow ${displayName} on Gitgram`}
        >
          {followMutation.isPending
            ? 'Following...'
            : followMutation.isSuccess
              ? 'Following'
              : 'Follow on Gitgram'}
        </button>

        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          aria-label={`View ${displayName} on GitHub`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
          </svg>
          GitHub
        </a>
      </div>

      {/* Follow error */}
      {followMutation.isError && (
        <p className="mt-2 text-xs text-red-500" role="alert">
          Failed to follow. Please try again.
        </p>
      )}
    </div>
  )
}
