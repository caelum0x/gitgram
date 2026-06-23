'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Copy,
  Check,
  ArrowRight,
  Download,
  Zap,
  BookOpen,
  Terminal,
  Code2,
  Puzzle,
  Webhook,
  Box,
  ChevronRight,
  Package,
  RotateCcw,
  ListChecks,
  Settings,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navSections = [
  { id: 'installation', title: 'Installation', href: '/docs/installation', icon: Download },
  { id: 'quick-start', title: 'Quick Start', href: '/docs/quick-start', icon: Zap },
  { id: 'core-concepts', title: 'Core Concepts', href: '/docs/core-concepts', icon: BookOpen },
  { id: 'cli-reference', title: 'CLI Reference', href: '/docs/cli-reference', icon: Terminal },
  { id: 'vscode-extension', title: 'VS Code Extension', href: '/docs/vscode-extension', icon: Puzzle },
  { id: 'mcp-tools', title: 'MCP Tools', href: '/docs/mcp-tools', icon: Webhook },
  { id: 'api-reference', title: 'API Reference', href: '/docs/api-reference', icon: Code2 },
  { id: 'integrations', title: 'Integrations', href: '/docs/integrations', icon: Box },
];

const steps = [
  {
    number: 1,
    id: 'install',
    title: 'Install AITimeMachine',
    icon: Package,
    description: 'Install the CLI globally using your preferred package manager.',
  },
  {
    number: 2,
    id: 'initialize',
    title: 'Initialize Your Project',
    icon: Settings,
    description: 'Run aitm init inside your project directory to start tracking.',
  },
  {
    number: 3,
    id: 'checkpoint',
    title: 'Create a Checkpoint',
    icon: ListChecks,
    description: 'Save the current state of your project before making changes.',
  },
  {
    number: 4,
    id: 'restore',
    title: 'Restore When Needed',
    icon: RotateCcw,
    description: 'Roll back your entire project to any previous checkpoint instantly.',
  },
];

interface CodeBlockProps {
  code: string;
  id: string;
  language?: string;
  label?: string;
}

