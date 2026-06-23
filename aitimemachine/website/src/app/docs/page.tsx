'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Search,
  Download,
  Zap,
  BookOpen,
  Terminal,
  Code2,
  Puzzle,
  Webhook,
  Box,
  ArrowRight,
  ChevronRight,
  Package,
  Layers,
  Settings,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const navSections = [
  {
    id: 'installation',
    title: 'Installation',
    href: '/docs/installation',
    icon: Download,
  },
  {
    id: 'quick-start',
    title: 'Quick Start',
    href: '/docs/quick-start',
    icon: Zap,
  },
  {
    id: 'core-concepts',
    title: 'Core Concepts',
    href: '/docs/core-concepts',
    icon: BookOpen,
  },
  {
    id: 'cli-reference',
    title: 'CLI Reference',
    href: '/docs/cli-reference',
    icon: Terminal,
  },
  {
    id: 'vscode-extension',
    title: 'VS Code Extension',
    href: '/docs/vscode-extension',
    icon: Puzzle,
  },
  {
    id: 'mcp-tools',
    title: 'MCP Tools',
    href: '/docs/mcp-tools',
    icon: Webhook,
  },
  {
    id: 'api-reference',
    title: 'API Reference',
    href: '/docs/api-reference',
    icon: Code2,
  },
  {
    id: 'integrations',
    title: 'Integrations',
    href: '/docs/integrations',
    icon: Box,
  },
];

const docCategories = [
  {
    id: 'installation',
    title: 'Installation',
    href: '/docs/installation',
    icon: Package,
    description: 'Install AITimeMachine via npm, yarn, or pnpm. Works on macOS, Linux, and Windows.',
    badge: 'Start here',
    badgeColor: 'bg-green-500/20 text-green-400 border border-green-500/30',
  },
  {
    id: 'quick-start',
    title: 'Quick Start',
    href: '/docs/quick-start',
    icon: Zap,
    description: 'Up and running in under 2 minutes. Install, init, checkpoint, restore.',
    badge: 'Recommended',
    badgeColor: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  },
  {
    id: 'core-concepts',
    title: 'Core Concepts',
    href: '/docs/core-concepts',
    icon: Layers,
    description: 'Understand checkpoints, sessions, workspaces, and deterministic restore.',
    badge: null,
    badgeColor: '',
  },
  {
    id: 'cli-reference',
    title: 'CLI Reference',
    href: '/docs/cli-reference',
    icon: Terminal,
    description: 'Complete reference for aitm checkpoint, restore, list, status, agents, workspace.',
    badge: null,
    badgeColor: '',
  },
  {
    id: 'vscode-extension',
    title: 'VS Code Extension',
    href: '/docs/vscode-extension',
    icon: Puzzle,
    description: 'One-click checkpoints, visual timeline, and restore directly inside VS Code.',
    badge: null,
    badgeColor: '',
  },
  {
    id: 'mcp-tools',
    title: 'MCP Tools',
    href: '/docs/mcp-tools',
    icon: Webhook,
    description: 'Native MCP protocol integration with Claude Code, Cursor, and compatible AI tools.',
    badge: 'New',
    badgeColor: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
  },
  {
    id: 'api-reference',
    title: 'API Reference',
    href: '/docs/api-reference',
    icon: Code2,
    description: 'REST API for checkpoints, sessions, projects, timeline, and webhooks.',
    badge: null,
    badgeColor: '',
  },
  {
    id: 'integrations',
    title: 'Integrations',
    href: '/docs/integrations',
    icon: Settings,
    description: 'Connect AITimeMachine with GitHub Actions, CI/CD pipelines, and third-party tools.',
    badge: null,
    badgeColor: '',
  },
];

