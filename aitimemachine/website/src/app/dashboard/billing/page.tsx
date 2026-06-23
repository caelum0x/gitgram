'use client';

import { useState } from 'react';
import {
  CreditCard,
  Check,
  Zap,
  Users,
  ArrowUpRight,
  Download,
  Clock,
  AlertCircle,
  ExternalLink,
  Calendar,
  Shield,
  Loader2,
  Database,
  Activity,
  FileText,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { formatNumber, formatBytes } from '@/lib/utils';
import { useSubscription, useUsage } from '@/hooks/useDashboard';

// Plan definitions
const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    description: 'For personal projects',
    features: [
      'Local checkpoints only',
      '5 checkpoints per project',
      'No cloud sync',
      'Community support',
    ],
    limits: {
      apiRequests: 0,
      storage: 0,
      checkpoints: 5,
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 12,
    description: 'For professional developers',
    popular: true,
    features: [
      'Unlimited checkpoints',
      'Cloud sync & backup',
      '10 GB storage',
      '100,000 API requests/month',
      'Priority support',
      'Webhook integrations',
    ],
    limits: {
      apiRequests: 100000,
      storage: 10 * 1024 * 1024 * 1024,
      checkpoints: -1,
    },
  },
  {
    id: 'team',
    name: 'Team',
    price: 29,
    description: 'For teams and organizations',
    features: [
      'Everything in Pro',
      '50 GB storage per user',
      '500,000 API requests/month',
      'Team collaboration',
      'Admin dashboard',
      'SSO & SAML',
      'Dedicated support',
    ],
    limits: {
      apiRequests: 500000,
      storage: 50 * 1024 * 1024 * 1024,
      checkpoints: -1,
    },
  },
];

// Status badge colors
function getStatusBadge(status: string) {
  switch (status) {
    case 'active':
      return <Badge className="bg-green-600">Active</Badge>;
    case 'trialing':
      return <Badge className="bg-blue-600">Trial</Badge>;
    case 'past_due':
      return <Badge className="bg-yellow-600">Past Due</Badge>;
    case 'canceled':
      return <Badge className="bg-red-600">Canceled</Badge>;
    default:
      return <Badge className="bg-gray-600">{status}</Badge>;
  }
}

