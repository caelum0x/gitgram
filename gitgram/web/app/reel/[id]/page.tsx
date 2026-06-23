'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { reelService } from '@/services/reelService'

const REEL_EFFECT_STYLES: Record<string, { label: string; filter?: string; overlay?: string }> = {
  vintage: { label: 'Vintage', filter: 'sepia(0.35) saturate(0.9) contrast(1.05)' },
  blackwhite: { label: 'B&W', filter: 'grayscale(1)' },
  warm: { label: 'Warm', overlay: 'rgba(255, 150, 50, 0.18)' },
  cool: { label: 'Cool', overlay: 'rgba(50, 100, 255, 0.15)' },
  dramatic: { label: 'Dramatic', filter: 'contrast(1.2) saturate(1.15)', overlay: 'rgba(0, 0, 0, 0.08)' },
  fade: { label: 'Fade', filter: 'contrast(0.92) saturate(0.88)', overlay: 'rgba(200, 200, 200, 0.12)' },
  vivid: { label: 'Vivid', filter: 'saturate(1.35) contrast(1.1) brightness(1.03)' },
  noir: { label: 'Noir', filter: 'grayscale(1) contrast(1.25) brightness(0.95)' },
  sepia: { label: 'Sepia', filter: 'sepia(0.7)', overlay: 'rgba(160, 120, 60, 0.16)' },
}

