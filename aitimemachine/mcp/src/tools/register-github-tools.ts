/**
 * register-github-tools.ts
 *
 * GitHub integration: registers tools that proxy the GitHub REST API
 * (api.github.com) into the AITM MCP server. Each tool's run() handler
 * calls GitHub via fetch, authenticating with a personal access token
 * supplied through the GITHUB_TOKEN environment variable.
 *
 * Tool names are prefixed with `github_` to avoid conflicts with AITM tools.
 *
 * Read tools use readOnlyAnnotations(); github_create_issue mutates remote
 * state and uses mutatingAnnotations(). Rate-limit headers are surfaced on
 * the response when the remaining quota is low so callers can back off.
 */

import { z } from 'zod';
import { createToolRegistrar, defineTool } from '../lib/tool-runtime.js';
import {
  mutatingAnnotations,
  readOnlyAnnotations,
} from '../lib/tool-annotations.js';
import { jsonResponse } from '../lib/tool-responses.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const GITHUB_API_URL =
  (typeof process !== 'undefined' && process.env.GITHUB_API_URL) ||
  'https://api.github.com';

const GITHUB_API_VERSION = '2022-11-28';

// Below this many remaining requests we annotate the response with a warning.
const RATE_LIMIT_WARN_THRESHOLD = 10;

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

interface RateLimitInfo {
  limit: number | null;
  remaining: number | null;
  reset: string | null;
  warning?: string;
}

function getToken(): string {
  const token =
    typeof process !== 'undefined' ? process.env.GITHUB_TOKEN : undefined;
  if (!token) {
    throw new Error(
      'GitHub proxy: GITHUB_TOKEN is not configured. Set the GITHUB_TOKEN ' +
        'environment variable to a personal access token before using ' +
        'github_* tools.'
    );
  }
  return token;
}

function defaultHeaders(accept = 'application/vnd.github+json'): HeadersInit {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: accept,
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
    'User-Agent': 'aitm-mcp-github-tools',
  };
}

function parseRateLimit(response: Response): RateLimitInfo {
  const headerNumber = (name: string): number | null => {
    const raw = response.headers.get(name);
    if (raw === null) return null;
    const value = Number.parseInt(raw, 10);
    return Number.isNaN(value) ? null : value;
  };

  const limit = headerNumber('X-RateLimit-Limit');
  const remaining = headerNumber('X-RateLimit-Remaining');
  const resetEpoch = headerNumber('X-RateLimit-Reset');
  const reset =
    resetEpoch !== null ? new Date(resetEpoch * 1000).toISOString() : null;

  const info: RateLimitInfo = { limit, remaining, reset };

  if (remaining !== null && remaining <= RATE_LIMIT_WARN_THRESHOLD) {
    info.warning =
      `GitHub rate limit low: ${remaining} request(s) remaining` +
      (reset ? `, resets at ${reset}.` : '.');
  }

  return info;
}

/**
 * Perform a request against the GitHub REST API and return the parsed body
 * together with rate-limit metadata. Throws on transport and HTTP errors,
 * surfacing GitHub's error message and a friendly rate-limit hint on 403/429.
 */
