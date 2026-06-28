'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';
import {
  Check,
  X,
  Zap,
  Users,
  HelpCircle,
  ArrowRight,
  Shield,
  Cloud,
  GitBranch,
  Terminal,
  Clock,
  Star,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { isAnnualBillingAvailable } from '@/lib/billingProducts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Plan {
  id: 'free' | 'pro' | 'team';
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  period: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  features: string[];
  notIncluded: string[];
  cta: string;
  popular: boolean;
  highlight: string;
  productId?: string;
}

interface FaqItem {
  question: string;
  answer: string;
}

interface ComparisonRow {
  feature: string;
  free: boolean | string;
  pro: boolean | string;
  team: boolean | string;
  category?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRO_PRODUCT_ID = process.env.NEXT_PUBLIC_POLAR_PRO_PRODUCT_ID ?? '';
const TEAM_PRODUCT_ID = process.env.NEXT_PUBLIC_POLAR_TEAM_PRODUCT_ID ?? '';
const ANNUAL_DISCOUNT = 0.2;

const plans: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    monthlyPrice: 0,
    annualPrice: 0,
    period: '',
    description: 'For personal projects and experimentation',
    icon: Terminal,
    iconColor: 'text-gray-400',
    highlight: 'bg-gray-800/50',
    features: [
      '5 restore points per project',
      '7-day checkpoint history',
      '1 project',
      'Local storage only',
      'CLI & MCP tools',
      'Community support',
    ],
    notIncluded: [
      'Cloud backup & sync',
      'VS Code extension',
      'GitHub integration',
      'Team restore points',
    ],
    cta: 'Get Started Free',
    popular: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: 19,
    annualPrice: Math.round(19 * (1 - ANNUAL_DISCOUNT)),
    period: '/mo',
    description: 'For professional developers shipping with AI daily',
    icon: Zap,
    iconColor: 'text-blue-400',
    highlight: 'bg-blue-600',
    features: [
      'Unlimited restore points',
      '90-day checkpoint history',
      '5 projects',
      'Cloud backup & sync',
      'VS Code extension',
      'CLI & MCP tools',
      'Webhook integrations',
      'Priority email support',
    ],
    notIncluded: [
      'GitHub integration',
      'Team restore points',
    ],
    cta: 'Start Pro',
    popular: true,
    productId: PRO_PRODUCT_ID,
  },
  {
    id: 'team',
    name: 'Team',
    monthlyPrice: 49,
    annualPrice: Math.round(49 * (1 - ANNUAL_DISCOUNT)),
    period: '/mo',
    description: 'For teams where AI agents make 35+ PRs a day',
    icon: Users,
    iconColor: 'text-purple-400',
    highlight: 'bg-gray-800/50',
    features: [
      'Everything in Pro',
      'Unlimited projects',
      'GitHub integration',
      'Team restore points',
      'Shared checkpoint library',
      'Admin dashboard',
      'SSO & SAML',
      'Audit logs',
      'Dedicated Slack support',
    ],
    notIncluded: [],
    cta: 'Start Team Trial',
    popular: false,
    productId: TEAM_PRODUCT_ID,
  },
];

const comparisonRows: ComparisonRow[] = [
  { feature: 'Restore points', free: '5 / project', pro: 'Unlimited', team: 'Unlimited', category: 'Core' },
  { feature: 'Checkpoint history', free: '7 days', pro: '90 days', team: '90 days', category: 'Core' },
  { feature: 'Projects', free: '1', pro: '5', team: 'Unlimited', category: 'Core' },
  { feature: 'Local storage', free: true, pro: true, team: true, category: 'Core' },
  { feature: 'CLI & MCP tools', free: true, pro: true, team: true, category: 'Core' },
  { feature: 'Cloud backup & sync', free: false, pro: true, team: true, category: 'Cloud' },
  { feature: 'VS Code extension', free: false, pro: true, team: true, category: 'Cloud' },
  { feature: 'Webhook integrations', free: false, pro: true, team: true, category: 'Cloud' },
  { feature: 'GitHub integration', free: false, pro: false, team: true, category: 'Team' },
  { feature: 'Team restore points', free: false, pro: false, team: true, category: 'Team' },
  { feature: 'Shared checkpoint library', free: false, pro: false, team: true, category: 'Team' },
  { feature: 'Admin dashboard', free: false, pro: false, team: true, category: 'Team' },
  { feature: 'SSO & SAML', free: false, pro: false, team: true, category: 'Team' },
  { feature: 'Audit logs', free: false, pro: false, team: true, category: 'Team' },
  { feature: 'Support', free: 'Community', pro: 'Priority email', team: 'Dedicated Slack', category: 'Support' },
];

