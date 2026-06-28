import {
  Download,
  Zap,
  BookOpen,
  Terminal,
  Puzzle,
  Webhook,
  Code2,
  Box,
  type LucideIcon,
} from 'lucide-react';

export interface DocNavSection {
  id: string;
  title: string;
  href: string;
  icon: LucideIcon;
}

/**
 * Single source of truth for the documentation navigation.
 *
 * Every entry MUST correspond to a real page under `src/app/docs/<id>/page.tsx`.
 * Keeping this in one module prevents the drift that previously let the docs
 * hub link to routes that did not exist.
 */
export const DOC_NAV_SECTIONS: readonly DocNavSection[] = [
  { id: 'installation', title: 'Installation', href: '/docs/installation', icon: Download },
  { id: 'quick-start', title: 'Quick Start', href: '/docs/quick-start', icon: Zap },
  { id: 'core-concepts', title: 'Core Concepts', href: '/docs/core-concepts', icon: BookOpen },
  { id: 'cli-reference', title: 'CLI Reference', href: '/docs/cli-reference', icon: Terminal },
  { id: 'vscode-extension', title: 'VS Code Extension', href: '/docs/vscode-extension', icon: Puzzle },
  { id: 'mcp-tools', title: 'MCP Tools', href: '/docs/mcp-tools', icon: Webhook },
  { id: 'api-reference', title: 'API Reference', href: '/docs/api-reference', icon: Code2 },
  { id: 'integrations', title: 'Integrations', href: '/docs/integrations', icon: Box },
] as const;
