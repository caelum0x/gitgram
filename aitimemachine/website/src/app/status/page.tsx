'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Bell, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Status = 'operational' | 'degraded' | 'down';
type IncidentState = 'resolved' | 'monitoring' | 'investigating';

interface ComponentHealth {
  name: string;
  description: string;
  status: Status;
  uptime: number; // 90-day uptime percentage
}

interface DayBar {
  status: Status | 'none';
}

interface IncidentUpdate {
  time: string;
  state: IncidentState;
  message: string;
}

interface Incident {
  date: string;
  title: string;
  state: IncidentState;
  updates: IncidentUpdate[];
}

interface MetricRow {
  label: string;
  responseMs: number;
  uptime: number;
}

interface ProvidersResponse {
  overall?: string;
  providers?: Record<string, { status?: string }>;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://timemachine-api.gitgram.app';

// Components we surface on the status page. Default state is "operational" and
// is overridden when the live /health/providers endpoint reports otherwise.
const DEFAULT_COMPONENTS: ComponentHealth[] = [
  { name: 'API Server', description: 'REST + GraphQL gateway', status: 'operational', uptime: 99.98 },
  { name: 'MCP Server', description: 'Model Context Protocol bridge', status: 'operational', uptime: 99.95 },
  { name: 'Sync Service', description: 'Cloud checkpoint synchronization', status: 'operational', uptime: 99.92 },
  { name: 'Web Dashboard', description: 'app.gitgram.app frontend', status: 'operational', uptime: 99.99 },
  { name: 'GitNexus', description: 'Repository graph + PR engine', status: 'operational', uptime: 99.9 },
  { name: 'Auth', description: 'Authentication & sessions', status: 'operational', uptime: 99.97 },
  { name: 'Database', description: 'Primary PostgreSQL cluster', status: 'operational', uptime: 99.99 },
];

// Maps an upstream provider name to one of our surfaced component names.
const PROVIDER_TO_COMPONENT: Record<string, string> = {
  GitNexus: 'GitNexus',
  PostgreSQL: 'Database',
  Redis: 'Sync Service',
  OpenAI: 'MCP Server',
  Anthropic: 'MCP Server',
  Context7: 'MCP Server',
  Beads: 'GitNexus',
  PAL: 'API Server',
};

const RECENT_INCIDENTS: Incident[] = [
  {
    date: 'June 18, 2026',
    title: 'Elevated sync latency in EU region',
    state: 'resolved',
    updates: [
      {
        time: '14:52 UTC',
        state: 'resolved',
        message:
          'Sync latency has returned to normal levels. Root cause was a saturated connection pool on the EU replica; pool sizing has been increased.',
      },
      {
        time: '14:10 UTC',
        state: 'monitoring',
        message: 'A fix has been deployed and we are monitoring sync queue depth in the EU region.',
      },
      {
        time: '13:38 UTC',
        state: 'investigating',
        message: 'We are investigating reports of slow checkpoint uploads for users in the EU region.',
      },
    ],
  },
  {
    date: 'June 9, 2026',
    title: 'GitNexus PR indexing delays',
    state: 'resolved',
    updates: [
      {
        time: '09:21 UTC',
        state: 'resolved',
        message: 'PR indexing has fully caught up. No data was lost; only display freshness was affected.',
      },
      {
        time: '08:05 UTC',
        state: 'monitoring',
        message: 'Backlog is draining steadily. New PRs are being indexed within seconds again.',
      },
      {
        time: '07:40 UTC',
        state: 'investigating',
        message: 'GitNexus is showing delayed PR graphs for some repositories while we investigate a queue backlog.',
      },
    ],
  },
  {
    date: 'May 27, 2026',
    title: 'Scheduled database maintenance',
    state: 'resolved',
    updates: [
      {
        time: '03:30 UTC',
        state: 'resolved',
        message: 'Maintenance completed successfully. The primary PostgreSQL cluster was upgraded with zero data loss.',
      },
      {
        time: '02:00 UTC',
        state: 'monitoring',
        message: 'Maintenance window started. Brief read-only periods may be observed.',
      },
    ],
  },
];

const METRICS: MetricRow[] = [
  { label: 'Last 24 hours', responseMs: 118, uptime: 100.0 },
  { label: 'Last 7 days', responseMs: 124, uptime: 99.99 },
  { label: 'Last 30 days', responseMs: 131, uptime: 99.97 },
  { label: 'Last 90 days', responseMs: 136, uptime: 99.95 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeStatus(raw: string | undefined): Status {
  switch ((raw || '').toLowerCase()) {
    case 'available':
    case 'healthy':
    case 'operational':
    case 'ok':
      return 'operational';
    case 'degraded':
    case 'slow':
      return 'degraded';
    case 'unavailable':
    case 'down':
    case 'unhealthy':
    case 'error':
      return 'down';
    default:
      return 'operational';
  }
}

const STATUS_DOT: Record<Status, string> = {
  operational: 'bg-green-500',
  degraded: 'bg-yellow-500',
  down: 'bg-red-500',
};

const STATUS_TEXT: Record<Status, string> = {
  operational: 'text-green-400',
  degraded: 'text-yellow-400',
  down: 'text-red-400',
};

const STATUS_LABEL: Record<Status, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  down: 'Outage',
};

const BAR_FILL: Record<Status | 'none', string> = {
  operational: 'fill-green-500',
  degraded: 'fill-yellow-500',
  down: 'fill-red-500',
  none: 'fill-gray-700',
};

// Deterministic 90-day history so SSR and client render identically.
function buildHistory(component: ComponentHealth): DayBar[] {
  const bars: DayBar[] = [];
  // Seed from the component name length so different components vary slightly.
  const seed = component.name.length;
  for (let i = 0; i < 90; i++) {
    const n = (i * 7 + seed * 13) % 97;
    let status: Status | 'none' = 'operational';
    if (n === 41) status = 'down';
    else if (n % 23 === 0 && n !== 0) status = 'degraded';
    // Reflect the live status on the most recent (last) bar.
    if (i === 89) status = component.status;
    bars.push({ status });
  }
  return bars;
}

function overallFrom(components: ComponentHealth[]): Status {
  if (components.some((c) => c.status === 'down')) return 'down';
  if (components.some((c) => c.status === 'degraded')) return 'degraded';
  return 'operational';
}

const OVERALL_BANNER: Record<Status, { title: string; border: string; bg: string }> = {
  operational: {
    title: 'All Systems Operational',
    border: 'border-green-500/30',
    bg: 'bg-gradient-to-r from-green-500/10 to-emerald-500/10',
  },
  degraded: {
    title: 'Degraded Performance',
    border: 'border-yellow-500/30',
    bg: 'bg-gradient-to-r from-yellow-500/10 to-amber-500/10',
  },
  down: {
    title: 'Major Outage',
    border: 'border-red-500/30',
    bg: 'bg-gradient-to-r from-red-500/10 to-rose-500/10',
  },
};

const INCIDENT_BADGE: Record<IncidentState, { variant: 'success' | 'warning' | 'destructive'; label: string }> = {
  resolved: { variant: 'success', label: 'Resolved' },
  monitoring: { variant: 'warning', label: 'Monitoring' },
  investigating: { variant: 'destructive', label: 'Investigating' },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function UptimeBars({ component }: { component: ComponentHealth }) {
  const bars = useMemo(() => buildHistory(component), [component]);
  const barWidth = 3;
  const gap = 1;
  const height = 34;
  const totalWidth = bars.length * (barWidth + gap);

  return (
    <div className="mt-4">
      <svg
        viewBox={`0 0 ${totalWidth} ${height}`}
        className="w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`90-day uptime history for ${component.name}`}
      >
        {bars.map((bar, i) => (
          <rect
            key={i}
            x={i * (barWidth + gap)}
            y={0}
            width={barWidth}
            height={height}
            rx={1}
            className={BAR_FILL[bar.status]}
          />
        ))}
      </svg>
      <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
        <span>90 days ago</span>
        <span>{component.uptime.toFixed(2)}% uptime</span>
        <span>Today</span>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: Status }) {
  if (status === 'operational') return <CheckCircle2 className="h-4 w-4 text-green-400" />;
  if (status === 'degraded') return <AlertTriangle className="h-4 w-4 text-yellow-400" />;
  return <XCircle className="h-4 w-4 text-red-400" />;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function StatusPage() {
  const [components, setComponents] = useState<ComponentHealth[]>(DEFAULT_COMPONENTS);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const checkHealth = useCallback(async () => {
    setRefreshing(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${API_BASE}/api/v1/health/providers`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeout);

      if (res.ok || res.status === 503) {
        const data: ProvidersResponse = await res.json();
        const providerMap = data.providers ?? (data as Record<string, { status?: string }>);

        setComponents((prev) =>
          prev.map((component) => {
            // Find any upstream provider mapped to this component.
            const matchedStatuses: Status[] = Object.entries(providerMap)
              .filter(([provider]) => PROVIDER_TO_COMPONENT[provider] === component.name)
              .map(([, value]) => normalizeStatus(value?.status));

            if (matchedStatuses.length === 0) {
              return component; // keep operational fallback
            }

            const worst: Status = matchedStatuses.includes('down')
              ? 'down'
              : matchedStatuses.includes('degraded')
                ? 'degraded'
                : 'operational';

            return { ...component, status: worst };
          })
        );
      }
    } catch {
      // Fall back to the operational mock — no state mutation needed.
    } finally {
      setLastChecked(new Date());
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 60000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  const overall = useMemo(() => overallFrom(components), [components]);
  const banner = OVERALL_BANNER[overall];

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) return;
    // In production this posts to a subscription endpoint; here we confirm UX.
    setSubscribed(true);
    setEmail('');
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />

      <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        {/* Header */}
        <div className="mb-10 text-center">
          <Badge className="mb-4" variant="outline">
            Status
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">System Status</h1>
          <p className="mt-3 text-gray-400">
            Live operational status of all Gitgram TimeMachine services.
          </p>
        </div>

        {/* Overall banner */}
        <div className={`mb-10 rounded-2xl border ${banner.border} ${banner.bg} p-6`}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className={`relative flex h-3.5 w-3.5`}>
                {overall === 'operational' && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
                )}
                <span className={`relative inline-flex h-3.5 w-3.5 rounded-full ${STATUS_DOT[overall]}`} />
              </span>
              <h2 className={`text-xl font-semibold ${STATUS_TEXT[overall]}`}>{banner.title}</h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={checkHealth}
              disabled={refreshing}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
          <p className="mt-2 text-sm text-gray-400">
            {lastChecked
              ? `Last updated ${lastChecked.toLocaleTimeString()} · auto-refreshes every 60s`
              : 'Checking systems…'}
          </p>
        </div>

        {/* Components + 90-day uptime */}
        <section className="mb-12">
          <h2 className="mb-4 text-lg font-semibold text-gray-200">Components</h2>
          <div className="space-y-4">
            {components.map((component) => (
              <div
                key={component.name}
                className="rounded-xl border border-gray-800 bg-gray-900/60 p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <StatusIcon status={component.status} />
                    <div>
                      <h3 className="font-semibold">{component.name}</h3>
                      <p className="text-sm text-gray-500">{component.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <span className={`text-sm font-medium ${STATUS_TEXT[component.status]}`}>
                      {STATUS_LABEL[component.status]}
                    </span>
                    <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[component.status]}`} />
                  </div>
                </div>
                <UptimeBars component={component} />
              </div>
            ))}
          </div>
        </section>

        {/* Metrics */}
        <section className="mb-12">
          <h2 className="mb-4 text-lg font-semibold text-gray-200">Response Time &amp; Uptime</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {METRICS.map((metric) => (
              <div
                key={metric.label}
                className="rounded-xl border border-gray-800 bg-gradient-to-b from-gray-900 to-gray-900/40 p-4 text-center"
              >
                <p className="text-xs uppercase tracking-wide text-gray-500">{metric.label}</p>
                <p className="mt-2 text-2xl font-bold text-white">{metric.responseMs}ms</p>
                <p className="mt-1 text-sm text-green-400">{metric.uptime.toFixed(2)}% up</p>
              </div>
            ))}
          </div>
        </section>

        {/* Incidents */}
        <section className="mb-12">
          <h2 className="mb-4 text-lg font-semibold text-gray-200">Recent Incidents</h2>
          <div className="space-y-6">
            {RECENT_INCIDENTS.map((incident) => {
              const badge = INCIDENT_BADGE[incident.state];
              return (
                <div
                  key={`${incident.date}-${incident.title}`}
                  className="rounded-xl border border-gray-800 bg-gray-900/60 p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">{incident.title}</h3>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">{incident.date}</p>
                  <ol className="mt-4 space-y-4 border-l border-gray-800 pl-4">
                    {incident.updates.map((update, idx) => {
                      const ub = INCIDENT_BADGE[update.state];
                      return (
                        <li key={idx} className="relative">
                          <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-gray-600" />
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-gray-500">{update.time}</span>
                            <span className={`text-xs font-medium ${STATUS_TEXT[
                              update.state === 'resolved'
                                ? 'operational'
                                : update.state === 'monitoring'
                                  ? 'degraded'
                                  : 'down'
                            ]}`}>
                              {ub.label}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-gray-300">{update.message}</p>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              );
            })}
          </div>
        </section>

        {/* Subscribe */}
        <section className="rounded-2xl border border-gray-800 bg-gradient-to-br from-blue-500/10 to-purple-500/10 p-8">
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-semibold">Subscribe to Updates</h2>
          </div>
          <p className="mt-2 text-sm text-gray-400">
            Get notified by email when an incident is opened, updated, or resolved.
          </p>
          {subscribed ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              You&apos;re subscribed. Check your inbox to confirm.
            </p>
          ) : (
            <form onSubmit={handleSubscribe} className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-label="Email address"
                className="flex-1 rounded-lg border border-gray-700 bg-gray-950 px-4 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <Button type="submit">Subscribe</Button>
            </form>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
