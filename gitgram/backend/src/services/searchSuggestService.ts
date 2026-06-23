// Fast autocomplete service backed by an in-memory sorted prefix array.
//
// It indexes usernames, repository names (short + full), hashtag names and
// (optionally) snippet titles so that prefix lookups run in O(log n + k) time
// via binary search rather than hitting the database on every keystroke.
//
// The index is rebuilt from the database on a fixed interval (every 5 minutes)
// by startAutoRefresh(), and can also be rebuilt on demand with refreshIndex().
//
// Design notes:
//   * The backing array is sorted ascending by the lower-cased value, which is
//     what makes binary-search prefix matching possible.
//   * Module-level state is never exported raw — callers interact through the
//     suggest()/refreshIndex()/indexStats() functions only.
//   * No `any` types: all DB rows and public shapes are explicitly typed.

import { prisma } from '../utils/prisma';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SuggestType = 'user' | 'repository' | 'hashtag' | 'snippet';

/** Human-readable label shown next to each suggestion in the UI. */
export const TYPE_LABELS: Readonly<Record<SuggestType, string>> = Object.freeze({
  user: 'User',
  repository: 'Repository',
  hashtag: 'Hashtag',
  snippet: 'Snippet',
});

/** Prefix that, when prepended to the suggestion value, forms a display token. */
export const TYPE_PREFIXES: Readonly<Record<SuggestType, string>> = Object.freeze({
  user: '@',
  repository: '',
  hashtag: '#',
  snippet: '',
});

export interface Suggestion {
  /** The raw value (username, repo full name, hashtag name, snippet title). */
  value: string;
  /** The category of the suggestion. */
  type: SuggestType;
  /** Human-readable type label (e.g. "User", "Repository"). */
  label: string;
  /** Display string including any type prefix (e.g. "@octocat", "#typescript"). */
  display: string;
  /** Popularity weight — higher means more prominent in results. */
  weight: number;
}

export interface SuggestOptions {
  /** Restrict suggestions to these types. Defaults to all types. */
  types?: SuggestType[];
  /** Maximum number of results to return. Defaults to 10, capped at 50. */
  limit?: number;
}

