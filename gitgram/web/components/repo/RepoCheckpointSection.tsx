'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { AitmChangeStory, parseAitmChangeStoryBlock } from '@/utils/aitmChangeStory';

interface RepoCheckpointSectionProps {
  owner: string;
  name: string;
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

export default function RepoCheckpointSection({ owner, name, posts }: RepoCheckpointSectionProps) {
  const checkpointPosts = useMemo(() => extractCheckpointPosts(posts), [posts]);
  const [showAll, setShowAll] = useState(false);

  // Hide section entirely if no checkpoint posts
  if (checkpointPosts.length === 0) return null;

  const displayed = showAll ? checkpointPosts : checkpointPosts.slice(0, 3);

  return (
    <section className="rounded-xl border border-blue-500/20 bg-gradient-to-r from-blue-500/5 to-purple-500/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-blue-500/20 px-5 py-3">
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <h2 className="text-sm font-semibold text-foreground">Checkpoint-Linked Change Stories</h2>
          <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-500">
            {checkpointPosts.length}
          </span>
        </div>
        <Link
          href={`/compose?type=change_story&owner=${owner}&name=${name}`}
          className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Story
        </Link>
      </div>

      {/* Checkpoint cards */}
      <div className="divide-y divide-blue-500/10">
        {displayed.map(({ post, story, cleanContent }) => {
          const aitmUrl = story.aitmProjectId
            ? `https://timemachine.gitgram.app/project/${story.aitmProjectId}/checkpoint/${story.checkpointId}`
            : null;

          return (
            <div key={post.id} className="px-5 py-4 transition hover:bg-blue-500/5">
              <div className="flex items-start gap-4">
                {/* Checkpoint indicator */}
                <div className="flex flex-col items-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  {/* Vertical connector line */}
                  <div className="mt-1 h-full w-px bg-blue-500/20" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-foreground truncate">
                      {story.title || 'Change Story'}
                    </h3>
                    <span className="rounded bg-blue-500/10 px-2 py-0.5 font-mono text-xs text-blue-500 flex-shrink-0">
                      {story.checkpointId.slice(0, 8)}
                    </span>
                  </div>

                  {cleanContent && (
                    <p className="mb-2 text-sm text-foreground-secondary line-clamp-2">{cleanContent}</p>
                  )}

                  {/* Diff stats mini */}
                  <div className="mb-2 flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 text-green-500">
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      +{story.diffAdded}
                    </span>
                    <span className="flex items-center gap-1 text-red-500">
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                      </svg>
                      -{story.diffRemoved}
                    </span>
                    <span className="flex items-center gap-1 text-yellow-500">
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      ~{story.diffModified}
                    </span>
                    {story.changedFiles.length > 0 && (
                      <span className="text-foreground-secondary">
                        {story.changedFiles.length} file{story.changedFiles.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {/* Meta row */}
                  <div className="flex items-center gap-3 text-xs text-foreground-secondary">
                    <span>by @{post.user?.username || 'unknown'}</span>
                    {post.createdAt && (
                      <span>{formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}</span>
                    )}
                    {story.fromCheckpointId && (
                      <span className="rounded bg-gray-500/10 px-1.5 py-0.5 font-mono text-[10px]">
                        from {story.fromCheckpointId.slice(0, 8)}
                      </span>
                    )}
                    {aitmUrl && (
                      <a
                        href={aitmUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-400 transition"
                      >
                        View on AITM
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Show more / less */}
      {checkpointPosts.length > 3 && (
        <div className="border-t border-blue-500/10 px-5 py-2.5">
          <button
            onClick={() => setShowAll(!showAll)}
            className="w-full text-center text-xs font-medium text-blue-500 hover:text-blue-400 transition"
          >
            {showAll
              ? 'Show less'
              : `Show all ${checkpointPosts.length} change stories`}
          </button>
        </div>
      )}
    </section>
  );
}
