'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { userService } from '@/services/userService'
import api from '@/services/api'

export default function DiscoverSuggestedPage() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSuggestedUsers()
  }, [])

  const loadSuggestedUsers = async () => {
    try {
      const response = await api.get('/v1/users/suggested', {
        params: { page: 1, limit: 20 },
      })
      setUsers(response.data.users || [])
    } catch (error) {
      console.error('Load suggested users error:', error)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Suggested Users</h1>
        <div className="space-y-2">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between p-4 bg-surface rounded-lg"
            >
              <Link
                href={`/profile/${user.id}`}
                className="flex items-center gap-4 flex-1"
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
                <div>
                  <p className="font-semibold text-foreground">@{user.username}</p>
                  {user.bio && (
                    <p className="text-sm text-foreground/70">{user.bio}</p>
                  )}
                </div>
              </Link>
              <button
                onClick={async () => {
                  try {
                    await userService.follow(user.id)
                  } catch (error) {
                    console.error('Follow error:', error)
                  }
                }}
                className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:opacity-90"
              >
                Follow
              </button>
            </div>
          ))}
        </div>
        {users.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No suggested users
          </div>
        )}
      </div>
    </div>
  )
}

