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
  uptime: number; // 90-day uptime percentage (baseline; refined when live data arrives)
  latencyMs?: number; // live measured latency for the mapped provider, if known
  live?: boolean; // true once real health data has been applied
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

interface ProviderHealthDto {
  name: string;
  status?: string;
  latencyMs?: number;
}

interface ProvidersResponse {
  overall?: string;
  // The backend returns an array of providers; older shapes used a map.
  providers?: ProviderHealthDto[] | Record<string, { status?: string; latencyMs?: number }>;
  checkedAt?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://timemachine-api.gitgram.app';

// Components we surface on the status page. We do not fabricate historical
// uptime percentages (there is no time-series backend to source them from):
// `uptime` is filled in from the live status reading once a health check
// returns, and remains 0/"awaiting" until then.
const DEFAULT_COMPONENTS: ComponentHealth[] = [
  { name: 'API Server', description: 'REST + GraphQL gateway', status: 'operational', uptime: 0 },
  { name: 'MCP Server', description: 'Model Context Protocol bridge', status: 'operational', uptime: 0 },
  { name: 'Sync Service', description: 'Cloud checkpoint synchronization', status: 'operational', uptime: 0 },
  { name: 'Web Dashboard', description: 'app.gitgram.app frontend', status: 'operational', uptime: 0 },
  { name: 'GitNexus', description: 'Repository graph + PR engine', status: 'operational', uptime: 0 },
  { name: 'Auth', description: 'Authentication & sessions', status: 'operational', uptime: 0 },
  { name: 'Database', description: 'Primary PostgreSQL cluster', status: 'operational', uptime: 0 },
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

// We do not maintain a historical incident store or an uptime time-series
// backend, so we never render fabricated incident history or multi-window
// metrics. The page starts empty and is populated only from the live
// /health/providers reading (see checkHealth below).

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

interface ProviderSample {
  status: Status;
  latencyMs: number | null;
}

/**
 * Normalise either the array (`providers: [...]`) or legacy map shape into a
 * lookup keyed by provider name, capturing live status + measured latency.
 */
function normalizeProviders(
  providers: ProvidersResponse['providers'],
): Map<string, ProviderSample> {
  const map = new Map<string, ProviderSample>();
  if (!providers) return map;

  if (Array.isArray(providers)) {
    for (const p of providers) {
      if (!p?.name) continue;
      map.set(p.name, {
        status: normalizeStatus(p.status),
        latencyMs: typeof p.latencyMs === 'number' ? p.latencyMs : null,
      });
    }
  } else {
    for (const [name, value] of Object.entries(providers)) {
      map.set(name, {
        status: normalizeStatus(value?.status),
        latencyMs: typeof value?.latencyMs === 'number' ? value.latencyMs : null,
      });
    }
  }
  return map;
}

// Live availability derived from a current status reading. Without a
// time-series backend we report the live figure rather than a fabricated
// historical percentage.
const LIVE_UPTIME: Record<Status, number> = {
  operational: 100,
  degraded: 99,
  down: 0,
};

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
  // We do not have a backend uptime time-series, so we never fabricate a
  // 90-day history. Historical bars are "none" (unknown); only the most recent
  // bar reflects the real, live status reading.
  const bars: DayBar[] = [];
  for (let i = 0; i < 90; i++) {
    bars.push({ status: i === 89 && component.live ? component.status : 'none' });
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
        aria-label={`Uptime history for ${component.name}`}
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
        <span>History unavailable</span>
        <span>
          {component.live
            ? component.latencyMs !== undefined
              ? `Live · ${component.latencyMs}ms`
              : `Live · ${component.uptime.toFixed(0)}% available`
            : 'Awaiting live check'}
        </span>
        <span>Now</span>
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
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [liveData, setLiveData] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);

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
        const providerMap = normalizeProviders(data.providers);
        if (providerMap.size === 0) {
          return;
        }

        const measuredLatencies: number[] = [];

        const nextComponents = DEFAULT_COMPONENTS.map((component) => {
          // Gather every provider mapped to this component.
          const samples: ProviderSample[] = [];
          for (const [provider, sample] of providerMap) {
            if (PROVIDER_TO_COMPONENT[provider] === component.name) {
              samples.push(sample);
            }
          }

          if (samples.length === 0) {
            return component; // no upstream signal: keep baseline
          }

          const statuses = samples.map((s) => s.status);
          const worst: Status = statuses.includes('down')
            ? 'down'
            : statuses.includes('degraded')
              ? 'degraded'
              : 'operational';

          const latencies = samples
            .map((s) => s.latencyMs)
            .filter((l): l is number => typeof l === 'number');
          const avgLatency =
            latencies.length > 0
              ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
              : undefined;
          if (avgLatency !== undefined) measuredLatencies.push(avgLatency);

          return {
            ...component,
            status: worst,
            latencyMs: avgLatency,
            uptime: LIVE_UPTIME[worst],
            live: true,
          };
        });

        setComponents(nextComponents);

        // Real latency snapshot drives the "current" metrics row; we don't
        // fabricate historical windows we can't measure.
        const overallStatus: Status = nextComponents.some((c) => c.status === 'down')
          ? 'down'
          : nextComponents.some((c) => c.status === 'degraded')
            ? 'degraded'
            : 'operational';
        const avgResponse =
          measuredLatencies.length > 0
            ? Math.round(
                measuredLatencies.reduce((a, b) => a + b, 0) / measuredLatencies.length,
              )
            : 0;
        setMetrics([
          {
            label: 'Current',
            responseMs: avgResponse,
            uptime: LIVE_UPTIME[overallStatus],
          },
        ]);

        // No incident time-series store exists; reflect the live reality.
        setIncidents(
          overallStatus === 'operational'
            ? []
            : [
                {
                  date: new Date().toLocaleDateString(undefined, {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  }),
                  title:
                    overallStatus === 'down'
                      ? 'Service disruption detected'
                      : 'Degraded performance detected',
                  state: 'investigating',
                  updates: [
                    {
                      time: new Date().toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                      }),
                      state: 'investigating',
                      message:
                        'Automated health checks are reporting issues with one or more components. Our team is investigating.',
                    },
                  ],
                },
              ],
        );
        setLiveData(true);
      }
    } catch {
      // Backend unreachable: keep the last known state.
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

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) return;
    setSubscribing(true);
    setSubscribeError(null);
    try {
      const response = await fetch('/api/status/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setSubscribeError(
          (data && typeof data.error === 'string' && data.error) ||
            'Could not subscribe. Please try again later.'
        );
        return;
      }
      setSubscribed(true);
      setEmail('');
    } catch {
      setSubscribeError('Could not subscribe. Please try again later.');
    } finally {
      setSubscribing(false);
    }
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
          {metrics.length === 0 ? (
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 text-sm text-gray-400">
              Live response-time metrics will appear here after the next health check. Historical
              metrics are not yet available.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {metrics.map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-xl border border-gray-800 bg-gradient-to-b from-gray-900 to-gray-900/40 p-4 text-center"
                >
                  <p className="text-xs uppercase tracking-wide text-gray-500">{metric.label}</p>
                  <p className="mt-2 text-2xl font-bold text-white">
                    {metric.responseMs > 0 ? `${metric.responseMs}ms` : '—'}
                  </p>
                  <p className="mt-1 text-sm text-green-400">{metric.uptime.toFixed(2)}% up</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Incidents */}
        <section className="mb-12">
          <h2 className="mb-4 text-lg font-semibold text-gray-200">Recent Incidents</h2>
          <div className="space-y-6">
            {liveData && incidents.length === 0 && (
              <div className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/60 p-5 text-sm text-gray-400">
                <CheckCircle2 className="h-5 w-5 text-green-400" />
                No incidents reported. All systems are operating normally.
              </div>
            )}
            {!liveData && incidents.length === 0 && (
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5 text-sm text-gray-400">
                Checking systems… incident status will appear after the first health check.
              </div>
            )}
            {incidents.map((incident) => {
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
            <>
              <form onSubmit={handleSubscribe} className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  aria-label="Email address"
                  disabled={subscribing}
                  className="flex-1 rounded-lg border border-gray-700 bg-gray-950 px-4 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
                />
                <Button type="submit" disabled={subscribing}>
                  {subscribing ? 'Subscribing...' : 'Subscribe'}
                </Button>
              </form>
              {subscribeError && (
                <p className="mt-3 flex items-center gap-2 text-sm text-red-400">
                  <XCircle className="h-4 w-4" />
                  {subscribeError}
                </p>
              )}
            </>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
