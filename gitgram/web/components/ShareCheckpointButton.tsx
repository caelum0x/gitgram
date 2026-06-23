'use client'

import { useState } from 'react'
import { postService } from '@/services/postService'
import { useToast } from './ui/toast'

interface ShareCheckpointButtonProps {
  checkpointId: string
  fromCheckpointId?: string
  aitmProjectId?: string
  diffSummary?: { added: number; removed: number; modified: number }
  changedFiles?: string[]
  title?: string
  className?: string
}

export default function ShareCheckpointButton({
  checkpointId,
  fromCheckpointId,
  aitmProjectId,
  diffSummary,
  changedFiles,
  title,
  className = '',
}: ShareCheckpointButtonProps) {
  const { showToast } = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [caption, setCaption] = useState('')
  const [loading, setLoading] = useState(false)

  const handleShare = async () => {
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('content', caption)

      await postService.createPostWithCheckpoint(formData, {
        checkpointId,
        projectId: aitmProjectId || '',
        fromCheckpointId,
        diffSummary,
        changedFiles,
        changeStoryTitle: title || 'Repository Change Story',
      })
      showToast('Shared as post!', 'success')
      setIsOpen(false)
      setCaption('')
    } catch {
      showToast('Failed to share checkpoint', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-hover"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        Share as post
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-border bg-card shadow-lg">
          <div className="p-4">
            <h4 className="text-sm font-semibold mb-2">Share to Gitgram</h4>
            <p className="text-xs text-muted mb-3">
              Share this checkpoint as a Change Story post on your Gitgram feed.
            </p>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a caption (optional)..."
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px] font-mono text-muted">
                checkpoint {checkpointId.slice(0, 8)}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg px-3 py-1.5 text-xs border border-border hover:bg-hover"
                >
                  Cancel
                </button>
                <button
                  onClick={handleShare}
                  disabled={loading}
                  className="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                >
                  {loading ? 'Sharing...' : 'Share'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
