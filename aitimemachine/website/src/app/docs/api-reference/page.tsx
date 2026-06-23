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
  KeyRound,
  Gauge,
  Lock,
  Unlock,
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

const BASE_URL = 'https://api.aitimemachine.dev';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface Param {
  name: string;
  in: 'path' | 'query' | 'body';
  type: string;
  required: boolean;
  description: string;
}

interface Endpoint {
  id: string;
  method: HttpMethod;
  path: string;
  group: string;
  summary: string;
  description: string;
  auth: boolean;
  params: Param[];
  requestBody?: string;
  response: string;
  curl: string;
}

const endpoints: Endpoint[] = [
  // ----- Sessions -----
  {
    id: 'create-session',
    method: 'POST',
    path: '/v1/sessions',
    group: 'Sessions',
    summary: 'Create an agent session',
    description:
      'Open a new agent session for a project. Sessions group together the checkpoints, messages, and tool calls produced by a single AI run so they can be replayed and shared later.',
    auth: true,
    params: [
      { name: 'projectId', in: 'body', type: 'string', required: true, description: 'ID of the project this session belongs to.' },
      { name: 'agent', in: 'body', type: 'string', required: false, description: 'Identifier of the agent driving the session (e.g. "claude").' },
      { name: 'title', in: 'body', type: 'string', required: false, description: 'Human-readable title for the session.' },
      { name: 'metadata', in: 'body', type: 'object', required: false, description: 'Arbitrary key/value metadata stored with the session.' },
    ],
    requestBody: `{
  "projectId": "proj_8f2a1c",
  "agent": "claude",
  "title": "Refactor auth module",
  "metadata": {
    "branch": "feature/auth-rework"
  }
}`,
    response: `{
  "session": {
    "id": "sess_a1b2c3d4",
    "projectId": "proj_8f2a1c",
    "agent": "claude",
    "title": "Refactor auth module",
    "status": "active",
    "createdAt": "2026-06-22T10:14:02.001Z"
  }
}`,
    curl: `curl -X POST ${BASE_URL}/v1/sessions \\
  -H "X-API-Key: aitm_xxxxxxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "projectId": "proj_8f2a1c",
    "agent": "claude",
    "title": "Refactor auth module"
  }'`,
  },
  {
    id: 'list-sessions',
    method: 'GET',
    path: '/v1/sessions',
    group: 'Sessions',
    summary: 'List sessions',
    description:
      'Return all active sessions for the authenticated user, including device, location, and last-active information for each session.',
    auth: true,
    params: [
      { name: 'limit', in: 'query', type: 'number', required: false, description: 'Maximum number of sessions to return. Defaults to 50.' },
      { name: 'projectId', in: 'query', type: 'string', required: false, description: 'Filter sessions to a single project.' },
    ],
    response: `{
  "sessions": [
    {
      "id": "sess_a1b2c3d4",
      "device": { "browser": "Chrome", "os": "macOS", "isMobile": false },
      "location": "San Francisco, US",
      "ip_address": "203.0.113.7",
      "last_active": "2026-06-22T10:31:55.000Z",
      "created_at": "2026-06-22T10:14:02.001Z",
      "expires_at": "2026-07-22T10:14:02.001Z",
      "is_current": true
    }
  ],
  "total": 1
}`,
    curl: `curl ${BASE_URL}/v1/sessions \\
  -H "X-API-Key: aitm_xxxxxxxxxxxxxxxxxxxx"`,
  },
  {
    id: 'get-session',
    method: 'GET',
    path: '/v1/sessions/:id',
    group: 'Sessions',
    summary: 'Get a session',
    description:
      'Retrieve a single session by its ID, including its current status and aggregate counts of checkpoints and messages.',
    auth: true,
    params: [
      { name: 'id', in: 'path', type: 'string', required: true, description: 'The session ID (e.g. "sess_a1b2c3d4").' },
    ],
    response: `{
  "session": {
    "id": "sess_a1b2c3d4",
    "projectId": "proj_8f2a1c",
    "agent": "claude",
    "title": "Refactor auth module",
    "status": "active",
    "checkpointCount": 12,
    "messageCount": 48,
    "createdAt": "2026-06-22T10:14:02.001Z"
  }
}`,
    curl: `curl ${BASE_URL}/v1/sessions/sess_a1b2c3d4 \\
  -H "X-API-Key: aitm_xxxxxxxxxxxxxxxxxxxx"`,
  },
  {
    id: 'restore-session',
    method: 'POST',
    path: '/v1/sessions/:id/restore',
    group: 'Sessions',
    summary: 'Restore a session',
    description:
      'Restore project state from a session. A safety checkpoint is captured before the restore is applied so the operation itself can be undone.',
    auth: true,
    params: [
      { name: 'id', in: 'path', type: 'string', required: true, description: 'The session ID to restore from.' },
      { name: 'checkpointId', in: 'body', type: 'string', required: false, description: 'Restore to a specific checkpoint. Defaults to the latest checkpoint in the session.' },
      { name: 'filesOnly', in: 'body', type: 'boolean', required: false, description: 'Restore files only and skip terminal and AI context.' },
    ],
    requestBody: `{
  "checkpointId": "cp_77ad12",
  "filesOnly": false
}`,
    response: `{
  "restored": true,
  "sessionId": "sess_a1b2c3d4",
  "checkpointId": "cp_77ad12",
  "safetyCheckpointId": "cp_safety_90fe",
  "filesChanged": 7
}`,
    curl: `curl -X POST ${BASE_URL}/v1/sessions/sess_a1b2c3d4/restore \\
  -H "X-API-Key: aitm_xxxxxxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{ "checkpointId": "cp_77ad12" }'`,
  },
  {
    id: 'session-checkpoints',
    method: 'GET',
    path: '/v1/sessions/:id/checkpoints',
    group: 'Checkpoints',
    summary: 'List session checkpoints',
    description:
      'List all checkpoints captured during a session in chronological order, including their manifest hash, trigger type, and file counts.',
    auth: true,
    params: [
      { name: 'id', in: 'path', type: 'string', required: true, description: 'The session ID.' },
      { name: 'limit', in: 'query', type: 'number', required: false, description: 'Maximum number of checkpoints to return.' },
    ],
    response: `{
  "checkpoints": [
    {
      "id": "cp_77ad12",
      "name": "After tests passing",
      "manifestHash": "sha256:9c1f...",
      "triggerType": "agent",
      "fileCount": 41,
      "createdAt": "2026-06-22T10:28:11.000Z"
    }
  ],
  "total": 1
}`,
    curl: `curl ${BASE_URL}/v1/sessions/sess_a1b2c3d4/checkpoints \\
  -H "X-API-Key: aitm_xxxxxxxxxxxxxxxxxxxx"`,
  },
  // ----- Sync -----
  {
    id: 'sync-push',
    method: 'POST',
    path: '/v1/sync/push',
    group: 'Sync',
    summary: 'Push checkpoints to the cloud',
    description:
      'Upload a checkpoint and its file manifest to the cloud. If a pre-computed root tree hash is not supplied, the server builds the tree hierarchy from the provided flat file list. Subject to storage quota for the current plan.',
    auth: true,
    params: [
      { name: 'projectId', in: 'body', type: 'string', required: true, description: 'Project the checkpoint belongs to.' },
      { name: 'checkpoint', in: 'body', type: 'object', required: true, description: 'Checkpoint object: id, name, manifestHash, and optional files[] / rootTreeHash.' },
    ],
    requestBody: `{
  "projectId": "proj_8f2a1c",
  "checkpoint": {
    "id": "cp_77ad12",
    "name": "After tests passing",
    "manifestHash": "sha256:9c1f...",
    "files": [
      { "path": "src/auth.ts", "hash": "sha256:aa11", "size": 2048 }
    ]
  }
}`,
    response: `{
  "success": true,
  "checkpointId": "cp_77ad12",
  "rootTreeHash": "sha256:tree_4b8d",
  "uploadedBlobs": 1,
  "storageUsed": "12.4 MB"
}`,
    curl: `curl -X POST ${BASE_URL}/v1/sync/push \\
  -H "X-API-Key: aitm_xxxxxxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "projectId": "proj_8f2a1c",
    "checkpoint": {
      "id": "cp_77ad12",
      "name": "After tests passing",
      "manifestHash": "sha256:9c1f..."
    }
  }'`,
  },
  {
    id: 'sync-pull',
    method: 'POST',
    path: '/v1/sync/pull',
    group: 'Sync',
    summary: 'Pull checkpoints from the cloud',
    description:
      'Fetch checkpoints and the content-addressed blobs needed to reconstruct project state on another machine. Only blobs missing locally need to be requested.',
    auth: true,
    params: [
      { name: 'projectId', in: 'body', type: 'string', required: true, description: 'Project to pull from.' },
      { name: 'since', in: 'body', type: 'string', required: false, description: 'Only return checkpoints created after this ISO timestamp.' },
      { name: 'blobHashes', in: 'body', type: 'string[]', required: false, description: 'Specific blob hashes to download.' },
    ],
    requestBody: `{
  "projectId": "proj_8f2a1c",
  "since": "2026-06-20T00:00:00.000Z"
}`,
    response: `{
  "checkpoints": [
    {
      "id": "cp_77ad12",
      "name": "After tests passing",
      "rootTreeHash": "sha256:tree_4b8d",
      "createdAt": "2026-06-22T10:28:11.000Z"
    }
  ],
  "blobs": [
    { "hash": "sha256:aa11", "size": 2048 }
  ]
}`,
    curl: `curl -X POST ${BASE_URL}/v1/sync/pull \\
  -H "X-API-Key: aitm_xxxxxxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{ "projectId": "proj_8f2a1c" }'`,
  },
  {
    id: 'sync-status',
    method: 'GET',
    path: '/v1/sync/status',
    group: 'Sync',
    summary: 'Get sync & quota status',
    description:
      'Return the current storage quota usage for the authenticated user, including bytes used, the plan limit, and a human-readable summary.',
    auth: true,
    params: [
      { name: 'projectId', in: 'query', type: 'string', required: false, description: 'Scope the quota report to a single project.' },
    ],
    response: `{
  "plan": "pro",
  "storage": {
    "usedBytes": 13002342,
    "limitBytes": 10737418240,
    "usedFormatted": "12.4 MB",
    "limitFormatted": "10 GB",
    "percentUsed": 0.12
  },
  "lastSyncedAt": "2026-06-22T10:28:11.000Z"
}`,
    curl: `curl ${BASE_URL}/v1/sync/status \\
  -H "X-API-Key: aitm_xxxxxxxxxxxxxxxxxxxx"`,
  },
  // ----- Teams -----
  {
    id: 'create-team',
    method: 'POST',
    path: '/teams',
    group: 'Teams',
    summary: 'Create a team',
    description:
      'Create a new team workspace. The caller becomes the team owner and an invite code is returned for adding members. Slugs are normalized and made unique automatically.',
    auth: true,
    params: [
      { name: 'name', in: 'body', type: 'string', required: true, description: 'Team display name (1–100 characters).' },
      { name: 'slug', in: 'body', type: 'string', required: false, description: 'URL slug (3–50 chars). Generated from the name if omitted.' },
      { name: 'description', in: 'body', type: 'string', required: false, description: 'Optional description (up to 500 characters).' },
    ],
    requestBody: `{
  "name": "Platform Team",
  "slug": "platform",
  "description": "Owns the core API and sync services"
}`,
    response: `{
  "team": {
    "id": "team_3f9c1a8b22d4",
    "name": "Platform Team",
    "slug": "platform",
    "ownerId": "usr_44ab",
    "plan": "team",
    "createdAt": "2026-06-22T10:40:00.000Z"
  },
  "inviteCode": "8d2f1ac9b7e34f0a"
}`,
    curl: `curl -X POST ${BASE_URL}/teams \\
  -H "X-API-Key: aitm_xxxxxxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{ "name": "Platform Team", "slug": "platform" }'`,
  },
  // ----- Sharing -----
  {
    id: 'get-shared',
    method: 'GET',
    path: '/shared/:shareId',
    group: 'Sharing',
    summary: 'View a shared session',
    description:
      'Resolve a share link and return the shared session along with its checkpoints. Public shares require no authentication; private and team shares honour the X-API-Key header when present.',
    auth: false,
    params: [
      { name: 'shareId', in: 'path', type: 'string', required: true, description: 'The share identifier from the share URL.' },
      { name: 'teamId', in: 'query', type: 'string', required: false, description: 'Required for team-visibility shares to verify membership.' },
    ],
    response: `{
  "session": {
    "id": "sess_a1b2c3d4",
    "title": "Refactor auth module"
  },
  "checkpoints": [
    { "id": "cp_77ad12", "name": "After tests passing" }
  ],
  "visibility": "public",
  "sharedBy": "ada@example.com",
  "expiresAt": null,
  "shareId": "shr_5e1a90"
}`,
    curl: `curl ${BASE_URL}/shared/shr_5e1a90`,
  },
  // ----- Webhooks -----
  {
    id: 'register-webhook',
    method: 'POST',
    path: '/v1/webhooks/register',
    group: 'Webhooks',
    summary: 'Register a webhook',
    description:
      'Register a webhook endpoint that receives events for the authenticated user. A signing secret is returned once at creation time and is used to verify the X-AITM-Signature header on every delivery — store it securely.',
    auth: true,
    params: [
      { name: 'url', in: 'body', type: 'string', required: true, description: 'HTTPS endpoint that will receive event payloads.' },
      { name: 'events', in: 'body', type: 'string[]', required: true, description: 'Array of event names to subscribe to (e.g. "checkpoint.created").' },
      { name: 'secret', in: 'body', type: 'string', required: false, description: 'Custom signing secret. A random one is generated if omitted.' },
    ],
    requestBody: `{
  "url": "https://example.com/hooks/aitm",
  "events": ["checkpoint.created", "session.restored"]
}`,
    response: `{
  "id": "9f1c2a7b3d4e5f60",
  "secret": "whsec_4b8d...store-this-now",
  "events": ["checkpoint.created", "session.restored"],
  "message": "Webhook registered. Store the secret securely - it won't be shown again."
}`,
    curl: `curl -X POST ${BASE_URL}/v1/webhooks/register \\
  -H "X-API-Key: aitm_xxxxxxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://example.com/hooks/aitm",
    "events": ["checkpoint.created"]
  }'`,
  },
  // ----- Health -----
  {
    id: 'health',
    method: 'GET',
    path: '/health',
    group: 'Health',
    summary: 'Basic health check',
    description:
      'Liveness probe that returns 200 OK when the server is running. Includes the API version and uptime. No authentication required.',
    auth: false,
    params: [],
    response: `{
  "status": "healthy",
  "timestamp": "2026-06-22T10:45:00.000Z",
  "version": "1.0.0",
  "uptime": 86400000,
  "uptimeFormatted": "1d 0h 0m"
}`,
    curl: `curl ${BASE_URL}/health`,
  },
  {
    id: 'health-providers',
    method: 'GET',
    path: '/health/providers',
    group: 'Health',
    summary: 'Provider health report',
    description:
      'Return the health of upstream providers (GitNexus, Context7, Beads, PAL, OpenAI, Anthropic, PostgreSQL, Redis). Responds 503 when the overall status is unavailable. No authentication required.',
    auth: false,
    params: [],
    response: `{
  "overall": "healthy",
  "checkedAt": "2026-06-22T10:45:00.000Z",
  "providers": [
    { "name": "PostgreSQL", "status": "healthy", "latencyMs": 4 },
    { "name": "Redis", "status": "healthy", "latencyMs": 1 },
    { "name": "Anthropic", "status": "healthy", "latencyMs": 212 }
  ]
}`,
    curl: `curl ${BASE_URL}/health/providers`,
  },
];

