'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserCardUser {
  id: string;
  username: string;
  displayName?: string;
  avatar?: string | null;
  bio?: string | null;
  followersCount: number;
  isFollowing?: boolean;
}

interface UserCardProps {
  user: UserCardUser;
  variant?: 'compact' | 'full';
  onFollowChange?: (userId: string, isFollowing: boolean) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFollowers(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

function getInitials(username: string, displayName?: string | null): string {
  const name = displayName ?? username;
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// ---------------------------------------------------------------------------
// Avatar sub-component
// ---------------------------------------------------------------------------

function Avatar({ user, size }: { user: UserCardUser; size: 'sm' | 'lg' }) {
  const [imgError, setImgError] = useState(false);
  const dim = size === 'lg' ? 48 : 32;
  const sizeClass = size === 'lg' ? 'w-12 h-12' : 'w-8 h-8';
  const textClass = size === 'lg' ? 'text-base' : 'text-xs';

  if (user.avatar && !imgError) {
    return (
      <Image
        src={user.avatar}
        alt={user.username}
        width={dim}
        height={dim}
        className={`${sizeClass} rounded-full object-cover shrink-0`}
        onError={() => setImgError(true)}
        unoptimized
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full bg-gradient-to-br from-[var(--primary)]/60 to-purple-600/60 flex items-center justify-center shrink-0`}
      aria-hidden="true"
    >
      <span className={`${textClass} font-semibold text-white`}>
        {getInitials(user.username, user.displayName)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function UserCard({ user, variant = 'full', onFollowChange }: UserCardProps) {
  const [isFollowing, setIsFollowing] = useState(user.isFollowing ?? false);
  const [isPending, setIsPending] = useState(false);

  async function handleFollowToggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isPending) return;

    const next = !isFollowing;
    // Optimistic update
    setIsFollowing(next);
    setIsPending(true);

    try {
      onFollowChange?.(user.id, next);
    } finally {
      setIsPending(false);
    }
  }

  if (variant === 'compact') {
    return (
      <Link
        href={`/profile/${user.username}`}
        className="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--surface-secondary)] transition-colors group"
      >
        <Avatar user={user} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--foreground)] truncate group-hover:text-[var(--primary)] transition-colors">
            {user.displayName ?? user.username}
          </p>
          <p className="text-xs text-[var(--foreground-secondary)] truncate">
            @{user.username}
          </p>
        </div>
        <button
          type="button"
          onClick={handleFollowToggle}
          disabled={isPending}
          aria-label={isFollowing ? `Unfollow ${user.username}` : `Follow ${user.username}`}
          className={[
            'shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors disabled:opacity-50',
            isFollowing
              ? 'bg-[var(--surface-secondary)] text-[var(--foreground-secondary)] hover:bg-[var(--error)]/15 hover:text-[var(--error)] border border-[var(--border)]'
              : 'bg-[var(--primary)] text-white hover:bg-[var(--primary)]/80',
          ].join(' ')}
        >
          {isFollowing ? 'Following' : 'Follow'}
        </button>
      </Link>
    );
  }

  // Full variant
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/profile/${user.username}`}
          className="flex items-center gap-3 group min-w-0"
        >
          <Avatar user={user} size="lg" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--foreground)] truncate group-hover:text-[var(--primary)] transition-colors">
              {user.displayName ?? user.username}
            </p>
            <p className="text-xs text-[var(--foreground-secondary)] truncate">
              @{user.username}
            </p>
          </div>
        </Link>

        <button
          type="button"
          onClick={handleFollowToggle}
          disabled={isPending}
          aria-label={isFollowing ? `Unfollow ${user.username}` : `Follow ${user.username}`}
          className={[
            'shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-colors disabled:opacity-50',
            isFollowing
              ? 'bg-[var(--surface-secondary)] text-[var(--foreground-secondary)] hover:bg-[var(--error)]/15 hover:text-[var(--error)] border border-[var(--border)]'
              : 'bg-[var(--primary)] text-white hover:bg-[var(--primary)]/80',
          ].join(' ')}
        >
          {isPending ? '...' : isFollowing ? 'Following' : 'Follow'}
        </button>
      </div>

      {/* Bio */}
      {user.bio && (
        <p className="text-sm text-[var(--foreground-secondary)] line-clamp-2 leading-relaxed">
          {user.bio}
        </p>
      )}

      {/* Followers count */}
      <div className="flex items-center gap-1.5 text-xs text-[var(--foreground-secondary)]">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span>
          <span className="font-semibold text-[var(--foreground)]">
            {formatFollowers(user.followersCount)}
          </span>{' '}
          followers
        </span>
      </div>
    </div>
  );
}

export default UserCard;
