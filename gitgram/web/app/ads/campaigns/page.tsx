'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { adCampaignService } from '@/services/adCampaignService'
import { getErrorMessage } from '@/utils/error'
import { useToast } from '@/components/ui/toast'

export default function AdCampaignsPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('')

  useEffect(() => {
    loadCampaigns()
  }, [statusFilter])

  const loadCampaigns = async () => {
    try {
      setLoading(true)
      const response = await adCampaignService.getCampaigns(statusFilter || undefined)
      setCampaigns(response.campaigns || [])
    } catch (error) {
      console.error('Load campaigns error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (campaignId: string) => {
    if (!confirm('Are you sure you want to delete this campaign?')) {
      return
    }

    try {
      await adCampaignService.deleteCampaign(campaignId)
      loadCampaigns()
    } catch (error: unknown) {
      showToast(getErrorMessage(error), 'error')
    }
  }

  const handlePause = async (campaignId: string) => {
    try {
      await adCampaignService.pauseCampaign(campaignId)
      loadCampaigns()
    } catch (error: unknown) {
      showToast(getErrorMessage(error), 'error')
    }
  }

  const handleResume = async (campaignId: string) => {
    try {
      await adCampaignService.resumeCampaign(campaignId)
      loadCampaigns()
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
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-foreground">Ad Campaigns</h1>
          <Link
            href="/ads/campaigns/create"
            className="px-6 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90"
          >
            Create Campaign
          </Link>
        </div>

        <div className="mb-6">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 bg-surface border border-border rounded-lg text-foreground"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        {campaigns.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-text-secondary mb-4">No campaigns found</p>
            <Link
              href="/ads/campaigns/create"
              className="text-accent hover:underline"
            >
              Create your first campaign
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {campaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="bg-surface rounded-lg p-6 border border-border"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-foreground mb-2">
                      {campaign.name}
                    </h3>
                    {campaign.description && (
                      <p className="text-text-secondary">{campaign.description}</p>
                    )}
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
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

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                  <div>
                    <span className="text-text-secondary">Type:</span>
                    <div className="font-medium text-foreground">{campaign.type}</div>
                  </div>
                  <div>
                    <span className="text-text-secondary">Budget:</span>
                    <div className="font-medium text-foreground">${campaign.budget}</div>
                  </div>
                  <div>
                    <span className="text-text-secondary">Spent:</span>
                    <div className="font-medium text-foreground">${campaign.spent || 0}</div>
                  </div>
                  <div>
                    <span className="text-text-secondary">Billing:</span>
                    <div className="font-medium text-foreground">{campaign.billingType}</div>
                  </div>
                </div>

                <div className="flex gap-3 flex-wrap">
                  <Link
                    href={`/ads/campaigns/${campaign.id}`}
                    className="px-4 py-2 bg-accent text-white rounded-lg font-semibold hover:opacity-90"
                  >
                    View Details
                  </Link>
                  {campaign.status === 'active' && (
                    <button
                      onClick={() => handlePause(campaign.id)}
                      className="px-4 py-2 bg-warning text-white rounded-lg font-semibold hover:opacity-90"
                    >
                      Pause
                    </button>
                  )}
                  {campaign.status === 'paused' && (
                    <button
                      onClick={() => handleResume(campaign.id)}
                      className="px-4 py-2 bg-success text-white rounded-lg font-semibold hover:opacity-90"
                    >
                      Resume
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(campaign.id)}
                    className="px-4 py-2 bg-error text-white rounded-lg font-semibold hover:opacity-90"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

