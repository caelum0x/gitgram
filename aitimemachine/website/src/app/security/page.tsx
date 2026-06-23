import Link from 'next/link';
import type { Metadata } from 'next';
import {
  ShieldCheck,
  Lock,
  KeyRound,
  Fingerprint,
  ScrollText,
  Globe,
  ServerCog,
  Bug,
  Mail,
  ArrowRight,
  Check,
  Network,
  Database,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: 'Security — Gitgram TimeMachine',
  description:
    'How Gitgram TimeMachine protects your checkpoints: encryption at rest and in transit, cryptographic checkpoint integrity, access controls, compliance, and responsible disclosure.',
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SECURITY_EMAIL = 'security@aitimemachine.dev';

interface Pillar {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  description: string;
  points: string[];
}

const pillars: Pillar[] = [
  {
    icon: Lock,
    iconColor: 'text-blue-400',
    title: 'Encryption in transit',
    description:
      'Every byte that moves between your machine, the CLI, the API, and cloud storage is encrypted end to end.',
    points: [
      'TLS 1.3 for all API and sync traffic',
      'HSTS enforced on every web and API endpoint',
      'Certificate pinning available for on-prem deployments',
    ],
  },
  {
    icon: Database,
    iconColor: 'text-purple-400',
    title: 'Encryption at rest',
    description:
      'Cloud-synced checkpoints are encrypted before they touch disk and stay encrypted at rest.',
    points: [
      'AES-256-GCM encryption for all stored checkpoints',
      'Envelope encryption with per-tenant data keys',
      'Keys managed in a hardware-backed KMS, rotated regularly',
    ],
  },
  {
    icon: Fingerprint,
    iconColor: 'text-green-400',
    title: 'Checkpoint integrity',
    description:
      'Restore points are content-addressed and tamper-evident. A restore is only ever applied if the data verifies.',
    points: [
      'SHA-256 content hashing of every file and snapshot',
      'Merkle-tree manifests detect any altered byte',
      'Hash verification runs before any restore is applied',
    ],
  },
  {
    icon: KeyRound,
    iconColor: 'text-yellow-400',
    title: 'Access controls',
    description:
      'Least-privilege access from the first request. You decide exactly who and what can touch a checkpoint.',
    points: [
      'Role-based access control for orgs and projects',
      'Scoped, revocable API tokens for CLI and CI',
      'SSO / SAML and SCIM provisioning on enterprise plans',
    ],
  },
];

interface ComplianceItem {
  icon: React.ElementType;
  label: string;
  detail: string;
}

const compliance: ComplianceItem[] = [
  { icon: ShieldCheck, label: 'SOC 2 Type II', detail: 'Independently audited annually' },
  { icon: Globe, label: 'GDPR', detail: 'Data subject rights and DPAs available' },
  { icon: Network, label: 'Data residency', detail: 'Pin storage to US or EU regions' },
  { icon: ServerCog, label: 'On-prem option', detail: 'Run inside your own VPC or air gap' },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PillarCard({ pillar }: { pillar: Pillar }) {
  const Icon = pillar.icon;
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-7 transition-all hover:border-gray-700">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-800">
          <Icon className={`h-5 w-5 ${pillar.iconColor}`} />
        </div>
        <h3 className="text-lg font-semibold text-white">{pillar.title}</h3>
      </div>
      <p className="mb-5 text-sm leading-relaxed text-gray-400">{pillar.description}</p>
      <ul className="space-y-2.5">
        {pillar.points.map((point) => (
          <li key={point} className="flex items-start gap-2.5 text-sm">
            <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
            <span className="text-gray-300">{point}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-green-950/20 via-gray-950 to-gray-950" />
        <div className="relative mx-auto max-w-4xl px-4 pb-14 pt-20 text-center sm:px-6 lg:px-8 sm:pt-28">
          <Badge className="mb-4 border-green-600/30 bg-green-600/20 text-green-400">Security</Badge>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Security at Gitgram TimeMachine
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-400">
            Your checkpoints hold source code, terminal history, and AI context. We treat
            them as some of the most sensitive data you own — and protect them accordingly.
          </p>
        </div>
      </section>

      {/* Core pillars */}
      <section className="mx-auto max-w-6xl px-4 pb-8 sm:px-6 lg:px-8">
        <div className="grid gap-6 md:grid-cols-2">
          {pillars.map((pillar) => (
            <PillarCard key={pillar.title} pillar={pillar} />
          ))}
        </div>
      </section>

      {/* Checkpoint integrity deep dive */}
      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-8 sm:p-10">
          <div className="mb-4 flex items-center gap-3">
            <Fingerprint className="h-6 w-6 text-green-400" />
            <h2 className="text-2xl font-bold">How checkpoint integrity works</h2>
          </div>
          <p className="mb-4 text-sm leading-relaxed text-gray-400">
            Every restore point is a content-addressed snapshot. When AITM captures your
            project, it hashes each file with SHA-256 and assembles those hashes into a
            Merkle-tree manifest. The manifest root uniquely identifies the entire state —
            change a single byte and the root changes.
          </p>
          <p className="mb-4 text-sm leading-relaxed text-gray-400">
            Because checkpoints are content-addressed, identical content is stored once and
            deduplicated, and any corruption or tampering is detectable. Before a restore is
            ever applied, AITM re-computes the hashes and verifies them against the manifest.
            If anything fails to match, the restore is aborted — you never apply a state we
            cannot prove is intact.
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {[
              'SHA-256 hashing of every file and snapshot',
              'Merkle-tree manifests for whole-state integrity',
              'Content-addressed, deduplicated storage',
              'Hash verification gates every restore',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
                <span className="text-gray-300">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Compliance */}
      <section className="bg-gray-900/40 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold">Compliance &amp; data governance</h2>
            <p className="mx-auto mt-3 max-w-2xl text-gray-400">
              We back our security claims with independent audits and give you control over
              where your data lives.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {compliance.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className="flex flex-col items-center rounded-2xl border border-gray-800 bg-gray-950/50 p-6 text-center"
                >
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                    <Icon className="h-6 w-6 text-green-400" />
                  </div>
                  <span className="text-base font-semibold text-white">{item.label}</span>
                  <span className="mt-1 text-xs text-gray-500">{item.detail}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-8 text-center text-sm text-gray-500">
            Need our SOC 2 report or a signed DPA?{' '}
            <a
              href={`mailto:${SECURITY_EMAIL}?subject=Compliance%20document%20request`}
              className="text-blue-400 underline underline-offset-2 transition-colors hover:text-blue-300"
            >
              Request documentation
            </a>
            .
          </p>
        </div>
      </section>

      {/* Operational security */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold">Operational security</h2>
          <p className="mx-auto mt-3 max-w-2xl text-gray-400">
            Security is not just cryptography — it is how we build, deploy, and monitor.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: ScrollText,
              title: 'Audit logging',
              body: 'Every restore, checkpoint, and access event is recorded immutably and can be exported to your SIEM.',
            },
            {
              icon: ServerCog,
              title: 'Hardened infrastructure',
              body: 'Least-privilege IAM, network isolation, and automated patching across all production systems.',
            },
            {
              icon: Bug,
              title: 'Continuous testing',
              body: 'Dependency scanning, static analysis, and regular third-party penetration tests on our stack.',
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-2xl border border-gray-800 bg-gray-900/50 p-6"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-gray-800">
                  <Icon className="h-5 w-5 text-blue-400" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-white">{item.title}</h3>
                <p className="text-sm leading-relaxed text-gray-400">{item.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Responsible disclosure */}
      <section className="mx-auto max-w-4xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-blue-900/40 bg-blue-950/10 p-8 sm:p-10">
          <div className="mb-4 flex items-center gap-3">
            <Bug className="h-6 w-6 text-blue-400" />
            <h2 className="text-2xl font-bold">Responsible disclosure</h2>
          </div>
          <p className="mb-5 text-sm leading-relaxed text-gray-400">
            We welcome reports from security researchers. If you believe you have found a
            vulnerability, please report it to us privately so we can investigate and fix it
            before any details are made public. We commit to acknowledging your report and
            working with you in good faith.
          </p>
          <ol className="mb-6 space-y-3 text-sm text-gray-300">
            <li className="flex gap-3">
              <span className="font-semibold text-blue-400">1.</span>
              Email a detailed report to{' '}
              <a href={`mailto:${SECURITY_EMAIL}`} className="text-blue-300 underline underline-offset-2">
                {SECURITY_EMAIL}
              </a>
              , including steps to reproduce.
            </li>
            <li className="flex gap-3">
              <span className="font-semibold text-blue-400">2.</span>
              We acknowledge within 2 business days and begin investigating.
            </li>
            <li className="flex gap-3">
              <span className="font-semibold text-blue-400">3.</span>
              Please give us a reasonable window to remediate before public disclosure.
            </li>
            <li className="flex gap-3">
              <span className="font-semibold text-blue-400">4.</span>
              Do not access, modify, or exfiltrate data that is not yours while testing.
            </li>
          </ol>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Button asChild>
              <a href={`mailto:${SECURITY_EMAIL}?subject=Security%20vulnerability%20report`}>
                <Mail className="mr-2 h-4 w-4" />
                Report a vulnerability
              </a>
            </Button>
            <span className="text-sm text-gray-500">
              Reach us anytime at{' '}
              <a href={`mailto:${SECURITY_EMAIL}`} className="text-blue-400 underline underline-offset-2">
                {SECURITY_EMAIL}
              </a>
            </span>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-gray-800 bg-gray-900/30 py-16">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <ShieldCheck className="mx-auto mb-4 h-10 w-10 text-green-400" />
          <h2 className="text-2xl font-bold sm:text-3xl">
            Have questions about our security posture?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-gray-400">
            Whether you are running a security review or evaluating AITM for your
            organization, our team is happy to walk you through the details.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
            <Button size="lg" asChild className="text-base">
              <a href={`mailto:${SECURITY_EMAIL}`}>
                Contact Security
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button size="lg" variant="outline" asChild className="text-base">
              <Link href="/enterprise">Explore Enterprise</Link>
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
