'use client'
import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useRouter } from 'next/navigation'
import api from '@/services/api'
import { useToast } from '@/components/ui/toast'

interface BlockedUser {
  id: string
  username: string
  avatarUrl?: string
  blockedAt?: string
}

export default function BlockedUsersPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const { showToast } = useToast()

  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([])
  const [unblockingUserId, setUnblockingUserId] = useState<string | null>(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated) router.replace('/login')
  }, [isAuthenticated, router])

  useEffect(() => {
    const loadBlockedUsers = async () => {
      setPageLoading(true)
      setPageError(null)
      try {
        const response = await api.get('/v1/privacy/blocked')
        const data = response.data
        setBlockedUsers(Array.isArray(data) ? data : [])
      } catch (error: unknown) {
        console.error('Failed to load blocked users:', error)
        setPageError('Failed to load blocked users. Please try again.')
      } finally {
        setPageLoading(false)
      }
    }

    if (isAuthenticated) {
      loadBlockedUsers()
    }
  }, [isAuthenticated])

  if (!isAuthenticated) return null

  const handleUnblock = async (userId: string, username: string) => {
    setUnblockingUserId(userId)
    try {
      await api.delete(`/v1/privacy/block/${userId}`)
      setBlockedUsers(prev => prev.filter(u => u.id !== userId))
      showToast(`${username} has been unblocked`, 'success')
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } } }
      const message = axiosError.response?.data?.message || 'Failed to unblock user'
      showToast(message, 'error')
    } finally {
      setUnblockingUserId(null)
    }
  }

  if (pageLoading) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="h-9 w-48 bg-muted rounded animate-pulse mb-8" />
        <div className="space-y-6">
          <div className="p-6 bg-card border border-border rounded-lg space-y-4">
            <div className="h-6 w-40 bg-muted rounded animate-pulse" />
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-muted rounded-full animate-pulse" />
                    <div className="h-4 w-28 bg-muted rounded animate-pulse" />
                  </div>
                  <div className="h-8 w-20 bg-muted rounded-lg animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (pageError) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold mb-8">Blocked Users</h1>
        <div className="p-6 bg-error/10 border border-error/30 rounded-lg text-center">
          <svg
            className="w-12 h-12 text-error mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <p className="text-error font-semibold mb-2">Failed to Load Settings</p>
          <p className="text-sm text-muted mb-4">{pageError}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8">Blocked Users</h1>

      <div className="space-y-6">
        <div className="p-6 bg-card border border-border rounded-lg space-y-4">
          <h2 className="text-xl font-semibold">Manage Blocked Users</h2>
          <p className="text-sm text-muted">
            Blocked users cannot see your profile, posts, or send you messages.
          </p>

          {blockedUsers.length === 0 ? (
            <div className="p-8 bg-muted/30 border border-border rounded-lg text-center">
              <svg
                className="w-12 h-12 text-muted mx-auto mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                />
              </svg>
              <p className="font-medium text-muted">You haven&apos;t blocked anyone</p>
              <p className="text-sm text-muted mt-1">
                When you block someone, they will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {blockedUsers.map((blockedUser, index) => (
                <div
                  key={blockedUser.id}
                  className={`flex items-center justify-between py-3 ${
                    index < blockedUsers.length - 1 ? 'border-b border-border' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {blockedUser.avatarUrl ? (
                      <img
                        src={blockedUser.avatarUrl}
                        alt={blockedUser.username}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                        <span className="text-sm font-semibold text-muted-foreground">
                          {blockedUser.username.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div>
                      <p className="font-medium">@{blockedUser.username}</p>
                      {blockedUser.blockedAt && (
                        <p className="text-xs text-muted">
                          Blocked on {new Date(blockedUser.blockedAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnblock(blockedUser.id, blockedUser.username)}
                    disabled={unblockingUserId === blockedUser.id}
                    className="px-4 py-1.5 text-sm border border-error text-error rounded-lg hover:bg-error/10 disabled:opacity-50"
                  >
                    {unblockingUserId === blockedUser.id ? 'Unblocking...' : 'Unblock'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
