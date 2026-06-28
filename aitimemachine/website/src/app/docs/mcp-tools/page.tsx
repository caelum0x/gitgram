'use client';

import { Webhook, Wrench } from 'lucide-react';
import {
  DocsPageShell,
  DocsBreadcrumb,
  DocHeader,
  CodeBlock,
  DocFooterNav,
} from '../_components';

interface McpTool {
  name: string;
  description: string;
  params: string;
}

const tools: McpTool[] = [
  {
    name: 'aitm_checkpoint',
    description: 'Create a checkpoint of the current project state. The agent calls this before risky edits.',
    params: '{ description: string, exclude?: string[] }',
  },
  {
    name: 'aitm_restore',
    description: 'Restore the project to a checkpoint, automatically creating a safety snapshot first.',
    params: '{ checkpointId: string, filesOnly?: boolean }',
  },
  {
    name: 'aitm_list',
    description: 'List recent checkpoints for the active project with their IDs and descriptions.',
    params: '{ limit?: number }',
  },
  {
    name: 'aitm_diff',
    description: 'Return the unified diff between two checkpoints so the agent can reason about changes.',
    params: '{ from: string, to: string, path?: string }',
  },
  {
    name: 'aitm_search',
    description: 'Search checkpoint history by description, file path, or captured terminal output.',
    params: '{ query: string, limit?: number }',
  },
];

export default function McpToolsPage() {
  return (
    <DocsPageShell activeId="mcp-tools">
      <DocsBreadcrumb title="MCP Tools" />

      <DocHeader
        badge="MCP Tools"
        badgeIcon={<Webhook className="w-3.5 h-3.5" />}
        title="Model Context Protocol integration"
        description="AITimeMachine exposes its checkpoint and restore capabilities as MCP tools, so AI assistants like Claude Code and Cursor can snapshot and rewind your project autonomously."
      />

      <section className="space-y-4 scroll-mt-24" id="claude-code">
        <h2 className="text-2xl font-semibold">Claude Code</h2>
        <p className="text-gray-400">
          Register the AITM MCP server so Claude Code can call checkpoint and restore tools during a session.
        </p>
        <CodeBlock code="claude mcp add aitm -- npx -y aitimemachine mcp" label="Terminal" />
        <p className="text-sm text-gray-500">
          This starts the AITM MCP server over stdio. Claude Code discovers the tools below automatically.
        </p>
      </section>

      <section className="space-y-4 scroll-mt-24" id="cursor">
        <h2 className="text-2xl font-semibold">Cursor &amp; other MCP clients</h2>
        <p className="text-gray-400">
          For clients that read a JSON config, add an entry pointing at the AITM MCP server.
        </p>
        <CodeBlock
          language="json"
          label="mcp.json"
          code={`{
  "mcpServers": {
    "aitm": {
      "command": "npx",
      "args": ["-y", "aitimemachine", "mcp"]
    }
  }
}`}
        />
      </section>

      <section className="space-y-4 scroll-mt-24" id="tools">
        <h2 className="text-2xl font-semibold">Available tools</h2>
        <div className="space-y-3">
          {tools.map((tool) => (
            <div key={tool.name} className="p-4 bg-gray-900 border border-gray-800 rounded-xl">
              <div className="flex items-center gap-2 mb-1.5">
                <Wrench className="w-4 h-4 text-purple-400 flex-shrink-0" />
                <code className="font-mono text-sm text-white">{tool.name}</code>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">{tool.description}</p>
              <code className="mt-2 inline-block font-mono text-xs text-gray-500">{tool.params}</code>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4 scroll-mt-24" id="usage">
        <h2 className="text-2xl font-semibold">How agents use it</h2>
        <p className="text-gray-400 leading-relaxed">
          Once registered, an agent typically calls{' '}
          <code className="bg-gray-800 px-1.5 py-0.5 rounded font-mono text-xs">aitm_checkpoint</code> before applying a
          large refactor, then uses{' '}
          <code className="bg-gray-800 px-1.5 py-0.5 rounded font-mono text-xs">aitm_diff</code> and{' '}
          <code className="bg-gray-800 px-1.5 py-0.5 rounded font-mono text-xs">aitm_restore</code> to recover if the
          change does not pan out — all without human intervention.
        </p>
      </section>

      <DocFooterNav
        prev={{ title: 'VS Code Extension', href: '/docs/vscode-extension' }}
        next={{ title: 'Next: API Reference', href: '/docs/api-reference' }}
      />
    </DocsPageShell>
  );
}
