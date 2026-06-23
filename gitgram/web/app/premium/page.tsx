'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { subscriptionService } from '@/services/subscriptionService'
import { useToast } from '@/components/ui/toast'
import { getErrorMessage } from '@/utils/error'
import api from '@/services/api'

// ─── Types ───────────────────────────────────────────────────────────────────

type BillingPeriod = 'monthly' | 'annual'
type Tier = 'free' | 'pro' | 'team'

interface PricingTier {
  id: Tier
  name: string
  monthlyPrice: number
  annualMonthlyPrice: number
  description: string
  badge?: string
  features: string[]
  cta: string
  highlighted: boolean
}

interface ComparisonRow {
  feature: string
  free: string | boolean
  pro: string | boolean
  team: string | boolean
}

interface FaqItem {
  question: string
  answer: string
}

interface CurrentSubscription {
  plan: 'free' | 'premium' | 'creator'
  status: 'active' | 'canceled' | 'expired' | 'past_due'
  currentPeriodEnd?: string
}

interface CheckoutResponse {
  checkoutUrl?: string
  checkout_url?: string
}

interface SubscriptionsResponse {
  subscription?: CurrentSubscription
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ANNUAL_DISCOUNT = 0.2

const PRICING_TIERS: PricingTier[] = [
  {
    id: 'free',
    name: 'Free',
    monthlyPrice: 0,
    annualMonthlyPrice: 0,
    description: 'Get started with open source collaboration.',
    features: [
      '5 repositories',
      '10 AI analysis / month',
      'Basic developer profile',
      'Follow & discover developers',
      'Community access',
    ],
    cta: 'Current Plan',
    highlighted: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: 12,
    annualMonthlyPrice: 9.6,
    description: 'For developers serious about their open source presence.',
    badge: 'Most Popular',
    features: [
      'Unlimited repositories',
      '100 AI analysis / month',
      'Custom profile & themes',
      'Priority feed placement',
      'Advanced analytics dashboard',
      'Verified developer badge',
      'Early feature access',
      'Priority support',
    ],
    cta: 'Upgrade to Pro',
    highlighted: true,
  },
  {
    id: 'team',
    name: 'Team',
    monthlyPrice: 29,
    annualMonthlyPrice: 23.2,
    description: 'Built for teams shipping open source at scale.',
    features: [
      'Everything in Pro',
      'Team dashboard & management',
      'Unlimited AI analysis',
      'Full API access',
      'Custom integrations',
      'White-label profile pages',
      'Dedicated account manager',
      'SLA & uptime guarantee',
    ],
    cta: 'Upgrade to Team',
    highlighted: false,
  },
]

const COMPARISON_ROWS: ComparisonRow[] = [
  {
    feature: 'AI Analysis',
    free: '10 / mo',
    pro: '100 / mo',
    team: 'Unlimited',
  },
  {
    feature: 'Repos',
    free: '5',
    pro: 'Unlimited',
    team: 'Unlimited',
  },
  {
    feature: 'Private Repos',
    free: false,
    pro: '10',
    team: 'Unlimited',
  },
  {
    feature: 'Custom Profile',
    free: false,
    pro: true,
    team: true,
  },
  {
    feature: 'Priority Feed',
    free: false,
    pro: true,
    team: true,
  },
  {
    feature: 'Analytics',
    free: 'Basic',
    pro: 'Advanced',
    team: 'Advanced',
  },
  {
    feature: 'Team Dashboard',
    free: false,
    pro: false,
    team: true,
  },
]

const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'Can I cancel my subscription at any time?',
    answer:
      'Yes. You can cancel at any time from your account settings. Your plan stays active until the end of the current billing period, after which it reverts to Free with no further charges.',
  },
  {
    question: 'What happens to my repositories if I downgrade?',
    answer:
      'Your repositories are never deleted. If you exceed the Free plan limit, additional repositories become read-only until you upgrade again or remove the excess repos.',
  },
  {
    question: 'Is there a free trial for Pro or Team?',
    answer:
      'Pro includes a 14-day free trial — no credit card required. Team plans can request a 30-day trial by reaching out to our sales team via the help center.',
  },
  {
    question: 'How does the annual discount work?',
    answer:
      'Choosing annual billing locks in a 20% discount compared to monthly pricing. You are billed once per year upfront and can still cancel — unused months are refunded pro-rata via Polar.sh.',
  },
  {
    question: 'Do you offer discounts for open source maintainers or students?',
    answer:
      'Yes. Verified open source maintainers and students with a valid .edu email are eligible for 50% off Pro. Apply through your account settings under "Discount eligibility".',
  },
]

