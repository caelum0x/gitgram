'use client'

import { useState, useEffect } from 'react'
import { adService } from '@/services/adService'
import { getErrorMessage } from '@/utils/error'
import { useToast } from '@/components/ui/toast'

export default function AdReviewPage() {
  const { showToast } = useToast()
  const [ads, setAds] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectingAdId, setRejectingAdId] = useState<string | null>(null)

  useEffect(() => {
    loadPendingAds()
  }, [])

  const loadPendingAds = async () => {
    try {
      setLoading(true)
      const response = await adService.getPendingAds()
      setAds(response.ads || [])
    } catch (error) {
      console.error('Load pending ads error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (adId: string) => {
    if (!confirm('Approve this ad?')) {
      return
    }

    try {
      await adService.approveAd(adId)
      showToast('Ad approved successfully', 'success')
      loadPendingAds()
    } catch (error: unknown) {
      showToast(getErrorMessage(error), 'error')
    }
  }

  const handleReject = async (adId: string) => {
    if (!rejectReason) {
      showToast('Please provide a rejection reason', 'warning')
      return
    }

    try {
      await adService.rejectAd(adId, rejectReason)
      showToast('Ad rejected', 'success')
      setRejectReason('')
      setRejectingAdId(null)
      loadPendingAds()
    } catch (error: unknown) {
      showToast(getErrorMessage(error), 'error')
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
      <div className="max-w-6xl mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold text-foreground mb-8">Ad Review</h1>

        {ads.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-text-secondary">No pending ads to review</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {ads.map((ad) => (
              <div
                key={ad.id}
                className="bg-surface rounded-lg p-6 border border-border"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-foreground mb-2">
                      {ad.title || 'Untitled Ad'}
                    </h3>
                    {ad.content && (
                      <p className="text-text-secondary mb-2">{ad.content}</p>
                    )}
                    {ad.mediaUrl && (
                      <div className="mt-4">
                        <img
                          src={ad.mediaUrl}
                          alt="Ad media"
                          className="max-w-md rounded-lg"
                        />
                      </div>
                    )}
                  </div>
                  <span className="px-3 py-1 bg-warning text-white rounded-full text-sm font-medium">
                    {ad.status}
                  </span>
                </div>

                <div className="grid md:grid-cols-3 gap-4 mb-4 text-sm">
                  <div>
                    <span className="text-text-secondary">Campaign:</span>
                    <div className="font-medium text-foreground">{ad.campaign?.name || 'N/A'}</div>
                  </div>
                  <div>
                    <span className="text-text-secondary">Advertiser:</span>
                    <div className="font-medium text-foreground">{ad.advertiser?.username || 'N/A'}</div>
                  </div>
                  <div>
                    <span className="text-text-secondary">Created:</span>
                    <div className="font-medium text-foreground">
                      {new Date(ad.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                {rejectingAdId === ad.id ? (
                  <div className="space-y-3">
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={3}
                      className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                      placeholder="Rejection reason..."
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleReject(ad.id)}
                        className="px-4 py-2 bg-error text-white rounded-lg font-semibold hover:opacity-90"
                      >
                        Confirm Reject
                      </button>
                      <button
                        onClick={() => {
                          setRejectingAdId(null)
                          setRejectReason('')
                        }}
                        className="px-4 py-2 bg-surface border border-border text-foreground rounded-lg font-semibold hover:opacity-90"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleApprove(ad.id)}
                      className="px-4 py-2 bg-success text-white rounded-lg font-semibold hover:opacity-90"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => setRejectingAdId(ad.id)}
                      className="px-4 py-2 bg-error text-white rounded-lg font-semibold hover:opacity-90"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

