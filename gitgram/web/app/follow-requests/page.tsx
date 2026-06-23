'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { userService } from '@/services/userService'
import { useToast } from '@/components/ui/toast'
import { getErrorMessage } from '@/utils/error'
import Link from 'next/link'

interface FollowRequest {
  id: string
  requesterId: string
  status: string
  createdAt: string
  requester?: {
    id: string
    username: string
    avatar?: string
    bio?: string
  }
}

export default function FollowRequestsPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const { showToast } = useToast()

  const [requests, setRequests] = useState<FollowRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth')
      return
    }
    loadRequests()
  }, [isAuthenticated])

  const loadRequests = async () => {
    try {
      const data = await userService.getFollowRequests()
      setRequests(data.requests || [])
    } catch (error) {
      console.error('Load requests error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAccept = async (requestId: string) => {
    setProcessingId(requestId)
    try {
      await userService.acceptFollowRequest(requestId)
      setRequests(prev => prev.filter(r => r.id !== requestId))
      showToast('Follow request accepted', 'success')
    } catch (error: unknown) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setProcessingId(null)
    }
  }

  const handleReject = async (requestId: string) => {
    setProcessingId(requestId)
    try {
      await userService.rejectFollowRequest(requestId)
      setRequests(prev => prev.filter(r => r.id !== requestId))
      showToast('Follow request rejected', 'info')
    } catch (error: unknown) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setProcessingId(null)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    return date.toLocaleDateString()
  }

  if (!isAuthenticated) return null

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted">Loading requests...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-muted rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-2xl font-bold">Follow Requests</h1>
        {requests.length > 0 && (
          <span className="px-2 py-1 bg-primary text-white text-xs rounded-full">
            {requests.length}
          </span>
        )}
      </div>

      {requests.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
            <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2">No pending requests</h2>
          <p className="text-muted">When someone requests to follow you, you'll see it here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <div
              key={request.id}
              className="flex items-center gap-4 p-4 bg-card border border-border rounded-xl"
            >
              <Link
                href={`/profile/${request.requester?.username}`}
                className="flex-shrink-0"
              >
                {request.requester?.avatar ? (
                  <img
                    src={request.requester.avatar}
                    alt={request.requester.username}
                    className="w-14 h-14 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-primary font-semibold text-lg">
                      {request.requester?.username?.[0]?.toUpperCase() || '?'}
                    </span>
                  </div>
                )}
              </Link>

              <div className="flex-1 min-w-0">
                <Link
                  href={`/profile/${request.requester?.username}`}
                  className="font-semibold hover:underline"
                >
                  @{request.requester?.username || 'Unknown'}
                </Link>
                {request.requester?.bio && (
                  <p className="text-sm text-muted truncate">{request.requester.bio}</p>
                )}
                <p className="text-xs text-muted mt-1">{formatDate(request.createdAt)}</p>
              </div>

              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => handleAccept(request.id)}
                  disabled={processingId === request.id}
                  className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {processingId === request.id ? '...' : 'Accept'}
                </button>
                <button
                  onClick={() => handleReject(request.id)}
                  disabled={processingId === request.id}
                  className="px-4 py-2 border border-border rounded-lg text-sm font-semibold hover:bg-muted disabled:opacity-50 transition-colors"
                >
                  {processingId === request.id ? '...' : 'Decline'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
