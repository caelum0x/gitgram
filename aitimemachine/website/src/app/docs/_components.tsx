'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight, Copy, Check, BookOpen, Zap } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { cn } from '@/lib/utils';
import { DOC_NAV_SECTIONS } from './_nav';

interface DocsSidebarProps {
  activeId: string;
}

/**
 * Left-hand documentation navigation, driven by the shared DOC_NAV_SECTIONS
 * source of truth so every link resolves to a real page.
 */
export function DocsSidebar({ activeId }: DocsSidebarProps) {
  return (
    <aside className="hidden lg:block w-60 flex-shrink-0">
      <div className="sticky top-24 space-y-4">
        <nav className="space-y-1">
          <p className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Documentation
          </p>
          {DOC_NAV_SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = section.id === activeId;
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
  );
}

interface DocsPageShellProps {
  activeId: string;
  children: ReactNode;
}

/** Full page chrome (navbar, sidebar, footer) shared by content doc pages. */
export function DocsPageShell({ activeId, children }: DocsPageShellProps) {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          <DocsSidebar activeId={activeId} />
          <main className="flex-1 min-w-0 space-y-12 pb-16">{children}</main>
        </div>
      </div>
      <Footer />
    </div>
  );
}

interface DocsBreadcrumbProps {
  title: string;
}

export function DocsBreadcrumb({ title }: DocsBreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-gray-500">
      <Link href="/docs" className="hover:text-gray-300 transition-colors">
        Docs
      </Link>
      <ChevronRight className="w-3.5 h-3.5" />
      <span className="text-gray-300">{title}</span>
    </nav>
  );
}

interface CodeBlockProps {
  code: string;
  language?: string;
  label?: string;
}

/** Copy-to-clipboard code block matching the quick-start page styling. */
export function CodeBlock({ code, language = 'bash', label }: CodeBlockProps) {
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

interface DocHeaderProps {
  badge: string;
  badgeIcon: ReactNode;
  title: string;
  description: string;
}

export function DocHeader({ badge, badgeIcon, title, description }: DocHeaderProps) {
  return (
    <div className="space-y-3">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium">
        {badgeIcon}
        {badge}
      </div>
      <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
      <p className="text-gray-400 text-lg max-w-2xl">{description}</p>
    </div>
  );
}

interface NextPrevLink {
  title: string;
  href: string;
}

interface DocFooterNavProps {
  prev?: NextPrevLink;
  next?: NextPrevLink;
}

export function DocFooterNav({ prev, next }: DocFooterNavProps) {
  return (
    <div className="border-t border-gray-800 pt-8 flex items-center justify-between gap-3">
      {prev ? (
        <Link
          href={prev.href}
          className="group flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          {prev.title}
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          href={next.href}
          className="group flex items-center gap-2 text-sm font-medium text-white hover:text-blue-300 transition-colors"
        >
          {next.title}
          <ChevronRight className="w-4 h-4" />
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}
