'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CreditCard,
  Zap,
  Users,
  ArrowUpRight,
  Check,
  AlertCircle,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { formatNumber, formatBytes } from '@/lib/utils';

interface Subscription {
  id: string;
  status: string;
  plan: string;
  productId: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  startedAt: string | null;
  endedAt: string | null;
}

interface SubscriptionData {
  subscription: Subscription | null;
  plan: string;
  status: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  user: {
    id: string;
    email: string;
    plan: string;
    polarCustomerId: string | null;
  };
}

// Plan limits for usage display
const PLAN_LIMITS = {
  free: {
    apiRequests: 0,
    storage: 0,
    projects: 1,
    checkpoints: 5,
  },
  pro: {
    apiRequests: 100000,
    storage: 10 * 1024 * 1024 * 1024, // 10 GB
    projects: -1, // unlimited
    checkpoints: -1, // unlimited
  },
  team: {
    apiRequests: 500000,
    storage: 50 * 1024 * 1024 * 1024, // 50 GB
    projects: -1,
    checkpoints: -1,
  },
};

const PLAN_FEATURES = {
  free: ['1 project', 'Local checkpoints only', 'Community support'],
  pro: ['Unlimited projects', '10 GB storage', '100K API requests/mo', 'Priority support'],
  team: ['50 GB per user', '500K API requests/mo', 'Team collaboration', 'SSO & SAML'],
};

interface UsageMetric {
  used: number;
  limit: number;
}

interface UsageState {
  apiRequests: UsageMetric;
  storage: UsageMetric;
  projects: UsageMetric;
  checkpoints: UsageMetric;
}

// Shape returned by GET /api/usage
interface UsageApiResponse {
  apiRequests: { used: number; limit: number };
  storage: { used: number; limit: number; unit: string };
  checkpoints: { used: number; limit: number | null };
  projects: { used: number; limit: number | null };
}

// Convert a storage value in the reported unit (GB/MB) to raw bytes so the
// component can render it with formatBytes consistently.
function storageToBytes(value: number, unit: string): number {
  const normalized = unit.toUpperCase();
  if (normalized === 'GB') return value * 1024 * 1024 * 1024;
  if (normalized === 'MB') return value * 1024 * 1024;
  if (normalized === 'KB') return value * 1024;
  return value;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error';
}

interface SubscriptionStatusProps {
  variant?: 'compact' | 'full';
  showUsage?: boolean;
}

