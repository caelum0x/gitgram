'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Plug,
  Sparkles,
  Code2,
  Mail,
  Check,
  Clock,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CATEGORIES,
  integrations,
  type Integration,
  type IntegrationCategory,
} from './data';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Filter = 'All' | IntegrationCategory;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LogoPlaceholder({
  logo,
  accent,
  size = 'md',
}: {
  logo: string;
  accent: string;
  size?: 'md' | 'lg';
}) {
  const dimensions = size === 'lg' ? 'w-16 h-16 text-xl' : 'w-11 h-11 text-sm';
  return (
    <div
      className={`${dimensions} rounded-xl bg-gradient-to-br ${accent} flex items-center justify-center font-bold text-gray-950 shadow-md flex-shrink-0`}
      aria-hidden="true"
    >
      {logo}
    </div>
  );
}

function StatusBadge({ status }: { status: Integration['status'] }) {
  if (status === 'Available') {
    return (
      <Badge className="bg-green-600/20 text-green-400 border-green-600/30 text-xs">
        <Check className="w-3 h-3 mr-1 inline" />
        Available
      </Badge>
    );
  }
  return (
    <Badge className="bg-yellow-600/20 text-yellow-400 border-yellow-600/30 text-xs">
      <Clock className="w-3 h-3 mr-1 inline" />
      Coming Soon
    </Badge>
  );
}

function CategoryFilter({
  active,
  onSelect,
  counts,
}: {
  active: Filter;
  onSelect: (filter: Filter) => void;
  counts: Record<Filter, number>;
}) {
  const filters: Filter[] = ['All', ...CATEGORIES];

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {filters.map((filter) => {
        const isActive = filter === active;
        return (
          <button
            key={filter}
            type="button"
            onClick={() => onSelect(filter)}
            aria-pressed={isActive}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
              isActive
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-gray-900/50 border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
            }`}
          >
            {filter}
            <span
              className={`ml-2 text-xs ${
                isActive ? 'text-blue-100' : 'text-gray-600'
              }`}
            >
              {counts[filter]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function IntegrationCard({ integration }: { integration: Integration }) {
  return (
    <Link
      href={`/integrations/${integration.slug}`}
      className="group flex flex-col rounded-2xl border border-gray-800 bg-gray-900/50 p-6 transition-all hover:border-gray-700 hover:bg-gray-900/80"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <LogoPlaceholder logo={integration.logo} accent={integration.accent} />
        <StatusBadge status={integration.status} />
      </div>

      <h3 className="text-lg font-semibold text-white mb-1">
        {integration.name}
      </h3>
      <Badge variant="outline" className="w-fit mb-3 text-xs">
        {integration.category}
      </Badge>
      <p className="text-sm text-gray-400 leading-relaxed flex-1">
        {integration.shortDescription}
      </p>

      <span className="mt-5 inline-flex items-center text-sm font-medium text-blue-400 group-hover:text-blue-300 transition-colors">
        Learn more
        <ArrowRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function IntegrationsPage() {
  const [filter, setFilter] = useState<Filter>('All');

  const counts = useMemo<Record<Filter, number>>(() => {
    const base: Record<Filter, number> = {
      All: integrations.length,
      Editors: 0,
      'AI Tools': 0,
      'CI/CD': 0,
      'Version Control': 0,
      Cloud: 0,
    };
    for (const integration of integrations) {
      base[integration.category] += 1;
    }
    return base;
  }, []);

  const visible = useMemo(() => {
    if (filter === 'All') return integrations;
    return integrations.filter((i) => i.category === filter);
  }, [filter]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-900/20 via-gray-950 to-gray-950 pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 text-center">
          <Badge className="mb-4 bg-blue-600/20 text-blue-400 border-blue-600/30">
            <Plug className="w-3 h-3 mr-1 inline" />
            Integrations
          </Badge>
          <h1 className="text-4xl sm:text-5xl font-bold mb-4 tracking-tight">
            AITM works with your stack
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            From your editor to your CI pipeline to your cloud storage,
            AITimeMachine drops into the tools you already use — so every
            AI-assisted change is one command away from being undone.
          </p>
        </div>
      </section>

      {/* Filter + grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="mb-10">
          <CategoryFilter active={filter} onSelect={setFilter} counts={counts} />
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {visible.map((integration) => (
            <IntegrationCard key={integration.slug} integration={integration} />
          ))}
        </div>

        {visible.length === 0 && (
          <p className="text-center text-gray-500 py-16">
            No integrations in this category yet.
          </p>
        )}
      </section>

      {/* Request an integration CTA */}
      <section className="bg-gray-900/40 py-20 sm:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600/20 mb-6">
            <Sparkles className="w-6 h-6 text-blue-400" />
          </div>
          <h2 className="text-3xl font-bold mb-3">
            Don&apos;t see your tool?
          </h2>
          <p className="text-gray-400 mb-8 max-w-xl mx-auto">
            We add integrations based on what developers ask for. Tell us what
            you use and we&apos;ll prioritize it — or get notified the moment a
            coming-soon integration ships.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild className="text-base">
              <a href="mailto:integrations@gitgram.app?subject=Integration%20request">
                <Mail className="w-4 h-4 mr-2" />
                Request an integration
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild className="text-base">
              <Link href="/contact">Talk to us</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Build your own */}
      <section className="py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden bg-gradient-to-r from-blue-900/50 to-purple-900/50 border border-gray-800 rounded-3xl p-10 sm:p-14">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 pointer-events-none" />
            <div className="relative grid lg:grid-cols-2 gap-10 items-center">
              <div>
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gray-950/60 mb-6">
                  <Code2 className="w-6 h-6 text-blue-400" />
                </div>
                <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                  Build your own integration
                </h2>
                <p className="text-gray-300 mb-8 leading-relaxed">
                  Every integration above is built on the same public API and
                  MCP server you have access to. Checkpoint, list, diff, and
                  restore from any language or tool — wire AITM into your own
                  workflow in an afternoon.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Button size="lg" asChild className="text-base">
                    <Link href="/docs/api-reference">
                      Read the API reference
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    asChild
                    className="text-base"
                  >
                    <Link href="/docs/cli-reference">CLI reference</Link>
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-800 bg-gray-950/70 p-6 font-mono text-sm overflow-x-auto">
                <p className="text-gray-500 mb-3 select-none"># checkpoint via the API</p>
                <pre className="text-gray-300 leading-relaxed">
                  <span className="text-green-400">curl</span> -X POST
                  https://api.aitimemachine.dev/v1/checkpoints{'\n'}
                  {'  '}-H{' '}
                  <span className="text-amber-300">
                    &quot;Authorization: Bearer $AITM_TOKEN&quot;
                  </span>
                  {'\n'}
                  {'  '}-d{' '}
                  <span className="text-amber-300">
                    &apos;&#123;&quot;message&quot;:&quot;before refactor&quot;&#125;&apos;
                  </span>
                </pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