export default function ReelDetailPage() {
  const params = useParams()
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const reelId = params.id as string
  const [reel, setReel] = useState<any>(null)
  const [comments, setComments] = useState<any[]>([])
  const [commentText, setCommentText] = useState('')
  const [loading, setLoading] = useState(true)
  const [isLiked, setIsLiked] = useState(false)
  const [likesCount, setLikesCount] = useState(0)

  useEffect(() => {
    loadReel()
    loadComments()
  }, [reelId])

  const loadReel = async () => {
    try {
      const response = await reelService.getReel(reelId)
      const nextReel = response.reel || response
      setReel(nextReel)
      setIsLiked(Boolean(response.isLiked))
      setLikesCount(Number(response.likesCount ?? nextReel.likesCount ?? 0))
    } catch (error) {
      console.error('Load reel error:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadComments = async () => {
    try {
      const response = await reelService.getReelComments(reelId)
      setComments(response.comments || [])
    } catch (error) {
      console.error('Load comments error:', error)
    }
  }

  const handleLike = async () => {
    try {
      const response = await reelService.likeReel(reelId)
      setIsLiked(Boolean(response.liked))
      setLikesCount(Number(response.likesCount ?? likesCount))
    } catch (error) {
      console.error('Like error:', error)
    }
  }

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!commentText.trim()) return

    try {
      const response = await reelService.createReelComment(reelId, commentText)
      setComments((prev) => [response.comment, ...prev])
      setCommentText('')
      setReel((prev: any) =>
        prev ? { ...prev, commentsCount: Number(prev.commentsCount || 0) + 1 } : prev
      )
    } catch (error) {
      console.error('Submit comment error:', error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground">Loading...</div>
      </div>
    )
  }

  if (!reel) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground">Reel not found</div>
      </div>
    )
  }

  const profileHref = `/profile/${reel.user?.username || reel.user?.id || reel.userId}`
  const effectStyle = reel.effectId ? REEL_EFFECT_STYLES[reel.effectId] : undefined
  const trimStart = Number(reel.trimStart ?? 0)
  const trimEnd = typeof reel.trimEnd === 'number' ? reel.trimEnd : null

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="grid md:grid-cols-2 gap-8">
          <div>
            {reel.videoUrl ? (
              <div className="relative rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  src={reel.videoUrl}
                  controls
                  loop={!trimEnd}
                  className="w-full rounded-lg"
                  poster={reel.thumbnailUrl}
                  style={effectStyle?.filter ? { filter: effectStyle.filter } : undefined}
                  onLoadedMetadata={() => {
                    if (videoRef.current && trimStart > 0) {
                      videoRef.current.currentTime = trimStart
                    }
                  }}
                  onTimeUpdate={() => {
                    if (videoRef.current && trimEnd && videoRef.current.currentTime >= trimEnd) {
                      videoRef.current.currentTime = trimStart
                      void videoRef.current.play().catch(() => {})
                    }
                  }}
                />
                {effectStyle?.overlay && (
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{ backgroundColor: effectStyle.overlay }}
                  />
                )}
              </div>
            ) : (
              <div className="w-full aspect-[9/16] bg-surface rounded-lg flex items-center justify-center">
                <span className="text-foreground/50">Video not available</span>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <Link href={profileHref}>
                {reel.user?.avatar ? (
                  <Image
                    src={reel.user.avatar}
                    alt={reel.user.username}
                    width={50}
                    height={50}
                    className="rounded-full"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center">
                    <span className="text-white font-semibold">
                      {reel.user?.username?.[0]?.toUpperCase()}
                    </span>
                  </div>
                )}
              </Link>
              <div>
                <Link href={profileHref} className="font-semibold text-foreground hover:text-accent">
                  @{reel.user?.username}
                </Link>
                {reel.repository?.fullName && (
                  <p className="text-sm text-foreground/60">{reel.repository.fullName}</p>
                )}
              </div>
            </div>

            {(reel.description || reel.caption) && (
              <p className="text-foreground">{reel.description || reel.caption}</p>
            )}

            {reel.music && (
              <div className="rounded-lg border border-border bg-surface px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-foreground/60">Music</p>
                <p className="text-sm font-medium text-foreground mt-1">
                  {reel.music.title} • {reel.music.artist}
                </p>
              </div>
            )}

            {(effectStyle || trimEnd) && (
              <div className="rounded-lg border border-border bg-surface px-4 py-3 space-y-2">
                {effectStyle && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-foreground/60">Effect</p>
                    <p className="text-sm font-medium text-foreground mt-1">{effectStyle.label}</p>
                  </div>
                )}
                {trimEnd && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-foreground/60">Trim</p>
                    <p className="text-sm font-medium text-foreground mt-1">
                      {trimStart.toFixed(1)}s to {trimEnd.toFixed(1)}s
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-6">
              <button
                onClick={handleLike}
                className={`flex items-center gap-2 ${isLiked ? 'text-red-500' : 'text-foreground/70'}`}
              >
                <span className="text-2xl">{isLiked ? '❤️' : '🤍'}</span>
                <span>{likesCount}</span>
              </button>
              <button
                onClick={() => router.push(`/reel/${reelId}/comments`)}
                className="flex items-center gap-2 text-foreground/70"
              >
                <span className="text-2xl">💬</span>
                <span>{reel.commentsCount || 0}</span>
              </button>
              <button
                onClick={() => router.push(`/reel/${reelId}/share`)}
                className="text-foreground/70"
              >
                <span className="text-2xl">📤</span>
              </button>
            </div>

            <div>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-foreground">
                  Comments ({reel.commentsCount || 0})
                </h3>
                <Link href={`/reel/${reelId}/likes`} className="text-sm text-accent hover:underline">
                  View likes
                </Link>
              </div>

              <form onSubmit={handleSubmitComment} className="mb-4">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment..."
                  className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent mb-2"
                  rows={2}
                />
                <button
                  type="submit"
                  disabled={!commentText.trim()}
                  className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  Post
                </button>
              </form>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {comments.map((comment) => {
                  const commentProfileHref = `/profile/${comment.user?.username || comment.userId}`

                  return (
                    <div key={comment.id} className="flex gap-3">
                      <Link href={commentProfileHref}>
                        {comment.user?.avatar ? (
                          <Image
                            src={comment.user.avatar}
                            alt={comment.user.username}
                            width={32}
                            height={32}
                            className="rounded-full"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
                            <span className="text-white text-xs font-semibold">
                              {comment.user?.username?.[0]?.toUpperCase()}
                            </span>
                          </div>
                        )}
                      </Link>
                      <div className="flex-1">
                        <Link
                          href={commentProfileHref}
                          className="font-semibold text-foreground hover:text-accent text-sm"
                        >
                          {comment.user?.username}
                        </Link>
                        <p className="text-foreground text-sm mt-1">{comment.content}</p>
                      </div>
                    </div>
                  )
                })}
                {comments.length === 0 && (
                  <p className="text-foreground/70 text-sm text-center py-4">
                    No comments yet
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