export default function SubscriptionStatus({
  variant = 'full',
  showUsage = true,
}: SubscriptionStatusProps) {
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageState | null>(null);

  useEffect(() => {
    fetchSubscription();
    if (showUsage) {
      fetchUsage();
    }
  }, [showUsage]);

  const fetchSubscription = async () => {
    try {
      const response = await fetch('/api/billing/subscription');
      if (!response.ok) {
        throw new Error('Failed to fetch subscription');
      }
      const subscriptionData = await response.json();
      setData(subscriptionData);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const fetchUsage = async () => {
    try {
      const response = await fetch('/api/usage');
      if (!response.ok) {
        throw new Error('Failed to fetch usage');
      }
      const u: UsageApiResponse = await response.json();
      setUsage({
        apiRequests: { used: u.apiRequests.used, limit: u.apiRequests.limit },
        storage: {
          used: storageToBytes(u.storage.used, u.storage.unit),
          limit: storageToBytes(u.storage.limit, u.storage.unit),
        },
        projects: { used: u.projects.used, limit: u.projects.limit ?? -1 },
        checkpoints: { used: u.checkpoints.used, limit: u.checkpoints.limit ?? -1 },
      });
    } catch {
      // Usage is non-critical: leave it null and the usage block renders a
      // graceful empty state rather than blocking the subscription view.
      setUsage(null);
    }
  };

  const openBillingPortal = async () => {
    setPortalLoading(true);
    try {
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to open billing portal');
      }
      const { portalUrl } = await response.json();
      window.location.href = portalUrl;
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setPortalLoading(false);
    }
  };

  const handleUpgrade = async (targetPlan: 'pro' | 'team') => {
    setCheckoutLoading(targetPlan);
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: targetPlan }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create checkout');
      }
      const { checkoutUrl } = await response.json();
      window.location.href = checkoutUrl;
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setCheckoutLoading(null);
    }
  };

  const usagePercent = (metric: UsageMetric): number => {
    if (metric.limit <= 0) return 0;
    return Math.min((metric.used / metric.limit) * 100, 100);
  };

  if (loading) {
    return (
      <div className="bg-gray-900 rounded-xl p-6 animate-pulse">
        <div className="h-6 bg-gray-800 rounded w-32 mb-4"></div>
        <div className="h-4 bg-gray-800 rounded w-48 mb-2"></div>
        <div className="h-4 bg-gray-800 rounded w-36"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-900 rounded-xl p-6 border border-red-900/50">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold mb-1 text-red-400">Error</h2>
            <p className="text-sm text-gray-400">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                setError(null);
                setLoading(true);
                fetchSubscription();
              }}
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const plan = data?.plan || 'free';
  const subscription = data?.subscription;
  const limits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS.free;
  const features = PLAN_FEATURES[plan as keyof typeof PLAN_FEATURES] || PLAN_FEATURES.free;

  const getPlanBadgeColor = (planName: string) => {
    switch (planName) {
      case 'team':
        return 'bg-purple-600';
      case 'pro':
        return 'bg-blue-600';
      default:
        return 'bg-gray-600';
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Compact variant for sidebar or dashboard widget
  if (variant === 'compact') {
    return (
      <div className="bg-gray-900 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-400">Plan</span>
          <Badge className={getPlanBadgeColor(plan)}>{plan}</Badge>
        </div>
        {plan === 'free' ? (
          <Button
            size="sm"
            className="w-full"
            onClick={() => handleUpgrade('pro')}
            disabled={checkoutLoading === 'pro'}
          >
            {checkoutLoading === 'pro' ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Zap className="w-4 h-4 mr-2" />
            )}
            Upgrade to Pro
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={openBillingPortal}
            disabled={portalLoading}
          >
            {portalLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CreditCard className="w-4 h-4 mr-2" />
            )}
            Manage Billing
          </Button>
        )}
      </div>
    );
  }

  // Full variant with usage and all details
  return (
    <div className="bg-gray-900 rounded-xl p-6 space-y-6">
      {/* Header with plan badge */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Subscription</h2>
          <p className="text-sm text-gray-400 mt-1">
            {plan === 'free'
              ? 'Free plan - local checkpoints only'
              : `${plan.charAt(0).toUpperCase() + plan.slice(1)} plan`}
          </p>
        </div>
        <Badge className={`${getPlanBadgeColor(plan)} text-white`}>
          {plan === 'team' && <Users className="w-3 h-3 mr-1" />}
          {plan.toUpperCase()}
        </Badge>
      </div>

      {/* Cancellation warning */}
      {subscription?.cancelAtPeriodEnd && (
        <div className="p-4 bg-yellow-900/20 border border-yellow-800 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-200">Subscription ending</p>
            <p className="text-xs text-yellow-300/80 mt-1">
              Your subscription will end on {formatDate(subscription.currentPeriodEnd)}.
              You will be downgraded to the Free plan.
            </p>
          </div>
        </div>
      )}

      {/* Active subscription details */}
      {subscription && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Status</span>
            <span
              className={`font-medium ${
                subscription.status === 'active' ? 'text-green-400' : 'text-yellow-400'
              }`}
            >
              {subscription.status === 'active' ? 'Active' : subscription.status}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Current period ends</span>
            <span className="text-white">{formatDate(subscription.currentPeriodEnd)}</span>
          </div>
        </div>
      )}

      {/* Usage stats (for paid plans) */}
      {showUsage && plan !== 'free' && usage && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-300">Usage this month</h3>
          <div className="grid gap-4">
            {/* API Requests */}
            <div className="p-3 bg-gray-800/50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">API Requests</span>
                <span className="text-xs text-gray-500">
                  {formatNumber(usage.apiRequests.used)} / {formatNumber(usage.apiRequests.limit)}
                </span>
              </div>
              <Progress value={usagePercent(usage.apiRequests)} className="h-1.5" />
            </div>

            {/* Storage */}
            <div className="p-3 bg-gray-800/50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">Storage</span>
                <span className="text-xs text-gray-500">
                  {formatBytes(usage.storage.used)} / {formatBytes(usage.storage.limit)}
                </span>
              </div>
              <Progress value={usagePercent(usage.storage)} className="h-1.5" />
            </div>

            {/* Projects & Checkpoints (for unlimited plans) */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-gray-800/50 rounded-lg text-center">
                <p className="text-2xl font-bold text-white">{usage.projects.used}</p>
                <p className="text-xs text-gray-500">Projects</p>
              </div>
              <div className="p-3 bg-gray-800/50 rounded-lg text-center">
                <p className="text-2xl font-bold text-white">{formatNumber(usage.checkpoints.used)}</p>
                <p className="text-xs text-gray-500">Checkpoints</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Plan features */}
      {plan === 'free' && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-300">Free plan includes</h3>
          <ul className="space-y-2">
            {features.map((feature) => (
              <li key={feature} className="flex items-center gap-2 text-sm text-gray-400">
                <Check className="w-4 h-4 text-gray-600" />
                {feature}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Upgrade options for free plan */}
      {plan === 'free' && (
        <div className="space-y-3 pt-2">
          <p className="text-sm text-gray-400">
            Upgrade to unlock cloud sync, unlimited checkpoints, and more.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => handleUpgrade('pro')}
              disabled={checkoutLoading === 'pro'}
              className="w-full"
            >
              {checkoutLoading === 'pro' ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Zap className="w-4 h-4 mr-2" />
              )}
              Pro $12/mo
            </Button>
            <Button
              variant="outline"
              onClick={() => handleUpgrade('team')}
              disabled={checkoutLoading === 'team'}
              className="w-full"
            >
              {checkoutLoading === 'team' ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Users className="w-4 h-4 mr-2" />
              )}
              Team $29/mo
            </Button>
          </div>
        </div>
      )}

      {/* Upgrade option for pro users */}
      {plan === 'pro' && (
        <div className="pt-2 space-y-3">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => handleUpgrade('team')}
            disabled={checkoutLoading === 'team'}
          >
            {checkoutLoading === 'team' ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <ArrowUpRight className="w-4 h-4 mr-2" />
            )}
            Upgrade to Team
          </Button>
        </div>
      )}

      {/* Manage billing for paid plans */}
      {subscription && (
        <Button
          variant="secondary"
          className="w-full"
          onClick={openBillingPortal}
          disabled={portalLoading}
        >
          {portalLoading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <ExternalLink className="w-4 h-4 mr-2" />
          )}
          Manage Subscription
        </Button>
      )}

      {/* Pricing link */}
      <div className="text-center">
        <Link href="/pricing" className="text-xs text-gray-500 hover:text-gray-400 transition">
          View all plans & features
        </Link>
      </div>
    </div>
  );
}
