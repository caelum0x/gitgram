'use client';

import { useMemo } from 'react';
import { Repository } from '@/services/repoService';

interface RepoStatsDashboardProps {
  repository: Repository;
  posts: any[];
}

function fmt(num?: number) {
  return Number(num || 0).toLocaleString();
}

export default function RepoStatsDashboard({ repository, posts }: RepoStatsDashboardProps) {
  const totalLikes = useMemo(
    () => posts.reduce((sum, p) => sum + (p.likesCount || p._count?.likes || 0), 0),
    [posts]
  );

  const totalComments = useMemo(
    () => posts.reduce((sum, p) => sum + (p.commentsCount || p._count?.comments || 0), 0),
    [posts]
  );

  const totalShares = useMemo(
    () => posts.reduce((sum, p) => sum + (p.sharesCount || p._count?.shares || 0), 0),
    [posts]
  );

  const engagementRate = useMemo(() => {
    if (posts.length === 0) return '0';
    const total = totalLikes + totalComments + totalShares;
    return (total / posts.length).toFixed(1);
  }, [posts, totalLikes, totalComments, totalShares]);

  const topPosts = useMemo(() => {
    return [...posts]
      .sort((a, b) => {
        const aScore = (a.likesCount || 0) + (a.commentsCount || 0);
        const bScore = (b.likesCount || 0) + (b.commentsCount || 0);
        return bScore - aScore;
      })
      .slice(0, 3);
  }, [posts]);

  const stats = [
    {
      label: 'Total Posts',
      value: fmt(repository.social?.posts || posts.length),
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
        </svg>
      ),
      color: 'text-blue-500 bg-blue-500/10',
    },
    {
      label: 'Followers',
      value: fmt(repository.social?.followers),
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      color: 'text-purple-500 bg-purple-500/10',
    },
    {
      label: 'Total Likes',
      value: fmt(totalLikes),
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      ),
      color: 'text-red-500 bg-red-500/10',
    },
    {
      label: 'Avg. Engagement',
      value: engagementRate,
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      ),
      color: 'text-green-500 bg-green-500/10',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-card p-4">
            <div className={`mb-2 flex h-10 w-10 items-center justify-center rounded-lg ${stat.color}`}>
              {stat.icon}
            </div>
            <p className="text-xl font-bold text-foreground">{stat.value}</p>
            <p className="text-xs text-foreground-secondary">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Top posts */}
      {topPosts.length > 0 && (
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">Top Posts</h3>
          </div>
          <div className="divide-y divide-border">
            {topPosts.map((post, idx) => (
              <div key={post.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm text-foreground">
                    {post.content?.replace(/\[AITM_CHANGE_STORY\][\s\S]*?\[\/AITM_CHANGE_STORY\]/g, '').trim().slice(0, 80) || 'Media post'}
                  </p>
                  <p className="text-xs text-foreground-secondary">
                    by @{post.user?.username || 'unknown'}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-foreground-secondary">
                  <span className="flex items-center gap-1">
                    <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                    {post.likesCount || 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
                    </svg>
                    {post.commentsCount || 0}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
