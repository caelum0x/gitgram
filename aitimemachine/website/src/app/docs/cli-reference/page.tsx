'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Search,
  Terminal,
  Download,
  Zap,
  BookOpen,
  Code2,
  Puzzle,
  Webhook,
  Box,
  ChevronRight,
  Copy,
  Check,
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Input } from '@/components/ui/input';
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

interface Flag {
  name: string;
  type: string;
  default?: string;
  description: string;
}

interface Command {
  name: string;
  group: string;
  synopsis: string;
  description: string;
  flags: Flag[];
  example: string;
  exampleLabel?: string;
}

const commands: Command[] = [
  {
    name: 'aitm checkpoint',
    group: 'Core',
    synopsis: 'aitm checkpoint <description> [options]',
    description:
      'Create a new checkpoint of the current project state. Captures all files (tracked and untracked), terminal history, and AI context.',
    flags: [
      { name: '--include <glob>', type: 'string', description: 'Additional glob patterns to include' },
      { name: '--exclude <glob>', type: 'string', description: 'Glob patterns to exclude from the snapshot' },
      { name: '--no-ai-context', type: 'boolean', description: 'Skip capturing AI conversation context' },
      { name: '--no-terminal', type: 'boolean', description: 'Skip capturing terminal command history' },
      { name: '--quiet, -q', type: 'boolean', description: 'Suppress output; only print the checkpoint ID' },
    ],
    exampleLabel: 'Terminal',
    example: `# Basic checkpoint
aitm checkpoint "Before refactoring auth module"

# Exclude large build artifacts
aitm checkpoint "Added CI config" --exclude "dist/**" --exclude ".next/**"

# Quiet mode (useful in scripts)
CHECKPOINT_ID=$(aitm checkpoint "pre-deploy snapshot" --quiet)
echo $CHECKPOINT_ID  # cp_a1b2c3d4`,
  },
  {
    name: 'aitm restore',
    group: 'Core',
    synopsis: 'aitm restore <checkpoint-id> [options]',
    description:
      'Restore the project to a previous checkpoint. Automatically creates a safety checkpoint before restoring so you can undo the restore itself.',
    flags: [
      { name: '--preview', type: 'boolean', description: 'Show a diff of what would change without applying it' },
      { name: '--files-only', type: 'boolean', description: 'Only restore files; skip terminal and AI context' },
      { name: '--no-backup', type: 'boolean', description: 'Skip creating a safety checkpoint before restoring' },
      { name: '--force, -f', type: 'boolean', description: 'Overwrite uncommitted changes without confirmation' },
    ],
    exampleLabel: 'Terminal',
    example: `# Restore to a specific checkpoint
aitm restore cp_a1b2c3d4

# Preview changes before restoring
aitm restore cp_a1b2c3d4 --preview

# Restore only files (skip terminal & AI context)
aitm restore cp_a1b2c3d4 --files-only`,
  },
  {
    name: 'aitm list',
    group: 'Core',
    synopsis: 'aitm list [options]',
    description:
      'List all checkpoints for the current project in reverse chronological order. Displays checkpoint ID, timestamp, description, and file count.',
    flags: [
      { name: '--limit <n>', type: 'number', default: '20', description: 'Maximum number of checkpoints to show' },
      { name: '--all', type: 'boolean', description: 'Show all checkpoints without a limit' },
      { name: '--json', type: 'boolean', description: 'Output as JSON for scripting' },
      { name: '--since <date>', type: 'string', description: 'Show checkpoints created after this date (e.g. "2026-06-01")' },
    ],
    exampleLabel: 'Terminal',
    example: `# List last 20 checkpoints (default)
aitm list

# Show all checkpoints
aitm list --all

# Output as JSON
aitm list --json | jq '.[0].id'

# Checkpoints from the last week
aitm list --since "2026-06-15"`,
  },
  {
    name: 'aitm status',
    group: 'Core',
    synopsis: 'aitm status',
    description:
      'Show the current tracking status of the project: last checkpoint, number of changed files since then, and cloud sync status.',
    flags: [
      { name: '--json', type: 'boolean', description: 'Output as JSON' },
      { name: '--short, -s', type: 'boolean', description: 'Print a one-line summary' },
    ],
    exampleLabel: 'Terminal',
    example: `aitm status

# Output:
# Project:      my-app
# Last checkpoint: cp_a1b2c3  "Before refactor"  2 hours ago
# Changed files:  7 modified, 2 untracked
# Cloud sync:   Synced  (Pro plan)`,
  },
  {
    name: 'aitm agents',
    group: 'AI',
    synopsis: 'aitm agents <subcommand> [options]',
    description:
      'Manage AI agent sessions. List active agents, inspect their checkpoint history, and pause or resume sessions.',
    flags: [
      { name: 'list', type: 'subcommand', description: 'List all active and recent agent sessions' },
      { name: 'inspect <agent-id>', type: 'subcommand', description: 'Show checkpoints created by a specific agent' },
      { name: 'pause <agent-id>', type: 'subcommand', description: 'Pause an active agent session' },
      { name: 'resume <agent-id>', type: 'subcommand', description: 'Resume a paused agent session' },
    ],
    exampleLabel: 'Terminal',
    example: `# List all agent sessions
aitm agents list

# Inspect checkpoints for a specific agent
aitm agents inspect agent_claude_001

# Pause an agent (e.g. before manually editing files)
aitm agents pause agent_claude_001

# Resume the agent afterwards
aitm agents resume agent_claude_001`,
  },
  {
    name: 'aitm workspace',
    group: 'Workspace',
    synopsis: 'aitm workspace <subcommand> [options]',
    description:
      'Manage workspaces — isolated project environments with their own checkpoint history. Useful for running multiple AI agents in parallel.',
    flags: [
      { name: 'create <name>', type: 'subcommand', description: 'Create a new isolated workspace' },
      { name: 'list', type: 'subcommand', description: 'List all workspaces for this project' },
      { name: 'switch <name>', type: 'subcommand', description: 'Switch to a different workspace' },
      { name: 'merge <name>', type: 'subcommand', description: 'Merge a workspace back into the default' },
      { name: 'delete <name>', type: 'subcommand', description: 'Delete a workspace and its checkpoints' },
    ],
    exampleLabel: 'Terminal',
    example: `# Create a workspace for an experimental refactor
aitm workspace create refactor-auth

# List all workspaces
aitm workspace list

# Switch into the workspace
aitm workspace switch refactor-auth

# Merge back when satisfied
aitm workspace merge refactor-auth`,
  },
];

