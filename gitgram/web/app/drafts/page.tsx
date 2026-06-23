'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/components/ui/toast'
import { draftService, Draft } from '@/services/draftService'
import Link from 'next/link'

export default function DraftsPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const { showToast } = useToast()

  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [publishingId, setPublishingId] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth')
      return
    }
    loadDrafts()
  }, [isAuthenticated])

  const loadDrafts = async () => {
    try {
      const fetchedDrafts = await draftService.getDrafts()
      setDrafts(fetchedDrafts)
    } catch (error) {
      console.error('Load drafts error:', error)
      showToast('Failed to load drafts', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const result = await draftService.syncDrafts()
      if (result.synced > 0) {
        showToast(`Synced ${result.synced} draft${result.synced > 1 ? 's' : ''}`, 'success')
        await loadDrafts()
      } else {
        showToast('All drafts are synced', 'info')
      }
    } catch (error) {
      showToast('Sync failed', 'error')
    } finally {
      setSyncing(false)
    }
  }

  const handleDelete = async (draftId: string) => {
    setDeletingId(draftId)
    try {
      await draftService.deleteDraft(draftId)
      setDrafts(drafts.filter(d => d.id !== draftId && d.localId !== draftId))
      showToast('Draft deleted', 'info')
    } catch (error) {
      showToast('Failed to delete draft', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  const handlePublish = async (draft: Draft) => {
    const id = draft.localId || draft.id
    setPublishingId(id)
    try {
      await draftService.publishDraft(id)
      setDrafts(drafts.filter(d => d.id !== draft.id && d.localId !== draft.localId))
      showToast('Post published!', 'success')
      router.push('/')
    } catch (error) {
      showToast('Failed to publish', 'error')
    } finally {
      setPublishingId(null)
    }
  }

  const handleEdit = (draft: Draft) => {
    const params = new URLSearchParams({
      draftId: draft.localId || draft.id,
      content: draft.content || '',
    })
    router.push(`/compose?${params.toString()}`)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const unsyncedCount = drafts.filter(d => !d.synced || d.id?.startsWith('local_')).length

  if (!isAuthenticated) return null

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted">Loading drafts...</p>
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
        <h1 className="text-2xl font-bold">Drafts</h1>
        {drafts.length > 0 && (
          <span className="px-2 py-1 bg-muted text-muted-foreground text-xs rounded-full">
            {drafts.length}
          </span>
        )}

        {/* Sync button */}
        {unsyncedCount > 0 && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="ml-auto px-3 py-1.5 text-sm bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {syncing ? (
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            Sync ({unsyncedCount})
          </button>
        )}
      </div>

      {drafts.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
            <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2">No drafts</h2>
          <p className="text-muted mb-4">Posts you save as drafts will appear here.</p>
          <Link
            href="/compose"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Post
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {drafts.map((draft) => {
            const draftId = draft.localId || draft.id
            const isUnsynced = !draft.synced || draft.id?.startsWith('local_')

            return (
              <div
                key={draftId}
                className="p-4 bg-card border border-border rounded-xl"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">
                      Last edited {formatDate(draft.updatedAt || draft.createdAt)}
                    </span>
                    {isUnsynced && (
                      <span className="px-1.5 py-0.5 text-[10px] bg-warning/10 text-warning rounded">
                        Local only
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(draft)}
                      className="p-2 hover:bg-muted rounded-lg transition-colors"
                      title="Continue editing"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(draftId)}
                      disabled={deletingId === draftId}
                      className="p-2 hover:bg-error/10 text-error rounded-lg transition-colors disabled:opacity-50"
                      title="Delete draft"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                <p className="text-sm whitespace-pre-wrap line-clamp-4">
                  {draft.content || '(No content)'}
                </p>

                {draft.mediaUrls && draft.mediaUrls.length > 0 && (
                  <div className="flex gap-2 mt-3 overflow-x-auto">
                    {draft.mediaUrls.map((url, index) => (
                      <img
                        key={index}
                        src={url}
                        alt={`Draft media ${index + 1}`}
                        className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                      />
                    ))}
                  </div>
                )}

                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => handleEdit(draft)}
                    className="flex-1 py-2 bg-muted text-foreground rounded-lg text-sm font-semibold hover:bg-muted/80 transition-colors"
                  >
                    Continue Editing
                  </button>
                  <button
                    onClick={() => handlePublish(draft)}
                    disabled={publishingId === draftId || !draft.content}
                    className="flex-1 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {publishingId === draftId ? 'Publishing...' : 'Publish Now'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
