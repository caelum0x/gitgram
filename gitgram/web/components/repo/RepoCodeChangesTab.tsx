'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { AitmChangeStory } from '@/utils/aitmChangeStory';
import { parseAitmChangeStoryBlock } from '@/utils/aitmChangeStory';
import EmptyState from '@/components/EmptyState';

interface RepoCodeChangesTabProps {
  owner: string;
  name: string;
  activities: any[];
  posts: any[];
}

/** Extracts AITM checkpoint-linked stories from posts. */
function extractCheckpointPosts(posts: any[]): { post: any; story: AitmChangeStory; cleanContent: string }[] {
  const results: { post: any; story: AitmChangeStory; cleanContent: string }[] = [];
  for (const post of posts) {
    const { story, cleanContent } = parseAitmChangeStoryBlock(post.content || '');
    if (story) {
      results.push({ post, story, cleanContent });
    }
  }
  return results;
}

/** File change type badge */
function ChangeTypeBadge({ type }: { type: 'added' | 'removed' | 'modified' }) {
  const styles = {
    added: 'bg-green-500/10 text-green-500 border-green-500/20',
    removed: 'bg-red-500/10 text-red-500 border-red-500/20',
    modified: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  };
  const labels = { added: 'Added', removed: 'Removed', modified: 'Modified' };
  return (
    <span className={`rounded border px-1.5 py-0.5 text-xs font-medium ${styles[type]}`}>
      {labels[type]}
    </span>
  );
}

/** A single checkpoint-linked change story card */
function CheckpointCard({
  story,
  cleanContent,
  post,
  owner,
  name,
}: {
  story: AitmChangeStory;
  cleanContent: string;
  post: any;
  owner: string;
  name: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const aitmUrl = story.aitmProjectId
    ? `https://timemachine.gitgram.app/project/${story.aitmProjectId}/checkpoint/${story.checkpointId}`
    : null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden transition hover:border-blue-500/30">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-blue-500/5 to-purple-500/5 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <svg className="h-4 w-4 flex-shrink-0 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <h3 className="text-sm font-semibold text-foreground truncate">
              {story.title || 'AITM Change Story'}
            </h3>
          </div>
          <div className="flex items-center gap-2 text-xs text-foreground-secondary">
            <span className="rounded bg-blue-500/10 px-2 py-0.5 font-mono text-blue-500">
              checkpoint {story.checkpointId.slice(0, 8)}
            </span>
            {story.fromCheckpointId && (
              <>
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                <span className="rounded bg-gray-500/10 px-2 py-0.5 font-mono">
                  from {story.fromCheckpointId.slice(0, 8)}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-foreground-secondary">
          {post.user?.username && (
            <span>by @{post.user.username}</span>
          )}
          {post.createdAt && (
            <span>{new Date(post.createdAt).toLocaleDateString()}</span>
          )}
        </div>
      </div>

      {/* Diff summary */}
      <div className="grid grid-cols-3 gap-px bg-border">
        <div className="flex items-center justify-center gap-2 bg-card px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/10">
            <svg className="h-4 w-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-bold text-green-500">{story.diffAdded}</p>
            <p className="text-xs text-foreground-secondary">Added</p>
          </div>
        </div>
        <div className="flex items-center justify-center gap-2 bg-card px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10">
            <svg className="h-4 w-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-bold text-red-500">{story.diffRemoved}</p>
            <p className="text-xs text-foreground-secondary">Removed</p>
          </div>
        </div>
        <div className="flex items-center justify-center gap-2 bg-card px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-500/10">
            <svg className="h-4 w-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-bold text-yellow-500">{story.diffModified}</p>
            <p className="text-xs text-foreground-secondary">Modified</p>
          </div>
        </div>
      </div>

      {/* Changed files */}
      {story.changedFiles.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex w-full items-center justify-between text-xs font-medium text-foreground-secondary hover:text-foreground transition"
          >
            <span>Changed files ({story.changedFiles.length})</span>
            <svg
              className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {expanded && (
            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border bg-background">
              {story.changedFiles.map((file, idx) => (
                <div
                  key={file + idx}
                  className="flex items-center gap-2 border-b border-border/50 px-3 py-1.5 last:border-b-0"
                >
                  <svg className="h-3.5 w-3.5 flex-shrink-0 text-foreground-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="truncate font-mono text-xs text-foreground">{file}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Description and CTA */}
      <div className="border-t border-border px-4 py-3">
        {cleanContent && (
          <p className="mb-3 text-sm text-foreground">{cleanContent}</p>
        )}
        <div className="flex items-center gap-3">
          {aitmUrl && (
            <a
              href={aitmUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-blue-700"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              View full diff on AITM
            </a>
          )}
          <Link
            href={`/compose?type=change_story&owner=${owner}&name=${name}`}
            className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground transition hover:bg-hover"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Create Change Story
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function RepoCodeChangesTab({ owner, name, activities, posts }: RepoCodeChangesTabProps) {
  const checkpointPosts = useMemo(() => extractCheckpointPosts(posts), [posts]);

  return (
    <div className="space-y-6">
      {/* Checkpoint-linked posts */}
      {checkpointPosts.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <svg className="h-5 w-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <h2 className="text-base font-semibold text-foreground">Checkpoint-Linked Changes</h2>
            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-500">
              {checkpointPosts.length}
            </span>
          </div>
          <div className="space-y-4">
            {checkpointPosts.map(({ post, story, cleanContent }) => (
              <CheckpointCard
                key={post.id}
                post={post}
                story={story}
                cleanContent={cleanContent}
                owner={owner}
                name={name}
              />
            ))}
          </div>
        </section>
      )}

      {/* Activity timeline */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-foreground-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-base font-semibold text-foreground">Activity Timeline</h2>
          </div>
          <Link
            href={`/compose?type=change_story&owner=${owner}&name=${name}`}
            className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary-hover"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Change Story
          </Link>
        </div>

        {activities.length === 0 && checkpointPosts.length === 0 ? (
          <EmptyState
            icon="🔄"
            title="No code changes yet"
            description="Create change stories to track this repository's evolution. Link AITM checkpoints for visual diffs."
          />
        ) : activities.length === 0 ? null : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute bottom-0 left-5 top-0 w-px bg-border" />

            <div className="space-y-0">
              {activities.map((activity, idx) => (
                <div key={activity.id} className="relative flex gap-4 pb-6">
                  {/* Timeline dot */}
                  <div className="relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 border-border bg-card">
                    <ActivityIcon eventType={activity.eventType} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 rounded-lg border border-border bg-card px-4 py-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-medium text-primary capitalize">
                        {(activity.eventType || 'event').replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-foreground-secondary">
                        {new Date(activity.occurredAt || activity.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-foreground">
                      {activity.summary || activity.title || activity.description || 'Repository activity captured.'}
                    </p>
                    {activity.commitSha && (
                      <p className="mt-1.5 inline-block rounded bg-background px-2 py-0.5 font-mono text-xs text-foreground-secondary">
                        {activity.commitSha.slice(0, 7)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ActivityIcon({ eventType }: { eventType?: string }) {
  const type = (eventType || '').toLowerCase();
  if (type.includes('push') || type.includes('commit')) {
    return (
      <svg className="h-4 w-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    );
  }
  if (type.includes('pull') || type.includes('pr')) {
    return (
      <svg className="h-4 w-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16m-7 6h7" />
      </svg>
    );
  }
  if (type.includes('issue')) {
    return (
      <svg className="h-4 w-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    );
  }
  if (type.includes('release') || type.includes('tag')) {
    return (
      <svg className="h-4 w-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4 text-foreground-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}