const faqs: FaqItem[] = [
  {
    question: 'What exactly is a restore point?',
    answer:
      'A restore point is a full snapshot of your project state — file contents, terminal history, AI conversation context, and environment variables — captured at a specific moment. Unlike a git commit, it includes everything git ignores. You can jump back to any restore point in one command.',
  },
  {
    question: 'Can I use AITimeMachine without cloud sync?',
    answer:
      'Yes. The Free plan is entirely local. Your restore points are stored on your machine and never leave it unless you upgrade to a paid plan. Cloud sync is opt-in on Pro and Team.',
  },
  {
    question: 'How does the annual discount work?',
    answer:
      'Annual billing saves you 20% — over two months free per year. When the annual option is available, choosing it on this page sends you to a checkout for the discounted annual plan; the lower price is the price you are charged. You can switch between monthly and annual at any time from your billing dashboard.',
  },
  {
    question: 'What happens to my data if I cancel?',
    answer:
      'Local restore points remain on your machine indefinitely. Cloud-synced data is retained for 30 days after cancellation so you have time to export or re-subscribe. We never delete your data without notice.',
  },
  {
    question: 'How does the Team plan handle GitHub at 35 PRs a day?',
    answer:
      'The Team plan\'s GitHub integration automatically creates a restore point before every AI-generated PR and after merge. If a batch of AI PRs introduces a regression, you can restore the repository to any point in the sequence — no manual git bisect required.',
  },
  {
    question: 'Do you offer a free trial for paid plans?',
    answer:
      'Pro comes with a 14-day free trial — no credit card required. Team comes with a 14-day trial as well. If you\'re not satisfied for any reason within the first 14 days, we\'ll give you a full refund, no questions asked.',
  },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AnnualToggle({
  annual,
  onToggle,
}: {
  annual: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-4 mb-12">
      <span className={`text-sm font-medium ${!annual ? 'text-white' : 'text-gray-400'}`}>
        Monthly
      </span>
      <button
        type="button"
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-950 ${
          annual ? 'bg-blue-600' : 'bg-gray-700'
        }`}
        aria-pressed={annual}
        aria-label="Toggle annual billing"
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
            annual ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
      <span className={`text-sm font-medium ${annual ? 'text-white' : 'text-gray-400'}`}>
        Annual
      </span>
      {annual && (
        <Badge className="bg-green-600/20 text-green-400 border-green-600/30 text-xs">
          Save 20%
        </Badge>
      )}
    </div>
  );
}

function ComparisonCell({ value }: { value: boolean | string }) {
  if (typeof value === 'string') {
    return <span className="text-sm text-gray-300">{value}</span>;
  }
  if (value) {
    return <Check className="w-5 h-5 text-green-500 mx-auto" />;
  }
  return <X className="w-4 h-4 text-gray-600 mx-auto" />;
}

function FaqCard({ faq }: { faq: FaqItem }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-gray-800/30 border border-gray-800 rounded-2xl overflow-hidden">
      <button
        type="button"
        className="w-full text-left px-6 py-5 flex items-start gap-3 hover:bg-gray-800/40 transition-colors"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <HelpCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <span className="text-sm font-semibold text-white flex-1">{faq.question}</span>
        <span
          className={`text-gray-400 transition-transform flex-shrink-0 mt-0.5 ${
            open ? 'rotate-180' : ''
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>
      {open && (
        <div className="px-6 pb-5 ml-8">
          <p className="text-sm text-gray-400 leading-relaxed">{faq.answer}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PricingPage() {
  const { isSignedIn } = useUser();
  const searchParams = useSearchParams();

  // Only offer annual billing when at least one annual Polar product ID is
  // configured. Showing the toggle without a backing product would let a user
  // pick a discounted price we cannot actually charge.
  const annualAvailable = isAnnualBillingAvailable();
  const [annual, setAnnual] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (searchParams.get('checkout') === 'canceled') {
      setError('Checkout was canceled. You can try again whenever you are ready.');
    }
    if (searchParams.get('checkout') === 'success') {
      setShowSuccess(true);
    }
  }, [searchParams]);

  const handleCheckout = async (plan: Plan) => {
    if (!plan.productId) return;

    if (!isSignedIn) {
      window.location.href = '/sign-up';
      return;
    }

    setCheckoutLoading(plan.id);
    setError(null);

    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: plan.productId, plan: plan.id, annual }),
      });

      if (!response.ok) {
        const data: { error?: string } = await response.json();
        throw new Error(data.error ?? 'Failed to create checkout session');
      }

      const { checkoutUrl }: { checkoutUrl: string } = await response.json();
      window.location.href = checkoutUrl;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setCheckoutLoading(null);
    }
  };

  const displayPrice = (plan: Plan): number =>
    annual ? plan.annualPrice : plan.monthlyPrice;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />

      {/* Banner messages */}
      {showSuccess && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
          <div className="bg-green-900/30 border border-green-700 rounded-lg px-4 py-3">
            <p className="text-green-400 text-center text-sm">
              Subscription activated.{' '}
              <Link href="/dashboard" className="underline font-medium">
                Go to Dashboard
              </Link>
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
          <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3">
            <p className="text-red-400 text-center text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12 text-center">
        <Badge className="mb-4 bg-blue-600/20 text-blue-400 border-blue-600/30">Pricing</Badge>
        <h1 className="text-4xl sm:text-5xl font-bold mb-4 tracking-tight">
          Simple, transparent pricing
        </h1>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-8">
          Start free. Upgrade when your AI agents ship more code than you can supervise.
          No hidden fees, cancel anytime.
        </p>

        {annualAvailable && (
          <AnnualToggle annual={annual} onToggle={() => setAnnual((v) => !v)} />
        )}
      </section>

      {/* Plan cards */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="grid md:grid-cols-3 gap-8">
          {plans.map((plan) => {
            const price = displayPrice(plan);
            const Icon = plan.icon;

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-2xl border ${
                  plan.popular
                    ? 'border-blue-500 bg-blue-950/20'
                    : 'border-gray-800 bg-gray-900/50'
                } p-8 transition-all hover:border-gray-700`}
              >
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <Badge className="bg-blue-600 text-white px-3 py-0.5 text-xs font-semibold shadow">
                      <Star className="w-3 h-3 mr-1 inline" />
                      Most Popular
                    </Badge>
                  </div>
                )}

                {/* Header */}
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-8 h-8 rounded-lg ${plan.popular ? 'bg-blue-500/20' : 'bg-gray-800'} flex items-center justify-center`}>
                      <Icon className={`w-4 h-4 ${plan.iconColor}`} />
                    </div>
                    <h2 className="text-xl font-bold">{plan.name}</h2>
                  </div>
                  <div className="mt-4 mb-1 flex items-end gap-1">
                    <span className="text-5xl font-bold tracking-tight">
                      {price === 0 ? 'Free' : `$${price}`}
                    </span>
                    {price > 0 && (
                      <span className="text-gray-400 mb-2">
                        {plan.period}
                        {annual && ' billed annually'}
                      </span>
                    )}
                  </div>
                  {annual && price > 0 && (
                    <p className="text-xs text-green-400">
                      Was ${plan.monthlyPrice}/mo — you save ${(plan.monthlyPrice - price) * 12}/yr
                    </p>
                  )}
                  <p className="text-sm text-gray-400 mt-2">{plan.description}</p>
                </div>

                {/* CTA */}
                <div className="mb-8">
                  {plan.id === 'free' ? (
                    <Button
                      variant={plan.popular ? 'default' : 'outline'}
                      className="w-full"
                      asChild
                    >
                      <Link href={isSignedIn ? '/dashboard' : '/sign-up'}>
                        {isSignedIn ? 'Your current plan' : plan.cta}
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      className={`w-full ${plan.popular ? '' : ''}`}
                      variant={plan.popular ? 'default' : 'outline'}
                      onClick={() => handleCheckout(plan)}
                      disabled={checkoutLoading === plan.id}
                    >
                      {checkoutLoading === plan.id ? (
                        'Redirecting...'
                      ) : (
                        <>
                          {plan.cta}
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </>
                      )}
                    </Button>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-3 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm">
                      <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-300">{feature}</span>
                    </li>
                  ))}
                  {plan.notIncluded.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm">
                      <X className="w-4 h-4 text-gray-600 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-600">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Enterprise nudge */}
        <div className="mt-8 text-center">
          <p className="text-gray-500 text-sm">
            Need more than 50 projects or custom SLAs?{' '}
            <a href="mailto:enterprise@gitgram.app" className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors">
              Talk to us about Enterprise
            </a>
          </p>
        </div>
      </section>

      {/* Feature comparison table */}
      <section className="bg-gray-900/40 py-20 sm:py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">Compare plans</h2>
            <p className="text-gray-400">Full feature breakdown across all tiers</p>
          </div>

          <div className="rounded-2xl border border-gray-800 overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-4 gap-0 bg-gray-800/60 border-b border-gray-800">
              <div className="p-4 text-sm font-medium text-gray-400">Feature</div>
              {plans.map((plan) => (
                <div key={plan.id} className="p-4 text-center">
                  <span className={`text-sm font-semibold ${plan.popular ? 'text-blue-400' : 'text-white'}`}>
                    {plan.name}
                  </span>
                </div>
              ))}
            </div>

            {/* Rows grouped by category */}
            {(['Core', 'Cloud', 'Team', 'Support'] as const).map((category) => {
              const rows = comparisonRows.filter((r) => r.category === category);
              return (
                <div key={category}>
                  <div className="px-4 py-2 bg-gray-950/60 border-b border-gray-800">
                    <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                      {category}
                    </span>
                  </div>
                  {rows.map((row, idx) => (
                    <div
                      key={row.feature}
                      className={`grid grid-cols-4 gap-0 border-b border-gray-800/60 ${
                        idx % 2 === 0 ? 'bg-transparent' : 'bg-gray-900/30'
                      }`}
                    >
                      <div className="p-4 text-sm text-gray-300">{row.feature}</div>
                      <div className="p-4 flex items-center justify-center">
                        <ComparisonCell value={row.free} />
                      </div>
                      <div className="p-4 flex items-center justify-center">
                        <ComparisonCell value={row.pro} />
                      </div>
                      <div className="p-4 flex items-center justify-center">
                        <ComparisonCell value={row.team} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Testimonial strip */}
      <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              quote: 'AITM is the only tool that keeps up with our AI agents. We ship 40+ PRs a day and never lose context.',
              author: 'Sam T.',
              role: 'Staff Eng, AI-first startup',
              icon: Shield,
            },
            {
              quote: 'One undo command saved three hours of untangling a bad Claude session. Worth every penny.',
              author: 'Priya M.',
              role: 'Solo founder',
              icon: Clock,
            },
            {
              quote: 'The GitHub integration automatically checkpoints before every merge. Our team stopped fearing force pushes.',
              author: 'Luca B.',
              role: 'Engineering Lead',
              icon: GitBranch,
            },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <div key={t.author} className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6">
                <Icon className="w-6 h-6 text-blue-400 mb-4" />
                <p className="text-sm text-gray-300 mb-4 italic">"{t.quote}"</p>
                <p className="text-sm font-semibold">{t.author}</p>
                <p className="text-xs text-gray-500">{t.role}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-gray-900/40 py-20 sm:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">Frequently asked questions</h2>
            <p className="text-gray-400">
              Still curious?{' '}
              <a href="mailto:support@gitgram.app" className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors">
                Email us
              </a>{' '}
              and we will reply within one business day.
            </p>
          </div>

          <div className="space-y-3">
            {faqs.map((faq) => (
              <FaqCard key={faq.question} faq={faq} />
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden bg-gradient-to-r from-blue-900/50 to-purple-900/50 border border-gray-800 rounded-3xl p-10 sm:p-14 text-center">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 pointer-events-none" />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Start before your next AI session breaks something
              </h2>
              <p className="text-gray-400 mb-8 max-w-xl mx-auto">
                Free forever for one project. No credit card required. Set up in under two minutes.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" asChild className="text-base">
                  <Link href="/sign-up">
                    Get Started Free
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="text-base">
                  <Link href="/docs">Read the Docs</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
