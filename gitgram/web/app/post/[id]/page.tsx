'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { postService } from '@/services/postService'
import PostCard from '@/components/PostCard'

export default function PostDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const [post, setPost] = useState<any>(null)

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return }
    postService.getPost(params.id as string).then(setPost).catch(() => router.push('/feed'))
  }, [isAuthenticated, params.id])

  if (!isAuthenticated || !post) return null

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <PostCard
        post={post}
        onLike={(id: string) => { postService.likePost(id).then(() => setPost({...post, isLiked: true, likesCount: post.likesCount + 1})) }}
      />
    </div>
  )
}
