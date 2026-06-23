'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { userService } from '@/services/userService'

export default function FollowersPage() {
  const router = useRouter()
  const { isAuthenticated, user } = useAuthStore()
  const [followers, setFollowers] = useState<any[]>([])

  useEffect(() => {
    if (!isAuthenticated || !user) { router.push('/login'); return }
    userService.getFollowers(user.id).then(d => setFollowers(d.followers || d)).catch(() => {})
  }, [isAuthenticated, user])

  if (!isAuthenticated) return null

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8">Followers</h1>
      <div className="space-y-2">
        {followers.map(f => (
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