export default function BillingPage() {
  const { subscription, isLoading: subscriptionLoading, mutate: refetchSubscription } = useSubscription();
  const { usage, isLoading: usageLoading } = useUsage();

  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const isLoading = subscriptionLoading || usageLoading;
  const currentPlan = PLANS.find(p => p.id === subscription?.plan) || PLANS[0];
  const isFreePlan = !subscription || subscription.plan === 'free';

  const handleUpgrade = async (planId: string) => {
    setUpgrading(planId);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId }),
      });
      if (res.ok) {
        const { checkoutUrl } = await res.json();
        if (checkoutUrl) {
          window.location.href = checkoutUrl;
        }
      }
    } catch (error) {
      console.error('Failed to start checkout:', error);
    } finally {
      setUpgrading(null);
    }
  };

  const handleManageBilling = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      if (res.ok) {
        const { portalUrl } = await res.json();
        if (portalUrl) {
          window.location.href = portalUrl;
        }
      }
    } catch (error) {
      console.error('Failed to open billing portal:', error);
    } finally {
      setPortalLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    setCanceling(true);
    try {
      const res = await fetch('/api/billing/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ immediately: false }),
      });
      if (res.ok) {
        await refetchSubscription();
        setCancelDialogOpen(false);
      } else {
        const error = await res.json();
        console.error('Failed to cancel:', error);
      }
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
    } finally {
      setCanceling(false);
    }
  };

  // Calculate usage percentages
  const apiPercentage = usage?.apiRequests.percentage || 0;
  const storagePercentage = usage?.storage.percentage || 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Billing & Subscription</h1>
          <p className="text-gray-400 mt-1">
            Manage your subscription, usage, and payment methods
          </p>
        </div>
        {!isFreePlan && (
          <Button
            variant="outline"
            onClick={handleManageBilling}
            disabled={portalLoading}
          >
            {portalLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <ExternalLink className="w-4 h-4 mr-2" />
            )}
            Manage in Polar
          </Button>
        )}
      </div>

      {/* Current Plan Card */}
      <Card className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border-blue-800">
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Badge className={currentPlan.id === 'pro' ? 'bg-blue-600' : currentPlan.id === 'team' ? 'bg-purple-600' : 'bg-gray-600'}>
                  {currentPlan.name} Plan
                </Badge>
                {subscription && getStatusBadge(subscription.status)}
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-white">${currentPlan.price}</span>
                {currentPlan.price > 0 && (
                  <span className="text-gray-400">/month{currentPlan.id === 'team' ? ' per user' : ''}</span>
                )}
              </div>

              <p className="text-gray-400">{currentPlan.description}</p>

              {subscription?.currentPeriodEnd && !subscription.cancelAtPeriodEnd && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Calendar className="w-4 h-4" />
                  <span>Renews on {new Date(subscription.currentPeriodEnd).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                  })}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {isFreePlan ? (
                <Button onClick={() => handleUpgrade('pro')} size="lg">
                  <Zap className="w-4 h-4 mr-2" />
                  Upgrade to Pro
                </Button>
              ) : (
                <>
                  {currentPlan.id === 'pro' && (
                    <Button onClick={() => handleUpgrade('team')} variant="outline" size="lg">
                      <Users className="w-4 h-4 mr-2" />
                      Upgrade to Team
                    </Button>
                  )}
                  <Button variant="outline" size="lg" onClick={handleManageBilling} disabled={portalLoading}>
                    {portalLoading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <CreditCard className="w-4 h-4 mr-2" />
                    )}
                    Change Plan
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Cancellation Warning */}
          {subscription?.cancelAtPeriodEnd && (
            <div className="mt-6 p-4 bg-yellow-900/20 border border-yellow-800 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-yellow-200">Subscription ending</p>
                <p className="text-xs text-yellow-300/80 mt-1">
                  Your subscription will end on {subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : 'the end of the current period'}.
                  You will be downgraded to the Free plan and lose access to cloud features.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleManageBilling} className="flex-shrink-0">
                Reactivate
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Meters */}
      <div>
        <h2 className="text-xl font-bold text-white mb-4">Current Usage</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* API Requests */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">
                API Requests
              </CardTitle>
              <Activity className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent className="space-y-3">
              {isFreePlan ? (
                <div className="text-center py-2">
                  <p className="text-sm text-gray-500">Upgrade for API access</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-white">
                      {formatNumber(usage?.apiRequests.used || 0)}
                    </span>
                    <Badge variant={apiPercentage > 80 ? 'warning' : 'secondary'}>
                      {Math.round(apiPercentage)}%
                    </Badge>
                  </div>
                  <Progress
                    value={apiPercentage}
                    className="h-2"
                  />
                  <p className="text-xs text-gray-500">
                    of {formatNumber(usage?.apiRequests.limit || 0)} monthly limit
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Storage */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">
                Cloud Storage
              </CardTitle>
              <Database className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent className="space-y-3">
              {isFreePlan ? (
                <div className="text-center py-2">
                  <p className="text-sm text-gray-500">Upgrade for cloud storage</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-white">
                      {usage?.storage.used || 0} {usage?.storage.unit || 'GB'}
                    </span>
                    <Badge variant={storagePercentage > 80 ? 'warning' : 'secondary'}>
                      {Math.round(storagePercentage)}%
                    </Badge>
                  </div>
                  <Progress
                    value={storagePercentage}
                    className="h-2"
                  />
                  <p className="text-xs text-gray-500">
                    of {usage?.storage.limit || 0} {usage?.storage.unit || 'GB'} limit
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Checkpoints */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-400">
                Checkpoints
              </CardTitle>
              <FileText className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-white">
                  {formatNumber(usage?.checkpoints.used || 0)}
                </span>
                {isFreePlan ? (
                  <Badge variant="secondary">
                    {usage?.checkpoints.used || 0}/{usage?.checkpoints.limit || 5}
                  </Badge>
                ) : (
                  <Badge className="bg-green-600">Unlimited</Badge>
                )}
              </div>
              {isFreePlan && usage?.checkpoints.limit && (
                <Progress
                  value={((usage?.checkpoints.used || 0) / (usage?.checkpoints.limit || 5)) * 100}
                  className="h-2"
                />
              )}
              <p className="text-xs text-gray-500">
                {isFreePlan ? `${5 - (usage?.checkpoints.used || 0)} remaining` : 'Total checkpoints created'}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Available Plans */}
      <div>
        <h2 className="text-xl font-bold text-white mb-4">Available Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <Card
              key={plan.id}
              className={plan.popular ? 'border-blue-600 relative' : ''}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-blue-600">Most Popular</Badge>
                </div>
              )}
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {plan.name}
                  {plan.id === 'team' && <Users className="w-5 h-5 text-purple-400" />}
                </CardTitle>
                <div className="mt-2">
                  <span className="text-3xl font-bold">${plan.price}</span>
                  {plan.price > 0 && <span className="text-gray-400">/month</span>}
                  {plan.id === 'team' && <span className="text-gray-400"> per user</span>}
                </div>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 mb-6">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <span className="text-gray-300">{feature}</span>
                    </li>
                  ))}
                </ul>
                {subscription?.plan === plan.id ? (
                  <Button variant="secondary" className="w-full" disabled>
                    Current Plan
                  </Button>
                ) : plan.id === 'free' ? (
                  <Button variant="outline" className="w-full" disabled>
                    {!isFreePlan ? 'Downgrade via Portal' : 'Current'}
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    onClick={() => handleUpgrade(plan.id)}
                    disabled={upgrading === plan.id}
                  >
                    {upgrading === plan.id ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      `Upgrade to ${plan.name}`
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Payment Method & Billing History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Method */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Payment Method
            </CardTitle>
            <CardDescription>
              Manage your payment methods securely through Polar
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isFreePlan ? (
              <div className="text-center py-6">
                <Shield className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500">No payment method required</p>
                <p className="text-sm text-gray-600 mt-1">Add one when you upgrade to a paid plan</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-gray-800/50 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-6 bg-gradient-to-r from-blue-500 to-blue-700 rounded flex items-center justify-center">
                      <span className="text-white text-xs font-bold">CARD</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Managed by Polar</p>
                      <p className="text-xs text-gray-400">Securely stored payment method</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleManageBilling} disabled={portalLoading}>
                    {portalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update'}
                  </Button>
                </div>
                <Button variant="outline" className="w-full" onClick={handleManageBilling} disabled={portalLoading}>
                  {portalLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <ExternalLink className="w-4 h-4 mr-2" />
                  )}
                  Manage Payment Methods
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Billing History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Billing History
            </CardTitle>
            <CardDescription>
              View and download your past invoices
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isFreePlan ? (
              <div className="text-center py-6">
                <Clock className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500">No billing history</p>
                <p className="text-sm text-gray-600 mt-1">Invoices will appear here after your first payment</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-3">
                  {/* Sample invoice entries - in production these would come from the API */}
                  <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-white">January 2026</p>
                        <p className="text-xs text-gray-400">{currentPlan.name} Plan - ${currentPlan.price}.00</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-xs">Paid</Badge>
                  </div>
                </div>
                <Button variant="outline" className="w-full" onClick={handleManageBilling} disabled={portalLoading}>
                  {portalLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  View All Invoices in Polar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cancel Subscription */}
      {!isFreePlan && !subscription?.cancelAtPeriodEnd && (
        <Card className="border-red-900/50">
          <CardHeader>
            <CardTitle className="text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Cancel Subscription
            </CardTitle>
            <CardDescription>
              Cancel your subscription and downgrade to the Free plan
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="text-sm text-gray-400">
                <p>If you cancel, you'll lose access to:</p>
                <ul className="mt-2 space-y-1">
                  <li className="flex items-center gap-2">
                    <XCircle className="w-3 h-3 text-red-500" />
                    Cloud sync and backup
                  </li>
                  <li className="flex items-center gap-2">
                    <XCircle className="w-3 h-3 text-red-500" />
                    Unlimited checkpoints
                  </li>
                  <li className="flex items-center gap-2">
                    <XCircle className="w-3 h-3 text-red-500" />
                    Priority support
                  </li>
                </ul>
              </div>

              <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="border-red-900 text-red-400 hover:bg-red-900/20">
                    Cancel Subscription
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="text-white">Cancel Subscription?</DialogTitle>
                    <DialogDescription>
                      Are you sure you want to cancel your {currentPlan.name} subscription?
                    </DialogDescription>
                  </DialogHeader>

                  <div className="py-4">
                    <div className="p-4 bg-yellow-900/20 border border-yellow-800 rounded-lg">
                      <p className="text-sm text-yellow-200">
                        Your subscription will remain active until the end of your current billing period
                        {subscription?.currentPeriodEnd && (
                          <span className="font-medium">
                            {' '}({new Date(subscription.currentPeriodEnd).toLocaleDateString()})
                          </span>
                        )}.
                      </p>
                      <p className="text-sm text-yellow-300/80 mt-2">
                        After that, you'll be downgraded to the Free plan and lose access to cloud features.
                        Your data will be preserved for 30 days.
                      </p>
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
                      Keep Subscription
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleCancelSubscription}
                      disabled={canceling}
                    >
                      {canceling ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Canceling...
                        </>
                      ) : (
                        'Yes, Cancel'
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upgrade CTA for Free users */}
      {isFreePlan && (
        <Card className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border-blue-800">
          <CardContent className="py-8">
            <div className="text-center">
              <Zap className="w-12 h-12 text-blue-400 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-white mb-2">Unlock the Full Power of Gitgram TimeMachine</h3>
              <p className="text-gray-400 mb-6 max-w-xl mx-auto">
                Upgrade to Pro for unlimited checkpoints, cloud sync, and priority support.
                Perfect for professional developers who want to never lose their work.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button size="lg" onClick={() => handleUpgrade('pro')}>
                  <Zap className="w-4 h-4 mr-2" />
                  Upgrade to Pro - $12/month
                </Button>
                <Button variant="outline" size="lg" asChild>
                  <a href="/pricing">
                    Compare Plans
                    <ArrowUpRight className="w-4 h-4 ml-2" />
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
