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
// All tools call the @upstash/context7-sdk client directly. The tool
// names / inputs / outputs are unchanged. The SDK exposes two primitives:
//   - searchLibrary(query, libraryName) -> Library[]   (resolve / list)
//   - getContext(query, libraryId)      -> Documentation[]  (docs / examples /
//     api search / changelog / version compare are expressed as scoped queries)
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
      tokens: z.number().int().positive().optional().describe('Maximum number of tokens to return (default: 5000)'),
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
    description: 'List all libraries indexed in Context7. Useful for discovering what documentation is available before resolving a library ID.',
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
    description: 'Fetch code examples for a resolved Context7 library ID. Returns runnable snippets and usage patterns for the library.',
    schema: {
      libraryId: z.string().min(1).describe('The Context7 library ID returned by tm_docs_resolve'),
      topic: z.string().optional().describe('Optional topic to filter examples (e.g. "authentication", "pagination")'),
      tokens: z.number().int().positive().optional().describe('Maximum number of tokens to return (default: 3000)'),
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
    description: 'Search for a specific API method, class, or function within a resolved Context7 library. Returns matching signatures, parameters, and return types.',
    schema: {
      libraryId: z.string().min(1).describe('The Context7 library ID returned by tm_docs_resolve'),
      symbol: z.string().min(1).describe('The method, function, or class name to search for (e.g. "useState", "Router", "createServer")'),
      tokens: z.number().int().positive().optional().describe('Maximum number of tokens to return (default: 3000)'),
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
    description: 'Compare API differences between two versions of a resolved Context7 library. Returns added, removed, and changed symbols.',
    schema: {
      libraryId: z.string().min(1).describe('The Context7 library ID returned by tm_docs_resolve'),
      fromVersion: z.string().min(1).describe('The baseline version to compare from (e.g. "18.0.0")'),
      toVersion: z.string().min(1).describe('The target version to compare to (e.g. "19.0.0")'),
      tokens: z.number().int().positive().optional().describe('Maximum number of tokens to return (default: 4000)'),
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
    description: 'Fetch the changelog for a resolved Context7 library. Returns version history, breaking changes, and release notes.',
    schema: {
      libraryId: z.string().min(1).describe('The Context7 library ID returned by tm_docs_resolve'),
      version: z.string().optional().describe('Optional specific version to fetch changelog for; omit to get the full history'),
      tokens: z.number().int().positive().optional().describe('Maximum number of tokens to return (default: 4000)'),
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
      tokens: z.number().int().positive().optional().describe('Maximum tokens per library (default: 2000)'),
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
