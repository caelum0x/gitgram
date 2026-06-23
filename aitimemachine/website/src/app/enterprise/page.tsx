import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ArrowRight,
  Users,
  Share2,
  KeyRound,
  ScrollText,
  Server,
  LifeBuoy,
  ShieldCheck,
  Lock,
  Globe,
  GitBranch,
  Check,
  Calendar,
  Building2,
  Boxes,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: 'Enterprise — Gitgram TimeMachine',
  description:
    'AITM for teams that ship with AI. Shared checkpoint history, SSO/SAML, audit logs, on-prem deployment, and priority support for organizations running fleets of AI agents.',
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SALES_EMAIL = 'enterprise@gitgram.app';
const CALENDLY_URL = 'https://calendly.com/gitgram/enterprise';

interface Feature {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  description: string;
}

const features: Feature[] = [
  {
    icon: Users,
    iconColor: 'text-blue-400',
    title: 'Team workspaces',
    description:
      'Group projects, members, and restore history under a single organization. Role-based access keeps every agent and engineer in the right lane.',
  },
  {
    icon: Share2,
    iconColor: 'text-purple-400',
    title: 'Shared sessions',
    description:
      'Hand off a live checkpoint to a teammate or another agent. Everyone sees the same file state, terminal history, and AI context — no re-syncing.',
  },
  {
    icon: KeyRound,
    iconColor: 'text-green-400',
    title: 'SSO / SAML',
    description:
      'Connect Okta, Azure AD, Google Workspace, or any SAML 2.0 provider. Provision and de-provision access centrally with SCIM.',
  },
  {
    icon: ScrollText,
    iconColor: 'text-yellow-400',
    title: 'Audit logs',
    description:
      'Every restore, checkpoint, and access event is logged immutably. Export to your SIEM or stream over webhook for compliance reviews.',
  },
  {
    icon: Server,
    iconColor: 'text-cyan-400',
    title: 'On-prem deployment',
    description:
      'Run AITM entirely inside your VPC or air-gapped network. Your checkpoints never leave infrastructure you control.',
  },
  {
    icon: LifeBuoy,
    iconColor: 'text-red-400',
    title: 'Priority support',
    description:
      'A dedicated Slack channel, a named technical account manager, and a 99.9% uptime SLA backed by 24/7 on-call response.',
  },
];

interface ComplianceBadge {
  icon: React.ElementType;
  label: string;
  detail: string;
}

const complianceBadges: ComplianceBadge[] = [
  { icon: ShieldCheck, label: 'SOC 2 Type II', detail: 'Audited annually' },
  { icon: Lock, label: 'GDPR', detail: 'EU data subject rights' },
  { icon: Globe, label: 'Data residency', detail: 'US / EU regions' },
  { icon: KeyRound, label: 'AES-256', detail: 'Encryption at rest' },
];

interface TeamTier {
  name: string;
  price: string;
  cadence: string;
  description: string;
  icon: React.ElementType;
  highlighted: boolean;
  features: string[];
  cta: string;
  ctaHref: string;
}

const tiers: TeamTier[] = [
  {
    name: 'Team',
    price: '$49',
    cadence: 'per seat / mo',
    description: 'For small teams pairing with AI agents every day.',
    icon: Users,
    highlighted: false,
    features: [
      'Up to 25 seats',
      'Shared checkpoint library',
      'GitHub integration',
      'Team restore points',
      'Admin dashboard',
      'Email support',
    ],
    cta: 'Start Team Trial',
    ctaHref: '/pricing',
  },
  {
    name: 'Business',
    price: '$99',
    cadence: 'per seat / mo',
    description: 'For scaling orgs that need SSO, audit logs, and an SLA.',
    icon: Building2,
    highlighted: true,
    features: [
      'Up to 250 seats',
      'Everything in Team',
      'SSO / SAML + SCIM',
      'Audit logs & SIEM export',
      'Priority support + TAM',
      '99.9% uptime SLA',
    ],
    cta: 'Talk to Sales',
    ctaHref: `mailto:${SALES_EMAIL}?subject=Business%20plan%20inquiry`,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    cadence: 'volume pricing',
    description: 'For large orgs running fleets of agents at 35+ PRs a day.',
    icon: Boxes,
    highlighted: false,
    features: [
      'Unlimited seats',
      'Everything in Business',
      'On-prem / air-gapped deploy',
      'Custom data residency',
      'Dedicated Slack + 24/7 on-call',
      'Security review & DPA',
    ],
    cta: 'Contact Sales',
    ctaHref: `mailto:${SALES_EMAIL}?subject=Enterprise%20plan%20inquiry`,
  },
];

