import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import {
  parseAdoptionSummary,
  type AdoptionSummary,
  type EvidenceStatus,
  type EvidenceWindow,
} from '@/lib/adoption-evidence';

interface Metric {
  label: string;
  value: string;
  detail: string;
}

const API_BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'https://timemachine-api.gitgram.app';

async function getAdoptionSummary(): Promise<AdoptionSummary | null> {
  try {
    const response = await fetch(`${API_BASE}/v1/adoption/summary`, {
      next: { revalidate: 300 },
    });
    if (!response.ok) return null;
    return parseAdoptionSummary(await response.json() as unknown);
  } catch {
    return null;
  }
}

function countValue(number: number | null | undefined, status: EvidenceStatus | 'unavailable'): string {
  if (status === 'unavailable') return 'Unavailable';
  if (status === 'unmeasured') return 'Unmeasured';
  return typeof number === 'number' ? new Intl.NumberFormat('en-US').format(number) : 'Not applicable';
}

function windowLabel(window: EvidenceWindow | undefined): string {
  if (!window || window.status === 'unmeasured' || !window.startsAt || !window.endsAt) {
    return 'No completed coverage window';
  }
  const formatter = new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${formatter.format(new Date(window.startsAt))} to ${formatter.format(new Date(window.endsAt))} UTC`;
}

function freshnessLabel(summary: AdoptionSummary): string {
  const freshness = summary.oss.freshness;
  if (freshness.status === 'unmeasured' || freshness.ageHours === null) return 'Freshness unmeasured';
  return `${freshness.status} / ${freshness.ageHours} h old`;
}

function EvidenceRail({ number, title, window, metrics }: {
  number: string;
  title: string;
  window: string;
  metrics: Metric[];
}) {
  return (
    <section className="border-t border-[#171713] py-10 sm:py-14">
      <div className="mb-8 grid gap-3 sm:grid-cols-[6rem_1fr] sm:items-end">
        <p className="font-serif text-7xl leading-none tracking-[-0.08em]" aria-hidden="true">{number}</p>
        <div>
          <h2 className="font-serif text-3xl tracking-[-0.035em] sm:text-4xl">{title}</h2>
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.16em]">{window}</p>
        </div>
      </div>
      <div className="grid border-l border-t border-[#171713] sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <article key={metric.label} className="min-h-56 border-b border-r border-[#171713] p-6">
            <p className="font-serif text-4xl tracking-[-0.05em] sm:text-5xl">{metric.value}</p>
            <h3 className="mt-5 font-mono text-xs uppercase tracking-[0.16em]">{metric.label}</h3>
            <p className="mt-4 text-sm leading-6 text-[#4d4c44]">{metric.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export default async function InvestorsPage() {
  const adoption = await getAdoptionSummary();
  const endpointStatus = adoption ? 'measured' : 'unavailable';
  const ossStatus = adoption?.oss.status ?? 'unavailable';
  const caseStatus = adoption?.caseEvidence.status ?? 'unavailable';

  const adoptionMetrics: Metric[] = [
    {
      label: 'Active developers',
      value: countValue(adoption?.activeDevelopers, endpointStatus),
      detail: 'Distinct cloud-sync accounts with a checkpoint in the adoption window.',
    },
    {
      label: 'Projects protected',
      value: countValue(adoption?.projects, endpointStatus),
      detail: 'Projects registered with the cloud checkpoint service.',
    },
    {
      label: 'Checkpoints created',
      value: countValue(adoption?.checkpoints.lifetime, endpointStatus),
      detail: adoption ? `${countValue(adoption.checkpoints.period, 'measured')} created in this window.` : 'The live query failed.',
    },
    {
      label: 'Restores applied',
      value: countValue(adoption?.appliedRestores.lifetime, endpointStatus),
      detail: adoption ? `${countValue(adoption.appliedRestores.period, 'measured')} applied in this window.` : 'The live query failed.',
    },
  ];

  const contributionMetrics: Metric[] = [
    {
      label: 'External contributors',
      value: countValue(adoption?.oss.externalContributors, ossStatus),
      detail: ossStatus === 'unmeasured' ? 'No completed OSS coverage batch.' : 'Distinct opaque contributor keys in the measured batch.',
    },
    {
      label: 'Repeat contributors',
      value: countValue(adoption?.oss.repeatContributors, ossStatus),
      detail: ossStatus === 'unmeasured' ? 'No completed OSS coverage batch.' : 'Contributors with two or more recorded contributions.',
    },
    {
      label: 'Repositories measured',
      value: countValue(adoption?.oss.repositoriesMeasured, ossStatus),
      detail: ossStatus === 'unmeasured' ? 'No completed OSS coverage batch.' : 'Repositories included in the batch coverage boundary.',
    },
    {
      label: 'Applied restore cases',
      value: countValue(adoption?.caseEvidence.cases, caseStatus),
      detail: caseStatus === 'unmeasured'
        ? 'No server-validated checkpoint-to-restore case has been recorded.'
        : adoption
          ? `${countValue(adoption.caseEvidence.repositoriesCovered, 'measured')} opaque repository keys covered.`
          : 'The live query failed.',
    },
  ];

  const responseMetrics: Metric[] = [
    {
      label: 'Contributions received',
      value: countValue(adoption?.oss.maintainerResponseLoad.contributionsReceived, ossStatus),
      detail: 'External contribution records opened in the OSS window.',
    },
    {
      label: 'First responses sent',
      value: countValue(adoption?.oss.maintainerResponseLoad.responsesSent, ossStatus),
      detail: 'Contribution records with a first maintainer response timestamp.',
    },
    {
      label: 'Awaiting first response',
      value: countValue(adoption?.oss.maintainerResponseLoad.awaitingResponse, ossStatus),
      detail: 'Measured contributions without a first response timestamp.',
    },
    {
      label: 'Average first response',
      value: adoption?.oss.maintainerResponseLoad.averageFirstResponseHours == null
        ? countValue(null, ossStatus)
        : `${adoption.oss.maintainerResponseLoad.averageFirstResponseHours} h`,
      detail: 'Mean elapsed time from contribution open to first maintainer response.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#EDE4CF] text-[#171713]">
      <Navbar />

      <main>
        <section className="border-b border-[#171713] px-5 py-20 sm:px-8 lg:px-14 lg:py-28">
          <div className="mx-auto max-w-7xl">
            <p className="mb-8 font-mono text-xs uppercase tracking-[0.2em]">Open source evidence record</p>
            <h1 className="max-w-5xl font-serif text-5xl leading-[0.95] tracking-[-0.045em] sm:text-7xl lg:text-8xl">
              Product use, contribution, and maintainer load.
            </h1>
            <div className="mt-12 grid gap-8 border-t border-[#171713] pt-8 lg:grid-cols-[1.5fr_1fr]">
              <p className="max-w-3xl text-xl leading-relaxed sm:text-2xl">
                AITimeMachine records reversible work. These counts come from cloud-sync records and completed maintainer coverage batches.
              </p>
              <div className="font-mono text-sm leading-6">
                <p>Source: {adoption?.methodology.source ?? 'Live endpoint unavailable'}</p>
                <p>Updated: {adoption ? `${new Date(adoption.generatedAt).toLocaleString('en-US', { timeZone: 'UTC' })} UTC` : 'Unavailable'}</p>
                <a className="underline underline-offset-4" href={`${API_BASE}/v1/adoption/summary`}>Inspect JSON evidence</a>
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-14">
          <EvidenceRail
            number="01"
            title="Product adoption"
            window={adoption ? windowLabel(adoption.windows.adoption) : 'Live query unavailable'}
            metrics={adoptionMetrics}
          />
          <EvidenceRail
            number="02"
            title="External contribution return"
            window={adoption ? `${windowLabel(adoption.windows.oss)} · ${freshnessLabel(adoption)}` : 'Live query unavailable'}
            metrics={contributionMetrics}
          />
          <EvidenceRail
            number="03"
            title="Maintainer response load"
            window={adoption ? `${windowLabel(adoption.windows.oss)} · ${freshnessLabel(adoption)}` : 'Live query unavailable'}
            metrics={responseMetrics}
          />
        </div>

        <section className="bg-[#171713] px-5 py-20 text-[#EDE4CF] sm:px-8 lg:px-14">
          <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-2">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em]">Measurement rules</p>
              <h2 className="mt-7 font-serif text-5xl leading-none tracking-[-0.04em]">Definitions for each count.</h2>
            </div>
            <dl className="divide-y divide-[#817b6c] border-y border-[#817b6c] text-sm leading-6">
              {[
                ['Active developer', adoption?.methodology.activeDeveloper ?? 'Distinct account with a checkpoint in the adoption window.'],
                ['External contributor', adoption?.methodology.externalContributor ?? 'Distinct opaque contributor key in a completed coverage batch.'],
                ['Repeat contributor', adoption?.methodology.repeatContributor ?? 'Opaque contributor key with two or more records in the batch.'],
                ['Maintainer response', adoption?.methodology.maintainerResponse ?? 'Elapsed time to the first maintainer response.'],
                ['Case evidence', adoption?.methodology.caseEvidence ?? 'Applied restore linked to its project and checkpoint.'],
                ['Privacy boundary', adoption?.methodology.privacy ?? 'The public record contains aggregate counts only.'],
              ].map(([term, definition]) => (
                <div className="py-5" key={term}>
                  <dt className="font-mono uppercase tracking-wider">{term}</dt>
                  <dd className="mt-2 text-[#cfc6b2]">{definition}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="px-5 py-20 sm:px-8 lg:px-14">
          <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 border-t border-[#171713] pt-8 sm:flex-row sm:items-end">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em]">Review</p>
              <p className="mt-4 max-w-2xl text-2xl leading-snug">Check the implementation, definitions, and privacy boundary.</p>
            </div>
            <Link href="/contact" className="inline-flex items-center gap-3 border border-[#171713] px-6 py-4 font-mono text-sm uppercase tracking-wider transition-colors hover:bg-[#171713] hover:text-[#EDE4CF]">
              Start a review <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
