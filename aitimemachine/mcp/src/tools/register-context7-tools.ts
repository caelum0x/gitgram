import { z } from 'zod';
import { Context7, type Library } from '@upstash/context7-sdk';
import {
  createToolRegistrar,
  defineTool,
} from '../lib/tool-runtime.js';
import { readOnlyAnnotations } from '../lib/tool-annotations.js';
import { jsonResponse, textResponse } from '../lib/tool-responses.js';

// ============================================================================
// In-process Context7 client (replaces the previous CONTEXT7_URL JSON-RPC proxy)
//
// All tools call the @upstash/context7-sdk client directly. The SDK exposes
// exactly two primitives, and NEITHER accepts a token budget — getContext only
// sends { query, libraryId, type } to the v2/context endpoint:
//   - searchLibrary(query, libraryName) -> Library[]      (resolve / list)
//   - getContext(query, libraryId)      -> Documentation[] (retrieval)
//
// The "examples / api search / changelog / version compare" tools are
// retrieval queries scoped by phrasing — they are NOT backed by dedicated
// structured-diff/changelog endpoints, so their descriptions are worded as
// "retrieval scoped to ..." rather than promising structured output. There is
// no `tokens` parameter because the SDK and endpoint cannot honor one.
// ============================================================================

let _client: Context7 | null = null;

function getClient(): Context7 {
  if (_client) {
    return _client;
  }
  const apiKey = process.env.CONTEXT7_API_KEY;
  if (!apiKey) {
    throw new Error('Context7 not configured: set CONTEXT7_API_KEY');
  }
  _client = new Context7({ apiKey });
  return _client;
}

function errMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export const registerContext7Tools = createToolRegistrar([
  defineTool({
    name: 'tm_docs_resolve',
    description: 'Resolve a library name to its Context7 library ID for use with tm_docs_query',
    schema: {
      libraryName: z.string().min(1).describe('The library or package name to resolve (e.g. "react", "zod", "express")'),
    },
    annotations: readOnlyAnnotations({ openWorldHint: true }),
    run: async ({ libraryName }) => {
      try {
        const libraries = await getClient().searchLibrary(libraryName, libraryName, { type: 'json' });
        return jsonResponse(libraries);
      } catch (error: unknown) {
        return textResponse(`Failed to resolve library "${libraryName}": ${errMessage(error)}`);
      }
    },
  }),

  defineTool({
    name: 'tm_docs_query',
    description: 'Query documentation for a resolved Context7 library ID',
    schema: {
      libraryId: z.string().min(1).describe('The Context7 library ID returned by tm_docs_resolve'),
      query: z.string().min(1).describe('The documentation topic or question to look up'),
    },
    annotations: readOnlyAnnotations({ openWorldHint: true }),
    run: async ({ libraryId, query }) => {
      try {
        const docs = await getClient().getContext(query, libraryId, { type: 'json' });
        return jsonResponse(docs);
      } catch (error: unknown) {
        return textResponse(`Failed to query docs for library "${libraryId}": ${errMessage(error)}`);
      }
    },
  }),

  defineTool({
    name: 'tm_docs_list_libraries',
    description:
      'Search Context7 for libraries matching a term and return the matches (id, name, trust score, versions). ' +
      'Context7 does not expose a full catalog listing, so this is a search-backed discovery query: ' +
      'omit "query" to search the generic term "library", or pass a term to narrow results. ' +
      'Equivalent to tm_docs_resolve but tuned for browsing candidates rather than picking one ID.',
    schema: {
      query: z.string().optional().describe('Optional filter string to narrow results by library name or topic'),
    },
    annotations: readOnlyAnnotations({ openWorldHint: true }),
    run: async ({ query }) => {
      try {
        const term = query && query.trim().length > 0 ? query.trim() : 'library';
        const libraries = await getClient().searchLibrary(term, term, { type: 'json' });
        return jsonResponse(libraries);
      } catch (error: unknown) {
        return textResponse(`Failed to list libraries: ${errMessage(error)}`);
      }
    },
  }),

  defineTool({
    name: 'tm_docs_get_examples',
    description:
      'Retrieve documentation for a resolved Context7 library ID scoped to code examples and usage patterns. ' +
      'This is a retrieval query (not a dedicated examples index); results are documentation snippets ' +
      'matched to an "examples" phrasing, optionally narrowed by a topic.',
    schema: {
      libraryId: z.string().min(1).describe('The Context7 library ID returned by tm_docs_resolve'),
      topic: z.string().optional().describe('Optional topic to filter examples (e.g. "authentication", "pagination")'),
    },
    annotations: readOnlyAnnotations({ openWorldHint: true }),
    run: async ({ libraryId, topic }) => {
      try {
        const scope = topic && topic.trim().length > 0 ? topic.trim() : 'code examples';
        const docs = await getClient().getContext(`code examples for ${scope}`, libraryId, { type: 'json' });
        return jsonResponse(docs);
      } catch (error: unknown) {
        return textResponse(`Failed to get examples for library "${libraryId}": ${errMessage(error)}`);
      }
    },
  }),

  defineTool({
    name: 'tm_docs_search_api',
    description:
      'Retrieve documentation for a resolved Context7 library ID scoped to a specific API symbol ' +
      '(method, class, or function). This is a retrieval query against the docs index, not a ' +
      'structured symbol/signature lookup; results are the documentation snippets most relevant to the symbol.',
    schema: {
      libraryId: z.string().min(1).describe('The Context7 library ID returned by tm_docs_resolve'),
      symbol: z.string().min(1).describe('The method, function, or class name to search for (e.g. "useState", "Router", "createServer")'),
    },
    annotations: readOnlyAnnotations({ openWorldHint: true }),
    run: async ({ libraryId, symbol }) => {
      try {
        const docs = await getClient().getContext(`API reference for ${symbol}`, libraryId, { type: 'json' });
        return jsonResponse(docs);
      } catch (error: unknown) {
        return textResponse(`Failed to search API symbol "${symbol}" in library "${libraryId}": ${errMessage(error)}`);
      }
    },
  }),

  defineTool({
    name: 'tm_docs_compare_versions',
    description:
      'Retrieve documentation for a resolved Context7 library ID scoped to differences and breaking ' +
      'changes between two versions. This is a retrieval query, not a structured API diff: it returns ' +
      'documentation snippets discussing the version delta rather than a computed added/removed/changed symbol list.',
    schema: {
      libraryId: z.string().min(1).describe('The Context7 library ID returned by tm_docs_resolve'),
      fromVersion: z.string().min(1).describe('The baseline version to compare from (e.g. "18.0.0")'),
      toVersion: z.string().min(1).describe('The target version to compare to (e.g. "19.0.0")'),
    },
    annotations: readOnlyAnnotations({ openWorldHint: true }),
    run: async ({ libraryId, fromVersion, toVersion }) => {
      try {
        const docs = await getClient().getContext(
          `differences and breaking changes between version ${fromVersion} and ${toVersion}`,
          libraryId,
          { type: 'json' }
        );
        return jsonResponse(docs);
      } catch (error: unknown) {
        return textResponse(`Failed to compare versions ${fromVersion}..${toVersion} for library "${libraryId}": ${errMessage(error)}`);
      }
    },
  }),

  defineTool({
    name: 'tm_docs_get_changelog',
    description:
      'Retrieve documentation for a resolved Context7 library ID scoped to changelog, release notes, ' +
      'and breaking changes. This is a retrieval query against the docs index, not a dedicated changelog ' +
      'API: results are documentation snippets matched to changelog phrasing, optionally narrowed to a version.',
    schema: {
      libraryId: z.string().min(1).describe('The Context7 library ID returned by tm_docs_resolve'),
      version: z.string().optional().describe('Optional specific version to fetch changelog for; omit to get the full history'),
    },
    annotations: readOnlyAnnotations({ openWorldHint: true }),
    run: async ({ libraryId, version }) => {
      try {
        const scope = version && version.trim().length > 0 ? ` for version ${version.trim()}` : '';
        const docs = await getClient().getContext(`changelog, release notes and breaking changes${scope}`, libraryId, { type: 'json' });
        return jsonResponse(docs);
      } catch (error: unknown) {
        return textResponse(`Failed to get changelog for library "${libraryId}": ${errMessage(error)}`);
      }
    },
  }),

  defineTool({
    name: 'tm_docs_for_imports',
    description: 'Detect import statements in a source file and fetch relevant documentation for each imported library',
    schema: {
      source: z.string().min(1).describe('Source code content to scan for import statements'),
      query: z.string().optional().describe('Optional documentation topic to look up for each detected library (default: "overview")'),
    },
    annotations: readOnlyAnnotations({ openWorldHint: true }),
    run: async ({ source, query }) => {
      const importPattern = /(?:import\s+(?:[^'"]+from\s+)?['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;
      const detected = new Set<string>();

      let match: RegExpExecArray | null;
      while ((match = importPattern.exec(source)) !== null) {
        const specifier = match[1] ?? match[2];
        if (!specifier) continue;
        // Skip relative imports
        if (specifier.startsWith('.')) continue;
        // Normalise scoped packages to their root (e.g. "@scope/pkg/sub" -> "@scope/pkg")
        const parts = specifier.split('/');
        const packageName = specifier.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
        if (packageName) {
          detected.add(packageName);
        }
      }

      if (detected.size === 0) {
        return textResponse('No non-relative imports detected in the provided source.');
      }

      const topic = query ?? 'overview';
      const results: Record<string, unknown> = {};

      let client: Context7;
      try {
        client = getClient();
      } catch (error: unknown) {
        return textResponse(`Context7 unavailable: ${errMessage(error)}`);
      }

      for (const pkg of detected) {
        try {
          const libraries: Library[] = await client.searchLibrary(pkg, pkg, { type: 'json' });
          const libraryId = libraries[0]?.id;
          if (!libraryId) {
            results[pkg] = { error: 'Could not resolve library ID' };
            continue;
          }
          const docs = await client.getContext(topic, libraryId, { type: 'json' });
          results[pkg] = docs;
        } catch (error: unknown) {
          results[pkg] = { error: errMessage(error) };
        }
      }

      return jsonResponse(results);
    },
  }),
]);
