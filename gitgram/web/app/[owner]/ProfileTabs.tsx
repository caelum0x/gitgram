'use client'

import { useRef, useCallback, useEffect, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import api from '@/services/api'
import PostCard from '@/components/PostCard'
import GitHubProfileCard from '@/components/GitHubProfileCard'
import RepositorySocialCard from '@/components/RepositorySocialCard'

// ---- Types ------------------------------------------------------------------

interface Post {
  id: string
  content?: string
  mediaUrl?: string
  mediaUrls?: string[]
  gifUrl?: string
  mediaType?: string
  likesCount: number
  commentsCount: number
  isLiked: boolean
  createdAt: string
  user: { id: string; username: string; avatar?: string }
}

interface PostsPage {
  posts: Post[]
  nextCursor: string | null
}

interface UserRepo {
  id: string
  owner: string
  name: string
  fullName: string
  description?: string
  stars: number
  forks: number
  language?: string
  topics?: string[]
  isFollowed?: boolean
  followersCount?: number
}

interface GitHubProfile {
  login: string
  name?: string
  bio?: string
  avatarUrl?: string
  followers?: number
  following?: number
  publicRepos?: number
  company?: string
  location?: string
  websiteUrl?: string
}

export type TabId = 'posts' | 'projects' | 'github'

// ---- API fetchers -----------------------------------------------------------

async function fetchUserPostsPage(username: string, cursor?: string): Promise<PostsPage> {
  const params: Record<string, string> = {}
  if (cursor) params.cursor = cursor
  const { data } = await api.get(`/v1/users/${username}/posts`, { params })
  return { posts: data.posts ?? [], nextCursor: data.nextCursor ?? null }
}

async function fetchUserRepositories(username: string): Promise<UserRepo[]> {
  const { data } = await api.get(`/v1/users/${username}/repositories`)
  return data.repositories ?? data ?? []
}

async function fetchGitHubProfile(username: string): Promise<GitHubProfile> {
  const { data } = await api.get(`/v1/users/${username}/github-profile`)
  return data
}

// ---- Tab content components -------------------------------------------------

function PostsTab({ username }: { username: string }) {
  const sentinelRef = useRef<HTMLDivElement>(null)

  const { data, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage, status } =
    useInfiniteQuery({
      queryKey: ['user-posts', username],
      queryFn: ({ pageParam }) =>
        fetchUserPostsPage(username, pageParam as string | undefined),
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
    const observer = new IntersectionObserver(onIntersect, { rootMargin: '300px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [onIntersect])

  if (status === 'pending') {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    )
  }

  if (status === 'error') {
    return <p className="text-center text-destructive py-12">Failed to load posts.</p>
  }

  if (posts.length === 0) {
    return <p className="text-center text-muted-foreground py-16">No posts yet.</p>
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={{
            id: post.id,
            content: post.content ?? '',
            author: {
              username: post.user.username,
              displayName: post.user.username,
              avatarUrl: post.user.avatar,
            },
            likes: post.likesCount,
            comments: post.commentsCount,
            reposts: 0,
            createdAt: post.createdAt,
            isLiked: post.isLiked,
          }}
          onLike={() => undefined}
        />
      ))}
      <div ref={sentinelRef} className="h-1" />
      {isFetchingNextPage && (
        <div className="flex justify-center py-6">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}

function ProjectsTab({ username }: { username: string }) {
  const { data, status } = useQuery({
    queryKey: ['user-repos', username],
    queryFn: () => fetchUserRepositories(username),
  })

  if (status === 'pending') {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    )
  }

  if (status === 'error') {
    return (
      <p className="text-center text-destructive py-12">Failed to load repositories.</p>
    )
  }

  const repos = data ?? []

  if (repos.length === 0) {
    return <p className="text-center text-muted-foreground py-16">No repositories yet.</p>
  }

  return (
    <div className="space-y-3">
      {repos.map((repo) => (
        <RepositorySocialCard
          key={repo.id}
          id={repo.id}
          owner={repo.owner}
          name={repo.name}
          fullName={repo.fullName}
          description={repo.description}
          stars={repo.stars}
          forks={repo.forks}
          language={repo.language}
          topics={repo.topics}
          isFollowed={repo.isFollowed}
          followersCount={repo.followersCount}
        />
      ))}
    </div>
  )
}

function GitHubTab({
  username,
  githubUsername,
}: {
  username: string
  githubUsername?: string
}) {
  const { data, status } = useQuery({
    queryKey: ['user-github', username],
    queryFn: () => fetchGitHubProfile(username),
    enabled: Boolean(githubUsername),
  })

  if (!githubUsername) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground mb-2">No GitHub account linked.</p>
      </div>
    )
  }

  if (status === 'pending') {
    return (
      <div className="flex justify-center pt-8">
        <GitHubProfileCard login={githubUsername} isLoading />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <p className="text-center text-destructive py-12">Failed to load GitHub profile.</p>
    )
  }

  return (
    <div className="flex justify-center pt-8">
      <GitHubProfileCard
        login={data?.login ?? githubUsername}
        name={data?.name}
        bio={data?.bio}
        avatarUrl={data?.avatarUrl}
        followers={data?.followers}
        following={data?.following}
        publicRepos={data?.publicRepos}
        company={data?.company}
        location={data?.location}
        websiteUrl={data?.websiteUrl}
      />
    </div>
  )
}

// ---- Main export ------------------------------------------------------------

interface ProfileTabsProps {
  username: string
  githubUsername?: string
  initialTab?: TabId
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'posts', label: 'Posts' },
  { id: 'projects', label: 'Projects' },
  { id: 'github', label: 'GitHub' },
]

export default function ProfileTabs({
  username,
  githubUsername,
  initialTab = 'posts',
}: ProfileTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab)

  return (
    <>
      {/* Tab bar */}
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4">
          <nav className="flex" aria-label="Profile sections" role="tablist">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {activeTab === 'posts' && <PostsTab username={username} />}
        {activeTab === 'projects' && <ProjectsTab username={username} />}
        {activeTab === 'github' && (
          <GitHubTab username={username} githubUsername={githubUsername} />
        )}
      </div>
    </>
  )
}