async function githubRequest(
  path: string,
  init: RequestInit = {},
  accept?: string
): Promise<{ body: unknown; rateLimit: RateLimitInfo }> {
  const url = path.startsWith('http') ? path : `${GITHUB_API_URL}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { ...defaultHeaders(accept), ...(init.headers ?? {}) },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `GitHub proxy: failed to reach ${url} — ${message}. ` +
        'Check network connectivity and that GITHUB_API_URL is correct.'
    );
  }

  const rateLimit = parseRateLimit(response);
  const isDiff = accept === 'application/vnd.github.diff';
  const text = await response.text();

  if (!response.ok) {
    if (
      (response.status === 403 || response.status === 429) &&
      rateLimit.remaining === 0
    ) {
      throw new Error(
        `GitHub proxy: rate limit exceeded for ${url}` +
          (rateLimit.reset ? ` (resets at ${rateLimit.reset}).` : '.')
      );
    }
    let detail = text;
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed && typeof parsed.message === 'string') {
        detail = parsed.message;
      }
    } catch {
      // Body was not JSON; fall back to the raw text.
    }
    throw new Error(
      `GitHub proxy: HTTP ${response.status} ${response.statusText} from ${url} — ${detail}`
    );
  }

  if (isDiff) {
    return { body: text, rateLimit };
  }

  if (text.length === 0) {
    return { body: null, rateLimit };
  }

  try {
    return { body: JSON.parse(text), rateLimit };
  } catch {
    return { body: text, rateLimit };
  }
}

/**
 * Wrap a successful result with rate-limit metadata into the MCP response
 * envelope. The rateLimit field is always present so callers can monitor quota.
 */
function withRateLimit(
  data: unknown,
  rateLimit: RateLimitInfo
): ReturnType<typeof jsonResponse> {
  return jsonResponse({ data, rateLimit });
}

function encodePath(segment: string): string {
  return segment
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

// ---------------------------------------------------------------------------
// Response shaping helpers (trim GitHub payloads to the useful fields)
// ---------------------------------------------------------------------------

interface RawRepo {
  full_name?: string;
  description?: string | null;
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  watchers_count?: number;
  language?: string | null;
  topics?: string[];
  default_branch?: string;
  license?: { spdx_id?: string | null } | null;
  html_url?: string;
  archived?: boolean;
  pushed_at?: string;
}

function shapeRepo(raw: RawRepo) {
  return {
    fullName: raw.full_name ?? null,
    description: raw.description ?? null,
    stars: raw.stargazers_count ?? 0,
    forks: raw.forks_count ?? 0,
    openIssues: raw.open_issues_count ?? 0,
    watchers: raw.watchers_count ?? 0,
    language: raw.language ?? null,
    topics: raw.topics ?? [],
    defaultBranch: raw.default_branch ?? null,
    license: raw.license?.spdx_id ?? null,
    url: raw.html_url ?? null,
    archived: raw.archived ?? false,
    pushedAt: raw.pushed_at ?? null,
  };
}

interface RawPull {
  number?: number;
  title?: string;
  state?: string;
  draft?: boolean;
  user?: { login?: string } | null;
  html_url?: string;
  created_at?: string;
  updated_at?: string;
  merged_at?: string | null;
}

function shapePull(raw: RawPull) {
  return {
    number: raw.number ?? null,
    title: raw.title ?? null,
    author: raw.user?.login ?? null,
    state: raw.state ?? null,
    draft: raw.draft ?? false,
    merged: Boolean(raw.merged_at),
    url: raw.html_url ?? null,
    createdAt: raw.created_at ?? null,
    updatedAt: raw.updated_at ?? null,
  };
}

interface RawIssue {
  number?: number;
  title?: string;
  state?: string;
  user?: { login?: string } | null;
  labels?: Array<{ name?: string } | string>;
  comments?: number;
  html_url?: string;
  pull_request?: unknown;
  created_at?: string;
}

function shapeIssue(raw: RawIssue) {
  const labels = (raw.labels ?? []).map((l) =>
    typeof l === 'string' ? l : (l.name ?? '')
  );
  return {
    number: raw.number ?? null,
    title: raw.title ?? null,
    author: raw.user?.login ?? null,
    state: raw.state ?? null,
    labels,
    comments: raw.comments ?? 0,
    url: raw.html_url ?? null,
    createdAt: raw.created_at ?? null,
  };
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export const registerGitHubTools = createToolRegistrar([
  // -------------------------------------------------------------------------
  // github_get_repo — repository metadata
  // -------------------------------------------------------------------------
  defineTool({
    name: 'github_get_repo',
    description:
      'Fetch metadata for a GitHub repository: stars, forks, primary language, ' +
      'description, topics, license, and default branch.',
    schema: {
      owner: z.string().min(1).describe('Repository owner (user or org login).'),
      repo: z.string().min(1).describe('Repository name.'),
    },
    annotations: readOnlyAnnotations(),
    run: async (args) => {
      const { owner, repo } = args;
      const { body, rateLimit } = await githubRequest(
        `/repos/${encodePath(owner)}/${encodePath(repo)}`
      );
      return withRateLimit(shapeRepo(body as RawRepo), rateLimit);
    },
  }),

  // -------------------------------------------------------------------------
  // github_list_prs — pull requests by state
  // -------------------------------------------------------------------------
  defineTool({
    name: 'github_list_prs',
    description:
      'List pull requests for a repository. Returns number, title, author, ' +
      'state, draft/merged flags, and URL. Filter by state (open, closed, all).',
    schema: {
      owner: z.string().min(1).describe('Repository owner (user or org login).'),
      repo: z.string().min(1).describe('Repository name.'),
      state: z
        .enum(['open', 'closed', 'all'])
        .default('open')
        .optional()
        .describe('Which pull requests to return. Default "open".'),
    },
    annotations: readOnlyAnnotations(),
    run: async (args) => {
      const { owner, repo } = args;
      const state = args.state ?? 'open';
      const query = new URLSearchParams({ state, per_page: '50' });
      const { body, rateLimit } = await githubRequest(
        `/repos/${encodePath(owner)}/${encodePath(repo)}/pulls?${query.toString()}`
      );
      const pulls = Array.isArray(body) ? (body as RawPull[]) : [];
      return withRateLimit(pulls.map(shapePull), rateLimit);
    },
  }),

  // -------------------------------------------------------------------------
  // github_get_pr_diff — unified diff text for a pull request
  // -------------------------------------------------------------------------
  defineTool({
    name: 'github_get_pr_diff',
    description:
      'Fetch the unified diff text for a pull request. Returns the raw ' +
      'patch as produced by GitHub (suitable for review or patch application).',
    schema: {
      owner: z.string().min(1).describe('Repository owner (user or org login).'),
      repo: z.string().min(1).describe('Repository name.'),
      prNumber: z
        .number()
        .int()
        .positive()
        .describe('Pull request number.'),
    },
    annotations: readOnlyAnnotations(),
    run: async (args) => {
      const { owner, repo, prNumber } = args;
      const { body, rateLimit } = await githubRequest(
        `/repos/${encodePath(owner)}/${encodePath(repo)}/pulls/${prNumber}`,
        {},
        'application/vnd.github.diff'
      );
      return withRateLimit(
        { prNumber, diff: typeof body === 'string' ? body : '' },
        rateLimit
      );
    },
  }),

  // -------------------------------------------------------------------------
  // github_list_issues — issues by state and labels
  // -------------------------------------------------------------------------
  defineTool({
    name: 'github_list_issues',
    description:
      'List issues for a repository. Returns number, title, author, state, ' +
      'labels, and comment count. Pull requests are excluded. Filter by state ' +
      'and a comma-separated label list.',
    schema: {
      owner: z.string().min(1).describe('Repository owner (user or org login).'),
      repo: z.string().min(1).describe('Repository name.'),
      state: z
        .enum(['open', 'closed', 'all'])
        .default('open')
        .optional()
        .describe('Which issues to return. Default "open".'),
      labels: z
        .string()
        .optional()
        .describe(
          'Comma-separated list of label names to filter by (e.g. "bug,help wanted").'
        ),
    },
    annotations: readOnlyAnnotations(),
    run: async (args) => {
      const { owner, repo } = args;
      const state = args.state ?? 'open';
      const query = new URLSearchParams({ state, per_page: '50' });
      if (args.labels) query.set('labels', args.labels);
      const { body, rateLimit } = await githubRequest(
        `/repos/${encodePath(owner)}/${encodePath(repo)}/issues?${query.toString()}`
      );
      const raw = Array.isArray(body) ? (body as RawIssue[]) : [];
      // The issues endpoint includes PRs; drop anything with a pull_request key.
      const issues = raw.filter((i) => i.pull_request === undefined);
      return withRateLimit(issues.map(shapeIssue), rateLimit);
    },
  }),

  // -------------------------------------------------------------------------
  // github_create_issue — open a new issue (mutating)
  // -------------------------------------------------------------------------
  defineTool({
    name: 'github_create_issue',
    description:
      'Create a new issue in a repository. Returns the created issue with its ' +
      'number, URL, and state. This mutates remote state on GitHub.',
    schema: {
      owner: z.string().min(1).describe('Repository owner (user or org login).'),
      repo: z.string().min(1).describe('Repository name.'),
      title: z.string().min(1).describe('Issue title.'),
      body: z.string().describe('Issue body in Markdown.'),
      labels: z
        .array(z.string())
        .optional()
        .describe('Optional list of label names to apply to the new issue.'),
    },
    annotations: mutatingAnnotations(),
    run: async (args) => {
      const { owner, repo, title, body, labels } = args;
      const payload: Record<string, unknown> = { title, body };
      if (labels && labels.length > 0) payload.labels = labels;
      const { body: created, rateLimit } = await githubRequest(
        `/repos/${encodePath(owner)}/${encodePath(repo)}/issues`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      return withRateLimit(shapeIssue(created as RawIssue), rateLimit);
    },
  }),

  // -------------------------------------------------------------------------
  // github_get_file — file contents (base64-decoded)
  // -------------------------------------------------------------------------
  defineTool({
    name: 'github_get_file',
    description:
      'Fetch the contents of a file from a repository at an optional ref ' +
      '(branch, tag, or commit SHA). Base64-encoded content is decoded to ' +
      'UTF-8 text. Returns { path, ref, size, content }.',
    schema: {
      owner: z.string().min(1).describe('Repository owner (user or org login).'),
      repo: z.string().min(1).describe('Repository name.'),
      path: z.string().min(1).describe('Path to the file within the repository.'),
      ref: z
        .string()
        .optional()
        .describe('Branch, tag, or commit SHA. Defaults to the default branch.'),
    },
    annotations: readOnlyAnnotations(),
    run: async (args) => {
      const { owner, repo, path, ref } = args;
      const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
      const { body, rateLimit } = await githubRequest(
        `/repos/${encodePath(owner)}/${encodePath(repo)}/contents/${encodePath(path)}${query}`
      );

      const file = body as {
        type?: string;
        encoding?: string;
        content?: string;
        size?: number;
        sha?: string;
      };

      if (file.type !== 'file' || typeof file.content !== 'string') {
        throw new Error(
          `GitHub proxy: '${path}' is not a regular file (type: ${file.type ?? 'unknown'}).`
        );
      }

      const decoded =
        file.encoding === 'base64'
          ? Buffer.from(file.content, 'base64').toString('utf-8')
          : file.content;

      return withRateLimit(
        {
          path,
          ref: ref ?? null,
          size: file.size ?? decoded.length,
          sha: file.sha ?? null,
          content: decoded,
        },
        rateLimit
      );
    },
  }),

  // -------------------------------------------------------------------------
  // github_search_code — code search across GitHub
  // -------------------------------------------------------------------------
  defineTool({
    name: 'github_search_code',
    description:
      'Search code across GitHub. Optionally scope the search to a single ' +
      'owner and/or repository. Returns matching file paths, repositories, ' +
      'and URLs.',
    schema: {
      query: z.string().min(1).describe('Search expression (GitHub code search syntax).'),
      owner: z
        .string()
        .optional()
        .describe('Restrict results to repositories owned by this user/org.'),
      repo: z
        .string()
        .optional()
        .describe(
          'Restrict results to this repository name. Requires owner to be set.'
        ),
    },
    annotations: readOnlyAnnotations(),
    run: async (args) => {
      const { query, owner, repo } = args;

      let qualified = query;
      if (owner && repo) {
        qualified += ` repo:${owner}/${repo}`;
      } else if (owner) {
        qualified += ` user:${owner}`;
      }

      const search = new URLSearchParams({ q: qualified, per_page: '30' });
      const { body, rateLimit } = await githubRequest(
        `/search/code?${search.toString()}`
      );

      const result = body as {
        total_count?: number;
        incomplete_results?: boolean;
        items?: Array<{
          name?: string;
          path?: string;
          html_url?: string;
          repository?: { full_name?: string };
        }>;
      };

      const items = (result.items ?? []).map((item) => ({
        name: item.name ?? null,
        path: item.path ?? null,
        repository: item.repository?.full_name ?? null,
        url: item.html_url ?? null,
      }));

      return withRateLimit(
        {
          totalCount: result.total_count ?? items.length,
          incompleteResults: result.incomplete_results ?? false,
          items,
        },
        rateLimit
      );
    },
  }),
]);

export default registerGitHubTools;
