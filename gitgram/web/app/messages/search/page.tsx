'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { userService } from '@/services/userService'

export default function MessageSearchPage() {
  const searchParams = useSearchParams()
  const query = searchParams.get('q') || ''
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (query) {
      searchUsers()
    }
  }, [query])

  const searchUsers = async () => {
    setLoading(true)
    try {
      const response = await userService.searchUsers(query)
      setUsers(response.users || [])
    } catch (error) {
      console.error('Search users error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Search Users</h1>
        {loading ? (
          <div className="text-center py-12 text-foreground/70">Loading...</div>
        ) : (
          <div className="space-y-2">
            {users.map((user) => (
              <Link
                key={user.id}
                href={`/chat/${user.id}`}
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
            {users.length === 0 && query && (
              <div className="text-center py-12 text-foreground/70">
                No users found
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

