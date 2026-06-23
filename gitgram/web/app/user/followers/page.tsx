'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAuthStore } from '@/store/authStore'
import { userService } from '@/services/userService'

export default function MyFollowersPage() {
  const { user } = useAuthStore()
  const [followers, setFollowers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      loadFollowers()
    }
  }, [user])

  const loadFollowers = async () => {
    try {
      const response = await userService.getFollowers(user!.id, 1, 20)
      setFollowers(response.followers || [])
    } catch (error) {
      console.error('Load followers error:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">My Followers</h1>
        <div className="space-y-2">
          {followers.map((user) => (
            <Link
              key={user.id}
              href={`/profile/${user.id}`}
              className="flex items-center gap-4 p-4 bg-surface rounded-lg hover:bg-surface/80"
            >
              {user.avatar ? (
                <Image
                  src={user.avatar}
                  alt={user.username}
                  width={50}
                  height={50}
                  className="rounded-full"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center">
                  <span className="text-white font-semibold">
                    {user.username[0].toUpperCase()}
                  </span>
                </div>
              )}
              <div className="flex-1">
                <p className="font-semibold text-foreground">@{user.username}</p>
                {user.bio && (
                  <p className="text-sm text-foreground/70">{user.bio}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
        {followers.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No followers yet
          </div>
        )}
      </div>
    </div>
  )
}

