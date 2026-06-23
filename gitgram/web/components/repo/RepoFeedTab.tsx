'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { repoService } from '@/services/repoService';
import { postService } from '@/services/postService';
import RichContent from '@/components/RichContent';
import AitmChangeStoryCard from '@/components/AitmChangeStoryCard';
import { parseAitmChangeStoryBlock } from '@/utils/aitmChangeStory';
import EmptyState from '@/components/EmptyState';

interface RepoFeedTabProps {
  owner: string;
  name: string;
  initialPosts: any[];
}

function fmt(num?: number) {
  return Number(num || 0).toLocaleString();
}

export default function RepoFeedTab({ owner, name, initialPosts }: RepoFeedTabProps) {
  const [posts, setPosts] = useState<any[]>(initialPosts);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialPosts.length >= 10);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Infinite scroll observer
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore && hasMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, page]);

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await repoService.getPosts(owner, name, { page: nextPage, limit: 10 });
      const data = res.data;
      const newPosts = data?.posts || [];
      if (newPosts.length === 0) {
        setHasMore(false);
      } else {
        setPosts((prev) => [...prev, ...newPosts.filter((p: any) => !prev.find((e: any) => e.id === p.id))]);
        setHasMore(data?.pagination?.hasMore ?? false);
        setPage(nextPage);
      }
    } catch (error) {
      console.error('Failed to load more posts', error);
    } finally {
      setLoadingMore(false);
    }
  }, [owner, name, page, loadingMore]);

  const handleLike = async (postId: string) => {
    try {
      await postService.likePost(postId);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, isLiked: true, likesCount: (p.likesCount || 0) + 1 }
            : p
        )
      );
    } catch (error) {
      console.error('Failed to like post', error);
    }
  };

  const handleUnlike = async (postId: string) => {
    try {
      await postService.unlikePost(postId);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, isLiked: false, likesCount: Math.max(0, (p.likesCount || 0) - 1) }
            : p
        )
      );
    } catch (error) {
      console.error('Failed to unlike post', error);
    }
  };

  const handleShare = async (postId: string) => {
    try {
      await postService.sharePost(postId);
      const url = `${window.location.origin}/post/${postId}`;
      if (navigator.share) {
        await navigator.share({ url, title: `Post from ${owner}/${name}` });
      } else {
        await navigator.clipboard.writeText(url);
      }
    } catch (error) {
      console.error('Failed to share post', error);
    }
  };

  if (posts.length === 0) {
    return (
      <EmptyState
        icon="posts"
        title="No posts yet"
        description={`Be the first to post about ${owner}/${name}. Share your thoughts, screenshots, or code snippets.`}
      />
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => {
        const { story, cleanContent } = parseAitmChangeStoryBlock(post.content || '');
        return (
          <div key={post.id} className="rounded-xl border border-border bg-card overflow-hidden transition hover:border-primary/20">
            {/* Post header */}
            <div className="flex items-center gap-3 px-4 pt-4 pb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
                {post.user?.avatar ? (
                  <img src={post.user.avatar} alt={post.user.username} className="h-full w-full rounded-full object-cover" />
                ) : (
                  <span className="text-sm font-semibold text-primary">
                    {post.user?.username?.[0]?.toUpperCase() || '?'}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  @{post.user?.username || 'unknown'}
                </p>
                <p className="text-xs text-foreground-secondary">
                  {post.createdAt ? formatDistanceToNow(new Date(post.createdAt), { addSuffix: true }) : ''}
                </p>
              </div>
              {story && (
                <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-500">
                  change story
                </span>
              )}
              {!story && post.repositoryTag && (
                <span className="rounded-full bg-purple-500/10 px-2.5 py-0.5 text-xs font-medium text-purple-500">
                  repo post
                </span>
              )}
            </div>

            {/* Post content */}
            <div className="px-4 pb-3">
              {story && <AitmChangeStoryCard story={story} />}
              {cleanContent && (
                <div className="text-sm text-foreground">
                  <RichContent content={cleanContent} />
                </div>
              )}
            </div>

            {/* Media */}
            {post.mediaUrl && (
              <div className="border-y border-border bg-background">
                {post.mediaType === 'video' ? (
                  <video src={post.mediaUrl} controls className="max-h-[480px] w-full object-contain" />
                ) : (
                  <img src={post.mediaUrl} alt="Post media" className="max-h-[480px] w-full object-contain" />
                )}
              </div>
            )}
            {!post.mediaUrl && post.gifUrl && (
              <div className="border-y border-border bg-background">
                <img src={post.gifUrl} alt="GIF" className="max-h-[480px] w-full object-contain" />
              </div>
            )}

            {/* Interaction bar */}
            <div className="flex items-center gap-1 px-4 py-3">
              <button
                onClick={() => (post.isLiked ? handleUnlike(post.id) : handleLike(post.id))}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition hover:bg-hover ${
                  post.isLiked ? 'text-red-500' : 'text-foreground-secondary'
                }`}
              >
                <svg
                  className={`h-5 w-5 ${post.isLiked ? 'fill-red-500' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                  />
                </svg>
                <span>{fmt(post.likesCount || post._count?.likes)}</span>
              </button>

              <button className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-foreground-secondary transition hover:bg-hover">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                <span>{fmt(post.commentsCount || post._count?.comments)}</span>
              </button>

              <button
                onClick={() => handleShare(post.id)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-foreground-secondary transition hover:bg-hover"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                  />
                </svg>
                <span>Share</span>
              </button>
            </div>
          </div>
        );
      })}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-4" />
      {loadingMore && (
        <div className="flex justify-center py-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
      {!hasMore && posts.length > 0 && (
        <p className="py-4 text-center text-sm text-foreground-secondary">No more posts to load.</p>
      )}
    </div>
  );
}
