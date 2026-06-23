'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'react-hot-toast';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CollectionOwner {
  id: string;
  username: string;
  avatar: string | null;
}

interface Collection {
  id: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  user: CollectionOwner;
  postCount: number;
  createdAt: string;
}

interface CollectionItemAuthor {
  id: string;
  username: string;
  avatar: string | null;
}

interface CollectionItem {
  id: string;
  content: string;
  author: CollectionItemAuthor;
  likes: number;
  comments: number;
  createdAt: string;
  tags: string[];
  repoOwner: string | null;
  repoName: string | null;
}

interface ItemsPage {
  items: CollectionItem[];
  total: number;
  page: number;
  totalPages: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return `${diffSec}s`;
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24) return `${diffHr}h`;
  if (diffDay < 7) return `${diffDay}d`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CollectionHeaderSkeleton() {
  return (
    <div className="animate-pulse">
      <div
        className="h-8 w-64 rounded-lg mb-3"
        style={{ background: 'var(--surface-secondary)' }}
      />
      <div
        className="h-4 w-96 rounded mb-4"
        style={{ background: 'var(--surface-secondary)' }}
      />
      <div className="flex items-center gap-3">
        <div
          className="h-8 w-8 rounded-full"
          style={{ background: 'var(--surface-secondary)' }}
        />
        <div
          className="h-4 w-24 rounded"
          style={{ background: 'var(--surface-secondary)' }}
        />
      </div>
    </div>
  );
}

function ItemSkeleton() {
  return (
    <div
      className="rounded-xl p-4 animate-pulse"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="h-7 w-7 rounded-full"
          style={{ background: 'var(--surface-secondary)' }}
        />
        <div
          className="h-3 w-24 rounded"
          style={{ background: 'var(--surface-secondary)' }}
        />
      </div>
      <div
        className="h-4 w-full rounded mb-2"
        style={{ background: 'var(--surface-secondary)' }}
      />
      <div
        className="h-4 w-3/4 rounded"
        style={{ background: 'var(--surface-secondary)' }}
      />
    </div>
  );
}

interface ConfirmDeleteModalProps {
  collectionName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}

