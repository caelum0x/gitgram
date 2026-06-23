'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import api from '@/services/api'

export default function PostSharedPage() {
  const params = useParams()
  const postId = params.id as string
  const [shares, setShares] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadShares()
  }, [postId])

  const loadShares = async () => {
    try {
      const response = await api.get(`/v1/posts/${postId}/shares`)
      setShares(response.data.shares || [])
    } catch (error) {
      console.error('Load shares error:', error)
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
        <h1 className="text-2xl font-bold text-foreground mb-6">Shared By</h1>
        <div className="space-y-2">
          {shares.map((share) => (
            <Link
              key={share.id}
              href={`/profile/${share.userId}`}
              className="flex items-center gap-4 p-4 bg-surface rounded-lg hover:bg-surface/80"
            >
              {share.user?.avatar ? (
                <Image
                  src={share.user.avatar}
                  alt={share.user.username}
                  width={50}
                  height={50}
                  className="rounded-full"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center">
                  <span className="text-white font-semibold">
                    {share.user?.username?.[0]?.toUpperCase()}
                  </span>
                </div>
              )}
              <div className="flex-1">
                <p className="font-semibold text-foreground">@{share.user?.username}</p>
                {share.comment && (
                  <p className="text-sm text-foreground/70 mt-1">{share.comment}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
        {shares.length === 0 && (
          <div className="text-center py-12 text-foreground/70">
            No shares yet
          </div>
        )}
      </div>
    </div>
  )
}

