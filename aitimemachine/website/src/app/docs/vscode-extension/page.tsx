'use client';

import Link from 'next/link';
import { Puzzle, MousePointerClick, GitCompare, RotateCcw, Clock, Download } from 'lucide-react';
import {
  DocsPageShell,
  DocsBreadcrumb,
  DocHeader,
  CodeBlock,
  DocFooterNav,
} from '../_components';

const features = [
  {
    icon: MousePointerClick,
    title: 'One-click checkpoints',
    description: 'Create a checkpoint from the status bar or command palette without leaving the editor.',
  },
  {
    icon: Clock,
    title: 'Visual timeline',
    description: 'Browse every checkpoint for the open workspace in a side-panel timeline.',
  },
  {
    icon: GitCompare,
    title: 'Inline diffs',
    description: 'Compare any two checkpoints using VS Code’s native diff viewer.',
  },
  {
    icon: RotateCcw,
    title: 'In-editor restore',
    description: 'Restore a checkpoint with a confirmation prompt and an automatic safety snapshot.',
  },
];

const commands = [
  { command: 'AITM: Create Checkpoint', shortcut: 'Cmd/Ctrl + Alt + C', description: 'Snapshot the current workspace.' },
  { command: 'AITM: Open Timeline', shortcut: '—', description: 'Reveal the checkpoint timeline panel.' },
  { command: 'AITM: Restore Checkpoint…', shortcut: '—', description: 'Pick a checkpoint and restore it.' },
  { command: 'AITM: Compare Checkpoints…', shortcut: '—', description: 'Diff two checkpoints side by side.' },
];

export default function VsCodeExtensionPage() {
  return (
    <DocsPageShell activeId="vscode-extension">
      <DocsBreadcrumb title="VS Code Extension" />

      <DocHeader
        badge="VS Code Extension"
        badgeIcon={<Puzzle className="w-3.5 h-3.5" />}
        title="AITimeMachine for VS Code"
        description="Create checkpoints, browse your timeline, and restore project state without leaving the editor."
      />

      <section className="space-y-4 scroll-mt-24" id="install">
        <h2 className="text-2xl font-semibold">Install</h2>
        <p className="text-gray-400">
          Install from the VS Code Marketplace, or directly from the command line.
        </p>
        <CodeBlock code="code --install-extension aitimemachine.aitm-vscode" label="Terminal" />
        <p className="text-sm text-gray-500">
          The extension uses your existing CLI installation and login. Install the{' '}
          <Link href="/docs/installation" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
            CLI
          </Link>{' '}
          first.
        </p>
      </section>

      <section className="space-y-4 scroll-mt-24" id="features">
        <h2 className="text-2xl font-semibold">Features</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="flex gap-3 p-4 bg-gray-900 border border-gray-800 rounded-xl">
                <div className="p-2 bg-gray-800 rounded-lg h-fit">
                  <Icon className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">{f.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{f.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-4 scroll-mt-24" id="commands">
        <h2 className="text-2xl font-semibold">Commands</h2>
        <p className="text-gray-400">
          Open the command palette (<code className="bg-gray-800 px-1.5 py-0.5 rounded font-mono text-xs">Cmd/Ctrl + Shift + P</code>)
          and search for &ldquo;AITM&rdquo;.
        </p>
        <div className="overflow-hidden rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-900 text-gray-400">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Command</th>
                <th className="text-left px-4 py-2.5 font-medium">Shortcut</th>
                <th className="text-left px-4 py-2.5 font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {commands.map((c) => (
                <tr key={c.command} className="bg-gray-950">
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-200">{c.command}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-400">{c.shortcut}</td>
                  <td className="px-4 py-2.5 text-gray-400">{c.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4 scroll-mt-24" id="settings">
        <h2 className="text-2xl font-semibold">Settings</h2>
        <p className="text-gray-400">Configure the extension in your VS Code settings JSON.</p>
        <CodeBlock
          language="json"
          label="settings.json"
          code={`{
  "aitm.autoCheckpointOnSave": false,
  "aitm.showStatusBarItem": true,
  "aitm.timeline.maxItems": 100
}`}
        />
        <div className="flex gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
          <Download className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-200">
            Checkpoints created in the editor sync to the{' '}
            <Link href="/dashboard/timeline" className="underline underline-offset-2 hover:text-blue-100">
              web dashboard
            </Link>{' '}
            automatically when you are signed in.
          </p>
        </div>
      </section>

      <DocFooterNav
        prev={{ title: 'CLI Reference', href: '/docs/cli-reference' }}
        next={{ title: 'Next: MCP Tools', href: '/docs/mcp-tools' }}
      />
    </DocsPageShell>
  );
}