function ConfirmDeleteModal({
  collectionName,
  onConfirm,
  onCancel,
  isDeleting,
}: ConfirmDeleteModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          className="text-lg font-semibold mb-2"
          style={{ color: 'var(--foreground)' }}
        >
          Delete collection?
        </h2>
        <p className="text-sm mb-6" style={{ color: 'var(--foreground-secondary)' }}>
          <strong style={{ color: 'var(--foreground)' }}>{collectionName}</strong> will be
          permanently deleted. This action cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: 'var(--surface-secondary)',
              color: 'var(--foreground)',
              border: '1px solid var(--border)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity"
            style={{
              background: 'var(--error)',
              color: '#fff',
              opacity: isDeleting ? 0.6 : 1,
            }}
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface CompactPostCardProps {
  item: CollectionItem;
  collectionId: string;
  isOwner: boolean;
  onRemove: (itemId: string) => void;
}

function CompactPostCard({ item, collectionId, isOwner, onRemove }: CompactPostCardProps) {
  const repoLabel =
    item.repoOwner && item.repoName ? `${item.repoOwner}/${item.repoName}` : null;

  return (
    <div
      className="group rounded-xl p-4 transition-colors"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {/* Author row */}
      <div className="flex items-center justify-between mb-3">
        <Link
          href={`/${item.author.username}`}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          {item.author.avatar ? (
            <img
              src={item.author.avatar}
              alt={item.author.username}
              className="h-7 w-7 rounded-full object-cover"
            />
          ) : (
            <div
              className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: 'var(--primary)', color: '#fff' }}
            >
              {item.author.username[0].toUpperCase()}
            </div>
          )}
          <span
            className="text-sm font-medium"
            style={{ color: 'var(--foreground)' }}
          >
            {item.author.username}
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>
            {formatRelativeTime(item.createdAt)}
          </span>

          {isOwner && (
            <button
              onClick={() => onRemove(item.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-xs px-2 py-1 rounded-md"
              style={{
                background: 'var(--surface-secondary)',
                color: 'var(--error)',
                border: '1px solid var(--border)',
              }}
              title="Remove from collection"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <Link href={`/posts/${item.id}`} className="block group/link">
        <p
          className="text-sm leading-relaxed mb-3 group-hover/link:opacity-80 transition-opacity"
          style={{ color: 'var(--foreground)' }}
        >
          {truncate(item.content, 180)}
        </p>
      </Link>

      {/* Repo label */}
      {repoLabel && (
        <div className="mb-3">
          <span
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
            style={{
              background: 'var(--surface-secondary)',
              color: 'var(--foreground-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 2.5A2.5 2.5 0 014.5 0h7A2.5 2.5 0 0114 2.5v10.5a.5.5 0 01-.777.416L8 10.101l-5.223 3.315A.5.5 0 012 13V2.5z" />
            </svg>
            {repoLabel}
          </span>
        </div>
      )}

      {/* Footer: tags + stats */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {item.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-xs px-1.5 py-0.5 rounded"
              style={{ background: 'var(--surface-secondary)', color: 'var(--primary)' }}
            >
              #{tag}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span
            className="flex items-center gap-1 text-xs"
            style={{ color: 'var(--foreground-secondary)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
            </svg>
            {item.likes}
          </span>
          <span
            className="flex items-center gap-1 text-xs"
            style={{ color: 'var(--foreground-secondary)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            {item.comments}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CollectionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const collectionId = params.id as string;

  const [collection, setCollection] = useState<Collection | null>(null);
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingCollection, setLoadingCollection] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const isOwner = !!user && !!collection && user.id === collection.user.id;

  // ── Data fetching ──────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function loadCollection() {
      setLoadingCollection(true);
      try {
        const { data } = await api.get<Collection>(`/collections/${collectionId}`);
        if (!cancelled) setCollection(data);
      } catch {
        if (!cancelled) toast.error('Failed to load collection');
      } finally {
        if (!cancelled) setLoadingCollection(false);
      }
    }

    loadCollection();
    return () => { cancelled = true; };
  }, [collectionId]);

  const loadItems = useCallback(
    async (pageNum: number) => {
      if (loadingItems) return;
      setLoadingItems(true);
      try {
        const { data } = await api.get<ItemsPage>(
          `/collections/${collectionId}/items`,
          { params: { page: pageNum, limit: 20 } }
        );
        setItems((prev) => (pageNum === 1 ? data.items : [...prev, ...data.items]));
        setTotalPages(data.totalPages);
        setPage(data.page);
      } catch {
        toast.error('Failed to load items');
      } finally {
        setLoadingItems(false);
      }
    },
    [collectionId, loadingItems]
  );

  // Initial items load (after collection is loaded to avoid race)
  useEffect(() => {
    if (!loadingCollection) {
      loadItems(1);
    }
    // loadItems reference is stable per collectionId; only trigger on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingCollection]);

  // ── Infinite scroll ────────────────────────────────────────────────────────

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    observerRef.current?.disconnect();

    if (page >= totalPages || loadingItems) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadItems(page + 1);
        }
      },
      { threshold: 0.1 }
    );

    observerRef.current.observe(sentinel);

    return () => observerRef.current?.disconnect();
  }, [page, totalPages, loadingItems, loadItems]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleShare = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard');
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await api.delete(`/collections/${collectionId}`);
      toast.success('Collection deleted');
      router.push('/collections');
    } catch {
      toast.error('Failed to delete collection');
      setIsDeleting(false);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    try {
      await api.delete(`/collections/${collectionId}/items/${itemId}`);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      setCollection((prev) =>
        prev ? { ...prev, postCount: Math.max(0, prev.postCount - 1) } : prev
      );
      toast.success('Removed from collection');
    } catch {
      toast.error('Failed to remove item');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div
        className="min-h-screen"
        style={{ background: 'var(--background)' }}
      >
        <div className="max-w-2xl mx-auto px-4 py-8">

          {/* Back link */}
          <Link
            href="/collections"
            className="inline-flex items-center gap-1 text-sm mb-6 hover:opacity-80 transition-opacity"
            style={{ color: 'var(--foreground-secondary)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            All collections
          </Link>

          {/* Collection header */}
          {loadingCollection ? (
            <CollectionHeaderSkeleton />
          ) : collection ? (
            <div
              className="rounded-2xl p-6 mb-6"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              {/* Name + badges row */}
              <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                <h1
                  className="text-2xl font-bold leading-tight"
                  style={{ color: 'var(--foreground)' }}
                >
                  {collection.name}
                </h1>

                <div className="flex items-center gap-2 mt-1 shrink-0">
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{
                      background: 'var(--surface-secondary)',
                      color: 'var(--foreground-secondary)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {collection.postCount} {collection.postCount === 1 ? 'post' : 'posts'}
                  </span>
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{
                      background: collection.isPrivate
                        ? 'rgba(210,153,34,0.15)'
                        : 'rgba(35,134,54,0.15)',
                      color: collection.isPrivate ? 'var(--warning)' : 'var(--accent)',
                      border: `1px solid ${collection.isPrivate ? 'var(--warning)' : 'var(--accent)'}`,
                    }}
                  >
                    {collection.isPrivate ? 'Private' : 'Public'}
                  </span>
                </div>
              </div>

              {/* Description */}
              {collection.description && (
                <p
                  className="text-sm mb-4 leading-relaxed"
                  style={{ color: 'var(--foreground-secondary)' }}
                >
                  {collection.description}
                </p>
              )}

              {/* Owner row */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <Link
                  href={`/${collection.user.username}`}
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                >
                  {collection.user.avatar ? (
                    <img
                      src={collection.user.avatar}
                      alt={collection.user.username}
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold"
                      style={{ background: 'var(--primary)', color: '#fff' }}
                    >
                      {collection.user.username[0].toUpperCase()}
                    </div>
                  )}
                  <span
                    className="text-sm font-medium"
                    style={{ color: 'var(--foreground)' }}
                  >
                    {collection.user.username}
                  </span>
                </Link>

                {/* Owner actions */}
                {isOwner && (
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/collections/${collectionId}/edit`}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                      style={{
                        background: 'var(--surface-secondary)',
                        color: 'var(--foreground)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      Edit
                    </Link>

                    <button
                      onClick={handleShare}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                      style={{
                        background: 'var(--surface-secondary)',
                        color: 'var(--foreground)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="18" cy="5" r="3" />
                        <circle cx="6" cy="12" r="3" />
                        <circle cx="18" cy="19" r="3" />
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                      </svg>
                      Share
                    </button>

                    <button
                      onClick={() => setShowDeleteModal(true)}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                      style={{
                        background: 'rgba(218,54,51,0.1)',
                        color: 'var(--error)',
                        border: '1px solid var(--error)',
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                      </svg>
                      Delete
                    </button>
                  </div>
                )}

                {/* Non-owner share */}
                {!isOwner && (
                  <button
                    onClick={handleShare}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                    style={{
                      background: 'var(--surface-secondary)',
                      color: 'var(--foreground)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="18" cy="5" r="3" />
                      <circle cx="6" cy="12" r="3" />
                      <circle cx="18" cy="19" r="3" />
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                    </svg>
                    Share
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div
              className="rounded-2xl p-8 text-center mb-6"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <p style={{ color: 'var(--foreground-secondary)' }}>Collection not found.</p>
            </div>
          )}

          {/* Items list */}
          <div className="flex flex-col gap-3">
            {/* Initial loading skeletons */}
            {loadingCollection && (
              <>
                <ItemSkeleton />
                <ItemSkeleton />
                <ItemSkeleton />
              </>
            )}

            {!loadingCollection && items.length === 0 && !loadingItems && (
              <div
                className="rounded-2xl p-10 text-center"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <svg
                  className="mx-auto mb-4 opacity-30"
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  style={{ color: 'var(--foreground-secondary)' }}
                >
                  <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <p
                  className="text-sm font-medium mb-1"
                  style={{ color: 'var(--foreground)' }}
                >
                  No posts yet
                </p>
                <p className="text-xs" style={{ color: 'var(--foreground-secondary)' }}>
                  Save posts to this collection and they will appear here.
                </p>
              </div>
            )}

            {items.map((item) => (
              <CompactPostCard
                key={item.id}
                item={item}
                collectionId={collectionId}
                isOwner={isOwner}
                onRemove={handleRemoveItem}
              />
            ))}

            {/* Infinite-scroll loading indicator */}
            {loadingItems && items.length > 0 && (
              <>
                <ItemSkeleton />
                <ItemSkeleton />
              </>
            )}

            {/* Sentinel for IntersectionObserver */}
            <div ref={sentinelRef} className="h-1" aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteModal && collection && (
        <ConfirmDeleteModal
          collectionName={collection.name}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
          isDeleting={isDeleting}
        />
      )}
    </>
  );
}
