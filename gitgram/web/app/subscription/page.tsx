'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useRouter, useSearchParams } from 'next/navigation'
import { subscriptionService } from '@/services/subscriptionService'
import { useToast } from '@/components/ui/toast'
import { getErrorMessage } from '@/utils/error'

interface Subscription {
  id?: string
  plan: 'free' | 'premium' | 'creator'
  status: 'active' | 'canceled' | 'expired' | 'past_due'
  currentPeriodEnd?: string
  polarSubscriptionId?: string
}

interface PlanFeature {
  name: string
  free: boolean | string
  premium: boolean | string
  creator: boolean | string
}

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Perfect for getting started with Gitgram',
    features: [
      'Basic profile',
      'Post updates & code snippets',
      'Follow developers',
      'View public repositories',
      'Basic analytics',
    ],
    highlighted: false,
  },
  {
    id: 'premium',
    name: 'Premium',
    price: '$9.99',
    period: 'per month',
    description: 'For developers who want more visibility',
    features: [
      'Everything in Free',
      'Verified badge',
      'Priority support',
      'Advanced analytics',
      'Custom profile themes',
      'Hide ads',
      'Early access to features',
    ],
    highlighted: true,
  },
  {
    id: 'creator',
    name: 'Creator',
    price: '$19.99',
    period: 'per month',
    description: 'For content creators and open source maintainers',
    features: [
      'Everything in Premium',
      'Gold verified badge',
      'Monetization features',
      'Sponsorship dashboard',
      'API access',
      'Dedicated support',
      'Team collaboration tools',
      'Custom domain support',
    ],
    highlighted: false,
  },
]

const featureComparison: PlanFeature[] = [
  { name: 'Posts per day', free: '10', premium: 'Unlimited', creator: 'Unlimited' },
  { name: 'File uploads', free: '100 MB/month', premium: '10 GB/month', creator: '100 GB/month' },
  { name: 'Video uploads', free: false, premium: true, creator: true },
  { name: 'Verified badge', free: false, premium: true, creator: 'Gold' },
  { name: 'Analytics dashboard', free: 'Basic', premium: 'Advanced', creator: 'Advanced' },
  { name: 'Custom themes', free: false, premium: true, creator: true },
  { name: 'Hide advertisements', free: false, premium: true, creator: true },
  { name: 'Priority support', free: false, premium: true, creator: 'Dedicated' },
  { name: 'API access', free: 'Read-only', premium: 'Full', creator: 'Full + Webhooks' },
  { name: 'Monetization', free: false, premium: false, creator: true },
  { name: 'Team collaboration', free: false, premium: false, creator: true },
  { name: 'Custom domain', free: false, premium: false, creator: true },
]

function SubscriptionContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated } = useAuthStore()
  const { showToast } = useToast()

  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [subscribing, setSubscribing] = useState<string | null>(null)
  const [canceling, setCanceling] = useState(false)

  useEffect(() => {
    const success = searchParams.get('success')
    const canceled = searchParams.get('canceled')

    if (success === 'true') {
      showToast('Subscription activated successfully!', 'success')
      router.replace('/subscription')
    } else if (canceled === 'true') {
      showToast('Checkout was canceled', 'info')
      router.replace('/subscription')
    }
  }, [searchParams, showToast, router])

  useEffect(() => {
    const fetchSubscription = async () => {
      if (!isAuthenticated) {
        setLoading(false)
        return
      }

      try {
        const data = await subscriptionService.getMySubscriptions()
        setSubscription(data)
      } catch (error) {
        console.error('Failed to fetch subscription:', error)
        setSubscription({ plan: 'free', status: 'active' })
      } finally {
        setLoading(false)
      }
    }

    fetchSubscription()
  }, [isAuthenticated])

  const handleSubscribe = async (planId: string) => {
    if (!isAuthenticated) {
      router.push('/login?redirect=/subscription')
      return
    }

    if (planId === 'free') {
      showToast('You are already on the Free plan', 'info')
      return
    }

    setSubscribing(planId)
    try {
      const response = await subscriptionService.createCheckout({
        productId: planId,
        returnUrl: `${window.location.origin}/subscription`,
      })

      if (response.url) {
        window.location.href = response.url
      }
    } catch (error: unknown) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setSubscribing(null)
    }
  }

  const handleChangePlan = async (planId: string) => {
    if (!subscription?.polarSubscriptionId) {
      await handleSubscribe(planId)
      return
    }

    setSubscribing(planId)
    try {
      await subscriptionService.changePlan(subscription.polarSubscriptionId, {
        productId: planId,
        prorationBillingMode: 'prorated_immediately',
      })
      showToast('Plan changed successfully!', 'success')
      const data = await subscriptionService.getMySubscriptions()
      setSubscription(data)
    } catch (error: unknown) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setSubscribing(null)
    }
  }

  const handleCancelSubscription = async () => {
    if (!subscription?.polarSubscriptionId) return

    if (!confirm('Are you sure you want to cancel your subscription? You will lose access to premium features at the end of your billing period.')) {
      return
    }

    setCanceling(true)
    try {
      await subscriptionService.cancelSubscription(subscription.polarSubscriptionId)
      showToast('Subscription canceled. You can still use premium features until the end of your billing period.', 'success')
      const data = await subscriptionService.getMySubscriptions()
      setSubscription(data)
    } catch (error: unknown) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setCanceling(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const getButtonText = (planId: string) => {
    if (!isAuthenticated) return 'Sign in to Subscribe'
    if (subscribing === planId) return 'Processing...'
    if (subscription?.plan === planId && subscription.status === 'active') return 'Current Plan'
    if (subscription?.plan === planId && subscription.status === 'canceled') return 'Reactivate'
    if (planId === 'free') return 'Downgrade to Free'
    if (subscription?.plan === 'creator' && planId === 'premium') return 'Downgrade'
    return subscription?.plan !== 'free' ? 'Change Plan' : 'Subscribe'
  }

  const isCurrentPlan = (planId: string) => {
    return subscription?.plan === planId && subscription.status === 'active'
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-8 px-4">
        <div className="h-10 w-64 bg-muted rounded animate-pulse mb-4" />
        <div className="h-6 w-96 bg-muted rounded animate-pulse mb-12" />
        <div className="grid md:grid-cols-3 gap-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-6 bg-card border border-border rounded-xl space-y-4">
              <div className="h-8 w-24 bg-muted rounded animate-pulse" />
              <div className="h-12 w-32 bg-muted rounded animate-pulse" />
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((j) => (
                  <div key={j} className="h-4 w-full bg-muted rounded animate-pulse" />
                ))}
              </div>
              <div className="h-12 w-full bg-muted rounded-lg animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Choose Your Plan</h1>
        <p className="text-lg text-muted max-w-2xl mx-auto">
          Unlock premium features and take your developer presence to the next level.
          All plans include a 7-day free trial.
        </p>
      </div>

      {/* Current Subscription Status */}
      {isAuthenticated && subscription && subscription.plan !== 'free' && (
        <div className="mb-8 p-6 bg-card border border-border rounded-xl">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-muted">Current Plan:</span>
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                  subscription.plan === 'creator'
                    ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-500 border border-amber-500/30'
                    : 'bg-primary/10 text-primary border border-primary/30'
                }`}>
                  {subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)}
                </span>
                {subscription.status === 'canceled' && (
                  <span className="px-2 py-1 bg-warning/10 text-warning text-xs rounded-full">
                    Canceling
                  </span>
                )}
              </div>
              {subscription.currentPeriodEnd && (
                <p className="text-sm text-muted">
                  {subscription.status === 'canceled'
                    ? `Access until: ${formatDate(subscription.currentPeriodEnd)}`
                    : `Next billing date: ${formatDate(subscription.currentPeriodEnd)}`
                  }
                </p>
              )}
            </div>
            {subscription.status === 'active' && (
              <button
                onClick={handleCancelSubscription}
                disabled={canceling}
                className="px-4 py-2 text-sm border border-error/30 text-error rounded-lg hover:bg-error/10 disabled:opacity-50"
              >
                {canceling ? 'Canceling...' : 'Cancel Subscription'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Pricing Cards */}
      <div className="grid md:grid-cols-3 gap-8 mb-16">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`relative p-6 bg-card border rounded-xl transition-all ${
              plan.highlighted
                ? 'border-primary shadow-lg shadow-primary/10 scale-105'
                : 'border-border hover:border-muted-foreground/30'
            } ${isCurrentPlan(plan.id) ? 'ring-2 ring-primary' : ''}`}
          >
            {plan.highlighted && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary text-white text-sm font-semibold rounded-full">
                Most Popular
              </div>
            )}
            {isCurrentPlan(plan.id) && (
              <div className="absolute -top-4 right-4 px-3 py-1 bg-accent text-white text-xs font-semibold rounded-full">
                Active
              </div>
            )}

            <div className="mb-6">
              <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold">{plan.price}</span>
                <span className="text-muted">/{plan.period}</span>
              </div>
              <p className="text-sm text-muted mt-2">{plan.description}</p>
            </div>

            <ul className="space-y-3 mb-8">
              {plan.features.map((feature, index) => (
                <li key={index} className="flex items-start gap-2">
                  <svg
                    className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                      plan.highlighted ? 'text-primary' : 'text-accent'
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={() => plan.id === 'free'
                ? (subscription?.plan !== 'free' ? handleChangePlan('free') : null)
                : (isCurrentPlan(plan.id) ? null : handleChangePlan(plan.id))
              }
              disabled={
                isCurrentPlan(plan.id) ||
                subscribing === plan.id ||
                (plan.id === 'free' && subscription?.plan === 'free')
              }
              className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                isCurrentPlan(plan.id)
                  ? 'bg-muted text-muted-foreground cursor-default'
                  : plan.highlighted
                    ? 'bg-primary text-white hover:bg-primary/90'
                    : 'border border-border hover:bg-muted'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {getButtonText(plan.id)}
            </button>
          </div>
        ))}
      </div>

      {/* Feature Comparison Table */}
      <div className="mb-16">
        <h2 className="text-2xl font-bold text-center mb-8">Feature Comparison</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-4 px-4 font-semibold">Feature</th>
                <th className="text-center py-4 px-4 font-semibold">Free</th>
                <th className="text-center py-4 px-4 font-semibold text-primary">Premium</th>
                <th className="text-center py-4 px-4 font-semibold">Creator</th>
              </tr>
            </thead>
            <tbody>
              {featureComparison.map((feature, index) => (
                <tr key={index} className="border-b border-border hover:bg-muted/50">
                  <td className="py-4 px-4 text-sm">{feature.name}</td>
                  <td className="text-center py-4 px-4">
                    {typeof feature.free === 'boolean' ? (
                      feature.free ? (
                        <svg className="w-5 h-5 text-accent mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-muted mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )
                    ) : (
                      <span className="text-sm text-muted">{feature.free}</span>
                    )}
                  </td>
                  <td className="text-center py-4 px-4 bg-primary/5">
                    {typeof feature.premium === 'boolean' ? (
                      feature.premium ? (
                        <svg className="w-5 h-5 text-primary mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-muted mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )
                    ) : (
                      <span className="text-sm font-medium text-primary">{feature.premium}</span>
                    )}
                  </td>
                  <td className="text-center py-4 px-4">
                    {typeof feature.creator === 'boolean' ? (
                      feature.creator ? (
                        <svg className="w-5 h-5 text-accent mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-muted mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )
                    ) : (
                      <span className="text-sm text-muted-foreground">{feature.creator}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-8">Frequently Asked Questions</h2>
        <div className="space-y-4">
          <div className="p-6 bg-card border border-border rounded-xl">
            <h3 className="font-semibold mb-2">Can I cancel anytime?</h3>
            <p className="text-sm text-muted">
              Yes! You can cancel your subscription at any time. You will continue to have access to premium features until the end of your current billing period.
            </p>
          </div>
          <div className="p-6 bg-card border border-border rounded-xl">
            <h3 className="font-semibold mb-2">What payment methods do you accept?</h3>
            <p className="text-sm text-muted">
              We accept all major credit cards and popular payment methods through our secure payment provider, Polar.
            </p>
          </div>
          <div className="p-6 bg-card border border-border rounded-xl">
            <h3 className="font-semibold mb-2">Is there a free trial?</h3>
            <p className="text-sm text-muted">
              Yes! All paid plans come with a 7-day free trial. You will not be charged until the trial period ends, and you can cancel anytime during the trial.
            </p>
          </div>
          <div className="p-6 bg-card border border-border rounded-xl">
            <h3 className="font-semibold mb-2">Can I switch plans?</h3>
            <p className="text-sm text-muted">
              Absolutely! You can upgrade or downgrade your plan at any time. When upgrading, you will be charged the prorated difference. When downgrading, the change takes effect at the start of your next billing cycle.
            </p>
          </div>
          <div className="p-6 bg-card border border-border rounded-xl">
            <h3 className="font-semibold mb-2">Do you offer refunds?</h3>
            <p className="text-sm text-muted">
              We offer a full refund within the first 14 days of your subscription if you are not satisfied. After that, you can cancel anytime but refunds are not available.
            </p>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      {!isAuthenticated && (
        <div className="mt-16 text-center p-8 bg-gradient-to-r from-primary/10 to-accent/10 rounded-2xl border border-primary/20">
          <h2 className="text-2xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-muted mb-6 max-w-xl mx-auto">
            Join thousands of developers who are already using Gitgram to showcase their work and connect with the community.
          </p>
          <button
            onClick={() => router.push('/register')}
            className="px-8 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90"
          >
            Create Free Account
          </button>
        </div>
      )}
    </div>
  )
}

export default function SubscriptionPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <SubscriptionContent />
    </Suspense>
  )
}
