'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'
import { postService } from '@/services/postService'
import { useToast } from '@/components/ui/toast'
import VerifiedBadge from '@/components/VerifiedBadge'
import { buildRepoPath } from '@/utils/repositoryRouting'

type TabType = 'posts' | 'repos' | 'saved'

interface UserProfile {
  id: string
  username: string
  email: string
  avatar?: string
  bio?: string
  fullName?: string
  followersCount: number
  followingCount: number
  postsCount: number
  githubUsername?: string
  isVerified?: boolean
}

interface Post {
  id: string
  content?: string
  mediaUrl?: string
  mediaType?: string
  likesCount: number
  commentsCount: number
  user?: { username: string }
}

interface Repository {
  id: string
  owner: string
  name: string
  fullName: string
  description?: string
  stars: number
  forks: number
  language?: string
}

export default function MyProfilePage() {
  const router = useRouter()
  const { isAuthenticated, user: authUser, initialize } = useAuthStore()
  const { showToast } = useToast()

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [repos, setRepos] = useState<Repository[]>([])
  const [savedPosts, setSavedPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('posts')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    initialize()
  }, [initialize])

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    loadProfile()
  }, [isAuthenticated, router])

  useEffect(() => {
    if (profile) {
      loadTabContent()
    }
  }, [activeTab, profile])

  const loadProfile = async () => {
    try {
      const { data } = await api.get('/users/me')
      setProfile(data)
      await loadUserPosts(data.username)
    } catch (error) {
      console.error('Failed to load profile:', error)
      showToast('Failed to load profile', 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadUserPosts = async (username: string) => {
    try {
      const feedData = await postService.getFeed()
      const userPosts = (feedData.posts || feedData || []).filter(
        (p: Post) => p.user?.username === username
      )
      setPosts(userPosts)
    } catch (error) {
      console.error('Failed to load posts:', error)
    }
  }

  const loadTabContent = async () => {
    if (activeTab === 'repos') {
      try {
        const { data } = await api.get('/repositories/bookmarked')
        setRepos(data.repositories || data || [])
      } catch (error) {
        console.error('Failed to load repos:', error)
        setRepos([])
      }
    } else if (activeTab === 'saved') {
      try {
        const { data } = await api.get('/posts/saved')
        setSavedPosts(data.posts || data || [])
      } catch (error) {
        console.error('Failed to load saved posts:', error)
        setSavedPosts([])
      }
    }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('avatar', file)
      const { data } = await api.post('/users/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setProfile(prev => prev ? { ...prev, avatar: data.avatar } : null)
      showToast('Avatar updated!', 'success')
    } catch (error) {
      showToast('Failed to upload avatar', 'error')
    } finally {
      setUploading(false)
    }
  }

  if (!isAuthenticated) {
    return null
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  const renderContent = () => {
    if (activeTab === 'posts') {
      if (posts.length === 0) {
        return (
          <div className="text-center py-16 text-foreground/70">
            <svg className="w-16 h-16 mx-auto mb-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-lg font-medium mb-2">No posts yet</p>
            <p className="text-sm">Share your first post to get started!</p>
          </div>
        )
      }

      return (
        <div className="grid grid-cols-3 gap-1">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/post/${post.id}`}
              className="aspect-square bg-muted relative group cursor-pointer"
            >
              {post.mediaUrl && (
                <img src={post.mediaUrl} alt="Post" className="w-full h-full object-cover" />
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 text-white">
                <div className="flex items-center gap-1">
                  <svg className="w-6 h-6 fill-white" viewBox="0 0 24 24">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                  <span>{post.likesCount || 0}</span>
                </div>
                <div className="flex items-center gap-1">
                  <svg className="w-6 h-6 fill-white" viewBox="0 0 24 24">
                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
                  </svg>
                  <span>{post.commentsCount || 0}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )
    }

    if (activeTab === 'repos') {
      if (repos.length === 0) {
        return (
          <div className="text-center py-16 text-foreground/70">
            <svg className="w-16 h-16 mx-auto mb-4 text-muted" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            <p className="text-lg font-medium mb-2">No saved repositories</p>
            <p className="text-sm">Bookmark repositories to see them here</p>
          </div>
        )
      }

      return (
        <div className="space-y-4">
          {repos.map((repo) => (
            <Link
              key={repo.id}
              href={buildRepoPath(repo.owner, repo.name)}
              className="block p-4 bg-surface border border-border rounded-lg hover:border-primary transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-primary hover:underline">{repo.fullName}</h3>
                  {repo.description && (
                    <p className="text-sm text-muted mt-1 line-clamp-2">{repo.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 mt-3 text-sm text-muted">
                {repo.language && (
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-primary"></span>
                    {repo.language}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"/>
                  </svg>
                  {repo.stars}
                </span>
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M5 3.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm0 2.122a2.25 2.25 0 10-1.5 0v.878A2.25 2.25 0 005.75 8.5h1.5v2.128a2.251 2.251 0 101.5 0V8.5h1.5a2.25 2.25 0 002.25-2.25v-.878a2.25 2.25 0 10-1.5 0v.878a.75.75 0 01-.75.75h-4.5A.75.75 0 015 6.25v-.878zm3.75 7.378a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm3-8.75a.75.75 0 100-1.5.75.75 0 000 1.5z"/>
                  </svg>
                  {repo.forks}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )
    }

    if (activeTab === 'saved') {
      if (savedPosts.length === 0) {
        return (
          <div className="text-center py-16 text-foreground/70">
            <svg className="w-16 h-16 mx-auto mb-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <p className="text-lg font-medium mb-2">No saved posts</p>
            <p className="text-sm">Save posts to view them later</p>
          </div>
        )
      }

      return (
        <div className="grid grid-cols-3 gap-1">
          {savedPosts.map((post) => (
            <Link
              key={post.id}
              href={`/post/${post.id}`}
              className="aspect-square bg-muted relative group cursor-pointer"
            >
              {post.mediaUrl && (
                <img src={post.mediaUrl} alt="Post" className="w-full h-full object-cover" />
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 text-white">
                <div className="flex items-center gap-1">
                  <svg className="w-6 h-6 fill-white" viewBox="0 0 24 24">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                  <span>{post.likesCount || 0}</span>
                </div>
                <div className="flex items-center gap-1">
                  <svg className="w-6 h-6 fill-white" viewBox="0 0 24 24">
                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
                  </svg>
                  <span>{post.commentsCount || 0}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )
    }

    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto py-8 px-4">
        {/* Profile Header */}
        <div className="flex items-start gap-8 mb-8">
          {/* Avatar */}
          <div className="relative">
            <div className="w-32 h-32 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
              {profile?.avatar ? (
                <img src={profile.avatar} alt={profile.username} className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl font-semibold text-primary">
                  {profile?.username?.[0]?.toUpperCase()}
                </span>
              )}
            </div>
            <label className="absolute bottom-0 right-0 w-10 h-10 bg-primary rounded-full flex items-center justify-center cursor-pointer hover:bg-primary/90">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
          </div>

          {/* User Info */}
          <div className="flex-1">
            <div className="flex items-center gap-4 mb-4">
              <h1 className="text-2xl font-bold flex items-center gap-2">
                {profile?.username}
                {profile?.isVerified && <VerifiedBadge />}
              </h1>
              <Link
                href="/settings/account"
                className="px-6 py-2 rounded-lg font-semibold bg-muted text-foreground hover:bg-muted/80 transition-colors"
              >
                Edit Profile
              </Link>
            </div>

            {/* Stats */}
            <div className="flex gap-8 mb-4">
              <div>
                <span className="font-semibold">{posts.length}</span>{' '}
                <span className="text-muted">posts</span>
              </div>
              <Link href="/user/followers" className="hover:underline">
                <span className="font-semibold">{profile?.followersCount || 0}</span>{' '}
                <span className="text-muted">followers</span>
              </Link>
              <Link href="/user/following" className="hover:underline">
                <span className="font-semibold">{profile?.followingCount || 0}</span>{' '}
                <span className="text-muted">following</span>
              </Link>
            </div>

            {/* Bio */}
            {profile?.fullName && <p className="font-semibold">{profile.fullName}</p>}
            {profile?.bio && <p className="text-sm text-muted whitespace-pre-wrap">{profile.bio}</p>}

            {/* GitHub Link */}
            {profile?.githubUsername && (
              <a
                href={`https://github.com/${profile.githubUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-sm text-primary hover:underline"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                @{profile.githubUsername}
              </a>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="border-t border-border">
          <div className="flex justify-center gap-16">
            <button
              onClick={() => setActiveTab('posts')}
              className={`py-4 flex items-center gap-2 border-t-2 -mt-px transition-colors ${
                activeTab === 'posts'
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted hover:text-foreground'
              }`}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M4 4h4v4H4V4zm6 0h4v4h-4V4zm6 0h4v4h-4V4zM4 10h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4zM4 16h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z"/>
              </svg>
              Posts
            </button>
            <button
              onClick={() => setActiveTab('repos')}
              className={`py-4 flex items-center gap-2 border-t-2 -mt-px transition-colors ${
                activeTab === 'repos'
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted hover:text-foreground'
              }`}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              Repos
            </button>
            <button
              onClick={() => setActiveTab('saved')}
              className={`py-4 flex items-center gap-2 border-t-2 -mt-px transition-colors ${
                activeTab === 'saved'
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted hover:text-foreground'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              Saved
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="pt-8">
          {renderContent()}
        </div>
      </div>
    </div>
  )
}