export interface IndexStats {
  size: number;
  byType: Record<SuggestType, number>;
  lastRebuildAt: number;
  ageMs: number;
  rebuilding: boolean;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface IndexEntry {
  value: string;
  lower: string;
  type: SuggestType;
  weight: number;
}

interface UserRow {
  username: string;
  _count: { followers: number };
}

interface RepoRow {
  name: string;
  fullName: string;
  stars: number | null;
}

interface HashtagRow {
  name: string;
  count: number | null;
}

interface SnippetRow {
  title: string;
  likesCount: number | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REBUILD_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ROWS_PER_TYPE = 50_000;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

// ---------------------------------------------------------------------------
// Module-level state (never exported directly)
// ---------------------------------------------------------------------------

/** Sorted array of index entries (ascending by `lower`). */
let sortedEntries: ReadonlyArray<IndexEntry> = [];

/** True while a rebuild is in flight — prevents concurrent rebuilds. */
let rebuildInProgress = false;

/** Timestamp (ms) of the last successful rebuild; 0 if never built. */
let lastRebuildAt = 0;

/** The interval handle for the background refresh, if running. */
let refreshTimer: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Sorted-array helpers (binary search)
// ---------------------------------------------------------------------------

/**
 * Returns the leftmost index `i` such that `entries[i].lower >= prefix`,
 * or `entries.length` when no such entry exists.
 */
function lowerBound(entries: ReadonlyArray<IndexEntry>, prefix: string): number {
  let lo = 0;
  let hi = entries.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (entries[mid].lower < prefix) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/** Stable comparator used to keep the index sorted by lower-cased value. */
function compareEntries(a: IndexEntry, b: IndexEntry): number {
  if (a.lower < b.lower) return -1;
  if (a.lower > b.lower) return 1;
  // Tie-break by weight descending so the same-prefix walk starts hot.
  return b.weight - a.weight;
}

// ---------------------------------------------------------------------------
// Index building from DB rows
// ---------------------------------------------------------------------------

function buildEntries(
  users: ReadonlyArray<UserRow>,
  repos: ReadonlyArray<RepoRow>,
  hashtags: ReadonlyArray<HashtagRow>,
  snippets: ReadonlyArray<SnippetRow>,
): IndexEntry[] {
  const entries: IndexEntry[] = [];

  for (const u of users) {
    if (!u.username) continue;
    entries.push({
      value: u.username,
      lower: u.username.toLowerCase(),
      type: 'user',
      weight: u._count.followers,
    });
  }

  for (const r of repos) {
    const weight = r.stars ?? 0;
    if (r.fullName) {
      entries.push({
        value: r.fullName,
        lower: r.fullName.toLowerCase(),
        type: 'repository',
        weight,
      });
    }
    // Index the short name too so "react" matches "facebook/react".
    if (r.name && r.name !== r.fullName) {
      entries.push({
        value: r.name,
        lower: r.name.toLowerCase(),
        type: 'repository',
        weight,
      });
    }
  }

  for (const h of hashtags) {
    if (!h.name) continue;
    entries.push({
      value: h.name,
      lower: h.name.toLowerCase(),
      type: 'hashtag',
      weight: h.count ?? 0,
    });
  }

  for (const s of snippets) {
    if (!s.title) continue;
    entries.push({
      value: s.title,
      lower: s.title.toLowerCase(),
      type: 'snippet',
      weight: s.likesCount ?? 0,
    });
  }

  entries.sort(compareEntries);
  return entries;
}

// ---------------------------------------------------------------------------
// Index rebuild
// ---------------------------------------------------------------------------

/**
 * Rebuilds the in-memory index from the database.
 *
 * Safe to call at any time. If a rebuild is already running, this is a no-op.
 * Errors are logged and swallowed so a transient DB hiccup never crashes the
 * background timer or the request that triggered the refresh.
 */
export async function refreshIndex(): Promise<void> {
  if (rebuildInProgress) return;
  rebuildInProgress = true;

  try {
    const [users, repos, hashtags, snippets] = await Promise.all([
      prisma.user.findMany({
        select: {
          username: true,
          _count: { select: { followers: true } },
        },
        take: MAX_ROWS_PER_TYPE,
      }),
      prisma.repository.findMany({
        select: { name: true, fullName: true, stars: true },
        take: MAX_ROWS_PER_TYPE,
      }),
      prisma.hashtag.findMany({
        select: { name: true, count: true },
        take: MAX_ROWS_PER_TYPE,
      }),
      prisma.codeSnippet.findMany({
        select: { title: true, likesCount: true },
        take: MAX_ROWS_PER_TYPE,
      }),
    ]);

    const entries = buildEntries(
      users as ReadonlyArray<UserRow>,
      repos as ReadonlyArray<RepoRow>,
      hashtags as ReadonlyArray<HashtagRow>,
      snippets as ReadonlyArray<SnippetRow>,
    );

    // Atomic swap — readers always see a fully-built, sorted array.
    sortedEntries = entries;
    lastRebuildAt = Date.now();
    logger.info(`searchSuggestService: index rebuilt — ${entries.length} entries`);
  } catch (err) {
    logger.error('searchSuggestService: index rebuild failed', err);
  } finally {
    rebuildInProgress = false;
  }
}

// ---------------------------------------------------------------------------
// Scheduled auto-refresh
// ---------------------------------------------------------------------------

/**
 * Starts the periodic background refresh. Idempotent: calling it again while
 * already running is a no-op. Kicks off an immediate build, then rebuilds every
 * REBUILD_INTERVAL_MS.
 */
export function startAutoRefresh(): void {
  if (refreshTimer !== null) return;
  void refreshIndex();
  refreshTimer = setInterval(() => {
    void refreshIndex();
  }, REBUILD_INTERVAL_MS);
  // Don't keep the event loop alive solely for this timer.
  if (typeof refreshTimer.unref === 'function') {
    refreshTimer.unref();
  }
}

/** Stops the background refresh. Used in tests and graceful shutdown. */
export function stopAutoRefresh(): void {
  if (refreshTimer !== null) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Suggestion lookup
// ---------------------------------------------------------------------------

function toSuggestion(entry: IndexEntry): Suggestion {
  return {
    value: entry.value,
    type: entry.type,
    label: TYPE_LABELS[entry.type],
    display: `${TYPE_PREFIXES[entry.type]}${entry.value}`,
    weight: entry.weight,
  };
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  const floored = Math.floor(limit);
  if (floored < 1) return 1;
  if (floored > MAX_LIMIT) return MAX_LIMIT;
  return floored;
}

/**
 * Returns autocomplete suggestions for the given prefix.
 *
 * Algorithm:
 *   1. Binary-search for the first entry whose lower-cased value is >= prefix.
 *   2. Walk forward, collecting entries whose lower-cased value starts with the
 *      prefix, until the prefix no longer matches.
 *   3. Filter by requested types, sort by weight descending, return top `limit`.
 *
 * Time complexity: O(log n + k) where k is the number of prefix matches.
 *
 * If the index has not been built yet the function returns an empty array
 * rather than blocking — the caller should show a loading state or retry.
 */
export function suggest(prefix: string, options: SuggestOptions = {}): Suggestion[] {
  const normalized = prefix.toLowerCase().trim();
  if (normalized.length === 0) return [];

  const entries = sortedEntries;
  if (entries.length === 0) return [];

  const limit = clampLimit(options.limit);
  const typeFilter =
    options.types && options.types.length > 0 ? new Set(options.types) : null;

  const start = lowerBound(entries, normalized);

  // Collect candidate matches. Stop as soon as the prefix no longer matches —
  // because the array is sorted, all matches are contiguous.
  const candidates: IndexEntry[] = [];
  for (let i = start; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry.lower.startsWith(normalized)) break;
    if (typeFilter && !typeFilter.has(entry.type)) continue;
    candidates.push(entry);
  }

  // Highest weight first; stable tie-break alphabetically for determinism.
  candidates.sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.lower < b.lower ? -1 : a.lower > b.lower ? 1 : 0;
  });

  return candidates.slice(0, limit).map(toSuggestion);
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/** Returns index statistics, useful for health checks and debugging. */
export function indexStats(): IndexStats {
  const byType: Record<SuggestType, number> = {
    user: 0,
    repository: 0,
    hashtag: 0,
    snippet: 0,
  };
  for (const entry of sortedEntries) {
    byType[entry.type] += 1;
  }

  return {
    size: sortedEntries.length,
    byType,
    lastRebuildAt,
    ageMs: lastRebuildAt > 0 ? Date.now() - lastRebuildAt : -1,
    rebuilding: rebuildInProgress,
  };
}

/** Test-only helper to reset module state between test runs. */
export function __resetForTests(): void {
  stopAutoRefresh();
  sortedEntries = [];
  rebuildInProgress = false;
  lastRebuildAt = 0;
}
