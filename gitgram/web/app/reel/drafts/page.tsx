'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/components/ui/toast'
import { reelDraftService, ReelDraft } from '@/services/reelDraftService'

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const diffMs = Date.now() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function DraftSkeleton() {
  return (
    <div
      className="p-4 rounded-xl border animate-pulse"
      style={{ background: '#1A1A2E', borderColor: 'rgba(124,58,237,0.1)' }}
    >
      <div className="flex justify-between mb-3">
        <div className="h-4 w-40 rounded" style={{ background: '#2A2A3E' }} />
        <div className="h-3 w-16 rounded" style={{ background: '#2A2A3E' }} />
      </div>
      <div className="h-2.5 w-full rounded mb-1.5" style={{ background: '#2A2A3E' }} />
      <div className="h-2.5 w-3/4 rounded" style={{ background: '#2A2A3E' }} />
    </div>
  )
}

export default function ReelDraftsPage() {
  const router = useRouter()
  const { isAuthenticated, isInitialized } = useAuthStore()
  const { showToast } = useToast()

  const [drafts, setDrafts] = useState<ReelDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (!isInitialized) return
    if (!isAuthenticated) {
      router.push('/login')
      return
    }
    setDrafts(reelDraftService.list())
    setLoading(false)
  }, [isInitialized, isAuthenticated, router])

  const handleDelete = (id: string) => {
    setDeletingId(id)
    try {
      reelDraftService.remove(id)
      setDrafts((prev) => prev.filter((d) => d.id !== id))
      showToast('Draft deleted', 'info')
    } catch {
      showToast('Failed to delete draft', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  const handleEdit = (id: string) => {
    router.push(`/reels/create?draftId=${id}`)
  }

  if (!isInitialized) return null
  if (!isAuthenticated) return null

  return (
    <div className="min-h-screen" style={{ background: '#0F0F1A' }}>
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-lg transition-colors"
            style={{ color: '#8b949e' }}
            aria-label="Go back"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold text-foreground">Reel Drafts</h1>
          {!loading && drafts.length > 0 && (
            <span
              className="px-2 py-1 text-xs rounded-full"
              style={{ background: 'rgba(124,58,237,0.15)', color: '#a78bfa' }}
            >
              {drafts.length}
            </span>
          )}
          <Link
            href="/reels/create"
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg,#7C3AED,#a855f7)' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Reel
          </Link>
        </div>

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <DraftSkeleton key={i} />
            ))}
          </div>
        ) : drafts.length === 0 ? (
          <div className="text-center py-16">
            <div
              className="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(124,58,237,0.12)' }}
            >
              <svg className="w-10 h-10" fill="none" stroke="#7C3AED" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">No reel drafts</h2>
            <p className="text-sm text-foreground-secondary mb-4">
              Reels you save while composing will appear here.
            </p>
            <Link
              href="/reels/create"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(135deg,#7C3AED,#a855f7)' }}
            >
              Create a Reel
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {drafts.map((draft) => (
              <div
                key={draft.id}
                className="p-4 rounded-xl border"
                style={{ background: '#1A1A2E', borderColor: 'rgba(124,58,237,0.15)' }}
              >
                <div className="flex justify-between items-start mb-3 gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground truncate">
                      {draft.title.trim() || '(Untitled reel)'}
                    </h3>
                    <p className="text-xs text-foreground-secondary mt-0.5">
                      {draft.language} &middot; Edited {formatDate(draft.updatedAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(draft.id)}
                    disabled={deletingId === draft.id}
                    className="p-2 rounded-lg transition-colors disabled:opacity-50"
                    style={{ color: '#da3633' }}
                    title="Delete draft"
                    aria-label="Delete draft"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                {draft.code.trim() && (
                  <pre
                    className="px-3 py-2.5 text-xs font-mono overflow-hidden leading-5 rounded-lg mb-3"
                    style={{ color: '#8b949e', background: 'rgba(0,0,0,0.3)' }}
                  >
                    {draft.code.split('\n').slice(0, 3).join('\n')}
                  </pre>
                )}

                <button
                  onClick={() => handleEdit(draft.id)}
                  className="w-full py-2 rounded-lg text-sm font-semibold text-white"
                  style={{ background: 'linear-gradient(135deg,#7C3AED,#a855f7)' }}
                >
                  Continue Editing
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
