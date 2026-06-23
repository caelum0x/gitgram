'use client'

import { cn } from '@/lib/utils'

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'circular' | 'text'
}

export function Skeleton({ className, variant = 'default', ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse bg-muted/50',
        variant === 'circular' && 'rounded-full',
        variant === 'text' && 'rounded h-4',
        variant === 'default' && 'rounded-xl',
        className
      )}
      aria-hidden="true"
      {...props}
    />
  )
}

// Post Card Skeleton
export function PostCardSkeleton() {
  return (
    <div className="p-4 bg-card border border-border rounded-xl space-y-3" aria-label="Loading post">
      <div className="flex items-center gap-3">
        <Skeleton variant="circular" className="w-10 h-10" />
        <div className="space-y-2 flex-1">
          <Skeleton variant="text" className="w-32 h-3.5" />
          <Skeleton variant="text" className="w-24 h-3" />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton variant="text" className="w-full h-3.5" />
        <Skeleton variant="text" className="w-3/4 h-3.5" />
      </div>
      <Skeleton className="w-full h-48 rounded-lg" />
      <div className="flex items-center gap-6 pt-2">
        <Skeleton className="w-14 h-6 rounded-md" />
        <Skeleton className="w-14 h-6 rounded-md" />
        <Skeleton className="w-14 h-6 rounded-md" />
      </div>
    </div>
  )
}

// User Card Skeleton
export function UserCardSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3" aria-label="Loading user">
      <Skeleton variant="circular" className="w-12 h-12" />
      <div className="space-y-2 flex-1">
        <Skeleton variant="text" className="w-32 h-3.5" />
        <Skeleton variant="text" className="w-48 h-3" />
      </div>
      <Skeleton className="w-20 h-8 rounded-lg" />
    </div>
  )
}

// Comment Skeleton
export function CommentSkeleton() {
  return (
    <div className="flex gap-3" aria-label="Loading comment">
      <Skeleton variant="circular" className="w-8 h-8" />
      <div className="space-y-2 flex-1">
        <div className="flex items-center gap-2">
          <Skeleton variant="text" className="w-24 h-3" />
          <Skeleton variant="text" className="w-12 h-2.5" />
        </div>
        <Skeleton variant="text" className="w-full h-3.5" />
        <Skeleton variant="text" className="w-2/3 h-3.5" />
      </div>
    </div>
  )
}

// Story Circle Skeleton
export function StoryCircleSkeleton() {
  return (
    <div className="flex flex-col items-center gap-1" aria-label="Loading story">
      <Skeleton variant="circular" className="w-16 h-16" />
      <Skeleton variant="text" className="w-12 h-2.5" />
    </div>
  )
}

// Repository Card Skeleton
export function RepoCardSkeleton() {
  return (
    <div className="p-4 bg-card border border-border rounded-xl space-y-3" aria-label="Loading repository">
      <div className="flex items-start gap-3">
        <Skeleton className="w-12 h-12 rounded-lg" />
        <div className="space-y-2 flex-1">
          <Skeleton variant="text" className="w-48 h-4" />
          <Skeleton variant="text" className="w-full h-3" />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Skeleton variant="text" className="w-16 h-3" />
        <Skeleton variant="text" className="w-16 h-3" />
        <Skeleton variant="text" className="w-16 h-3" />
      </div>
    </div>
  )
}

// Notification Skeleton
export function NotificationSkeleton() {
  return (
    <div className="flex items-start gap-3 p-3" aria-label="Loading notification">
      <Skeleton variant="circular" className="w-10 h-10" />
      <div className="space-y-2 flex-1">
        <Skeleton variant="text" className="w-full h-3.5" />
        <Skeleton variant="text" className="w-24 h-3" />
      </div>
      <Skeleton className="w-10 h-10 rounded-lg" />
    </div>
  )
}

// Profile Header Skeleton
export function ProfileHeaderSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading profile">
      <Skeleton className="w-full h-40" />
      <div className="px-4 -mt-12 relative">
        <Skeleton variant="circular" className="w-24 h-24 border-4 border-background" />
        <div className="mt-4 space-y-2">
          <Skeleton variant="text" className="w-48 h-6" />
          <Skeleton variant="text" className="w-32 h-3.5" />
          <Skeleton variant="text" className="w-full max-w-md h-3.5" />
        </div>
        <div className="flex gap-8 mt-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-1">
              <Skeleton variant="text" className="w-12 h-5" />
              <Skeleton variant="text" className="w-16 h-3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Feed Skeleton
export function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4" role="status" aria-label="Loading feed">
      {Array.from({ length: count }).map((_, i) => (
        <PostCardSkeleton key={i} />
      ))}
    </div>
  )
}

// Chat List Skeleton
export function ChatListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="divide-y divide-border" role="status" aria-label="Loading conversations">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <Skeleton variant="circular" className="w-12 h-12" />
          <div className="flex-1 space-y-2">
            <div className="flex justify-between">
              <Skeleton variant="text" className="w-32 h-3.5" />
              <Skeleton variant="text" className="w-12 h-2.5" />
            </div>
            <Skeleton variant="text" className="w-48 h-3" />
          </div>
        </div>
      ))}
    </div>
  )
}

// Search Results Skeleton
export function SearchResultsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading search results">
      {Array.from({ length: count }).map((_, i) => (
        <UserCardSkeleton key={i} />
      ))}
    </div>
  )
}

// Comments List Skeleton
export function CommentsListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4" role="status" aria-label="Loading comments">
      {Array.from({ length: count }).map((_, i) => (
        <CommentSkeleton key={i} />
      ))}
    </div>
  )
}
