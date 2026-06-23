'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { userService } from '@/services/userService'
import { getErrorMessage } from '@/utils/error'
import { useToast } from '@/components/ui/toast'

export default function LinkAccountPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const [searchQuery, setSearchQuery] = useState('')
  const [users, setUsers] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [linking, setLinking] = useState<string | null>(null)

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      setUsers([])
      return
    }

    setSearching(true)
    try {
      const response = await userService.searchUsers(query, 1, 20)
      setUsers(response.users || [])
    } catch (error) {
      console.error('Search users error:', error)
    } finally {
      setSearching(false)
    }
  }

  const handleLink = async (userId: string) => {
    try {
      setLinking(userId)
      await userService.linkAccount(userId)
      showToast('Account linked successfully!', 'success')
      router.push('/profile/settings/switch')
    } catch (error: unknown) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setLinking(null)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-foreground mb-6">Link Account</h1>

        <div className="mb-6">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              handleSearch(e.target.value)
            }}
            placeholder="Search for a user to link..."
            className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        {searching && (
          <div className="text-center py-8 text-foreground/70">Searching...</div>
        )}

        {!searching && searchQuery && users.length > 0 && (
          <div className="space-y-2">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-4 bg-surface rounded-lg"
              >
                <div className="flex items-center gap-4">
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
                </div>
                <button
                  onClick={() => handleLink(user.id)}
                  disabled={linking === user.id}
                  className="px-4 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {linking === user.id ? 'Linking...' : 'Link'}
                </button>
              </div>
            ))}
          </div>
        )}

        {!searching && searchQuery && users.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No users found
          </div>
        )}

        {!searchQuery && (
          <div className="text-center py-12 text-foreground/70">
            Enter a username to search for accounts to link
          </div>
        )}
      </div>
    </div>
  )
}

