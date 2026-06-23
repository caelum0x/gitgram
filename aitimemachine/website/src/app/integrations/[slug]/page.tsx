'use client';

import { use } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  Terminal,
  Sparkles,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getIntegration, type Integration, type SetupStep } from '../data';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CodeBlock({ step }: { step: SetupStep }) {
  if (!step.code) return null;
  return (
    <div className="mt-3 rounded-xl border border-gray-800 bg-gray-950/80 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800 bg-gray-900/60">
        <Terminal className="w-3.5 h-3.5 text-gray-500" />
        <span className="text-xs text-gray-500 uppercase tracking-wide">
          {step.language ?? 'bash'}
        </span>
      </div>
      <pre className="px-4 py-3 overflow-x-auto text-sm font-mono text-gray-200 leading-relaxed">
        {step.code}
      </pre>
    </div>
  );
}

function SetupStepCard({ step, index }: { step: SetupStep; index: number }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600/20 border border-blue-600/40 flex items-center justify-center text-sm font-semibold text-blue-400">
        {index + 1}
      </div>
      <div className="flex-1 pb-2">
        <h3 className="text-base font-semibold text-white mb-1">
          {step.title}
        </h3>
        <p className="text-sm text-gray-400 leading-relaxed">
          {step.description}
        </p>
        <CodeBlock step={step} />
      </div>
    </div>
  );
}

function InstallCta({ integration }: { integration: Integration }) {
  const available = integration.status === 'Available';
  return (
    <div className="flex flex-col sm:flex-row gap-4">
      {available ? (
        <Button size="lg" asChild className="text-base">
          <Link href={integration.docsUrl}>
            Install {integration.name}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Link>
        </Button>
      ) : (
        <Button size="lg" asChild className="text-base">
          <a
            href={`mailto:integrations@gitgram.app?subject=Early%20access:%20${encodeURIComponent(
              integration.name,
            )}`}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Request early access
          </a>
        </Button>
      )}
      <Button size="lg" variant="outline" asChild className="text-base">
        <Link href="/docs/api-reference">View the API</Link>
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function IntegrationDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const integration = getIntegration(slug);

  if (!integration) {
    notFound();
  }

  const available = integration.status === 'Available';

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-24">
        {/* Back link */}
        <Link
          href="/integrations"
          className="inline-flex items-center text-sm text-gray-400 hover:text-white transition-colors mb-10"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          All integrations
        </Link>

        {/* Hero */}
        <section className="flex flex-col sm:flex-row sm:items-start gap-6 mb-12">
          <div
            className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${integration.accent} flex items-center justify-center text-2xl font-bold text-gray-950 shadow-lg flex-shrink-0`}
            aria-hidden="true"
          >
            {integration.logo}
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                {integration.name}
              </h1>
              {available ? (
                <Badge className="bg-green-600/20 text-green-400 border-green-600/30 text-xs">
                  <Check className="w-3 h-3 mr-1 inline" />
                  Available
                </Badge>
              ) : (
                <Badge className="bg-yellow-600/20 text-yellow-400 border-yellow-600/30 text-xs">
                  <Clock className="w-3 h-3 mr-1 inline" />
                  Coming Soon
                </Badge>
              )}
            </div>
            <Badge variant="outline" className="mb-4 text-xs">
              {integration.category}
            </Badge>
            <p className="text-lg text-gray-300 leading-relaxed">
              {integration.longDescription}
            </p>
            <div className="mt-8">
              <InstallCta integration={integration} />
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mb-14">
          <h2 className="text-xl font-bold mb-5">What you get</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {integration.features.map((feature) => (
              <div
                key={feature}
                className="flex items-start gap-3 rounded-xl border border-gray-800 bg-gray-900/40 px-4 py-3"
              >
                <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-gray-300">{feature}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Setup steps */}
        <section className="mb-14">
          <h2 className="text-xl font-bold mb-6">Setup</h2>
          <div className="space-y-7">
            {integration.setupSteps.map((step, index) => (
              <SetupStepCard key={step.title} step={step} index={index} />
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="relative overflow-hidden bg-gradient-to-r from-blue-900/50 to-purple-900/50 border border-gray-800 rounded-3xl p-8 sm:p-10 text-center">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 pointer-events-none" />
          <div className="relative">
            <h2 className="text-2xl font-bold mb-3">
              {available
                ? `Add AITM to ${integration.name} now`
                : `Be first to use ${integration.name}`}
            </h2>
            <p className="text-gray-400 mb-7 max-w-lg mx-auto">
              {available
                ? 'Free forever for one project. No credit card required.'
                : 'Join the early access list and we will email you the moment it ships.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <InstallCta integration={integration} />
            </div>
          </div>
        </section>
      </div>

      <Footer />
    </div>
  );
}
