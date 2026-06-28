'use client';

import { Download, Check, Terminal as TerminalIcon, AlertCircle } from 'lucide-react';
import {
  DocsPageShell,
  DocsBreadcrumb,
  DocHeader,
  CodeBlock,
  DocFooterNav,
} from '../_components';

const requirements = [
  { label: 'Node.js 18 or later', detail: 'The CLI ships as an npm package and runs on the Node runtime.' },
  { label: 'macOS, Linux, or Windows', detail: 'Cross-platform. Windows is supported natively and via WSL.' },
  { label: 'Git (optional)', detail: 'Required only for the "commit checkpoint" workflow.' },
];

export default function InstallationPage() {
  return (
    <DocsPageShell activeId="installation">
      <DocsBreadcrumb title="Installation" />

      <DocHeader
        badge="Installation"
        badgeIcon={<Download className="w-3.5 h-3.5" />}
        title="Install AITimeMachine"
        description="Install the AITimeMachine CLI globally with your package manager of choice. Takes under a minute."
      />

      <section className="space-y-4 scroll-mt-24" id="requirements">
        <h2 className="text-2xl font-semibold">Requirements</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {requirements.map((req) => (
            <div key={req.label} className="p-4 bg-gray-900 border border-gray-800 rounded-xl">
              <div className="flex items-center gap-2 mb-1.5">
                <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                <p className="text-sm font-medium">{req.label}</p>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">{req.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4 scroll-mt-24" id="install">
        <h2 className="text-2xl font-semibold">Install the CLI</h2>
        <p className="text-gray-400">
          Install globally so the <code className="bg-gray-800 px-1.5 py-0.5 rounded font-mono text-xs">aitm</code> command
          is available in every project.
        </p>
        <CodeBlock code="npm install -g aitimemachine" label="npm" />
        <CodeBlock code="yarn global add aitimemachine" label="yarn" />
        <CodeBlock code="pnpm add -g aitimemachine" label="pnpm" />
      </section>

      <section className="space-y-4 scroll-mt-24" id="verify">
        <h2 className="text-2xl font-semibold">Verify the installation</h2>
        <p className="text-gray-400">Confirm the CLI is on your PATH and prints its version.</p>
        <CodeBlock
          code={`aitm --version\n# aitimemachine 1.x.x`}
          label="Terminal"
        />
        <div className="flex gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-200">
            If <code className="bg-amber-500/10 px-1.5 py-0.5 rounded font-mono text-xs">aitm</code> is not found, ensure
            your global npm bin directory is on your <code className="bg-amber-500/10 px-1.5 py-0.5 rounded font-mono text-xs">PATH</code>.
            Run <code className="bg-amber-500/10 px-1.5 py-0.5 rounded font-mono text-xs">npm bin -g</code> to find it.
          </p>
        </div>
      </section>

      <section className="space-y-4 scroll-mt-24" id="authenticate">
        <h2 className="text-2xl font-semibold">Authenticate (optional)</h2>
        <p className="text-gray-400">
          Cloud sync, the web dashboard, and team sharing require an account. Local checkpoints work without signing in.
        </p>
        <CodeBlock
          code={`# Opens your browser to authenticate, then stores a token locally\naitm login`}
          label="Terminal"
        />
        <div className="flex gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
          <TerminalIcon className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-200">
            In headless or CI environments, set an API key instead:{' '}
            <code className="bg-blue-500/10 px-1.5 py-0.5 rounded font-mono text-xs">AITM_API_KEY=...</code>. Create keys
            from the dashboard under Settings &rarr; API Keys.
          </p>
        </div>
      </section>

      <DocFooterNav
        prev={{ title: 'Back to Docs', href: '/docs' }}
        next={{ title: 'Next: Quick Start', href: '/docs/quick-start' }}
      />
    </DocsPageShell>
  );
}
