'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'

interface FollowButtonProps {
  profileId: string
  username: string
  initialIsFollowing: boolean
}

export default function FollowButton({
  profileId,
  username,
  initialIsFollowing,
}: FollowButtonProps) {
  const { user: currentUser, isAuthenticated } = useAuthStore()
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing)
  const [loading, setLoading] = useState(false)

  const isOwnProfile = Boolean(currentUser && currentUser.username === username)

  if (isOwnProfile) {
    return (
      <Link
        href="/settings"
        className="inline-block px-5 py-1.5 rounded-lg text-sm font-medium border border-border hover:bg-muted transition-colors"
      >
        Edit Profile
      </Link>
    )
  }

  if (!isAuthenticated) return null

  const handleClick = async () => {
    if (loading) return
    setLoading(true)
    try {
      if (isFollowing) {
        await api.delete(`/users/${profileId}/follow`)
        setIsFollowing(false)
      } else {
        await api.post(`/users/${profileId}/follow`)
        setIsFollowing(true)
      }
    } catch {
      // revert on error
      setIsFollowing((prev) => !prev)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`px-6 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
        isFollowing
          ? 'bg-muted text-foreground hover:bg-muted/80 border border-border'
          : 'bg-primary text-white hover:bg-primary/90'
      }`}
    >
      {loading ? '...' : isFollowing ? 'Following' : 'Follow'}
    </button>
  )
}
