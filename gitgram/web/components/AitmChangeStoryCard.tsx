'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AitmChangeStory } from '@/utils/aitmChangeStory';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AitmChangeStoryCardProps {
  story: AitmChangeStory;
  cleanContent?: string;
  postId?: string;
  authorUsername?: string;
  authorAvatar?: string;
  createdAt?: string;
  onLike?: () => void;
  onComment?: () => void;
  onShare?: () => void;
  liked?: boolean;
  likeCount?: number;
  commentCount?: number;
}

// ---------------------------------------------------------------------------
// Helper: Diff bar with colored segments
// ---------------------------------------------------------------------------

function DiffBar({ added, removed, modified }: { added: number; removed: number; modified: number }) {
  const total = added + removed + modified || 1;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-background">
      <div
        className="bg-green-500 transition-all"
        style={{ width: `${(added / total) * 100}%` }}
        title={`${added} added`}
      />
      <div
        className="bg-red-500 transition-all"
        style={{ width: `${(removed / total) * 100}%` }}
        title={`${removed} removed`}
      />
      <div
        className="bg-yellow-500 transition-all"
        style={{ width: `${(modified / total) * 100}%` }}
        title={`${modified} modified`}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: file change type icon
// ---------------------------------------------------------------------------

function FileChangeIcon({ fileName }: { fileName: string }) {
  // Infer change type from common diff prefixes or default to modified
  const lower = fileName.toLowerCase();
  if (lower.startsWith('+ ') || lower.startsWith('a ')) {
    return (
      <svg className="h-3.5 w-3.5 flex-shrink-0 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
    );
  }
  if (lower.startsWith('- ') || lower.startsWith('d ')) {
    return (
      <svg className="h-3.5 w-3.5 flex-shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
      </svg>
    );
  }
  // Default: modified / generic file icon
  return (
    <svg className="h-3.5 w-3.5 flex-shrink-0 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AitmChangeStoryCard({
  story,
  cleanContent,
  postId,
  authorUsername,
  authorAvatar,
  createdAt,
  onLike,
  onComment,
  onShare,
  liked = false,
  likeCount = 0,
  commentCount = 0,
}: AitmChangeStoryCardProps) {
  const [filesExpanded, setFilesExpanded] = useState(false);
  const [diffPreviewFile, setDiffPreviewFile] = useState<string | null>(null);

  const aitmUrl = story.aitmProjectId
    ? `https://timemachine.gitgram.app/project/${story.aitmProjectId}/checkpoint/${story.checkpointId}`
    : null;

  const totalChanges = story.diffAdded + story.diffRemoved + story.diffModified;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card transition hover:border-blue-500/30">
      {/* ---- Header ---- */}
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
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
                <span className="rounded bg-gray-500/10 px-2 py-0.5 font-mono">
                  from {story.fromCheckpointId.slice(0, 8)}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs text-foreground-secondary">
          {authorUsername && (
            <div className="flex items-center gap-1.5">
              {authorAvatar && (
                <img src={authorAvatar} alt="" className="h-4 w-4 rounded-full" />
              )}
              <span>@{authorUsername}</span>
            </div>
          )}
          {createdAt && (
            <span>{new Date(createdAt).toLocaleDateString()}</span>
          )}
        </div>
      </div>

      {/* ---- Diff summary with colored bars ---- */}
      <div className="px-4 py-3">
        <DiffBar added={story.diffAdded} removed={story.diffRemoved} modified={story.diffModified} />
        <div className="mt-2 grid grid-cols-3 gap-2">
          <div className="flex items-center justify-center gap-2 rounded-lg border border-green-500/20 bg-green-500/5 py-2">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-green-500/10">
              <svg className="h-3.5 w-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <p className="text-base font-bold text-green-500">{story.diffAdded}</p>
              <p className="text-[10px] text-foreground-secondary">Added</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 py-2">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-red-500/10">
              <svg className="h-3.5 w-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
              </svg>
            </div>
            <div>
              <p className="text-base font-bold text-red-500">{story.diffRemoved}</p>
              <p className="text-[10px] text-foreground-secondary">Removed</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5 py-2">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-yellow-500/10">
              <svg className="h-3.5 w-3.5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <div>
              <p className="text-base font-bold text-yellow-500">{story.diffModified}</p>
              <p className="text-[10px] text-foreground-secondary">Modified</p>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Expandable file list with change type icons ---- */}
      {story.changedFiles.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <button
            onClick={() => setFilesExpanded(!filesExpanded)}
            className="flex w-full items-center justify-between text-xs font-medium text-foreground-secondary hover:text-foreground transition"
          >
            <span>Changed files ({story.changedFiles.length})</span>
            <svg
              className={`h-4 w-4 transition-transform ${filesExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {filesExpanded && (
            <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-border bg-background">
              {story.changedFiles.slice(0, 50).map((file, idx) => (
                <div
                  key={file + idx}
                  className="group flex items-center gap-2 border-b border-border/50 px-3 py-1.5 last:border-b-0 hover:bg-hover transition cursor-pointer"
                  onClick={() => setDiffPreviewFile(diffPreviewFile === file ? null : file)}
                >
                  <FileChangeIcon fileName={file} />
                  <span className="flex-1 truncate font-mono text-xs text-foreground">{file}</span>
                  <svg className="h-3.5 w-3.5 text-foreground-secondary opacity-0 group-hover:opacity-100 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </div>
              ))}
              {story.changedFiles.length > 50 && (
                <p className="px-3 py-2 text-xs text-foreground-secondary">
                  ...and {story.changedFiles.length - 50} more files
                </p>
              )}
            </div>
          )}

          {/* Code diff preview placeholder for selected file */}
          {diffPreviewFile && filesExpanded && (
            <div className="mt-2 overflow-hidden rounded-lg border border-border bg-[#0d1117]">
              <div className="flex items-center justify-between border-b border-gray-700 px-3 py-2">
                <span className="font-mono text-xs text-gray-400">{diffPreviewFile}</span>
                <button
                  onClick={() => setDiffPreviewFile(null)}
                  className="text-xs text-gray-500 hover:text-gray-300"
                >
                  Close
                </button>
              </div>
              <div className="px-3 py-2">
                <p className="text-xs text-gray-500 italic">
                  Diff preview available when viewing the full change story.
                  {aitmUrl && ' Click "View full diff" below to see the complete diff on AITM.'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- Author narrative section ---- */}
      {cleanContent && (
        <div className="border-t border-border px-4 py-3">
          <div className="mb-1 flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5 text-foreground-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span className="text-[10px] font-medium uppercase tracking-wider text-foreground-secondary">Author Narrative</span>
          </div>
          <p className="text-sm text-foreground whitespace-pre-wrap">{cleanContent}</p>
        </div>
      )}

      {/* ---- CTA links ---- */}
      <div className="border-t border-border px-4 py-3">
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
          {postId && (
            <Link
              href={`/post/${postId}`}
              className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground transition hover:bg-hover"
            >
              View post
            </Link>
          )}
        </div>
      </div>

      {/* ---- Engagement buttons (like, comment, share) ---- */}
      <div className="flex items-center justify-between border-t border-border px-4 py-2">
        {/* Like */}
        <button
          onClick={onLike}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition hover:bg-hover ${
            liked ? 'text-red-500' : 'text-foreground-secondary'
          }`}
        >
          <svg
            className="h-4 w-4"
            fill={liked ? 'currentColor' : 'none'}
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          {likeCount > 0 && <span>{likeCount}</span>}
        </button>

        {/* Comment */}
        <button
          onClick={onComment}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-foreground-secondary transition hover:bg-hover hover:text-foreground"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {commentCount > 0 && <span>{commentCount}</span>}
        </button>

        {/* Share */}
        <button
          onClick={onShare}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-foreground-secondary transition hover:bg-hover hover:text-foreground"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          <span>Share</span>
        </button>

        {/* Bookmark / AITM link (compact) */}
        {story.aitmProjectId && (
          <span className="rounded bg-blue-500/10 px-2 py-0.5 text-[10px] font-mono text-blue-500">
            AITM
          </span>
        )}
      </div>
    </div>
  );
}
