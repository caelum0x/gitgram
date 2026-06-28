'use client';

import Link from 'next/link';
import { Box, GitBranch, Webhook, Terminal, Container } from 'lucide-react';
import {
  DocsPageShell,
  DocsBreadcrumb,
  DocHeader,
  CodeBlock,
  DocFooterNav,
} from '../_components';

const integrations = [
  {
    id: 'github-actions',
    icon: GitBranch,
    title: 'GitHub Actions',
    description: 'Create a checkpoint on every push so CI failures can be reproduced and rewound locally.',
  },
  {
    id: 'ci-cd',
    icon: Container,
    title: 'CI/CD pipelines',
    description: 'Snapshot the build environment before deploy steps in any pipeline that can run a shell command.',
  },
  {
    id: 'webhooks',
    icon: Webhook,
    title: 'Webhooks',
    description: 'Receive an HTTP callback whenever a checkpoint is created or a restore completes.',
  },
  {
    id: 'cli-scripting',
    icon: Terminal,
    title: 'CLI scripting',
    description: 'Use --quiet and --json flags to wire AITM into your own scripts and tooling.',
  },
];

export default function IntegrationsPage() {
  return (
    <DocsPageShell activeId="integrations">
      <DocsBreadcrumb title="Integrations" />

      <DocHeader
        badge="Integrations"
        badgeIcon={<Box className="w-3.5 h-3.5" />}
        title="Integrations"
        description="Connect AITimeMachine with GitHub Actions, CI/CD pipelines, webhooks, and your own scripts."
      />

      <section className="space-y-4 scroll-mt-24" id="overview">
        <div className="grid sm:grid-cols-2 gap-3">
          {integrations.map((i) => {
            const Icon = i.icon;
            return (
              <a
                key={i.id}
                href={`#${i.id}-detail`}
                className="group flex gap-3 p-4 bg-gray-900 border border-gray-800 rounded-xl hover:border-gray-600 transition-colors"
              >
                <div className="p-2 bg-gray-800 rounded-lg h-fit group-hover:bg-gray-700 transition-colors">
                  <Icon className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">{i.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{i.description}</p>
                </div>
              </a>
            );
          })}
        </div>
      </section>

      <section className="space-y-4 scroll-mt-24" id="github-actions-detail">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gray-800 rounded-lg">
            <GitBranch className="w-5 h-5 text-blue-400" />
          </div>
          <h2 className="text-2xl font-semibold">GitHub Actions</h2>
        </div>
        <p className="text-gray-400">
          Add a step that installs the CLI, authenticates with an API key secret, and creates a checkpoint.
        </p>
        <CodeBlock
          language="yaml"
          label=".github/workflows/checkpoint.yml"
          code={`name: AITM Checkpoint
on: [push]

jobs:
  checkpoint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install -g aitimemachine
      - run: aitm checkpoint "CI: \${{ github.sha }}" --quiet
        env:
          AITM_API_KEY: \${{ secrets.AITM_API_KEY }}`}
        />
      </section>

      <section className="space-y-4 scroll-mt-24" id="ci-cd-detail">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gray-800 rounded-lg">
            <Container className="w-5 h-5 text-blue-400" />
          </div>
          <h2 className="text-2xl font-semibold">CI/CD pipelines</h2>
        </div>
        <p className="text-gray-400">
          Any pipeline that can run a shell command can snapshot state before a deploy. Set{' '}
          <code className="bg-gray-800 px-1.5 py-0.5 rounded font-mono text-xs">AITM_API_KEY</code> as a secret.
        </p>
        <CodeBlock
          label="Terminal"
          code={`npm install -g aitimemachine\nexport AITM_API_KEY="$AITM_API_KEY"\naitm checkpoint "pre-deploy $(date -u +%FT%TZ)" --quiet`}
        />
      </section>

      <section className="space-y-4 scroll-mt-24" id="webhooks-detail">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gray-800 rounded-lg">
            <Webhook className="w-5 h-5 text-blue-400" />
          </div>
          <h2 className="text-2xl font-semibold">Webhooks</h2>
        </div>
        <p className="text-gray-400">
          Configure webhook endpoints from the dashboard to receive checkpoint and restore events. Each delivery is
          signed and retried on failure.
        </p>
        <CodeBlock
          language="json"
          label="Example payload"
          code={`{
  "event": "checkpoint.created",
  "projectId": "prj_a1b2c3",
  "checkpointId": "cp_d4e5f6",
  "description": "Before refactoring auth",
  "createdAt": "2026-06-28T10:00:00Z"
}`}
        />
        <p className="text-sm text-gray-500">
          Manage webhooks under{' '}
          <Link href="/dashboard/webhooks" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
            Dashboard &rarr; Webhooks
          </Link>
          .
        </p>
      </section>

      <section className="space-y-4 scroll-mt-24" id="cli-scripting-detail">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gray-800 rounded-lg">
            <Terminal className="w-5 h-5 text-blue-400" />
          </div>
          <h2 className="text-2xl font-semibold">CLI scripting</h2>
        </div>
        <p className="text-gray-400">
          Combine <code className="bg-gray-800 px-1.5 py-0.5 rounded font-mono text-xs">--quiet</code> and{' '}
          <code className="bg-gray-800 px-1.5 py-0.5 rounded font-mono text-xs">--json</code> to integrate with your own
          tooling.
        </p>
        <CodeBlock
          label="Terminal"
          code={`# Capture the new checkpoint id\nCP=$(aitm checkpoint "automated snapshot" --quiet)\n\n# Inspect history as JSON\naitm list --json | jq '.[0].id'`}
        />
        <p className="text-sm text-gray-500">
          See the full{' '}
          <Link href="/docs/cli-reference" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
            CLI Reference
          </Link>{' '}
          for every flag.
        </p>
      </section>

      <DocFooterNav
        prev={{ title: 'API Reference', href: '/docs/api-reference' }}
        next={{ title: 'Back to Docs', href: '/docs' }}
      />
    </DocsPageShell>
  );
}
