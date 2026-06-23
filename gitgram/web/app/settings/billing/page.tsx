'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { subscriptionService } from '@/services/subscriptionService'
import { useToast } from '@/components/ui/toast'
import { getErrorMessage } from '@/utils/error'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PlanTier = 'free' | 'premium' | 'creator'
type BillingPeriod = 'monthly' | 'annual'
type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete'
type InvoiceStatus = 'paid' | 'failed' | 'pending' | 'refunded'

interface PaymentMethod {
  brand: string
  last4: string
  expMonth?: number
  expYear?: number
}

interface CurrentSubscription {
  id: string | null
  tier: PlanTier
  planName: string
  price: number
  currency: string
  billingPeriod: BillingPeriod
  status: SubscriptionStatus
  renewalDate: string | null
  cancelAtPeriodEnd: boolean
  paymentMethod: PaymentMethod | null
}

interface UsageMetric {
  label: string
  used: number
  limit: number | null // null = unlimited
  unit?: string
}

interface UsageData {
  privateRepos: UsageMetric
  aiAnalysisCalls: UsageMetric
  storage: UsageMetric
}

interface Invoice {
  id: string
  date: string
  description: string
  amount: number
  currency: string
  status: InvoiceStatus
  invoiceUrl: string | null
}

// ---------------------------------------------------------------------------
// Defaults (used as a safe fallback before / on failed fetch)
// ---------------------------------------------------------------------------

const FREE_SUBSCRIPTION: CurrentSubscription = {
  id: null,
  tier: 'free',
  planName: 'Free',
  price: 0,
  currency: 'USD',
  billingPeriod: 'monthly',
  status: 'active',
  renewalDate: null,
  cancelAtPeriodEnd: false,
  paymentMethod: null,
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function formatDate(dateString: string | null): string {
  if (!dateString) return '—'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatMoney(amount: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount)
  } catch {
    return `$${amount.toFixed(2)}`
  }
}

function formatStorage(bytes: number): string {
  if (bytes <= 0) return '0 MB'
  const gb = bytes / 1_000_000_000
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`
  const mb = bytes / 1_000_000
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`
}

