'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Footer } from '@/components/Footer';
import { Navbar } from '@/components/Navbar';
import {
  parseAdoptionSummary,
  type AdoptionSummary,
  type EvidenceStatus,
} from '@/lib/adoption-evidence';
import styles from './maintainers.module.css';

type ViewState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; summary: AdoptionSummary };

const JSON_ENDPOINT = '/api/adoption/summary';
const METHODOLOGY_URL = 'https://github.com/gitgram/timemachine/blob/main/api-server/docs/adoption-evidence.md';

export default function MaintainersPage() {
  const [view, setView] = useState<ViewState>({ kind: 'loading' });

  const load = useCallback(async () => {
    setView({ kind: 'loading' });
    try {
      const response = await fetch(JSON_ENDPOINT, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const body = await response.json().catch(() => null) as unknown;
      if (!response.ok) {
        setView({ kind: 'error', message: readError(body) || `Evidence API returned HTTP ${response.status}.` });
        return;
      }
      const summary = parseAdoptionSummary(body);
      if (!summary) {
        setView({ kind: 'error', message: 'Evidence API returned an invalid summary. No values were displayed.' });
        return;
      }
      setView({ kind: 'ready', summary });
    } catch {
      setView({ kind: 'error', message: 'Evidence API could not be reached. No values were displayed.' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={styles.shell}>
      <Navbar />
      <main>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>Maintainer evidence desk</p>
          <h1>Measure the project<br />without inventing traction.</h1>
          <p className={styles.intro}>
            This route reads AITimeMachine’s public aggregate. Collection stays server-side;
            account, repository, contributor, checkpoint, and restore identifiers stay private.
          </p>
          <div className={styles.heroActions}>
            <button type="button" onClick={() => void load()} disabled={view.kind === 'loading'}>
              {view.kind === 'loading' ? 'Reading evidence…' : 'Refresh evidence'}
            </button>
            <a href={JSON_ENDPOINT}>Inspect JSON</a>
          </div>
        </section>

        {view.kind === 'loading' && (
          <section className={styles.statePanel} aria-live="polite" aria-busy="true">
            <span>LIVE READ / PENDING</span>
            <h2>Waiting for the evidence service.</h2>
            <p>No cached or example counts are shown while the request is unresolved.</p>
          </section>
        )}

        {view.kind === 'error' && (
          <section className={`${styles.statePanel} ${styles.errorPanel}`} role="alert">
            <span>LIVE READ / UNAVAILABLE</span>
            <h2>Evidence is unavailable.</h2>
            <p>{view.message}</p>
            <button type="button" onClick={() => void load()}>Retry the same endpoint</button>
          </section>
        )}

        {view.kind === 'ready' && <EvidenceRecord summary={view.summary} />}

        <section className={styles.operatorPath} aria-labelledby="operator-title">
          <header>
            <p className={styles.eyebrow}>Real collection path</p>
            <h2 id="operator-title">What reaches this page.</h2>
          </header>
          <ol>
            <li><span>01</span><h3>Cloud events</h3><p>Persisted projects, checkpoints, and applied restores define the rolling adoption window.</p></li>
            <li><span>02</span><h3>Coverage batch</h3><p>A server-side maintainer job submits only external contributions using secret-keyed opaque identifiers.</p></li>
            <li><span>03</span><h3>Validated cases</h3><p>A restore case counts only when its project, checkpoint, applied restore, and restore target agree.</p></li>
            <li><span>04</span><h3>Public aggregate</h3><p>The browser receives counts, windows, statuses, and definitions—not the source identifiers.</p></li>
          </ol>
          <div className={styles.methodLinks}>
            <a href={METHODOLOGY_URL} target="_blank" rel="noreferrer">Open ingestion and privacy methodology</a>
            <Link href="/privacy">Read the public-data boundary</Link>
          </div>
          <p className={styles.secretNote}>Internal ingestion credentials are intentionally absent from this browser workflow.</p>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function EvidenceRecord({ summary }: { summary: AdoptionSummary }) {
  const noProductRecords = summary.activeDevelopers === 0 && summary.projects === 0 &&
    summary.checkpoints.lifetime === 0 && summary.appliedRestores.lifetime === 0;
  const response = summary.oss.maintainerResponseLoad;

  return (
    <section className={styles.record} aria-labelledby="record-title">
      <header className={styles.recordHeader}>
        <div>
          <p className={styles.eyebrow}>Validated public response</p>
          <h2 id="record-title">Current evidence record.</h2>
        </div>
        <dl>
          <div><dt>Generated</dt><dd>{formatTimestamp(summary.generatedAt)}</dd></div>
          <div><dt>Adoption window</dt><dd>{formatWindow(summary.windows.adoption)}</dd></div>
          <div><dt>OSS window</dt><dd>{formatWindow(summary.windows.oss)}</dd></div>
          <div><dt>OSS freshness</dt><dd>{formatFreshness(summary)}</dd></div>
        </dl>
      </header>

      {noProductRecords && (
        <p className={styles.zeroNotice}>The adoption query completed and measured zero product records. Zero is not a service error.</p>
      )}

      {summary.oss.freshness.status === 'stale' && (
        <p className={styles.zeroNotice}>The latest OSS collector window is stale. Counts remain historical evidence, not a current operational reading.</p>
      )}

      <div className={styles.rails}>
        <MetricRail title="Product adoption" status="measured" metrics={[
          ['Active developers', formatNumber(summary.activeDevelopers)],
          ['Projects protected', formatNumber(summary.projects)],
          ['Checkpoints / window', formatNumber(summary.checkpoints.period)],
          ['Applied restores / window', formatNumber(summary.appliedRestores.period)],
        ]} />
        <MetricRail title="External contribution return" status={summary.oss.status} metrics={[
          ['Repositories measured', evidenceValue(summary.oss.repositoriesMeasured, summary.oss.status)],
          ['External contributors', evidenceValue(summary.oss.externalContributors, summary.oss.status)],
          ['Repeat contributors', evidenceValue(summary.oss.repeatContributors, summary.oss.status)],
          ['Contributions received', evidenceValue(response.contributionsReceived, summary.oss.status)],
        ]} />
        <MetricRail title="Maintainer response load" status={summary.oss.status} metrics={[
          ['First responses sent', evidenceValue(response.responsesSent, summary.oss.status)],
          ['Awaiting response', evidenceValue(response.awaitingResponse, summary.oss.status)],
          ['Average first response', response.averageFirstResponseHours === null
            ? summary.oss.status === 'unmeasured' ? 'UNMEASURED' : 'NOT APPLICABLE'
            : `${response.averageFirstResponseHours} h`],
          ['Validated restore cases', evidenceValue(summary.caseEvidence.cases, summary.caseEvidence.status)],
        ]} />
      </div>
    </section>
  );
}

function MetricRail({ title, status, metrics }: {
  title: string;
  status: EvidenceStatus;
  metrics: [string, string][];
}) {
  return (
    <article className={styles.rail} data-status={status}>
      <header><h3>{title}</h3><span>{status}</span></header>
      {status === 'unmeasured' && <p className={styles.unmeasured}>No completed coverage exists. Null values remain unmeasured.</p>}
      <dl>{metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </article>
  );
}

function evidenceValue(value: number | null, status: EvidenceStatus): string {
  return status === 'unmeasured' ? 'UNMEASURED' : value === null ? 'NOT APPLICABLE' : formatNumber(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'INVALID' : `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function formatWindow(window: AdoptionSummary['windows']['adoption']): string {
  if (window.status === 'unmeasured' || !window.startsAt || !window.endsAt) return 'UNMEASURED';
  return `${formatTimestamp(window.startsAt)} — ${formatTimestamp(window.endsAt)} / ${window.days} days`;
}

function formatFreshness(summary: AdoptionSummary): string {
  const freshness = summary.oss.freshness;
  if (freshness.status === 'unmeasured' || freshness.ageHours === null) return 'UNMEASURED';
  return `${freshness.status.toUpperCase()} · ${freshness.ageHours} h old / ${freshness.maxAgeHours} h limit`;
}

function readError(value: unknown): string {
  if (typeof value !== 'object' || value === null || !('error' in value)) return '';
  return typeof value.error === 'string' ? value.error : '';
}