const groups = ['All', 'Sessions', 'Checkpoints', 'Sync', 'Teams', 'Sharing', 'Webhooks', 'Health'];

const methodStyles: Record<HttpMethod, string> = {
  GET: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
  POST: 'bg-blue-500/15 border-blue-500/40 text-blue-300',
  PUT: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
  PATCH: 'bg-purple-500/15 border-purple-500/40 text-purple-300',
  DELETE: 'bg-red-500/15 border-red-500/40 text-red-300',
};

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

function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
        <CopyButton code={code} />
      </div>
      <pre className="bg-gray-900 border border-gray-800 rounded-lg p-4 overflow-x-auto text-sm leading-relaxed">
        <code className="text-gray-300 font-mono">{code}</code>
      </pre>
    </div>
  );
}

function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <span
      className={cn(
        'px-2 py-0.5 rounded-md border text-xs font-mono font-semibold tracking-wide whitespace-nowrap',
        methodStyles[method]
      )}
    >
      {method}
    </span>
  );
}

function AuthBadge({ auth }: { auth: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium whitespace-nowrap',
        auth
          ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
          : 'bg-gray-800 border-gray-700 text-gray-400'
      )}
    >
      {auth ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
      {auth ? 'Auth required' : 'Public'}
    </span>
  );
}

