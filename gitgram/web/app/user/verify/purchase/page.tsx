'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { verificationPurchaseService } from '@/services/verificationPurchaseService'
import { getErrorMessage } from '@/utils/error'
import { useToast } from '@/components/ui/toast'

export default function VerificationPurchasePage() {
  const router = useRouter()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [pricing, setPricing] = useState<any>(null)
  const [selectedType, setSelectedType] = useState<'standard' | 'golden'>('standard')
  const [selectedPeriod, setSelectedPeriod] = useState<'monthly' | 'annual'>('monthly')
  const [purchaseStatus, setPurchaseStatus] = useState<any>(null)

  useEffect(() => {
    loadPricing()
    loadPurchaseStatus()
  }, [])

  const loadPricing = async () => {
    try {
      const standardMonthly = await verificationPurchaseService.getPricing('standard', 'monthly')
      const standardAnnual = await verificationPurchaseService.getPricing('standard', 'annual')
      const goldenMonthly = await verificationPurchaseService.getPricing('golden', 'monthly')
      const goldenAnnual = await verificationPurchaseService.getPricing('golden', 'annual')

      setPricing({
        standard: { monthly: standardMonthly.price, annual: standardAnnual.price },
        golden: { monthly: goldenMonthly.price, annual: goldenAnnual.price },
      })
    } catch (error) {
      console.error('Load pricing error:', error)
    }
  }

  const loadPurchaseStatus = async () => {
    try {
      const status = await verificationPurchaseService.getPurchaseStatus()
      setPurchaseStatus(status)
    } catch (error) {
      console.error('Load purchase status error:', error)
    }
  }

  const handlePurchase = async () => {
    try {
      setLoading(true)
      const result = await verificationPurchaseService.createCheckout(selectedType, selectedPeriod)

      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl
      }
    } catch (error: unknown) {
      console.error('Purchase error:', error)
      showToast(getErrorMessage(error), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel your verification? Your badge will be removed at the end of the billing period.')) {
      return
    }

    try {
      setLoading(true)
      await verificationPurchaseService.cancelPurchase()
      showToast('Verification cancelled successfully', 'success')
      loadPurchaseStatus()
    } catch (error: unknown) {
      console.error('Cancel error:', error)
      showToast(getErrorMessage(error), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleUpgrade = async () => {
    if (!confirm('Upgrade your verification to Gold for enhanced features and visibility.')) {
      return
    }

    try {
      setLoading(true)
      await verificationPurchaseService.upgradeToGolden()
      showToast('Upgraded to Gold verification!', 'success')
      loadPurchaseStatus()
    } catch (error: unknown) {
      console.error('Upgrade error:', error)
      showToast(getErrorMessage(error), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDowngrade = async () => {
    if (!confirm('Downgrade your verification to Standard. You will receive a credit for the remaining period.')) {
      return
    }

    try {
      setLoading(true)
      await verificationPurchaseService.downgradeToStandard()
      showToast('Downgraded to Standard verification', 'success')
      loadPurchaseStatus()
    } catch (error: unknown) {
      console.error('Downgrade error:', error)
      showToast(getErrorMessage(error), 'error')
    } finally {
      setLoading(false)
    }
  }

  const getPrice = () => {
    if (!pricing) return 'Loading...'
    return `$${pricing[selectedType][selectedPeriod].toFixed(2)}/${selectedPeriod === 'monthly' ? 'mo' : 'yr'}`
  }

  if (!pricing) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold text-foreground mb-8">Purchase Verification</h1>

        {purchaseStatus?.hasVerification && (
          <div className="bg-surface border-l-4 border-l-accent rounded-lg p-6 mb-8">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">
                {purchaseStatus.type === 'golden' ? '⭐' : '✓'}
              </span>
              <h2 className="text-xl font-semibold text-foreground">
                {purchaseStatus.type === 'golden' ? 'Gold' : 'Standard'} Verification Active
              </h2>
            </div>
            {purchaseStatus.expiresAt && (
              <p className="text-foreground-secondary mb-4">
                Renews: {new Date(purchaseStatus.expiresAt).toLocaleDateString()}
              </p>
            )}
            <div className="flex gap-3 flex-wrap">
              {purchaseStatus.type === 'standard' && (
                <button
                  onClick={handleUpgrade}
                  disabled={loading}
                  className="px-4 py-2 bg-warning text-white rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors"
                >
                  Upgrade to Gold
                </button>
              )}
              {purchaseStatus.type === 'golden' && (
                <button
                  onClick={handleDowngrade}
                  disabled={loading}
                  className="px-4 py-2 bg-button-secondary text-white rounded-md text-sm font-medium hover:bg-button-secondary-hover disabled:opacity-50 transition-colors"
                >
                  Downgrade to Standard
                </button>
              )}
              <button
                onClick={handleCancel}
                disabled={loading}
                className="px-4 py-2 bg-error text-white rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {!purchaseStatus?.hasVerification && (
          <>
            <h2 className="text-xl font-semibold text-foreground mb-4">Choose Verification Type</h2>
            <div className="grid md:grid-cols-2 gap-4 mb-8">
              <div
                className={`p-6 rounded-lg border-2 cursor-pointer transition-colors ${
                  selectedType === 'standard'
                    ? 'border-accent bg-surface'
                    : 'border-border bg-surface/50'
                }`}
                onClick={() => setSelectedType('standard')}
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-3xl">✓</span>
                  <h3 className="text-xl font-semibold text-foreground">Standard</h3>
                </div>
                <p className="text-foreground-secondary mb-4">
                  Blue verification badge for individuals and creators
                </p>
                <p className="text-lg font-semibold text-accent">
                  ${pricing.standard[selectedPeriod].toFixed(2)}/{selectedPeriod === 'monthly' ? 'mo' : 'yr'}
                </p>
              </div>

              <div
                className={`p-6 rounded-lg border-2 cursor-pointer transition-colors ${
                  selectedType === 'golden'
                    ? 'border-accent bg-surface'
                    : 'border-border bg-surface/50'
                }`}
                onClick={() => setSelectedType('golden')}
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-3xl">⭐</span>
                  <h3 className="text-xl font-semibold text-foreground">Gold</h3>
                </div>
                <p className="text-foreground-secondary mb-4">
                  Premium gold badge for companies and organizations
                </p>
                <p className="text-lg font-semibold text-accent">
                  ${pricing.golden[selectedPeriod].toFixed(2)}/{selectedPeriod === 'monthly' ? 'mo' : 'yr'}
                </p>
              </div>
            </div>

            <h2 className="text-xl font-semibold text-foreground mb-4">Billing Period</h2>
            <div className="grid grid-cols-2 gap-4 mb-8">
              <button
                onClick={() => setSelectedPeriod('monthly')}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  selectedPeriod === 'monthly'
                    ? 'border-accent bg-surface'
                    : 'border-border bg-surface/50'
                }`}
              >
                <div className="font-semibold text-foreground mb-1">Monthly</div>
                <div className="text-sm text-foreground-secondary">
                  ${pricing[selectedType].monthly.toFixed(2)}/month
                </div>
              </button>

              <button
                onClick={() => setSelectedPeriod('annual')}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  selectedPeriod === 'annual'
                    ? 'border-accent bg-surface'
                    : 'border-border bg-surface/50'
                }`}
              >
                <div className="font-semibold text-foreground mb-1">Annual</div>
                <div className="text-sm text-foreground-secondary">
                  ${pricing[selectedType].annual.toFixed(2)}/year
                  <span className="text-success font-semibold ml-1">
                    (Save {((pricing[selectedType].monthly * 12 - pricing[selectedType].annual) / (pricing[selectedType].monthly * 12) * 100).toFixed(0)}%)
                  </span>
                </div>
              </button>
            </div>

            <div className="bg-surface rounded-lg p-6 mb-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center pb-3 border-b border-border">
                  <span className="text-foreground-secondary">Type:</span>
                  <span className="font-medium text-foreground">
                    {selectedType === 'golden' ? 'Gold' : 'Standard'} Verification
                  </span>
                </div>
                <div className="flex justify-between items-center pb-3 border-b border-border">
                  <span className="text-foreground-secondary">Period:</span>
                  <span className="font-medium text-foreground">
                    {selectedPeriod === 'annual' ? 'Annual' : 'Monthly'}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t-2 border-border">
                  <span className="text-foreground-secondary font-semibold">Total:</span>
                  <span className="text-xl font-bold text-accent">{getPrice()}</span>
                </div>
              </div>
            </div>

            <button
              onClick={handlePurchase}
              disabled={loading}
              className="w-full px-6 py-3 bg-button-primary hover:bg-button-primary-hover text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 mb-6"
            >
              {loading ? 'Processing...' : 'Purchase Verification'}
            </button>

            <div className="bg-surface rounded-lg p-6">
              <ul className="space-y-2 text-foreground-secondary">
                <li>• Verification badge will appear on your profile, posts, and comments</li>
                <li>• Subscription renews automatically</li>
                <li>• Cancel anytime, badge removed at end of billing period</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

