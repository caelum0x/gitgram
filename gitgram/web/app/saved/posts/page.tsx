'use client'

import { useRef, useCallback, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/components/ui/toast'
import api from '@/services/api'

interface SavedPost {
  id: string
  mediaUrl?: string
  mediaUrls?: string[]
  mediaType?: string
  content?: string
  likesCount?: number
  savedAt: string
  savedPostId: string
  user?: { username: string }
}

interface SavedPostsPage {
  posts: SavedPost[]
  nextCursor: string | null
  hasMore: boolean
}

async function fetchSavedPage(cursor?: string): Promise<SavedPostsPage> {
  const params: Record<string, string> = {}
  if (cursor) params.cursor = cursor
  const res = await api.get('/v1/collections/saved', { params })
  return res.data as SavedPostsPage
}

export default function SavedPostsPage() {
  const router = useRouter()
  const { isAuthenticated, isInitialized } = useAuthStore()
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isInitialized && !isAuthenticated) router.push('/login')
  }, [isAuthenticated, isInitialized, router])

  const { data, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage, status } =
    useInfiniteQuery({
      queryKey: ['saved-posts'],
      queryFn: ({ pageParam }) => fetchSavedPage(pageParam as string | undefined),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      enabled: isAuthenticated,
    })

  const posts = data?.pages.flatMap((p) => p.posts) ?? []

  const onIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetching) fetchNextPage()
    },
    [fetchNextPage, hasNextPage, isFetching]
  )

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(onIntersect, { rootMargin: '200px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [onIntersect])

  // Optimistic unsave (from nextjs-15-social-media-app BookmarkButton pattern)
  const unsaveMutation = useMutation({
    mutationFn: (postId: string) => api.delete(`/v1/post-actions/save/${postId}`),
    onMutate: async (postId) => {
      await queryClient.cancelQueries({ queryKey: ['saved-posts'] })
      const prev = queryClient.getQueryData(['saved-posts'])
      queryClient.setQueryData(['saved-posts'], (old: typeof data) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            posts: p.posts.filter((post) => post.id !== postId),
          })),
        }
      })
      showToast('Removed from saved', 'success')
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['saved-posts'], ctx.prev)
      showToast('Failed to remove', 'error')
    },
  })

  if (!isInitialized || !isAuthenticated) return null

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-2xl font-bold text-foreground">Saved Posts</h1>
          {status === 'success' && posts.length > 0 && (
            <span className="text-sm text-muted-foreground ml-auto">{posts.length} saved</span>
          )}
        </div>

        {status === 'pending' && (
          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="aspect-square bg-muted animate-pulse rounded" />
            ))}
          </div>
        )}

        {status === 'error' && (
          <p className="text-center py-12 text-destructive">Failed to load saved posts</p>
        )}

        {status === 'success' && posts.length === 0 && (
          <div className="text-center py-16 text-foreground/70">
            <p className="text-4xl mb-4">🔖</p>
            <p>No saved posts yet</p>
            <Link href="/" className="mt-4 inline-block text-primary hover:underline text-sm">
              Explore the feed
            </Link>
          </div>
        )}

        {posts.length > 0 && (
          <div className="grid grid-cols-3 gap-1">
            {posts.map((post) => {
              const mediaUrl = post.mediaUrl ?? post.mediaUrls?.[0]
              return (
                <div key={post.id} className="relative aspect-square group overflow-hidden rounded">
                  <Link href={`/post/${post.id}`} aria-label={post.content ? post.content.slice(0, 60) : 'View post'}>
                    {mediaUrl && (post.mediaType === 'image' || !post.mediaType) ? (
                      <Image
                        src={mediaUrl}
                        alt="Saved post"
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center p-3 text-xs text-muted-foreground text-center line-clamp-4">
                        {post.content ?? ''}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end p-2">
                      <span className="text-white text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                        ❤️ {post.likesCount ?? 0}
                      </span>
                    </div>
                  </Link>

                  {/* Unsave button on hover */}
                  <button
                    onClick={() => unsaveMutation.mutate(post.id)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 rounded-full p-1.5 text-white hover:bg-black/80"
                    aria-label="Remove from saved"
                    title="Remove from saved"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                      <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <div ref={sentinelRef} className="h-1" />
        {isFetchingNextPage && (
          <div className="flex justify-center py-6">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  )
}