export default function DocsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeNav, setActiveNav] = useState('');

  const filteredNav = navSections.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredCategories = docCategories.filter(
    (c) =>
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Left Sidebar */}
          <aside className="hidden lg:block w-60 flex-shrink-0">
            <div className="sticky top-24 space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search docs..."
                  className="pl-9 bg-gray-900 border-gray-800 text-sm placeholder:text-gray-600 focus:border-gray-600"
                />
              </div>

              {/* Navigation */}
              <nav className="space-y-1">
                <p className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Documentation
                </p>
                {filteredNav.map((section) => {
                  const Icon = section.icon;
                  return (
                    <Link
                      key={section.id}
                      href={section.href}
                      onClick={() => setActiveNav(section.id)}
                      className={cn(
                        'flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors',
                        activeNav === section.id
                          ? 'bg-gray-800 text-white'
                          : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                      )}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      {section.title}
                      <ChevronRight className="w-3 h-3 ml-auto opacity-40" />
                    </Link>
                  );
                })}
              </nav>

              {/* Divider */}
              <div className="border-t border-gray-800 pt-4">
                <p className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Resources
                </p>
                <Link
                  href="/changelog"
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors"
                >
                  <BookOpen className="w-4 h-4 flex-shrink-0" />
                  Changelog
                </Link>
                <Link
                  href="/status"
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors"
                >
                  <Zap className="w-4 h-4 flex-shrink-0" />
                  API Status
                </Link>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0 space-y-10">
            {/* Hero */}
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium">
                <BookOpen className="w-3.5 h-3.5" />
                Documentation
              </div>
              <h1 className="text-4xl font-bold tracking-tight">
                AITimeMachine Docs
              </h1>
              <p className="text-gray-400 text-lg max-w-2xl">
                AITimeMachine is a deterministic restore system for AI-native development.
                Capture your complete project state — files, terminal history, AI context —
                and restore to any point in time.
              </p>
              <div className="flex items-center gap-3 pt-2">
                <Button asChild className="bg-white text-gray-900 hover:bg-gray-100 font-semibold">
                  <Link href="/docs/quick-start">
                    Get Started
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800"
                >
                  <Link href="/docs/cli-reference">CLI Reference</Link>
                </Button>
              </div>
            </div>

            {/* Search results notice */}
            {searchQuery && (
              <p className="text-sm text-gray-500">
                Showing results for{' '}
                <span className="text-gray-300">&ldquo;{searchQuery}&rdquo;</span>
              </p>
            )}

            {/* Doc Categories Grid */}
            {filteredCategories.length > 0 ? (
              <div className="grid sm:grid-cols-2 gap-4">
                {filteredCategories.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <Link
                      key={cat.id}
                      href={cat.href}
                      className="group relative flex flex-col gap-3 p-5 bg-gray-900 border border-gray-800 rounded-xl hover:border-gray-600 hover:bg-gray-900/80 transition-all"
                    >
                      <div className="flex items-start justify-between">
                        <div className="p-2 bg-gray-800 rounded-lg group-hover:bg-gray-700 transition-colors">
                          <Icon className="w-5 h-5 text-gray-300" />
                        </div>
                        {cat.badge && (
                          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', cat.badgeColor)}>
                            {cat.badge}
                          </span>
                        )}
                      </div>
                      <div>
                        <h3 className="font-semibold text-white group-hover:text-white flex items-center gap-1">
                          {cat.title}
                          <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all" />
                        </h3>
                        <p className="text-sm text-gray-400 mt-1 leading-relaxed">
                          {cat.description}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <Search className="w-8 h-8 mx-auto mb-3 opacity-40" />
                <p>No docs found matching &ldquo;{searchQuery}&rdquo;</p>
              </div>
            )}

            {/* Quick links bar */}
            <div className="border-t border-gray-800 pt-8">
              <h2 className="text-lg font-semibold mb-4">Popular pages</h2>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'aitm checkpoint', href: '/docs/cli-reference' },
                  { label: 'aitm restore', href: '/docs/cli-reference' },
                  { label: 'MCP setup', href: '/docs/mcp-tools' },
                  { label: 'VS Code extension', href: '/docs/vscode-extension' },
                  { label: 'GitHub Actions', href: '/docs/integrations' },
                  { label: 'API authentication', href: '/docs/api-reference' },
                ].map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          </main>
        </div>
      </div>

      <Footer />
    </div>
  );
}