function EndpointRow({ endpoint }: { endpoint: Endpoint }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 bg-gray-900 hover:bg-gray-900/70 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <MethodBadge method={endpoint.method} />
          <code className="text-gray-200 font-mono text-sm font-semibold whitespace-nowrap">
            {endpoint.path}
          </code>
          <span className="text-sm text-gray-400 truncate hidden md:block">{endpoint.summary}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-3">
          <div className="hidden sm:block">
            <AuthBadge auth={endpoint.auth} />
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-800 divide-y divide-gray-800/60">
          {/* Description */}
          <div className="px-5 py-4 bg-gray-950 space-y-3">
            <div className="flex items-center gap-2 sm:hidden">
              <AuthBadge auth={endpoint.auth} />
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">{endpoint.description}</p>
          </div>

          {/* Params table */}
          {endpoint.params.length > 0 && (
            <div className="px-5 py-4 bg-gray-950 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Parameters
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 w-44">
                        Name
                      </th>
                      <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 w-20">In</th>
                      <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 w-24">
                        Type
                      </th>
                      <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 w-24">
                        Required
                      </th>
                      <th className="text-left py-2 text-xs font-medium text-gray-500">
                        Description
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {endpoint.params.map((param) => (
                      <tr key={param.name} className="hover:bg-gray-900/30 transition-colors">
                        <td className="py-2.5 pr-4">
                          <code className="text-xs text-amber-300 font-mono whitespace-nowrap">
                            {param.name}
                          </code>
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className="text-xs text-gray-500 font-mono">{param.in}</span>
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className="text-xs text-purple-400 font-mono">{param.type}</span>
                        </td>
                        <td className="py-2.5 pr-4">
                          <span
                            className={cn(
                              'text-xs font-mono',
                              param.required ? 'text-red-400' : 'text-gray-600'
                            )}
                          >
                            {param.required ? 'yes' : 'no'}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <span className="text-xs text-gray-400">{param.description}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Request body */}
          {endpoint.requestBody && (
            <div className="px-5 py-4 bg-gray-950">
              <CodeBlock code={endpoint.requestBody} label="Request body" />
            </div>
          )}

          {/* Response */}
          <div className="px-5 py-4 bg-gray-950">
            <CodeBlock code={endpoint.response} label="Response · 200 OK" />
          </div>

          {/* cURL */}
          <div className="px-5 py-4 bg-gray-950">
            <CodeBlock code={endpoint.curl} label="cURL" />
          </div>
        </div>
      )}
    </div>
  );
}

const planLimits = [
  { plan: 'Free', perMinute: '10', perMonth: '1,000' },
  { plan: 'Pro', perMinute: '100', perMonth: '100,000' },
  { plan: 'Team', perMinute: '500', perMonth: '500,000' },
  { plan: 'Enterprise', perMinute: '2,000', perMonth: '2,000,000' },
];

export default function ApiReferencePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState('All');

  const filtered = useMemo(() => {
    return endpoints.filter((ep) => {
      const matchesGroup = activeGroup === 'All' || ep.group === activeGroup;
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        ep.path.toLowerCase().includes(q) ||
        ep.summary.toLowerCase().includes(q) ||
        ep.description.toLowerCase().includes(q) ||
        ep.method.toLowerCase().includes(q);
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
                  const isActive = section.id === 'api-reference';
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
                <a
                  href="#authentication"
                  className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Authentication
                </a>
                <a
                  href="#rate-limits"
                  className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Rate limits
                </a>
                {groups
                  .filter((g) => g !== 'All')
                  .map((group) => (
                    <a
                      key={group}
                      href={`#group-${group.toLowerCase()}`}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      {group}
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
              <span className="text-gray-300">API Reference</span>
            </nav>

            {/* Header */}
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium">
                <Code2 className="w-3.5 h-3.5" />
                API Reference
              </div>
              <h1 className="text-4xl font-bold tracking-tight">REST API Reference</h1>
              <p className="text-gray-400 text-lg max-w-2xl">
                Programmatic access to the AITimeMachine cloud — sessions, checkpoints, sync, teams,
                sharing, and webhooks. All endpoints are served from{' '}
                <code className="bg-gray-800 px-1.5 py-0.5 rounded font-mono text-sm text-gray-300">
                  {BASE_URL}
                </code>
                .
              </p>
            </div>

            {/* Authentication */}
            <section id="authentication" className="space-y-4 scroll-mt-24">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-400" />
                <h2 className="text-2xl font-bold tracking-tight">Authentication</h2>
              </div>
              <p className="text-gray-400 leading-relaxed max-w-3xl">
                Authenticated endpoints require an API key passed in the{' '}
                <code className="bg-gray-800 px-1.5 py-0.5 rounded font-mono text-xs text-amber-300">
                  X-API-Key
                </code>{' '}
                request header. Keys are prefixed with{' '}
                <code className="bg-gray-800 px-1.5 py-0.5 rounded font-mono text-xs text-gray-300">
                  aitm_
                </code>{' '}
                and are scoped to a single user or team. Never expose a key in client-side code or
                commit it to source control.
              </p>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 bg-gray-900 border border-gray-800 rounded-xl space-y-2">
                  <p className="text-sm font-semibold text-gray-200">Get an API key</p>
                  <ol className="text-sm text-gray-400 space-y-1.5 list-decimal list-inside leading-relaxed">
                    <li>
                      Sign in to the{' '}
                      <Link href="/dashboard" className="text-blue-400 hover:underline">
                        dashboard
                      </Link>
                      .
                    </li>
                    <li>
                      Open <span className="text-gray-300">Settings → API Keys</span>.
                    </li>
                    <li>
                      Click <span className="text-gray-300">Create key</span>, name it, and choose
                      its scopes.
                    </li>
                    <li>Copy the key — it is shown only once.</li>
                  </ol>
                </div>
                <div className="p-4 bg-gray-900 border border-gray-800 rounded-xl space-y-2">
                  <p className="text-sm font-semibold text-gray-200">Scopes</p>
                  <ul className="text-sm text-gray-400 space-y-1.5 leading-relaxed">
                    <li>
                      <code className="text-amber-300 font-mono text-xs">read</code> — list and read
                      sessions, checkpoints, and shares.
                    </li>
                    <li>
                      <code className="text-amber-300 font-mono text-xs">write</code> — create,
                      restore, share, and delete resources.
                    </li>
                    <li>
                      <code className="text-amber-300 font-mono text-xs">admin</code> — manage teams,
                      members, and webhooks.
                    </li>
                  </ul>
                </div>
              </div>

              <CodeBlock
                label="Example authenticated request"
                code={`curl ${BASE_URL}/v1/sessions \\
  -H "X-API-Key: aitm_xxxxxxxxxxxxxxxxxxxx"`}
              />

              <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl space-y-2">
                <p className="text-sm font-semibold text-red-300">401 Unauthorized</p>
                <p className="text-sm text-gray-400">
                  A missing or invalid key returns a structured error. All errors share the same
                  envelope.
                </p>
                <pre className="bg-gray-900 border border-gray-800 rounded-lg p-3 overflow-x-auto text-xs leading-relaxed">
                  <code className="text-gray-300 font-mono">{`{
  "error": {
    "type": "authentication_error",
    "message": "Provide API key in X-API-Key header"
  }
}`}</code>
                </pre>
              </div>
            </section>

            {/* Rate limits */}
            <section id="rate-limits" className="space-y-4 scroll-mt-24">
              <div className="flex items-center gap-2">
                <Gauge className="w-5 h-5 text-emerald-400" />
                <h2 className="text-2xl font-bold tracking-tight">Rate limits</h2>
              </div>
              <p className="text-gray-400 leading-relaxed max-w-3xl">
                Requests are rate limited per API key by plan, with both a per-minute and a monthly
                ceiling. Every response includes{' '}
                <code className="bg-gray-800 px-1.5 py-0.5 rounded font-mono text-xs text-gray-300">
                  X-RateLimit-*
                </code>{' '}
                headers so you can back off before hitting a limit. Exceeding a limit returns{' '}
                <code className="bg-gray-800 px-1.5 py-0.5 rounded font-mono text-xs text-gray-300">
                  429 Too Many Requests
                </code>
                .
              </p>

              <div className="overflow-x-auto border border-gray-800 rounded-xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 bg-gray-900">
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-500">Plan</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-500">
                        Requests / minute
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-500">
                        Requests / month
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {planLimits.map((row) => (
                      <tr key={row.plan} className="hover:bg-gray-900/30 transition-colors">
                        <td className="py-3 px-4 text-gray-200 font-medium">{row.plan}</td>
                        <td className="py-3 px-4 text-gray-400 font-mono text-xs">
                          {row.perMinute}
                        </td>
                        <td className="py-3 px-4 text-gray-400 font-mono text-xs">{row.perMonth}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 bg-gray-900 border border-gray-800 rounded-xl space-y-2">
                  <p className="text-sm font-semibold text-gray-200">Response headers</p>
                  <ul className="text-sm text-gray-400 space-y-1.5 leading-relaxed font-mono text-xs">
                    <li>X-RateLimit-Limit</li>
                    <li>X-RateLimit-Remaining</li>
                    <li>X-RateLimit-Reset</li>
                    <li>X-RateLimit-Limit-Month</li>
                    <li>X-RateLimit-Remaining-Month</li>
                  </ul>
                </div>
                <div className="p-4 bg-gray-900 border border-gray-800 rounded-xl space-y-2">
                  <p className="text-sm font-semibold text-gray-200">429 response</p>
                  <pre className="bg-gray-950 border border-gray-800 rounded-lg p-3 overflow-x-auto text-xs leading-relaxed">
                    <code className="text-gray-300 font-mono">{`{
  "error": {
    "type": "rate_limit_error",
    "message": "Rate limit exceeded",
    "limit": 100,
    "remaining": 0
  }
}`}</code>
                  </pre>
                </div>
              </div>
            </section>

            {/* Search + filter bar */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search endpoints, paths, methods..."
                  className="pl-9 bg-gray-900 border-gray-800 text-sm placeholder:text-gray-600 focus:border-gray-600"
                />
              </div>
              <div className="flex items-center gap-2 overflow-x-auto">
                {groups.map((group) => (
                  <button
                    key={group}
                    onClick={() => setActiveGroup(group)}
                    className={cn(
                      'px-3 py-2 rounded-lg text-sm font-medium transition-colors border whitespace-nowrap',
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
              {filtered.length === endpoints.length
                ? `${endpoints.length} endpoints`
                : `${filtered.length} of ${endpoints.length} endpoints`}
            </p>

            {/* Endpoints grouped */}
            {filtered.length > 0 ? (
              <div className="space-y-8">
                {groups
                  .filter((g) => g !== 'All')
                  .map((group) => {
                    const groupEndpoints = filtered.filter((ep) => ep.group === group);
                    if (groupEndpoints.length === 0) return null;
                    return (
                      <div
                        key={group}
                        id={`group-${group.toLowerCase()}`}
                        className="space-y-3 scroll-mt-24"
                      >
                        <h3 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
                          {group}
                          <span className="text-xs font-normal text-gray-600">
                            ({groupEndpoints.length})
                          </span>
                        </h3>
                        {groupEndpoints.map((ep) => (
                          <div key={ep.id} id={ep.id}>
                            <EndpointRow endpoint={ep} />
                          </div>
                        ))}
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="text-center py-16 text-gray-500 space-y-3">
                <Code2 className="w-8 h-8 mx-auto opacity-30" />
                <p>No endpoints match &ldquo;{searchQuery}&rdquo;</p>
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
                href="/docs/mcp-tools"
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
                MCP Tools
              </Link>
              <Link
                href="/docs/integrations"
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Integrations
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
