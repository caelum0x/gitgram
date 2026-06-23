'use client'

import { useState, useEffect } from 'react'
import { draftService, Draft } from '@/services/draftService'
import { useToast } from '@/components/ui/toast'

interface DraftManagerProps {
  onLoadDraft: (draft: { id: string; content: string | null; mediaUrls: string[] }) => void
  onClose: () => void
}

export default function DraftManager({ onLoadDraft, onClose }: DraftManagerProps) {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const { showToast } = useToast()

  useEffect(() => {
    loadDrafts()
  }, [])

  const loadDrafts = async () => {
    try {
      const data = await draftService.getDrafts()
      setDrafts(Array.isArray(data) ? data : [])
    } catch {
      setDrafts([])
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await draftService.deleteDraft(id)
      setDrafts(prev => prev.filter(d => d.id !== id && d.localId !== id))
      showToast('Draft deleted', 'success')
    } catch {
      showToast('Failed to delete draft', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-surface border border-border rounded-2xl shadow-xl overflow-hidden max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-lg font-semibold text-foreground">
              Drafts ({drafts.length})
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-foreground-secondary hover:text-foreground hover:bg-surface-secondary rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Drafts List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : drafts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-foreground-secondary">
              <svg className="w-12 h-12 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">No drafts saved yet</p>
              <p className="text-xs mt-1">Drafts are saved automatically while composing</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {drafts.map((draft) => (
                <li key={draft.id || draft.localId} className="group">
                  <div className="px-5 py-4 hover:bg-surface-secondary/50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        onClick={() => onLoadDraft({
                          id: draft.id,
                          content: draft.content,
                          mediaUrls: draft.mediaUrls,
                        })}
                        className="flex-1 text-left min-w-0"
                      >
                        <p className="text-sm text-foreground line-clamp-2">
                          {draft.content || '(No text content)'}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-xs text-foreground-secondary">
                            {formatDate(draft.updatedAt || draft.createdAt)}
                          </span>
                          {draft.mediaUrls && draft.mediaUrls.length > 0 && (
                            <span className="text-xs text-foreground-secondary flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {draft.mediaUrls.length} media
                            </span>
                          )}
                          {draft.synced === false && (
                            <span className="text-xs text-warning flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                              </svg>
                              Local only
                            </span>
                          )}
                        </div>
                      </button>

                      <button
                        onClick={() => handleDelete(draft.id || draft.localId || '')}
                        disabled={deletingId === (draft.id || draft.localId)}
                        className="flex-shrink-0 p-1.5 text-foreground-secondary hover:text-error opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-error/10"
                        title="Delete draft"
                      >
                        {deletingId === (draft.id || draft.localId) ? (
                          <div className="w-4 h-4 border-2 border-error border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="w-full py-2 text-sm text-foreground-secondary hover:text-foreground border border-border rounded-lg hover:bg-surface-secondary transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