const customerLogos: string[] = [
  'Northwind',
  'Acme AI',
  'Quantel',
  'Vectorly',
  'Hyperloop Labs',
  'Meridian',
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FeatureCard({ feature }: { feature: Feature }) {
  const Icon = feature.icon;
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-6 transition-all hover:border-gray-700">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-gray-800">
        <Icon className={`h-5 w-5 ${feature.iconColor}`} />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-white">{feature.title}</h3>
      <p className="text-sm leading-relaxed text-gray-400">{feature.description}</p>
    </div>
  );
}

function TierCard({ tier }: { tier: TeamTier }) {
  const Icon = tier.icon;
  const isMailto = tier.ctaHref.startsWith('mailto:');
  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-8 transition-all ${
        tier.highlighted
          ? 'border-blue-500 bg-blue-950/20'
          : 'border-gray-800 bg-gray-900/50 hover:border-gray-700'
      }`}
    >
      {tier.highlighted && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <Badge className="bg-blue-600 px-3 py-0.5 text-xs font-semibold text-white shadow">
            Most Popular
          </Badge>
        </div>
      )}

      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              tier.highlighted ? 'bg-blue-500/20' : 'bg-gray-800'
            }`}
          >
            <Icon className={`h-4 w-4 ${tier.highlighted ? 'text-blue-400' : 'text-gray-300'}`} />
          </div>
          <h3 className="text-xl font-bold text-white">{tier.name}</h3>
        </div>
        <div className="mb-1 flex items-end gap-1">
          <span className="text-4xl font-bold tracking-tight text-white">{tier.price}</span>
          <span className="mb-1.5 text-sm text-gray-400">{tier.cadence}</span>
        </div>
        <p className="mt-2 text-sm text-gray-400">{tier.description}</p>
      </div>

      <div className="mb-8">
        <Button
          asChild
          variant={tier.highlighted ? 'default' : 'outline'}
          className="w-full"
        >
          {isMailto ? (
            <a href={tier.ctaHref}>
              {tier.cta}
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          ) : (
            <Link href={tier.ctaHref}>
              {tier.cta}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          )}
        </Button>
      </div>

      <ul className="flex-1 space-y-3">
        {tier.features.map((item) => (
          <li key={item} className="flex items-start gap-3 text-sm">
            <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
            <span className="text-gray-300">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EnterprisePage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-blue-950/30 via-gray-950 to-gray-950" />
        <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-20 text-center sm:px-6 lg:px-8 sm:pt-28">
          <Badge className="mb-4 border-blue-600/30 bg-blue-600/20 text-blue-400">Enterprise</Badge>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
            AITM for teams that ship with AI
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-400 sm:text-xl">
            When five agents work in parallel, you need one shared, restorable history.
            AITM gives your whole organization a deterministic undo button across every
            checkpoint, branch, and AI session.
          </p>
          <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
            <Button size="lg" asChild className="text-base">
              <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer">
                <Calendar className="mr-2 h-4 w-4" />
                Talk to Sales
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild className="text-base">
              <Link href="/pricing">View Pricing</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Problem / Solution */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 sm:py-20">
        <div className="grid items-center gap-8 lg:grid-cols-2">
          <div className="rounded-2xl border border-red-900/40 bg-red-950/10 p-8">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-red-300">
              <GitBranch className="h-5 w-5" />
              The problem
            </h2>
            <p className="mb-4 text-sm leading-relaxed text-gray-400">
              Your team turned on AI agents and the PR count exploded. Now five agents
              touch the same repo in the same hour. A bad batch lands, and nobody can
              say which checkpoint was good. Git bisect across machine-generated commits
              is a nightmare, and the context that produced the regression is already gone.
            </p>
            <ul className="space-y-2 text-sm text-gray-500">
              <li>• No shared view of what each agent changed</li>
              <li>• Lost terminal and AI context after the session ends</li>
              <li>• Manual git archaeology to find the last good state</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-green-900/40 bg-green-950/10 p-8">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-green-300">
              <ShieldCheck className="h-5 w-5" />
              The solution
            </h2>
            <p className="mb-4 text-sm leading-relaxed text-gray-400">
              AITM captures a full restore point — files, terminal, and AI conversation —
              before and after every agent action. Your whole team shares one checkpoint
              history, so when a parallel batch breaks something, anyone can jump the org
              back to the last known-good state in a single command.
            </p>
            <ul className="space-y-2 text-sm text-gray-400">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
                Shared, deterministic checkpoint history
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
                Full AI context preserved with every restore point
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
                One-command org-wide rollback, no git bisect
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="bg-gray-900/40 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold">Built for organizations</h2>
            <p className="mt-3 text-gray-400">
              Everything you need to run AITM across hundreds of engineers and agents.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <FeatureCard key={feature.title} feature={feature} />
            ))}
          </div>
        </div>
      </section>

      {/* Security & compliance */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 sm:py-24">
        <div className="mb-12 text-center">
          <Badge className="mb-4 border-green-600/30 bg-green-600/20 text-green-400">
            Security &amp; compliance
          </Badge>
          <h2 className="text-3xl font-bold">Enterprise-grade by default</h2>
          <p className="mx-auto mt-3 max-w-2xl text-gray-400">
            Your checkpoints contain source code and AI context. We protect them with the
            same rigor you would expect from your most sensitive infrastructure.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {complianceBadges.map((badge) => {
            const Icon = badge.icon;
            return (
              <div
                key={badge.label}
                className="flex flex-col items-center rounded-2xl border border-gray-800 bg-gray-900/50 p-6 text-center"
              >
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                  <Icon className="h-6 w-6 text-green-400" />
                </div>
                <span className="text-base font-semibold text-white">{badge.label}</span>
                <span className="mt-1 text-xs text-gray-500">{badge.detail}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-8 text-center">
          <Link
            href="/security"
            className="inline-flex items-center gap-1 text-sm text-blue-400 underline-offset-2 transition-colors hover:text-blue-300 hover:underline"
          >
            Read our full security overview
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Customer logos */}
      <section className="border-y border-gray-800 bg-gray-900/30 py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="mb-8 text-center text-xs font-semibold uppercase tracking-widest text-gray-500">
            Trusted by AI-first engineering teams
          </p>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
            {customerLogos.map((logo) => (
              <div
                key={logo}
                className="flex h-14 items-center justify-center rounded-lg border border-gray-800 bg-gray-950/50 text-sm font-semibold text-gray-500"
              >
                {logo}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing tiers */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 sm:py-24">
        <div className="mb-12 text-center">
          <Badge className="mb-4 border-purple-600/30 bg-purple-600/20 text-purple-400">Plans</Badge>
          <h2 className="text-3xl font-bold">Pricing for teams of every size</h2>
          <p className="mx-auto mt-3 max-w-2xl text-gray-400">
            Start with a Team trial and scale to Enterprise with on-prem deployment and a
            custom contract. Annual billing saves 20%.
          </p>
        </div>
        <div className="grid gap-8 md:grid-cols-3">
          {tiers.map((tier) => (
            <TierCard key={tier.name} tier={tier} />
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-gray-500">
          Need something specific — seat-based volume discounts, custom SLAs, or a DPA?{' '}
          <a
            href={`mailto:${SALES_EMAIL}`}
            className="text-blue-400 underline underline-offset-2 transition-colors hover:text-blue-300"
          >
            Email our team
          </a>
          .
        </p>
      </section>

      {/* Talk to Sales CTA */}
      <section className="py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-gray-800 bg-gradient-to-r from-blue-900/50 to-purple-900/50 p-10 text-center sm:p-14">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10" />
            <div className="relative">
              <h2 className="text-3xl font-bold sm:text-4xl">
                Bring deterministic restore to your whole org
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-gray-300">
                Book a 30-minute call. We will scope your agent fleet, walk through
                deployment options, and tailor a plan to your security requirements.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
                <Button size="lg" asChild className="text-base">
                  <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer">
                    <Calendar className="mr-2 h-4 w-4" />
                    Book a demo
                  </a>
                </Button>
                <Button size="lg" variant="outline" asChild className="text-base">
                  <a href={`mailto:${SALES_EMAIL}`}>
                    Email Sales
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </div>
              <p className="mt-6 text-xs text-gray-400">
                Or reach us directly at{' '}
                <a href={`mailto:${SALES_EMAIL}`} className="text-blue-300 underline underline-offset-2">
                  {SALES_EMAIL}
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
