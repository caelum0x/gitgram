'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { adCampaignService } from '@/services/adCampaignService'
import { getErrorMessage } from '@/utils/error'
import { useToast } from '@/components/ui/toast'

export default function CreateCampaignPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'post' as 'post' | 'reel' | 'story' | 'banner' | 'video',
    budget: '',
    dailyBudget: '',
    billingType: 'cpc' as 'cpc' | 'cpm' | 'cpa',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name || !formData.budget) {
      showToast('Name and budget are required', 'warning')
      return
    }

    try {
      setLoading(true)
      const campaign = await adCampaignService.createCampaign({
        name: formData.name,
        description: formData.description || undefined,
        type: formData.type,
        budget: parseFloat(formData.budget),
        dailyBudget: formData.dailyBudget ? parseFloat(formData.dailyBudget) : undefined,
        billingType: formData.billingType,
      })

      showToast('Campaign created successfully!', 'success')
      router.push(`/ads/campaigns/${campaign.campaign.id}`)
    } catch (error: unknown) {
      console.error('Create campaign error:', error)
      showToast(getErrorMessage(error), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold text-foreground mb-8">Create Ad Campaign</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Campaign Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="My Campaign"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
              className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="Campaign description..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Ad Type *
            </label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
              required
              className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="post">Post</option>
              <option value="reel">Reel</option>
              <option value="story">Story</option>
              <option value="banner">Banner</option>
              <option value="video">Video</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Total Budget ($) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={formData.budget}
              onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
              required
              className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="100.00"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Daily Budget ($)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={formData.dailyBudget}
              onChange={(e) => setFormData({ ...formData, dailyBudget: e.target.value })}
              className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="10.00"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Billing Type *
            </label>
            <select
              value={formData.billingType}
              onChange={(e) => setFormData({ ...formData, billingType: e.target.value as any })}
              required
              className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="cpc">CPC (Cost Per Click)</option>
              <option value="cpm">CPM (Cost Per Mille/1000 impressions)</option>
              <option value="cpa">CPA (Cost Per Action)</option>
            </select>
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-accent text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Campaign'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-3 bg-surface border border-border text-foreground rounded-lg font-semibold hover:opacity-90"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