const groups = ['All', 'Core', 'AI', 'Workspace'];

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      title="Copy to clipboard"
      className={cn(
        'p-1.5 rounded-md border transition-all',
        copied
          ? 'bg-green-500/20 border-green-500/40 text-green-400'
          : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'
      )}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function CommandRow({ command }: { command: Command }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-800 rounded-xl overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 bg-gray-900 hover:bg-gray-900/70 transition-colors text-left"
      >
        <div className="flex items-center gap-4 min-w-0">
          <code className="text-blue-400 font-mono text-sm font-semibold whitespace-nowrap">
            {command.name}
          </code>
          <span className="px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-xs text-gray-400 whitespace-nowrap">
            {command.group}
          </span>
          <span className="text-sm text-gray-400 truncate hidden sm:block">
            {command.description.split('.')[0]}.
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-500 flex-shrink-0 ml-3" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0 ml-3" />
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-800 divide-y divide-gray-800/60">
          {/* Synopsis + description */}
          <div className="px-5 py-4 space-y-3 bg-gray-950">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Synopsis
              </p>
              <code className="text-sm font-mono text-gray-300 bg-gray-900 px-3 py-1.5 rounded-lg border border-gray-800 inline-block">
                {command.synopsis}
              </code>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">{command.description}</p>
          </div>

          {/* Flags table */}
          <div className="px-5 py-4 bg-gray-950 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Flags
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 w-48">
                      Flag
                    </th>
                    <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 w-24">
                      Type
                    </th>
                    <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 w-20">
                      Default
                    </th>
                    <th className="text-left py-2 text-xs font-medium text-gray-500">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {command.flags.map((flag) => (
                    <tr key={flag.name} className="hover:bg-gray-900/30 transition-colors">
                      <td className="py-2.5 pr-4">
                        <code className="text-xs text-amber-300 font-mono whitespace-nowrap">
                          {flag.name}
                        </code>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="text-xs text-purple-400 font-mono">{flag.type}</span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="text-xs text-gray-500 font-mono">
                          {flag.default ?? '—'}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <span className="text-xs text-gray-400">{flag.description}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Example */}
          <div className="px-5 py-4 bg-gray-950 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {command.exampleLabel ?? 'Example'}
              </p>
              <CopyButton code={command.example} />
            </div>
            <pre className="bg-gray-900 border border-gray-800 rounded-lg p-4 overflow-x-auto text-sm leading-relaxed">
              <code className="text-gray-300 font-mono">{command.example}</code>
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CliReferencePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState('All');

  const filtered = useMemo(() => {
    return commands.filter((cmd) => {
      const matchesGroup = activeGroup === 'All' || cmd.group === activeGroup;
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        cmd.name.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q) ||
        cmd.flags.some(
          (f) => f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q)
        );
      return matchesGroup && matchesSearch;
    });
  }, [searchQuery, activeGroup]);

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
                  const isActive = section.id === 'cli-reference';
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

              {/* Jump to command */}
              <div className="border-t border-gray-800 pt-4">
                <p className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Commands
                </p>
                {commands.map((cmd) => (
                  <a
                    key={cmd.name}
                    href={`#${cmd.name.replace(/\s+/g, '-')}`}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors font-mono"
                  >
                    {cmd.name}
                  </a>
                ))}
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0 space-y-8 pb-16">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1.5 text-sm text-gray-500">
              <Link href="/docs" className="hover:text-gray-300 transition-colors">
                Docs
              </Link>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="text-gray-300">CLI Reference</span>
            </nav>

            {/* Header */}
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium">
                <Terminal className="w-3.5 h-3.5" />
                CLI Reference
              </div>
              <h1 className="text-4xl font-bold tracking-tight">CLI Reference</h1>
              <p className="text-gray-400 text-lg max-w-2xl">
                Complete reference for all AITimeMachine CLI commands. Click any command to
                expand flags and usage examples.
              </p>
            </div>

            {/* Installation note */}
            <div className="flex items-start gap-3 p-4 bg-gray-900 border border-gray-800 rounded-xl">
              <Terminal className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-gray-400 space-y-1">
                <p>
                  The <code className="bg-gray-800 px-1.5 py-0.5 rounded font-mono text-xs">aitm</code>{' '}
                  command is available after installing the CLI:
                </p>
                <div className="flex items-center gap-2">
                  <code className="bg-gray-800 px-2 py-1 rounded text-xs font-mono text-gray-300">
                    npm install -g aitimemachine
                  </code>
                  <CopyButton code="npm install -g aitimemachine" />
                </div>
              </div>
            </div>

            {/* Search + filter bar */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search commands, flags..."
                  className="pl-9 bg-gray-900 border-gray-800 text-sm placeholder:text-gray-600 focus:border-gray-600"
                />
              </div>
              <div className="flex items-center gap-2">
                {groups.map((group) => (
                  <button
                    key={group}
                    onClick={() => setActiveGroup(group)}
                    className={cn(
                      'px-3 py-2 rounded-lg text-sm font-medium transition-colors border',
                      activeGroup === group
                        ? 'bg-gray-800 text-white border-gray-600'
                        : 'text-gray-500 border-gray-800 hover:text-gray-300 hover:border-gray-700'
                    )}
                  >
                    {group}
                  </button>
                ))}
              </div>
            </div>

            {/* Results count */}
            <p className="text-xs text-gray-600">
              {filtered.length === commands.length
                ? `${commands.length} commands`
                : `${filtered.length} of ${commands.length} commands`}
            </p>

            {/* Commands list */}
            {filtered.length > 0 ? (
              <div className="space-y-3">
                {filtered.map((cmd) => (
                  <div key={cmd.name} id={cmd.name.replace(/\s+/g, '-')}>
                    <CommandRow command={cmd} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 text-gray-500 space-y-3">
                <Terminal className="w-8 h-8 mx-auto opacity-30" />
                <p>No commands match &ldquo;{searchQuery}&rdquo;</p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setActiveGroup('All');
                  }}
                  className="text-sm text-blue-400 hover:underline"
                >
                  Clear filters
                </button>
              </div>
            )}

            {/* Footer nav */}
            <div className="border-t border-gray-800 pt-8 flex items-center justify-between">
              <Link
                href="/docs/core-concepts"
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
                Core Concepts
              </Link>
              <Link
                href="/docs/vscode-extension"
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                VS Code Extension
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </main>
        </div>
      </div>

      <Footer />
    </div>
  );
}
