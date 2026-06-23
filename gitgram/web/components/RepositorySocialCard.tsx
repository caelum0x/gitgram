'use client';

import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import { buildRepoPath } from '@/utils/repositoryRouting';

const LANGUAGE_COLORS: Record<string, string> = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572A5',
  Go: '#00ADD8',
  Rust: '#dea584',
};

const MAX_VISIBLE_TOPICS = 3;

interface RepositorySocialCardProps {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  description?: string;
  stars: number;
  forks: number;
  language?: string;
  topics?: string[];
  isFollowed?: boolean;
  followersCount?: number;
}

interface FollowState {
  isFollowed: boolean;
  followersCount: number;
}

function formatCount(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(n);
}

export default function RepositorySocialCard({
  id,
  owner,
  name,
  fullName,
  description,
  stars,
  forks,
  language,
  topics = [],
  isFollowed = false,
  followersCount = 0,
}: RepositorySocialCardProps) {
  const queryClient = useQueryClient();
  const queryKey = ['repo-follow', id];

  const currentState: FollowState = queryClient.getQueryData<FollowState>(queryKey) ?? {
    isFollowed,
    followersCount,
  };

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      if (currentState.isFollowed) {
        await api.delete(`/v1/repositories/${id}/follow`);
      } else {
        await api.post(`/v1/repositories/${id}/follow`);
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<FollowState>(queryKey) ?? { isFollowed, followersCount };
      const next: FollowState = {
        isFollowed: !prev.isFollowed,
        followersCount: prev.isFollowed ? prev.followersCount - 1 : prev.followersCount + 1,
      };
      queryClient.setQueryData<FollowState>(queryKey, next);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData<FollowState>(queryKey, ctx.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const state = queryClient.getQueryData<FollowState>(queryKey) ?? { isFollowed, followersCount };
  const languageColor = language ? (LANGUAGE_COLORS[language] ?? '#6b7280') : null;

  const visibleTopics = topics.slice(0, MAX_VISIBLE_TOPICS);
  const extraTopics = topics.length - MAX_VISIBLE_TOPICS;

  return (
    <article className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 hover:border-purple-400 dark:hover:border-purple-500 transition-colors duration-200">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <Link
            href={buildRepoPath(owner, name)}
            className="font-semibold text-gray-900 dark:text-gray-100 hover:text-purple-600 dark:hover:text-purple-400 hover:underline truncate block"
            title={fullName}
          >
            {fullName}
          </Link>

          {description && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
              {description}
            </p>
          )}
        </div>

        <button
          onClick={() => mutate()}
          disabled={isPending}
          aria-pressed={state.isFollowed}
          aria-label={state.isFollowed ? `Unfollow ${fullName}` : `Follow ${fullName}`}
          className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium border transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${
            state.isFollowed
              ? 'border-gray-300 dark:border-gray-600 bg-transparent text-gray-700 dark:text-gray-300 hover:border-red-400 hover:text-red-500 dark:hover:border-red-400 dark:hover:text-red-400'
              : 'border-transparent bg-purple-600 text-white hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600'
          }`}
        >
          {state.isFollowed ? 'Following' : 'Follow'}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-gray-500 dark:text-gray-400">
        {languageColor && language && (
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: languageColor }}
              aria-hidden="true"
            />
            <span>{language}</span>
          </span>
        )}

        <span className="flex items-center gap-1" title={`${stars} stars`}>
          <svg
            viewBox="0 0 16 16"
            className="w-4 h-4"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
          </svg>
          <span>{formatCount(stars)}</span>
        </span>

        <span className="flex items-center gap-1" title={`${forks} forks`}>
          <svg
            viewBox="0 0 16 16"
            className="w-4 h-4"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z" />
          </svg>
          <span>{formatCount(forks)}</span>
        </span>

        {state.followersCount > 0 && (
          <span className="flex items-center gap-1" title={`${state.followersCount} followers`}>
            <svg
              viewBox="0 0 16 16"
              className="w-4 h-4"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M2 5.5a3.5 3.5 0 1 1 5.898 2.549 5.508 5.508 0 0 1 3.034 4.084.75.75 0 1 1-1.482.235 4 4 0 0 0-7.9 0 .75.75 0 0 1-1.482-.236A5.507 5.507 0 0 1 3.102 8.05 3.493 3.493 0 0 1 2 5.5ZM11 4a3.001 3.001 0 0 1 2.22 5.018 5.01 5.01 0 0 1 2.56 3.012.749.749 0 0 1-.885.954.752.752 0 0 1-.549-.514 3.507 3.507 0 0 0-2.522-2.372.75.75 0 0 1-.574-.73v-.352a.75.75 0 0 1 .416-.672A1.5 1.5 0 0 0 11 5.5.75.75 0 0 1 11 4Zm-5.5-.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
            </svg>
            <span>{formatCount(state.followersCount)}</span>
          </span>
        )}
      </div>

      {visibleTopics.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {visibleTopics.map((topic) => (
            <span
              key={topic}
              className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
            >
              {topic}
            </span>
          ))}
          {extraTopics > 0 && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
              +{extraTopics} more
            </span>
          )}
        </div>
      )}
    </article>
  );
}
