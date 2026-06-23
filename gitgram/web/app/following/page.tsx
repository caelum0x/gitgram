'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { userService } from '@/services/userService'

export default function FollowingPage() {
  const router = useRouter()
  const { isAuthenticated, user } = useAuthStore()
  const [following, setFollowing] = useState<any[]>([])

  useEffect(() => {
    if (!isAuthenticated || !user) { router.push('/login'); return }
    userService.getFollowing(user.id).then(d => setFollowing(d.following || d)).catch(() => {})
  }, [isAuthenticated, user])

  if (!isAuthenticated) return null

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8">Following</h1>
      <div className="space-y-2">
        {following.map(f => (
          <div key={f.id} onClick={() => router.push(`/profile/${f.username}`)} className="p-4 bg-card border border-border rounded-lg hover:bg-muted/50 cursor-pointer flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="font-semibold">{f.username?.[0]?.toUpperCase()}</span>
            </div>
            <div>
              <p className="font-semibold">{f.username}</p>
              {f.fullName && <p className="text-sm text-muted">{f.fullName}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
