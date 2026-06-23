'use client';

import { useState, useEffect } from 'react';
import { Repository } from '@/services/repoService';
import EmptyState from '@/components/EmptyState';

interface RepoAboutTabProps {
  repository: Repository;
  owner: string;
  name: string;
}

function fmt(num?: number) {
  return Number(num || 0).toLocaleString();
}

export default function RepoAboutTab({ repository, owner, name }: RepoAboutTabProps) {
  const [readmeContent, setReadmeContent] = useState<string | null>(null);
  const [readmeLoading, setReadmeLoading] = useState(true);
  const [contributors, setContributors] = useState<any[]>([]);

  useEffect(() => {
    fetchReadme();
    fetchContributors();
  }, [owner, name]);

  const fetchReadme = async () => {
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${name}/readme`, {
        headers: { Accept: 'application/vnd.github.v3.raw' },
      });
      if (res.ok) {
        const text = await res.text();
        setReadmeContent(text);
      }
    } catch {
      // README not available
    } finally {
      setReadmeLoading(false);
    }
  };

  const fetchContributors = async () => {
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${name}/contributors?per_page=20`);
      if (res.ok) {
        const data = await res.json();
        setContributors(Array.isArray(data) ? data : []);
      }
    } catch {
      // Contributors not available
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Main content - README */}
      <div className="lg:col-span-2">
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <svg className="h-4 w-4 text-foreground-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h2 className="text-sm font-semibold text-foreground">README.md</h2>
          </div>
          <div className="px-4 py-4">
            {readmeLoading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-6 w-3/4 rounded bg-hover" />
                <div className="h-4 w-full rounded bg-hover" />
                <div className="h-4 w-5/6 rounded bg-hover" />
                <div className="h-4 w-2/3 rounded bg-hover" />
                <div className="h-4 w-full rounded bg-hover" />
                <div className="h-4 w-4/5 rounded bg-hover" />
              </div>
            ) : readmeContent ? (
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <pre className="whitespace-pre-wrap rounded-lg bg-background p-4 text-xs leading-relaxed text-foreground">
                  {readmeContent.length > 3000 ? readmeContent.slice(0, 3000) + '\n\n... (truncated)' : readmeContent}
                </pre>
              </div>
            ) : (
              <p className="text-sm text-foreground-secondary">No README found for this repository.</p>
            )}
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="space-y-6">
        {/* Repository info */}
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">About</h3>
          </div>
          <div className="space-y-3 px-4 py-3">
            {repository.description && (
              <p className="text-sm text-foreground">{repository.description}</p>
            )}

            <div className="space-y-2 text-sm">
              {repository.language && (
                <div className="flex items-center gap-2 text-foreground-secondary">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  <span>{repository.language}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-foreground-secondary">
                <svg className="h-4 w-4 text-yellow-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                <span>{fmt(repository.stars)} stars</span>
              </div>
              <div className="flex items-center gap-2 text-foreground-secondary">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>{fmt(repository.forks)} forks</span>
              </div>
              <div className="flex items-center gap-2 text-foreground-secondary">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>{fmt(repository.social?.followers)} followers</span>
              </div>
            </div>

            <a
              href={repository.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              View on GitHub
            </a>
          </div>
        </div>

        {/* Contributors */}
        {contributors.length > 0 && (
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold text-foreground">
                Contributors ({contributors.length})
              </h3>
            </div>
            <div className="px-4 py-3">
              <div className="flex flex-wrap gap-1.5">
                {contributors.slice(0, 20).map((contributor) => (
                  <a
                    key={contributor.id}
                    href={contributor.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`${contributor.login} (${contributor.contributions} commits)`}
                    className="group relative"
                  >
                    <img
                      src={contributor.avatar_url}
                      alt={contributor.login}
                      className="h-8 w-8 rounded-full border-2 border-transparent transition group-hover:border-primary"
                      loading="lazy"
                    />
                  </a>
                ))}
              </div>
              {contributors.length > 20 && (
                <a
                  href={`https://github.com/${owner}/${name}/graphs/contributors`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 block text-xs text-primary hover:underline"
                >
                  View all contributors
                </a>
              )}
            </div>
          </div>
        )}

        {/* License placeholder */}
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">License</h3>
          </div>
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-foreground-secondary">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
              </svg>
              <span>View license on GitHub</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
