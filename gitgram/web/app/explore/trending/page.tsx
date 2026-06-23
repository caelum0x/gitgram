'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { trendingService, type TrendingTier } from '@/services/trendingService'
import { buildRepoPath } from '@/utils/repositoryRouting'
import { parseAitmChangeStoryBlock } from '@/utils/aitmChangeStory'
import RepoTextQuickActions from '@/components/repo/RepoTextQuickActions'

const TIERS: Array<{ label: string; value: TrendingTier }> = [
  { label: 'Hot Now', value: 'HOT_NOW' },
  { label: 'Today', value: 'TRENDING_TODAY' },
  { label: 'This Week', value: 'THIS_WEEK' },
  { label: 'Rising', value: 'RISING_STARS' },
]

const LANGUAGES = ['All', 'TypeScript', 'JavaScript', 'Python', 'Go', 'Rust']

function TrendingPostCard({ post }: { post: any }) {
  const { story, cleanContent } = parseAitmChangeStoryBlock(post.content || '')
  const isChangeStory = post.type === 'CHANGE_STORY' || Boolean(story || post.aitmCheckpointId)
  const displayText = story?.title || cleanContent || 'Post without text content'
  const changedFilesCount =
    story?.changedFiles?.length ||
    (Array.isArray(post.aitmCheckpointRef?.files) ? post.aitmCheckpointRef.files.length : 0)

  return (
    <Link
      href={`/post/${post.id}`}
      className="block rounded-xl border border-border bg-surface p-4 hover:border-accent"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">
          @{post.user?.username || 'unknown'}
        </span>
        <span className="text-xs text-foreground/50">#{post.trendingRank}</span>
      </div>

      {isChangeStory && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 font-medium text-accent">
            Change Story
          </span>
          {(story?.checkpointId || post.aitmCheckpointId) && (
            <span className="font-mono text-foreground/50">
              {(story?.checkpointId || post.aitmCheckpointId).slice(0, 10)}
            </span>
          )}
        </div>
      )}

      <p className="line-clamp-3 text-sm text-foreground/80">{displayText}</p>

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-foreground/60">
        <span>Likes {post._count?.likes || 0}</span>
        <span>Comments {post._count?.comments || 0}</span>
        {changedFilesCount > 0 && <span>Files {changedFilesCount}</span>}
        {post.repository?.fullName && <span>{post.repository.fullName}</span>}
      </div>
    </Link>
  )
}

export default function ExploreTrendingPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const [tier, setTier] = useState<TrendingTier>('TRENDING_TODAY')
  const [language, setLanguage] = useState('All')
  const [posts, setPosts] = useState<any[]>([])
  const [repos, setRepos] = useState<any[]>([])
  const [creators, setCreators] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login')
      return
    }
    loadTrending()
  }, [isAuthenticated, router, tier, language])

  const loadTrending = async () => {
    setLoading(true)
    setError(null)

    try {
      const params = {
        tier,
        limit: 12,
        ...(language !== 'All' ? { language: language.toLowerCase() } : {}),
      }

      const [postsResult, reposResult, creatorsResult] = await Promise.all([
        trendingService.getPosts(params),
        trendingService.getRepos(params),
        trendingService.getCreators({ tier, limit: 8 }),
      ])

      setPosts(postsResult?.posts || [])
      setRepos(reposResult?.repos || [])
      setCreators(creatorsResult?.creators || [])
    } catch (err) {
      setError('Failed to load trending content.')
      setPosts([])
      setRepos([])
      setCreators([])
    } finally {
      setLoading(false)
    }
  }

  if (!isAuthenticated) return null

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">Trending</h1>
          <p className="mt-2 text-sm text-foreground/70">
            Live ranking from real Gitgram trending entries for posts, repositories, and creators.
          </p>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {TIERS.map((item) => (
            <button
              key={item.value}
              onClick={() => setTier(item.value)}
              className={`rounded-full border px-4 py-2 text-sm font-medium ${
                tier === item.value
                  ? 'border-primary bg-primary text-white'
                  : 'border-border bg-surface text-foreground'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mb-8 flex flex-wrap gap-2">
          {LANGUAGES.map((item) => (
            <button
              key={item}
              onClick={() => setLanguage(item)}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                language === item
                  ? 'border-accent bg-accent text-white'
                  : 'border-border bg-background text-foreground/80'
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-foreground/70">Loading trending content...</div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-3">
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-foreground">Trending Posts</h2>
                <Link href="/search" className="text-sm text-accent hover:underline">
                  Search all
                </Link>
              </div>
              <div className="space-y-3">
                {posts.map((post) => (
                  <TrendingPostCard key={post.id} post={post} />
                ))}
                {posts.length === 0 && (
                  <div className="rounded-xl border border-border bg-surface p-4 text-sm text-foreground/60">
                    No trending posts for the current filters.
                  </div>
                )}
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-foreground">Trending Repositories</h2>
                <Link href="/explore/repos" className="text-sm text-accent hover:underline">
                  Explore repos
                </Link>
              </div>
              <div className="space-y-3">
                {repos.map((repo) => (
                  <Link
                    key={repo.id}
                    href={buildRepoPath(repo.owner, repo.name)}
                    className="block rounded-xl border border-border bg-surface p-4 hover:border-accent"
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="font-semibold text-foreground">{repo.fullName}</span>
                      <span className="text-xs text-foreground/50">#{repo.trendingRank}</span>
                    </div>
                    <p className="line-clamp-2 text-sm text-foreground/80">
                      {repo.description || 'No description'}
                    </p>
                    <div className="mt-3 flex gap-3 text-xs text-foreground/60">
                      <span>⭐ {repo.stars || 0}</span>
                      <span>🍴 {repo.forks || 0}</span>
                      {repo.language && <span>{repo.language}</span>}
                    </div>
                    <RepoTextQuickActions
                      owner={repo.owner}
                      name={repo.name}
                      className="mt-3"
                      buttonClassName="border-border bg-background/80 text-foreground-secondary hover:border-accent hover:text-accent"
                    />
                  </Link>
                ))}
                {repos.length === 0 && (
                  <div className="rounded-xl border border-border bg-surface p-4 text-sm text-foreground/60">
                    No trending repositories for the current filters.
                  </div>
                )}
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-foreground">Trending Creators</h2>
                <Link href="/discover/suggested" className="text-sm text-accent hover:underline">
                  Discover more
                </Link>
              </div>
              <div className="space-y-3">
                {creators.map((creator) => (
                  <Link
                    key={creator.id}
                    href={`/profile/${creator.username}`}
                    className="block rounded-xl border border-border bg-surface p-4 hover:border-accent"
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="font-semibold text-foreground">@{creator.username}</span>
                      <span className="text-xs text-foreground/50">#{creator.trendingRank}</span>
                    </div>
                    <p className="line-clamp-2 text-sm text-foreground/80">
                      {creator.bio || 'No bio'}
                    </p>
                    <div className="mt-3 flex gap-3 text-xs text-foreground/60">
                      <span>Followers {creator._count?.followers || 0}</span>
                      <span>Posts {creator._count?.posts || 0}</span>
                    </div>
                  </Link>
                ))}
                {creators.length === 0 && (
                  <div className="rounded-xl border border-border bg-surface p-4 text-sm text-foreground/60">
                    No trending creators for the current filters.
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
