'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { userService } from '@/services/userService'
import api from '@/services/api'
import { useToast } from '@/components/ui/toast'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProfileUser {
  id: string
  username: string
  fullName?: string
  bio?: string
  avatar?: string
  followersCount?: number
  followingCount?: number
  isFollowing?: boolean
}

interface ProfilePost {
  id: string
  mediaUrl?: string
  likesCount?: number
  commentsCount?: number
}

function normalizeProfile(raw: unknown): ProfileUser {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    id: String(r.id ?? ''),
    username: String(r.username ?? ''),
    fullName: r.fullName ? String(r.fullName) : undefined,
    bio: r.bio ? String(r.bio) : undefined,
    avatar: (r.avatar as string) ?? (r.avatarUrl as string) ?? undefined,
    followersCount: typeof r.followersCount === 'number' ? r.followersCount : 0,
    followingCount: typeof r.followingCount === 'number' ? r.followingCount : 0,
    isFollowing: Boolean(r.isFollowing),
  }
}

function normalizeProfilePost(raw: unknown): ProfilePost {
  const r = (raw ?? {}) as Record<string, unknown>
  const count = (r._count ?? {}) as Record<string, unknown>
  return {
    id: String(r.id ?? ''),
    mediaUrl: (r.mediaUrl as string) ?? undefined,
    likesCount:
      typeof r.likesCount === 'number'
        ? r.likesCount
        : typeof count.likes === 'number'
          ? count.likes
          : 0,
    commentsCount:
      typeof r.commentsCount === 'number'
        ? r.commentsCount
        : typeof count.comments === 'number'
          ? count.comments
          : 0,
  }
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function ProfileSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto py-8 px-4 animate-pulse">
        <div className="flex items-start gap-8 mb-8">
          <div className="w-32 h-32 rounded-full bg-muted" />
          <div className="flex-1 space-y-4 pt-2">
            <div className="h-7 w-48 rounded bg-muted" />
            <div className="flex gap-8">
              <div className="h-4 w-16 rounded bg-muted" />
              <div className="h-4 w-20 rounded bg-muted" />
              <div className="h-4 w-20 rounded bg-muted" />
            </div>
            <div className="h-4 w-40 rounded bg-muted" />
            <div className="h-3 w-64 rounded bg-muted" />
          </div>
        </div>
        <div className="border-t border-border pt-8">
          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="aspect-square bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const router = useRouter()
  const params = useParams()
  const { isAuthenticated, user: currentUser } = useAuthStore()
  const { showToast } = useToast()
  const [user, setUser] = useState<ProfileUser | null>(null)
  const [posts, setPosts] = useState<ProfilePost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [uploading, setUploading] = useState(false)

  const username = params.username as string
  const isOwnProfile = currentUser?.username === username

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    loadProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, username])

  const loadProfile = async () => {
    setLoading(true)
    setError(false)
    try {
      const userData = await userService.getProfile(username)
      setUser(normalizeProfile(userData))
      try {
        const { data } = await api.get(`/accounts/${username}/posts`)
        const rawPosts: unknown[] = Array.isArray(data) ? data : data.posts ?? []
        setPosts(rawPosts.map(normalizeProfilePost))
      } catch {
        setPosts([])
      }
    } catch {
      setError(true)
      showToast('Failed to load profile', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleFollow = async () => {
    if (!user) return
    try {
      if (user.isFollowing) {
        await userService.unfollow(user.id)
        setUser({ ...user, isFollowing: false, followersCount: (user.followersCount ?? 0) - 1 })
      } else {
        await userService.follow(user.id)
        setUser({ ...user, isFollowing: true, followersCount: (user.followersCount ?? 0) + 1 })
      }
    } catch {
      showToast('Failed to update follow status', 'error')
    }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('avatar', file)
      const updated = (await userService.uploadAvatar(formData)) as { avatar?: string; avatarUrl?: string }
      setUser({ ...user, avatar: updated.avatar ?? updated.avatarUrl ?? user.avatar })
      showToast('Avatar updated!', 'success')
    } catch {
      showToast('Failed to upload avatar', 'error')
    } finally {
      setUploading(false)
    }
  }

  if (!isAuthenticated) return null

  if (loading) return <ProfileSkeleton />

  if (error || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold">Profile unavailable</h2>
          <p className="text-sm text-muted">We couldn&apos;t load @{username}. Please try again.</p>
          <button
            onClick={loadProfile}
            className="px-6 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="flex items-start gap-8 mb-8">
          <div className="relative">
            <div className="w-32 h-32 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden">
              {user?.avatar ? (
                <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl font-semibold text-primary">{user?.username?.[0]?.toUpperCase()}</span>
              )}
            </div>
            {isOwnProfile && (
              <label className="absolute bottom-0 right-0 w-10 h-10 bg-primary rounded-full flex items-center justify-center cursor-pointer hover:bg-primary/90">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" disabled={uploading} />
              </label>
            )}
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-4 mb-4">
              <h1 className="text-2xl font-bold">{user?.username}</h1>
              {!isOwnProfile && (
                <button
                  onClick={handleFollow}
                  className={`px-6 py-2 rounded-lg font-semibold ${
                    user?.isFollowing
                      ? 'bg-muted text-foreground hover:bg-muted/80'
                      : 'bg-primary text-white hover:bg-primary/90'
                  }`}
                >
                  {user?.isFollowing ? 'Following' : 'Follow'}
                </button>
              )}
            </div>

            <div className="flex gap-8 mb-4">
              <div>
                <span className="font-semibold">{posts.length}</span> posts
              </div>
              <div>
                <span className="font-semibold">{user?.followersCount || 0}</span> followers
              </div>
              <div>
                <span className="font-semibold">{user?.followingCount || 0}</span> following
              </div>
            </div>

            {user?.fullName && <p className="font-semibold">{user.fullName}</p>}
            {user?.bio && <p className="text-sm text-muted">{user.bio}</p>}
          </div>
        </div>

        <div className="border-t border-border pt-8">
          <div className="grid grid-cols-3 gap-1">
            {posts.map((post) => (
              <div key={post.id} className="aspect-square bg-muted relative group cursor-pointer">
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
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
