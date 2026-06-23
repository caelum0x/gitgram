'use client'

import { useRef, useCallback, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useInfiniteQuery } from '@tanstack/react-query'
import api from '@/services/api'

interface TagPost {
  id: string
  mediaUrl?: string
  mediaUrls?: string[]
  mediaType?: string
  likesCount?: number
  content?: string
}

interface TagPostsPage {
  posts: TagPost[]
  nextCursor: string | null
}

async function fetchTagPosts(tag: string, cursor?: string): Promise<TagPostsPage> {
  const params: Record<string, string> = { tag }
  if (cursor) params.cursor = cursor
  const res = await api.get('/v1/tags/posts', { params })
  const data = res.data as TagPostsPage
  return { posts: data.posts ?? [], nextCursor: data.nextCursor ?? null }
}

export default function TagPostsPage() {
  const params = useParams()
  const router = useRouter()
  const tag = params.tag as string
  const sentinelRef = useRef<HTMLDivElement>(null)

  const { data, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage, status } =
    useInfiniteQuery({
      queryKey: ['tag-posts', tag],
      queryFn: ({ pageParam }) => fetchTagPosts(tag, pageParam as string | undefined),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
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

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="flex items-center gap-2 mb-6">
          <h1 className="text-2xl font-bold text-foreground">#{tag}</h1>
          <button
            onClick={() => router.push(`/hashtag/${tag}`)}
            className="text-xs text-primary hover:underline ml-auto"
          >
            Grid view
          </button>
        </div>

        {status === 'pending' && (
          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-square bg-muted animate-pulse rounded" />
            ))}
          </div>
        )}

        {status === 'error' && (
          <p className="text-center py-12 text-destructive">Failed to load posts for #{tag}</p>
        )}

        {status === 'success' && posts.length === 0 && (
          <div className="text-center py-12 text-foreground/70">No posts found for #{tag}</div>
        )}

        {posts.length > 0 && (
          <div className="grid grid-cols-3 gap-1">
            {posts.map((post) => {
              const mediaUrl = post.mediaUrl ?? post.mediaUrls?.[0]
              return (
                <Link
                  key={post.id}
                  href={`/post/${post.id}`}
                  className="relative aspect-square group overflow-hidden rounded"
                  aria-label={post.content ? `Post: ${post.content.slice(0, 60)}` : 'View post'}
                >
                  {mediaUrl && (post.mediaType === 'image' || !post.mediaType) && (
                    <>
                      <Image src={mediaUrl} alt="Post" fill className="object-cover group-hover:scale-105 transition-transform duration-200" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end p-2">
                        <span className="text-white text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                          ❤️ {post.likesCount ?? 0}
                        </span>
                      </div>
                    </>
                  )}
                  {!mediaUrl && (
                    <div className="w-full h-full bg-muted flex items-center justify-center p-3 text-xs text-muted-foreground text-center line-clamp-4">
                      {post.content ?? ''}
                    </div>
                  )}
                </Link>
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