function usagePercent(used: number, limit: number | null): number {
  if (limit === null || limit <= 0) return 0
  return Math.min(100, Math.round((used / limit) * 100))
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SectionProps {
  title: string
  description?: string
  children: React.ReactNode
}

function Section({ title, description, children }: SectionProps) {
  return (
    <section className="p-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl space-y-5">
      <div>
        <h2 className="text-base font-semibold text-[var(--foreground)]">{title}</h2>
        {description && (
          <p className="text-sm text-[var(--foreground-secondary)] mt-1">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}

interface StatusBadgeProps {
  status: SubscriptionStatus
}

function SubscriptionStatusBadge({ status }: StatusBadgeProps) {
  const config: Record<SubscriptionStatus, { label: string; tone: 'good' | 'warn' | 'bad' }> = {
    active: { label: 'Active', tone: 'good' },
    trialing: { label: 'Trial', tone: 'good' },
    past_due: { label: 'Past due', tone: 'bad' },
    canceled: { label: 'Canceled', tone: 'warn' },
    incomplete: { label: 'Incomplete', tone: 'warn' },
  }
  const { label, tone } = config[status]
  const toneCls =
    tone === 'good'
      ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
      : tone === 'warn'
        ? 'bg-[var(--warning)]/15 text-[var(--warning)]'
        : 'bg-[var(--error)]/15 text-[var(--error)]'
  const dotCls =
    tone === 'good'
      ? 'bg-[var(--accent)]'
      : tone === 'warn'
        ? 'bg-[var(--warning)]'
        : 'bg-[var(--error)]'
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${toneCls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotCls}`} />
      {label}
    </span>
  )
}

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus
}

function InvoiceStatusBadge({ status }: InvoiceStatusBadgeProps) {
  const config: Record<InvoiceStatus, { label: string; tone: 'good' | 'warn' | 'bad' }> = {
    paid: { label: 'Paid', tone: 'good' },
    failed: { label: 'Failed', tone: 'bad' },
    pending: { label: 'Pending', tone: 'warn' },
    refunded: { label: 'Refunded', tone: 'warn' },
  }
  const { label, tone } = config[status]
  const cls =
    tone === 'good'
      ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
      : tone === 'warn'
        ? 'bg-[var(--warning)]/10 text-[var(--warning)]'
        : 'bg-[var(--error)]/10 text-[var(--error)]'
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${cls}`}
    >
      {label}
    </span>
  )
}

interface UsageBarProps {
  metric: UsageMetric
  formatValue?: (value: number) => string
}

function UsageBar({ metric, formatValue }: UsageBarProps) {
  const unlimited = metric.limit === null
  const pct = usagePercent(metric.used, metric.limit)
  const fmt = formatValue ?? ((v: number) => v.toLocaleString())
  const barTone =
    pct >= 90 ? 'bg-[var(--error)]' : pct >= 70 ? 'bg-[var(--warning)]' : 'bg-[var(--primary)]'
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-[var(--foreground)]">{metric.label}</span>
        <span className="text-xs text-[var(--foreground-secondary)] tabular-nums">
          {fmt(metric.used)}
          {metric.unit && !unlimited ? ` ${metric.unit}` : ''}
          {' / '}
          {unlimited ? 'Unlimited' : `${fmt(metric.limit as number)}${metric.unit ? ` ${metric.unit}` : ''}`}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-[var(--surface-secondary)] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${unlimited ? 'bg-[var(--accent)]' : barTone}`}
          style={{ width: unlimited ? '100%' : `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BillingSettingsPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const { showToast } = useToast()

  const [subscription, setSubscription] = useState<CurrentSubscription>(FREE_SUBSCRIPTION)
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])

  const [pageLoading, setPageLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)

  const [portalLoading, setPortalLoading] = useState(false)
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [canceling, setCanceling] = useState(false)

  // -------------------------------------------------------------------------
  // Auth guard
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated) router.replace('/login')
  }, [isAuthenticated, router])

  // -------------------------------------------------------------------------
  // Load all data
  // -------------------------------------------------------------------------
  const loadData = useCallback(async () => {
    setPageLoading(true)
    setPageError(null)
    try {
      const [currentRes, usageRes, invoicesRes] = await Promise.allSettled([
        subscriptionService.getCurrent(),
        subscriptionService.getUsage(),
        subscriptionService.getInvoices(),
      ])

      if (currentRes.status === 'fulfilled' && currentRes.value) {
        const value = currentRes.value as Partial<CurrentSubscription>
        setSubscription({ ...FREE_SUBSCRIPTION, ...value })
      }

      if (usageRes.status === 'fulfilled' && usageRes.value) {
        setUsage(usageRes.value as UsageData)
      }

      if (invoicesRes.status === 'fulfilled') {
        const list = invoicesRes.value as { invoices?: Invoice[] } | Invoice[]
        const items = Array.isArray(list) ? list : (list.invoices ?? [])
        setInvoices(Array.isArray(items) ? items : [])
      }
    } catch (error: unknown) {
      console.error('Failed to load billing settings:', error)
      setPageError('Failed to load billing information. Please try again.')
    } finally {
      setPageLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated) loadData()
  }, [isAuthenticated, loadData])

  if (!isAuthenticated) return null

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const openPortal = async () => {
    setPortalLoading(true)
    try {
      const returnUrl =
        typeof window !== 'undefined' ? `${window.location.origin}/settings/billing` : undefined
      const response = (await subscriptionService.getPortalUrl(returnUrl)) as {
        portalUrl?: string
        url?: string
      }
      const portalUrl = response.portalUrl ?? response.url
      if (portalUrl) {
        window.location.href = portalUrl
      } else {
        showToast('Could not open the billing portal. Please try again.', 'error')
      }
    } catch (error: unknown) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setPortalLoading(false)
    }
  }

  const handleCancel = async () => {
    if (!subscription.id) {
      showToast('No active subscription to cancel', 'error')
      return
    }
    setCanceling(true)
    try {
      await subscriptionService.cancelSubscription(subscription.id)
      setSubscription((prev) => ({ ...prev, cancelAtPeriodEnd: true }))
      setCancelModalOpen(false)
      showToast(
        'Your subscription will be canceled at the end of the current billing period.',
        'success',
      )
    } catch (error: unknown) {
      showToast(getErrorMessage(error), 'error')
    } finally {
      setCanceling(false)
    }
  }

  // -------------------------------------------------------------------------
  // Shared classes
  // -------------------------------------------------------------------------

  const primaryBtnCls =
    'px-4 py-2 text-sm bg-[var(--primary)] text-white rounded-lg hover:bg-[var(--primary)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-semibold'

  const ghostBtnCls =
    'px-4 py-2 text-sm border border-[var(--border)] text-[var(--foreground)] rounded-lg hover:bg-[var(--surface-secondary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

  const dangerBtnCls =
    'px-4 py-2 text-sm border border-[var(--error)] text-[var(--error)] rounded-lg hover:bg-[var(--error)]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

  // -------------------------------------------------------------------------
  // Loading skeleton
  // -------------------------------------------------------------------------

  if (pageLoading) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="h-8 w-44 bg-[var(--surface)] rounded-lg animate-pulse mb-2" />
        <div className="h-4 w-80 bg-[var(--surface)] rounded animate-pulse mb-8" />
        <div className="space-y-6">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="p-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl space-y-4"
            >
              <div className="h-5 w-40 bg-[var(--surface-secondary)] rounded animate-pulse" />
              <div className="h-4 w-full bg-[var(--surface-secondary)] rounded animate-pulse" />
              <div className="h-12 w-full bg-[var(--surface-secondary)] rounded-lg animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  if (pageError) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-8">Billing</h1>
        <div className="p-8 bg-[var(--error)]/5 border border-[var(--error)]/20 rounded-xl text-center">
          <svg
            className="w-12 h-12 text-[var(--error)] mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <p className="text-[var(--error)] font-semibold mb-2">Failed to load billing</p>
          <p className="text-sm text-[var(--foreground-secondary)] mb-5">{pageError}</p>
          <button onClick={loadData} className={primaryBtnCls}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  const isPaid = subscription.tier !== 'free' && Boolean(subscription.id)
  const billingPeriodLabel = subscription.billingPeriod === 'annual' ? 'year' : 'month'

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Billing</h1>
        <p className="text-sm text-[var(--foreground-secondary)] mt-1">
          Manage your subscription, payment method, usage, and invoices.
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 1. Current plan                                                     */}
      {/* ------------------------------------------------------------------ */}
      <Section title="Current Plan">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5 bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <p className="text-lg font-bold text-[var(--foreground)]">{subscription.planName}</p>
              <SubscriptionStatusBadge status={subscription.status} />
            </div>
            <p className="text-sm text-[var(--foreground-secondary)] mt-1">
              {subscription.price > 0 ? (
                <>
                  {formatMoney(subscription.price, subscription.currency)} / {billingPeriodLabel}
                </>
              ) : (
                'Free forever'
              )}
            </p>
            {isPaid && (
              <p className="text-xs text-[var(--foreground-secondary)] mt-1">
                {subscription.cancelAtPeriodEnd
                  ? `Cancels on ${formatDate(subscription.renewalDate)}`
                  : `Renews on ${formatDate(subscription.renewalDate)}`}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {isPaid ? (
              <button onClick={openPortal} disabled={portalLoading} className={primaryBtnCls}>
                {portalLoading ? 'Opening…' : 'Manage'}
              </button>
            ) : (
              <Link href="/premium" className={primaryBtnCls}>
                Upgrade
              </Link>
            )}
          </div>
        </div>

        {subscription.cancelAtPeriodEnd && isPaid && (
          <div className="flex items-start gap-3 p-4 bg-[var(--warning)]/5 border border-[var(--warning)]/30 rounded-lg">
            <svg
              className="w-5 h-5 text-[var(--warning)] flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm text-[var(--foreground-secondary)]">
              Your subscription is set to cancel on{' '}
              <span className="font-semibold text-[var(--foreground)]">
                {formatDate(subscription.renewalDate)}
              </span>
              . You will keep access until then. Reactivate any time from the billing portal.
            </p>
          </div>
        )}
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 2. Usage this period                                                */}
      {/* ------------------------------------------------------------------ */}
      <Section
        title="Usage This Period"
        description="Your consumption for the current billing cycle."
      >
        {usage ? (
          <div className="space-y-5">
            <UsageBar metric={usage.privateRepos} />
            <UsageBar metric={usage.aiAnalysisCalls} />
            <UsageBar metric={usage.storage} formatValue={formatStorage} />
          </div>
        ) : (
          <div className="p-6 text-center bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg">
            <p className="text-sm text-[var(--foreground-secondary)]">
              Usage data is not available right now.
            </p>
          </div>
        )}
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 3. Payment method                                                   */}
      {/* ------------------------------------------------------------------ */}
      <Section
        title="Payment Method"
        description="The card used for your subscription charges."
      >
        {subscription.paymentMethod ? (
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-7 rounded bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-5 h-5 text-[var(--foreground-secondary)]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                  />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--foreground)] capitalize">
                  {subscription.paymentMethod.brand} •••• {subscription.paymentMethod.last4}
                </p>
                {subscription.paymentMethod.expMonth && subscription.paymentMethod.expYear && (
                  <p className="text-xs text-[var(--foreground-secondary)]">
                    Expires{' '}
                    {String(subscription.paymentMethod.expMonth).padStart(2, '0')}/
                    {subscription.paymentMethod.expYear}
                  </p>
                )}
              </div>
            </div>
            <button onClick={openPortal} disabled={portalLoading} className={ghostBtnCls}>
              {portalLoading ? 'Opening…' : 'Update payment method'}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg">
            <p className="text-sm text-[var(--foreground-secondary)]">No payment method on file.</p>
            {isPaid && (
              <button onClick={openPortal} disabled={portalLoading} className={ghostBtnCls}>
                {portalLoading ? 'Opening…' : 'Add payment method'}
              </button>
            )}
          </div>
        )}
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 4. Billing history                                                  */}
      {/* ------------------------------------------------------------------ */}
      <Section title="Billing History" description="Your past invoices and receipts.">
        {invoices.length === 0 ? (
          <div className="p-6 text-center bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg">
            <p className="text-sm text-[var(--foreground-secondary)]">No invoices yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--foreground-secondary)] border-b border-[var(--border)]">
                  <th className="font-medium px-2 py-2">Date</th>
                  <th className="font-medium px-2 py-2">Description</th>
                  <th className="font-medium px-2 py-2 text-right">Amount</th>
                  <th className="font-medium px-2 py-2 text-center">Status</th>
                  <th className="font-medium px-2 py-2 text-right">Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="px-2 py-3 text-[var(--foreground-secondary)] whitespace-nowrap">
                      {formatDate(invoice.date)}
                    </td>
                    <td className="px-2 py-3 text-[var(--foreground)]">{invoice.description}</td>
                    <td className="px-2 py-3 text-right text-[var(--foreground)] tabular-nums whitespace-nowrap">
                      {formatMoney(invoice.amount, invoice.currency)}
                    </td>
                    <td className="px-2 py-3 text-center">
                      <InvoiceStatusBadge status={invoice.status} />
                    </td>
                    <td className="px-2 py-3 text-right whitespace-nowrap">
                      {invoice.invoiceUrl ? (
                        <a
                          href={invoice.invoiceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                            />
                          </svg>
                          Download
                        </a>
                      ) : (
                        <span className="text-[var(--foreground-secondary)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 5. Plan comparison link                                             */}
      {/* ------------------------------------------------------------------ */}
      <Section
        title="Compare Plans"
        description="See everything included in Free, Premium, and Creator tiers."
      >
        <Link
          href="/premium"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)] hover:underline"
        >
          View all plans and features
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </Link>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 6. Cancel subscription                                              */}
      {/* ------------------------------------------------------------------ */}
      {isPaid && !subscription.cancelAtPeriodEnd && (
        <Section
          title="Cancel Subscription"
          description="Downgrade to the Free plan at the end of your billing period."
        >
          <button onClick={() => setCancelModalOpen(true)} className={dangerBtnCls}>
            Cancel subscription
          </button>
        </Section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Cancel / retention modal                                            */}
      {/* ------------------------------------------------------------------ */}
      {cancelModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-modal-title"
          onClick={() => !canceling && setCancelModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--error)]/10 flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-5 h-5 text-[var(--error)]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div>
                <h3
                  id="cancel-modal-title"
                  className="text-base font-semibold text-[var(--foreground)]"
                >
                  Are you sure you want to cancel?
                </h3>
                <p className="text-sm text-[var(--foreground-secondary)] mt-1">
                  You will keep {subscription.planName} access until{' '}
                  <span className="font-semibold text-[var(--foreground)]">
                    {formatDate(subscription.renewalDate)}
                  </span>
                  , then switch to the Free plan.
                </p>
              </div>
            </div>

            <div className="p-4 bg-[var(--surface-secondary)] border border-[var(--border)] rounded-lg">
              <p className="text-xs font-semibold text-[var(--foreground)] mb-2">You&apos;ll lose:</p>
              <ul className="space-y-1.5 text-sm text-[var(--foreground-secondary)]">
                {[
                  'Unlimited private repositories',
                  'Higher AI analysis limits',
                  'Extra storage and the verified badge',
                  'Priority support and ad-free browsing',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <svg
                      className="w-4 h-4 text-[var(--error)] flex-shrink-0 mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
              <button
                onClick={() => setCancelModalOpen(false)}
                disabled={canceling}
                className={ghostBtnCls}
              >
                Keep my subscription
              </button>
              <button
                onClick={handleCancel}
                disabled={canceling}
                className="px-4 py-2 text-sm bg-[var(--error)] text-white rounded-lg hover:bg-[var(--error)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
              >
                {canceling ? 'Canceling…' : 'Cancel subscription'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
