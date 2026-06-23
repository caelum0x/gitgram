'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { adCampaignService } from '@/services/adCampaignService'
import { adService } from '@/services/adService'
import { getErrorMessage } from '@/utils/error'
import { useToast } from '@/components/ui/toast'

export default function CampaignDetailPage() {
  const params = useParams()
  const router = useRouter()
  const campaignId = params.id as string
  const { showToast } = useToast()

  const [campaign, setCampaign] = useState<any>(null)
  const [ads, setAds] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCampaign()
    loadAds()
  }, [campaignId])

  const loadCampaign = async () => {
    try {
      const response = await adCampaignService.getCampaign(campaignId)
      setCampaign(response.campaign)
    } catch (error) {
      console.error('Load campaign error:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadAds = async () => {
    try {
      const response = await adService.getAds(campaignId)
      setAds(response.ads || [])
    } catch (error) {
      console.error('Load ads error:', error)
    }
  }

  const handlePause = async () => {
    try {
      await adCampaignService.pauseCampaign(campaignId)
      loadCampaign()
    } catch (error: unknown) {
      showToast(getErrorMessage(error), 'error')
    }
  }

  const handleResume = async () => {
    try {
      await adCampaignService.resumeCampaign(campaignId)
      loadCampaign()
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

  if (!campaign) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground">Campaign not found</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto py-8 px-4">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">{campaign.name}</h1>
            <span
              className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                campaign.status === 'active'
                  ? 'bg-success text-white'
                  : campaign.status === 'paused'
                  ? 'bg-warning text-white'
                  : 'bg-text-secondary text-white'
              }`}
            >
              {campaign.status}
            </span>
          </div>
          <div className="flex gap-3">
            {campaign.status === 'active' && (
              <button
                onClick={handlePause}
                className="px-4 py-2 bg-warning text-white rounded-lg font-semibold hover:opacity-90"
              >
                Pause
              </button>
            )}
            {campaign.status === 'paused' && (
              <button
                onClick={handleResume}
                className="px-4 py-2 bg-success text-white rounded-lg font-semibold hover:opacity-90"
              >
                Resume
              </button>
            )}
            <Link
              href={`/ads/campaigns/${campaignId}/analytics`}
              className="px-4 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90"
            >
              Analytics
            </Link>
          </div>
        </div>

        {campaign.description && (
          <p className="text-text-secondary mb-6">{campaign.description}</p>
        )}

        <div className="grid md:grid-cols-4 gap-4 mb-8">
          <div className="bg-surface rounded-lg p-4">
            <div className="text-sm text-text-secondary mb-1">Type</div>
            <div className="font-semibold text-foreground">{campaign.type}</div>
          </div>
          <div className="bg-surface rounded-lg p-4">
            <div className="text-sm text-text-secondary mb-1">Budget</div>
            <div className="font-semibold text-foreground">${campaign.budget}</div>
          </div>
          <div className="bg-surface rounded-lg p-4">
            <div className="text-sm text-text-secondary mb-1">Spent</div>
            <div className="font-semibold text-foreground">${campaign.spent || 0}</div>
          </div>
          <div className="bg-surface rounded-lg p-4">
            <div className="text-sm text-text-secondary mb-1">Billing</div>
            <div className="font-semibold text-foreground">{campaign.billingType}</div>
          </div>
        </div>

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold text-foreground">Ads</h2>
          <Link
            href={`/ads/campaigns/${campaignId}/ads/create`}
            className="px-4 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90"
          >
            Create Ad
          </Link>
        </div>

        {ads.length === 0 ? (
          <div className="text-center py-12 bg-surface rounded-lg">
            <p className="text-text-secondary mb-4">No ads in this campaign</p>
            <Link
              href={`/ads/campaigns/${campaignId}/ads/create`}
              className="text-accent hover:underline"
            >
              Create your first ad
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {ads.map((ad) => (
              <div
                key={ad.id}
                className="bg-surface rounded-lg p-6 border border-border"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      {ad.title || 'Untitled Ad'}
                    </h3>
                    {ad.content && (
                      <p className="text-text-secondary">{ad.content}</p>
                    )}
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      ad.status === 'active'
                        ? 'bg-success text-white'
                        : ad.status === 'pending'
                        ? 'bg-warning text-white'
                        : 'bg-text-secondary text-white'
                    }`}
                  >
                    {ad.status}
                  </span>
                </div>

                <div className="flex gap-3">
                  <Link
                    href={`/ads/${ad.id}`}
                    className="px-4 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90"
                  >
                    View
                  </Link>
                  {ad.status === 'active' && (
                    <button
                      onClick={async () => {
                        try {
                          await adService.pauseAd(ad.id)
                          loadAds()
                        } catch (error: unknown) {
                          showToast(getErrorMessage(error), 'error')
                        }
                      }}
                      className="px-4 py-2 bg-warning text-white rounded-lg font-semibold hover:opacity-90"
                    >
                      Pause
                    </button>
                  )}
                  {ad.status === 'paused' && (
                    <button
                      onClick={async () => {
                        try {
                          await adService.resumeAd(ad.id)
                          loadAds()
                        } catch (error: unknown) {
                          showToast(getErrorMessage(error), 'error')
                        }
                      }}
                      className="px-4 py-2 bg-success text-white rounded-lg font-semibold hover:opacity-90"
                    >
                      Resume
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

