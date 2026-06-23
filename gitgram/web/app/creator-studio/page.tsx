'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/components/ui/toast'
import api from '@/services/api'
import { githubService } from '@/services/githubService'
import { draftService, Draft } from '@/services/draftService'
import { buildRepoPath, buildRepoTextPath, buildRepoTextRawPath } from '@/utils/repositoryRouting'

interface Stats {
  totalPosts: number
  totalLikes: number
  totalComments: number
  totalFollowers: number
  recentViews: number
  engagementRate: number
}

interface RecentPost {
  id: string
  content: string
  mediaUrls: string[]
  likesCount: number
  commentsCount: number
  viewsCount: number
  createdAt: string
}

interface CreatorRepo {
  owner: string
  name: string
  fullName: string
  description?: string
}

export default function CreatorStudioPage() {
  const router = useRouter()
  const { isAuthenticated, isInitialized, user } = useAuthStore()
  const { showToast } = useToast()

  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Stats | null>(null)
  const [recentPosts, setRecentPosts] = useState<RecentPost[]>([])
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [scheduledCount, setScheduledCount] = useState(0)
  const [repos, setRepos] = useState<CreatorRepo[]>([])

  useEffect(() => {
    if (!isInitialized) {
      return
    }
    if (!isAuthenticated) {
      router.push('/auth')
      return
    }
    loadData()
  }, [isAuthenticated, isInitialized])

  const loadData = async () => {
    try {
      const [insightsRes, postsRes, draftsData, scheduledRes, repoRes] = await Promise.all([
        api.get('/insights/overview').catch(() => ({ data: null })),
        api.get('/posts/me?limit=5').catch(() => ({ data: [] })),
        draftService.getDrafts().catch(() => []),
        api.get('/scheduled-posts').catch(() => ({ data: [] })),
        githubService.getProjects().catch(() => ({ projects: [] })),
      ])

      if (insightsRes.data) {
        setStats({
          totalPosts: insightsRes.data.totalPosts || 0,
          totalLikes: insightsRes.data.totalLikes || 0,
          totalComments: insightsRes.data.totalComments || 0,
          totalFollowers: insightsRes.data.followers || 0,
          recentViews: insightsRes.data.recentViews || 0,
          engagementRate: insightsRes.data.engagementRate || 0,
        })
      }

      setRecentPosts(postsRes.data?.posts || postsRes.data || [])
      setDrafts(draftsData.slice(0, 3))
      setScheduledCount(scheduledRes.data?.length || 0)
      setRepos(
        ((repoRes as any).projects || repoRes || [])
          .map((repo: any) => ({
            owner: repo.owner?.login || repo.owner || '',
            name: repo.name || '',
            fullName: repo.fullName || repo.full_name || `${repo.owner?.login || repo.owner}/${repo.name}`,
            description: repo.description || '',
          }))
          .filter((repo: CreatorRepo) => repo.owner && repo.name)
          .slice(0, 6)
      )
    } catch (error) {
      console.error('Load data error:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toString()
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  if (!isInitialized || !isAuthenticated) return null

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted">Loading Creator Studio...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Creator Studio</h1>
          <p className="text-muted mt-1">Manage your content and track performance</p>
        </div>
        <Link
          href="/compose"
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Post
        </Link>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <div className="p-4 bg-card border border-border rounded-xl">
          <p className="text-sm text-muted mb-1">Posts</p>
          <p className="text-2xl font-bold">{formatNumber(stats?.totalPosts || 0)}</p>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl">
          <p className="text-sm text-muted mb-1">Followers</p>
          <p className="text-2xl font-bold">{formatNumber(stats?.totalFollowers || 0)}</p>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl">
          <p className="text-sm text-muted mb-1">Likes</p>
          <p className="text-2xl font-bold">{formatNumber(stats?.totalLikes || 0)}</p>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl">
          <p className="text-sm text-muted mb-1">Comments</p>
          <p className="text-2xl font-bold">{formatNumber(stats?.totalComments || 0)}</p>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl">
          <p className="text-sm text-muted mb-1">Views (7d)</p>
          <p className="text-2xl font-bold">{formatNumber(stats?.recentViews || 0)}</p>
        </div>
        <div className="p-4 bg-card border border-border rounded-xl">
          <p className="text-sm text-muted mb-1">Engagement</p>
          <p className="text-2xl font-bold">{(stats?.engagementRate || 0).toFixed(1)}%</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Link
          href="/compose"
          className="p-4 bg-card border border-border rounded-xl hover:bg-muted/50 transition-colors flex items-center gap-3"
        >
          <div className="p-2 bg-primary/10 rounded-lg">
            <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold">New Post</p>
            <p className="text-xs text-muted">Create content</p>
          </div>
        </Link>

        <Link
          href="/drafts"
          className="p-4 bg-card border border-border rounded-xl hover:bg-muted/50 transition-colors flex items-center gap-3"
        >
          <div className="p-2 bg-orange-500/10 rounded-lg">
            <svg className="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold">Drafts</p>
            <p className="text-xs text-muted">{drafts.length} saved</p>
          </div>
        </Link>

        <Link
          href="/scheduled"
          className="p-4 bg-card border border-border rounded-xl hover:bg-muted/50 transition-colors flex items-center gap-3"
        >
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold">Scheduled</p>
            <p className="text-xs text-muted">{scheduledCount} pending</p>
          </div>
        </Link>

        <Link
          href="/insights"
          className="p-4 bg-card border border-border rounded-xl hover:bg-muted/50 transition-colors flex items-center gap-3"
        >
          <div className="p-2 bg-green-500/10 rounded-lg">
            <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold">Analytics</p>
            <p className="text-xs text-muted">View insights</p>
          </div>
        </Link>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Recent Posts Performance */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Recent Posts</h2>
            <Link href={`/profile/${user?.username}`} className="text-sm text-primary hover:underline">
              View all
            </Link>
          </div>

          {recentPosts.length === 0 ? (
            <div className="p-8 bg-card border border-border rounded-xl text-center">
              <p className="text-muted mb-4">No posts yet</p>
              <Link
                href="/compose"
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
              >
                Create your first post
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentPosts.map((post) => (
                <Link
                  key={post.id}
                  href={`/post/${post.id}`}
                  className="block p-4 bg-card border border-border rounded-xl hover:bg-muted/50 transition-colors"
                >
                  <div className="flex gap-4">
                    {post.mediaUrls && post.mediaUrls[0] && (
                      <img
                        src={post.mediaUrls[0]}
                        alt=""
                        className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm line-clamp-2 mb-2">
                        {post.content || '(No caption)'}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-muted">
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                          </svg>
                          {formatNumber(post.likesCount)}
                        </span>
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                          {formatNumber(post.commentsCount)}
                        </span>
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          {formatNumber(post.viewsCount)}
                        </span>
                        <span className="ml-auto">{formatDate(post.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Drafts Preview */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Drafts</h2>
            <Link href="/drafts" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </div>

          {drafts.length === 0 ? (
            <div className="p-6 bg-card border border-border rounded-xl text-center">
              <svg className="w-10 h-10 mx-auto mb-3 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm text-muted">No drafts</p>
            </div>
          ) : (
            <div className="space-y-3">
              {drafts.map((draft) => (
                <Link
                  key={draft.id}
                  href={`/compose?draftId=${draft.localId || draft.id}`}
                  className="block p-4 bg-card border border-border rounded-xl hover:bg-muted/50 transition-colors"
                >
                  <p className="text-sm line-clamp-2 mb-2">
                    {draft.content || '(No content)'}
                  </p>
                  <p className="text-xs text-muted">
                    {formatDate(draft.updatedAt || draft.createdAt)}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold">Repository Creator Tools</h2>
            <p className="text-sm text-muted mt-1">Jump straight into repo-linked post, change story, and text export workflows.</p>
          </div>
          <Link href="/projects" className="text-sm text-primary hover:underline">
            View all repos
          </Link>
        </div>

        {repos.length === 0 ? (
          <div className="p-6 bg-card border border-border rounded-xl text-center">
            <p className="text-sm text-muted mb-3">No connected repositories found.</p>
            <Link
              href="/claim"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              Connect GitHub repos
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {repos.map((repo) => (
              <div key={repo.fullName} className="rounded-xl border border-border bg-card p-5">
                <div className="mb-4">
                  <p className="font-semibold">{repo.fullName}</p>
                  <p className="text-sm text-muted mt-1 line-clamp-2">
                    {repo.description || 'Repository-linked content tools for posts, change stories, and repo text exports.'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Link
                    href={buildRepoPath(repo.owner, repo.name)}
                    className="rounded-lg border border-border px-3 py-2 hover:bg-muted/50 transition-colors text-center"
                  >
                    Repo Page
                  </Link>
                  <Link
                    href={`/compose?type=post&owner=${encodeURIComponent(repo.owner)}&name=${encodeURIComponent(repo.name)}`}
                    className="rounded-lg border border-border px-3 py-2 hover:bg-muted/50 transition-colors text-center"
                  >
                    New Post
                  </Link>
                  <Link
                    href={`/compose?type=change_story&owner=${encodeURIComponent(repo.owner)}&name=${encodeURIComponent(repo.name)}`}
                    className="rounded-lg border border-border px-3 py-2 hover:bg-muted/50 transition-colors text-center"
                  >
                    Change Story
                  </Link>
                  <Link
                    href={buildRepoTextPath(repo.owner, repo.name)}
                    className="rounded-lg border border-border px-3 py-2 hover:bg-muted/50 transition-colors text-center"
                  >
                    Text View
                  </Link>
                  <Link
                    href={buildRepoTextRawPath(repo.owner, repo.name)}
                    className="rounded-lg border border-border px-3 py-2 hover:bg-muted/50 transition-colors text-center"
                  >
                    Raw Export
                  </Link>
                  <Link
                    href={`${buildRepoPath(repo.owner, repo.name)}?tab=settings`}
                    className="rounded-lg border border-border px-3 py-2 hover:bg-muted/50 transition-colors text-center"
                  >
                    AITM Setup
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
