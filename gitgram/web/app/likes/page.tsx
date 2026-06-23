'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'

export default function LikesPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const [posts, setPosts] = useState<any[]>([])

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return }
    api.get('/users/liked-posts').then(r => setPosts(r.data.posts || [])).catch(() => {})
  }, [isAuthenticated])

  if (!isAuthenticated) return null

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8">Liked Posts</h1>
      <div className="grid grid-cols-3 gap-1">
        {posts.map(p => (
          <div key={p.id} onClick={() => router.push(`/post/${p.id}`)} className="aspect-square bg-muted cursor-pointer">
            {p.mediaUrl && <img src={p.mediaUrl} alt="" className="w-full h-full object-cover" />}
          </div>
        ))}
      </div>
    </div>
  )
}