const STATS = [
  { value: '120k+', label: 'Developers' },
  { value: '850k+', label: 'Repositories' },
  { value: '4.9★', label: 'Average rating' },
  { value: '99.9%', label: 'Uptime SLA' },
]

// ─── Small Components ─────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg
      className="w-4 h-4 text-purple-400 flex-shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function CrossIcon() {
  return (
    <svg
      className="w-4 h-4 text-gray-600 flex-shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

function ArrowRightIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
    </svg>
  )
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-5 h-5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function ComparisonCell({ value }: { value: string | boolean }) {
  if (typeof value === 'boolean') {
    return (
      <div className="flex justify-center">
        {value ? <CheckIcon /> : <CrossIcon />}
      </div>
    )
  }
  return <span className="text-sm text-gray-300">{value}</span>
}

function FaqAccordion({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border border-gray-800 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-white/5 transition-colors"
      >
        <span className="font-medium text-white pr-4">{item.question}</span>
        <ChevronDownIcon open={open} />
      </button>
      {open && (
        <div className="px-5 pb-5 pt-4 text-gray-400 text-sm leading-relaxed border-t border-gray-800">
          {item.answer}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PremiumPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const { showToast } = useToast()

  const [billing, setBilling] = useState<BillingPeriod>('monthly')
  const [loadingTier, setLoadingTier] = useState<Tier | null>(null)
  const [currentSubscription, setCurrentSubscription] = useState<CurrentSubscription | null>(null)
  const [subscriptionLoading, setSubscriptionLoading] = useState(false)

  const planToTier = (plan: 'free' | 'premium' | 'creator'): Tier => {
    if (plan === 'premium') return 'pro'
    if (plan === 'creator') return 'team'
    return 'free'
  }

  useEffect(() => {
    if (!isAuthenticated) return
    setSubscriptionLoading(true)
    subscriptionService
      .getMySubscriptions()
      .then((data: SubscriptionsResponse) => {
        if (data?.subscription) {
          setCurrentSubscription(data.subscription)
        }
      })
      .catch(() => {
        // Silently ignore — user may have no active subscription
      })
      .finally(() => setSubscriptionLoading(false))
  }, [isAuthenticated])

  const handleSubscribe = useCallback(
    async (tier: Tier) => {
      if (tier === 'free') return

      if (!isAuthenticated) {
        router.push('/login?redirect=/premium')
        return
      }

      setLoadingTier(tier)
      try {
        const response = await api.post<CheckoutResponse>('/v1/subscriptions/checkout', {
          tier,
          billingPeriod: billing,
        })
        const checkoutUrl = response.data?.checkoutUrl ?? response.data?.checkout_url
        if (checkoutUrl) {
          window.location.href = checkoutUrl
        } else {
          throw new Error('No checkout URL returned from server')
        }
      } catch (err) {
        showToast(getErrorMessage(err) ?? 'Failed to start checkout. Please try again.', 'error')
      } finally {
        setLoadingTier(null)
      }
    },
    [isAuthenticated, billing, router, showToast]
  )

  const currentTier: Tier =
    currentSubscription?.status === 'active'
      ? planToTier(currentSubscription.plan)
      : 'free'

  const getDisplayPrice = (tier: PricingTier): string => {
    if (tier.monthlyPrice === 0) return '$0'
    const price = billing === 'annual' ? tier.annualMonthlyPrice : tier.monthlyPrice
    return `$${price.toFixed(2).replace('.00', '')}`
  }

  const isCurrentPlan = (tierId: Tier): boolean =>
    !subscriptionLoading && currentTier === tierId

  const getCtaLabel = (tier: PricingTier): string => {
    if (subscriptionLoading) return 'Loading...'
    if (isCurrentPlan(tier.id)) return 'Current Plan'
    if (tier.id === 'free') return 'Downgrade to Free'
    return tier.cta
  }

  const isCtaDisabled = (tier: PricingTier): boolean =>
    loadingTier !== null || subscriptionLoading || isCurrentPlan(tier.id)

  return (
    <main style={{ backgroundColor: '#0F0F1A' }} className="min-h-screen text-white">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-24 px-4">
        <div
          aria-hidden="true"
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full opacity-20 blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, #7C3AED 0%, transparent 70%)' }}
        />
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-1/4 w-[400px] h-[300px] rounded-full opacity-10 blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, #4F46E5 0%, transparent 70%)' }}
        />

        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-purple-900/40 border border-purple-700/50 rounded-full px-4 py-1.5 text-sm text-purple-300 mb-6">
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" aria-hidden="true" />
            Gitgram Premium
          </div>
          <h1 className="text-5xl sm:text-6xl font-extrabold leading-tight mb-6">
            Unlock the full{' '}
            <span
              style={{
                background: 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 50%, #C4B5FD 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Gitgram
            </span>{' '}
            experience
          </h1>
          <p className="text-lg text-gray-400 max-w-xl mx-auto">
            Supercharge your developer profile, get AI-powered code insights, and reach the builders
            who matter most.
          </p>
        </div>
      </section>

      {/* ── Billing Toggle ────────────────────────────────────────────────── */}
      <section aria-label="Billing period" className="flex justify-center pb-10 px-4">
        <div className="flex items-center gap-1 bg-gray-900/60 border border-gray-800 rounded-full p-1">
          <button
            type="button"
            onClick={() => setBilling('monthly')}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
              billing === 'monthly'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBilling('annual')}
            className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition-all ${
              billing === 'annual'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Annual
            <span className="bg-green-500/20 text-green-400 text-xs font-semibold px-2 py-0.5 rounded-full border border-green-500/30">
              -{Math.round(ANNUAL_DISCOUNT * 100)}%
            </span>
          </button>
        </div>
      </section>

      {/* ── Pricing Cards ─────────────────────────────────────────────────── */}
      <section aria-label="Pricing plans" className="max-w-6xl mx-auto px-4 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PRICING_TIERS.map((tier) => {
            const current = isCurrentPlan(tier.id)
            const loading = loadingTier === tier.id

            return (
              <article
                key={tier.id}
                className={`relative flex flex-col rounded-2xl border p-7 transition-all duration-200 ${
                  tier.highlighted
                    ? 'border-purple-500/70 shadow-2xl shadow-purple-900/30'
                    : current
                    ? 'border-purple-700/50'
                    : 'border-gray-800 hover:border-gray-700'
                }`}
                style={{
                  background: tier.highlighted
                    ? 'linear-gradient(160deg, #1A1030 0%, #120E28 100%)'
                    : '#13131F',
                }}
              >
                {tier.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span
                      className="px-4 py-1 rounded-full text-xs font-bold text-white whitespace-nowrap"
                      style={{ background: 'linear-gradient(90deg, #7C3AED, #9333EA)' }}
                    >
                      {tier.badge}
                    </span>
                  </div>
                )}

                {current && (
                  <div className="absolute -top-3.5 right-4">
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-700 text-gray-300 border border-gray-600 whitespace-nowrap">
                      Your plan
                    </span>
                  </div>
                )}

                <header className="mb-6">
                  <h2 className="text-xl font-bold text-white mb-1">{tier.name}</h2>
                  <p className="text-sm text-gray-400">{tier.description}</p>
                </header>

                <div className="mb-6">
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-extrabold text-white">
                      {getDisplayPrice(tier)}
                    </span>
                    {tier.monthlyPrice > 0 && (
                      <span className="text-gray-400 mb-1">/mo</span>
                    )}
                  </div>
                  {billing === 'annual' && tier.monthlyPrice > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      Billed annually · was ${tier.monthlyPrice}/mo
                    </p>
                  )}
                  {tier.monthlyPrice === 0 && (
                    <p className="text-xs text-gray-500 mt-1">Free forever</p>
                  )}
                </div>

                <ul className="flex-1 space-y-3 mb-8" aria-label={`${tier.name} features`}>
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-3 text-sm text-gray-300">
                      <CheckIcon />
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => handleSubscribe(tier.id)}
                  disabled={isCtaDisabled(tier)}
                  className={`w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200 ${
                    current
                      ? 'bg-gray-800 text-gray-500 cursor-default'
                      : tier.highlighted
                      ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-900/40 disabled:opacity-60 disabled:cursor-not-allowed'
                      : 'bg-gray-800 hover:bg-gray-700 text-white disabled:opacity-60 disabled:cursor-not-allowed'
                  }`}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <SpinnerIcon />
                      Redirecting...
                    </span>
                  ) : (
                    getCtaLabel(tier)
                  )}
                </button>
              </article>
            )
          })}
        </div>
      </section>

      {/* ── Feature Comparison Table ──────────────────────────────────────── */}
      <section aria-label="Feature comparison" className="max-w-6xl mx-auto px-4 pb-20">
        <h2 className="text-2xl font-bold text-white text-center mb-10">Compare all features</h2>

        <div className="overflow-x-auto rounded-2xl border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: '#13131F' }} className="border-b border-gray-800">
                <th scope="col" className="text-left p-4 text-gray-400 font-medium w-1/2">
                  Feature
                </th>
                <th scope="col" className="text-center p-4 text-gray-300 font-semibold">
                  Free
                </th>
                <th scope="col" className="text-center p-4 font-semibold">
                  <span className="text-purple-400">Pro</span>
                </th>
                <th scope="col" className="text-center p-4 text-gray-300 font-semibold">
                  Team
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr
                  key={row.feature}
                  className="border-b border-gray-800/60 hover:bg-white/[0.02] transition-colors"
                >
                  <td className="p-4 text-gray-300 font-medium">{row.feature}</td>
                  <td className="p-4 text-center">
                    <ComparisonCell value={row.free} />
                  </td>
                  <td className="p-4 text-center bg-purple-900/5">
                    <ComparisonCell value={row.pro} />
                  </td>
                  <td className="p-4 text-center">
                    <ComparisonCell value={row.team} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Social proof stats ────────────────────────────────────────────── */}
      <section aria-label="Platform statistics" className="max-w-4xl mx-auto px-4 pb-20">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {STATS.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-gray-800 p-5"
              style={{ backgroundColor: '#13131F' }}
            >
              <div
                className="text-2xl font-extrabold mb-1"
                style={{
                  background: 'linear-gradient(135deg, #7C3AED, #A78BFA)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                {stat.value}
              </div>
              <div className="text-sm text-gray-400">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section aria-label="Frequently asked questions" className="max-w-3xl mx-auto px-4 pb-28">
        <h2 className="text-2xl font-bold text-white text-center mb-10">
          Frequently asked questions
        </h2>

        <div className="space-y-3">
          {FAQ_ITEMS.map((item) => (
            <FaqAccordion key={item.question} item={item} />
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-16 text-center">
          <p className="text-gray-400 mb-4">
            Still have questions?{' '}
            <a href="/help" className="text-purple-400 hover:text-purple-300 underline">
              Visit our help center
            </a>
          </p>
          <button
            type="button"
            onClick={() => handleSubscribe('pro')}
            disabled={loadingTier !== null || isCurrentPlan('pro')}
            className="inline-flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-white bg-purple-600 hover:bg-purple-500 transition-colors shadow-lg shadow-purple-900/40 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loadingTier === 'pro' ? (
              <>
                <SpinnerIcon />
                Redirecting...
              </>
            ) : (
              <>
                Get started with Pro
                <ArrowRightIcon />
              </>
            )}
          </button>
        </div>
      </section>
    </main>
  )
}
