'use client';

import { useState } from 'react';
import EmptyState from '@/components/EmptyState';

interface RepoMediaTabProps {
  mediaPosts: any[];
}

function fmt(num?: number) {
  return Number(num || 0).toLocaleString();
}

export default function RepoMediaTab({ mediaPosts }: RepoMediaTabProps) {
  const [selectedPost, setSelectedPost] = useState<any | null>(null);
  const [filter, setFilter] = useState<'all' | 'image' | 'video'>('all');

  const filtered = mediaPosts.filter((post) => {
    if (filter === 'image') return post.mediaType !== 'video';
    if (filter === 'video') return post.mediaType === 'video';
    return true;
  });

  if (mediaPosts.length === 0) {
    return (
      <EmptyState
        icon="📷"
        title="No media yet"
        description="Screenshots, videos, and reels about this repository will appear here."
      />
    );
  }

  return (
    <div>
      {/* Filter bar */}
      <div className="mb-4 flex gap-2">
        {(['all', 'image', 'video'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition ${
              filter === f
                ? 'bg-primary text-white'
                : 'bg-hover text-foreground-secondary hover:text-foreground'
            }`}
          >
            {f === 'all' ? 'All' : f === 'image' ? 'Images' : 'Videos'}
          </button>
        ))}
        <span className="ml-auto text-xs text-foreground-secondary self-center">
          {filtered.length} item{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-3">
        {filtered.map((post) => (
          <button
            key={post.id}
            onClick={() => setSelectedPost(post)}
            className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-background transition hover:border-primary/30"
          >
            {post.mediaType === 'video' ? (
              <>
                <video src={post.mediaUrl} className="h-full w-full object-cover" muted preload="metadata" />
                <div className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
                  <svg className="inline h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </>
            ) : (
              <img
                src={post.mediaUrl || post.gifUrl}
                alt="Media"
                className="h-full w-full object-cover"
                loading="lazy"
              />
            )}
            {/* Hover overlay */}
            <div className="absolute inset-0 flex items-center justify-center gap-4 bg-black/50 text-white opacity-0 transition group-hover:opacity-100">
              <div className="flex items-center gap-1 text-sm font-medium">
                <svg className="h-5 w-5 fill-white" viewBox="0 0 24 24">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
                {fmt(post.likesCount || post._count?.likes)}
              </div>
              <div className="flex items-center gap-1 text-sm font-medium">
                <svg className="h-5 w-5 fill-white" viewBox="0 0 24 24">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
                </svg>
                {fmt(post.commentsCount || post._count?.comments)}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Lightbox modal */}
      {selectedPost && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setSelectedPost(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-xl bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedPost(null)}
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {selectedPost.mediaType === 'video' ? (
              <video
                src={selectedPost.mediaUrl}
                controls
                autoPlay
                className="max-h-[80vh] w-full object-contain"
              />
            ) : (
              <img
                src={selectedPost.mediaUrl || selectedPost.gifUrl}
                alt="Media"
                className="max-h-[80vh] w-full object-contain"
              />
            )}
            <div className="flex items-center gap-4 border-t border-border px-4 py-3 text-sm text-foreground-secondary">
              <span className="font-medium text-foreground">@{selectedPost.user?.username || 'unknown'}</span>
              <div className="flex items-center gap-1">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
                {fmt(selectedPost.likesCount || selectedPost._count?.likes)}
              </div>
              <div className="flex items-center gap-1">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
                </svg>
                {fmt(selectedPost.commentsCount || selectedPost._count?.comments)}
              </div>
              {selectedPost.content && (
                <p className="ml-2 truncate">{selectedPost.content.slice(0, 100)}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
