'use client';

import { Repository } from '@/services/repoService';

interface RepoHeroProps {
  repository: Repository;
  onFollow: () => void;
}

function fmt(num?: number) {
  return Number(num || 0).toLocaleString();
}

function languageColor(lang?: string): string {
  const colors: Record<string, string> = {
    TypeScript: 'bg-blue-500',
    JavaScript: 'bg-yellow-400',
    Python: 'bg-green-500',
    Rust: 'bg-orange-600',
    Go: 'bg-cyan-500',
    Java: 'bg-red-500',
    'C++': 'bg-pink-500',
    C: 'bg-gray-500',
    Ruby: 'bg-red-600',
    Swift: 'bg-orange-500',
    Kotlin: 'bg-purple-500',
    PHP: 'bg-indigo-400',
    Dart: 'bg-teal-500',
    Shell: 'bg-emerald-600',
    HTML: 'bg-orange-400',
    CSS: 'bg-purple-400',
  };
  return colors[lang || ''] || 'bg-gray-400';
}

export default function RepoHero({ repository, onFollow }: RepoHeroProps) {
  const ownerInitial = repository.owner?.[0]?.toUpperCase() || 'R';
  const topics = repository.topics || [];

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card">
      {/* Gradient banner */}
      <div className="h-32 bg-gradient-to-r from-purple-600 via-blue-600 to-cyan-500" />

      <div className="relative px-6 pb-6">
        {/* Avatar */}
        <div className="-mt-12 mb-4 flex items-end justify-between">
          <div className="flex h-24 w-24 items-center justify-center rounded-xl border-4 border-card bg-gradient-to-br from-purple-500 to-blue-600 text-3xl font-bold text-white shadow-lg">
            {ownerInitial}
          </div>
          <div className="flex items-center gap-3">
            <a
              href={repository.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-hover"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              View on GitHub
            </a>
            <button
              onClick={onFollow}
              className={`rounded-lg px-5 py-2 text-sm font-semibold transition ${
                repository.isFollowing
                  ? 'border border-border bg-background text-foreground hover:bg-hover'
                  : 'bg-primary text-white hover:bg-primary-hover'
              }`}
            >
              {repository.isFollowing ? 'Following' : 'Follow'}
            </button>
          </div>
        </div>

        {/* Name and description */}
        <h1 className="mb-1 text-2xl font-bold text-foreground">{repository.fullName}</h1>
        <p className="mb-4 text-sm text-foreground-secondary">
          {repository.description || 'No description provided.'}
        </p>

        {/* Topics */}
        {topics.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {topics.map((topic) => (
              <span
                key={topic}
                className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition cursor-default"
              >
                {topic}
              </span>
            ))}
          </div>
        )}

        {/* Stats row */}
        <div className="flex flex-wrap items-center gap-5 text-sm text-foreground-secondary">
          <div className="flex items-center gap-1.5">
            <svg className="h-4 w-4 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            <span className="font-semibold text-foreground">{fmt(repository.stars)}</span>
            <span>stars</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="font-semibold text-foreground">{fmt(repository.forks)}</span>
            <span>forks</span>
          </div>
          {repository.watchers !== undefined && repository.watchers > 0 && (
            <div className="flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span className="font-semibold text-foreground">{fmt(repository.watchers)}</span>
              <span>watchers</span>
            </div>
          )}
          {repository.language && (
            <div className="flex items-center gap-1.5">
              <span className={`h-3 w-3 rounded-full ${languageColor(repository.language)}`} />
              <span>{repository.language}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="font-semibold text-foreground">{fmt(repository.social?.followers)}</span>
            <span>followers</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
            </svg>
            <span className="font-semibold text-foreground">{fmt(repository.social?.posts)}</span>
            <span>posts</span>
          </div>
        </div>
      </div>
    </div>
  );
}