function CodeBlock({ code, id, language = 'bash', label }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group rounded-xl overflow-hidden border border-gray-800">
      {label && (
        <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
          <span className="text-xs font-medium text-gray-500">{label}</span>
          <span className="text-xs text-gray-600">{language}</span>
        </div>
      )}
      <div className="relative">
        <pre className="bg-gray-950 p-4 overflow-x-auto text-sm leading-relaxed">
          <code className={`language-${language} text-gray-300`}>{code}</code>
        </pre>
        <button
          onClick={handleCopy}
          title="Copy to clipboard"
          className={cn(
            'absolute top-3 right-3 p-1.5 rounded-md border transition-all',
            copied
              ? 'bg-green-500/20 border-green-500/40 text-green-400'
              : 'bg-gray-800 border-gray-700 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-white hover:border-gray-500'
          )}
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

export default function QuickStartPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Left Sidebar */}
          <aside className="hidden lg:block w-60 flex-shrink-0">
            <div className="sticky top-24 space-y-4">
              <nav className="space-y-1">
                <p className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Documentation
                </p>
                {navSections.map((section) => {
                  const Icon = section.icon;
                  const isActive = section.id === 'quick-start';
                  return (
                    <Link
                      key={section.id}
                      href={section.href}
                      className={cn(
                        'flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors',
                        isActive
                          ? 'bg-gray-800 text-white'
                          : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                      )}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      {section.title}
                      {isActive && <ChevronRight className="w-3 h-3 ml-auto text-blue-400" />}
                    </Link>
                  );
                })}
              </nav>

              {/* On this page */}
              <div className="border-t border-gray-800 pt-4">
                <p className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  On this page
                </p>
                {steps.map((step) => (
                  <a
                    key={step.id}
                    href={`#${step.id}`}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    <span className="w-4 h-4 rounded-full bg-gray-800 flex items-center justify-center text-[10px] font-bold text-gray-400">
                      {step.number}
                    </span>
                    {step.title}
                  </a>
                ))}
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0 space-y-12 pb-16">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1.5 text-sm text-gray-500">
              <Link href="/docs" className="hover:text-gray-300 transition-colors">
                Docs
              </Link>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="text-gray-300">Quick Start</span>
            </nav>

            {/* Header */}
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium">
                <Zap className="w-3.5 h-3.5" />
                Quick Start
              </div>
              <h1 className="text-4xl font-bold tracking-tight">Up and running in 2 minutes</h1>
              <p className="text-gray-400 text-lg max-w-2xl">
                This guide walks you through installing AITimeMachine, creating your first
                checkpoint, and restoring your project state.
              </p>
            </div>

            {/* Step progress */}
            <div className="flex items-center gap-2 flex-wrap">
              {steps.map((step, i) => (
                <div key={step.id} className="flex items-center gap-2">
                  <a
                    href={`#${step.id}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-300 hover:border-gray-500 hover:text-white transition-colors"
                  >
                    <span className="w-4 h-4 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-[10px] font-bold text-blue-400">
                      {step.number}
                    </span>
                    {step.title}
                  </a>
                  {i < steps.length - 1 && (
                    <ArrowRight className="w-3.5 h-3.5 text-gray-700 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>

            {/* Step 1 — Install */}
            <section id="install" className="space-y-5 scroll-mt-24">
              <div className="flex items-start gap-4">
                <div className="w-9 h-9 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-sm font-bold text-blue-400">1</span>
                </div>
                <div className="space-y-1">
                  <h2 className="text-2xl font-semibold">Install AITimeMachine</h2>
                  <p className="text-gray-400">
                    Install the CLI globally. Requires Node.js 18 or later.
                  </p>
                </div>
              </div>

              <div className="ml-13 space-y-3 pl-13">
                <CodeBlock
                  code="npm install -g aitimemachine"
                  id="npm-install"
                  label="npm"
                  language="bash"
                />
                <CodeBlock
                  code="yarn global add aitimemachine"
                  id="yarn-install"
                  label="yarn"
                  language="bash"
                />
                <CodeBlock
                  code="pnpm add -g aitimemachine"
                  id="pnpm-install"
                  label="pnpm"
                  language="bash"
                />

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
                  <p className="text-sm text-gray-400">Verify the installation:</p>
                  <CodeBlock code="aitm --version" id="verify" language="bash" />
                </div>

                <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
                  <p className="text-sm text-blue-300">
                    After installing, authenticate to enable cloud sync:{' '}
                    <code className="bg-blue-500/10 px-1.5 py-0.5 rounded text-blue-200 font-mono text-xs">
                      aitm login
                    </code>
                  </p>
                </div>
              </div>
            </section>

            {/* Step 2 — Initialize */}
            <section id="initialize" className="space-y-5 scroll-mt-24">
              <div className="flex items-start gap-4">
                <div className="w-9 h-9 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-sm font-bold text-blue-400">2</span>
                </div>
                <div className="space-y-1">
                  <h2 className="text-2xl font-semibold">Initialize Your Project</h2>
                  <p className="text-gray-400">
                    Navigate to your project directory and run{' '}
                    <code className="text-sm bg-gray-800 px-1.5 py-0.5 rounded font-mono">aitm init</code>.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <CodeBlock
                  code={`cd your-project\naitm init`}
                  id="init"
                  label="Terminal"
                  language="bash"
                />

                <p className="text-sm text-gray-400">
                  This creates a{' '}
                  <code className="bg-gray-800 px-1.5 py-0.5 rounded font-mono text-xs">.aitimemachine/</code>{' '}
                  directory in your project root. Add it to your{' '}
                  <code className="bg-gray-800 px-1.5 py-0.5 rounded font-mono text-xs">.gitignore</code>{' '}
                  if you prefer not to commit it, or commit it to share checkpoints with your team.
                </p>

                <CodeBlock
                  code={`# .gitignore\n.aitimemachine/`}
                  id="gitignore"
                  label=".gitignore"
                  language="bash"
                />
              </div>
            </section>

            {/* Step 3 — Checkpoint */}
            <section id="checkpoint" className="space-y-5 scroll-mt-24">
              <div className="flex items-start gap-4">
                <div className="w-9 h-9 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-sm font-bold text-blue-400">3</span>
                </div>
                <div className="space-y-1">
                  <h2 className="text-2xl font-semibold">Create a Checkpoint</h2>
                  <p className="text-gray-400">
                    Create a save point before any significant change. Think of it as a named
                    snapshot of your entire project state.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <CodeBlock
                  code={`aitm checkpoint "Initial setup complete"`}
                  id="checkpoint-create"
                  label="Terminal"
                  language="bash"
                />

                <p className="text-sm text-gray-400">
                  Each checkpoint captures:
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {[
                    { title: 'All project files', desc: 'Including untracked and .env files' },
                    { title: 'Terminal history', desc: 'Commands run and their output' },
                    { title: 'AI conversation context', desc: 'Chat history and reasoning' },
                    { title: 'Environment state', desc: 'Node version, dependencies, configs' },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className="flex gap-3 p-3 bg-gray-900 border border-gray-800 rounded-lg"
                    >
                      <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <CodeBlock
                  code={`# List your checkpoints\naitm list\n\n# Output:\n# cp_a1b2c3  2026-06-22 14:32  "Initial setup complete"\n# cp_d4e5f6  2026-06-22 15:10  "Added auth module"`}
                  id="checkpoint-list"
                  label="Terminal"
                  language="bash"
                />
              </div>
            </section>

            {/* Step 4 — Restore */}
            <section id="restore" className="space-y-5 scroll-mt-24">
              <div className="flex items-start gap-4">
                <div className="w-9 h-9 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-sm font-bold text-blue-400">4</span>
                </div>
                <div className="space-y-1">
                  <h2 className="text-2xl font-semibold">Restore When Needed</h2>
                  <p className="text-gray-400">
                    Something broke? Restore your entire project to a previous checkpoint in
                    one command.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <CodeBlock
                  code={`# Undo the last change (one step back)\naitm undo\n\n# Restore to a specific checkpoint\naitm restore cp_a1b2c3\n\n# Preview what would change before restoring\naitm restore cp_a1b2c3 --preview`}
                  id="restore-cmd"
                  label="Terminal"
                  language="bash"
                />

                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                  <p className="text-sm text-amber-300">
                    <span className="font-semibold">Note:</span> AITimeMachine automatically
                    creates a safety checkpoint before every restore, so you can always go forward
                    again if needed.
                  </p>
                </div>
              </div>
            </section>

            {/* Next steps */}
            <div className="border-t border-gray-800 pt-8 space-y-4">
              <h2 className="text-xl font-semibold">What&apos;s next?</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                <Link
                  href="/docs/core-concepts"
                  className="group flex items-center justify-between p-4 bg-gray-900 border border-gray-800 rounded-xl hover:border-gray-600 transition-all"
                >
                  <div>
                    <p className="font-medium text-sm">Core Concepts</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Understand how checkpoints and sessions work
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-gray-300 transition-colors" />
                </Link>
                <Link
                  href="/docs/cli-reference"
                  className="group flex items-center justify-between p-4 bg-gray-900 border border-gray-800 rounded-xl hover:border-gray-600 transition-all"
                >
                  <div>
                    <p className="font-medium text-sm">CLI Reference</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      All commands, flags, and examples
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-gray-300 transition-colors" />
                </Link>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button
                  asChild
                  variant="outline"
                  className="border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800"
                >
                  <Link href="/docs">
                    Back to Docs
                  </Link>
                </Button>
                <Button asChild className="bg-white text-gray-900 hover:bg-gray-100 font-semibold">
                  <Link href="/docs/core-concepts">
                    Next: Core Concepts
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </div>
            </div>
          </main>
        </div>
      </div>

      <Footer />
    </div>
  );
}
