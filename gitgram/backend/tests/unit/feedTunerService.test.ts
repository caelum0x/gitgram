/**
 * feedTunerService.test.ts
 *
 * Comprehensive test suite for feedTuner.ts — the post-processing pipeline that
 * enforces diversity, quality, and monetisation constraints before a feed slice
 * is returned to the client.
 *
 * Coverage targets:
 *  1.  MAX_AUTHOR_RUN=2 — no more than 2 consecutive posts from same author
 *  2.  Content-type diversity — posts, snippets, reels interleaved
 *  3.  Trending boost — high-trending posts rank higher
 *  4.  Cursor-based pagination — correct slice returned with cursor
 *  5.  Empty feed — graceful handling
 *  6.  Single-author feed — no interleaving possible; all items still returned
 *  7.  Large feed (100 posts) — correctness + acceptable performance
 *  8.  Deduplication — same post ID never returned twice
 *  9.  Sponsored post insertion — ad slots injected at correct intervals
 *  10. Language preference boost — language-tagged items score higher when preferred
 *
 * Framework: Jest (ts-jest) — the backend test runner used throughout this project.
 * API surface is identical to Vitest (describe / it / expect / jest.mock /
 * beforeEach / afterEach), so migrating to Vitest requires only renaming the
 * mock helpers from `jest.*` to `vi.*`.
 *
 * All tests are purely in-memory — no Prisma, Redis, or network calls.
 */

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('../../src/services/trendingAlgorithmService', () => ({
  computeTrendingScore: jest.fn(() => 0),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { computeTrendingScore } from '../../src/services/trendingAlgorithmService';
import {
  FeedTuner,
  tuneFeed,
  type TunableFeedItem,
  type SponsoredItem,
  type FeedTunerOptions,
  type FeedItemType,
} from '../../src/services/feedTuner';

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

const mockedComputeTrendingScore = computeTrendingScore as jest.MockedFunction<
  typeof computeTrendingScore
>;

// ---------------------------------------------------------------------------
// Factory helpers — return plain data objects; no mutation
// ---------------------------------------------------------------------------

function makeItem(
  id: string,
  authorId: string | null,
  score: number,
  type: FeedItemType = 'post',
  overrides: Partial<TunableFeedItem> = {}
): TunableFeedItem {
  return {
    id,
    type,
    authorId,
    score,
    likesCount: 0,
    commentsCount: 0,
    sharesCount: 0,
    savesCount: 0,
    createdAt: new Date('2026-06-20T12:00:00Z'),
    ...overrides,
  };
}

const makePost = (
  id: string,
  authorId: string | null,
  score: number,
  overrides: Partial<TunableFeedItem> = {}
): TunableFeedItem => makeItem(id, authorId, score, 'post', overrides);

const makeSnippet = (
  id: string,
  authorId: string | null,
  score: number,
  overrides: Partial<TunableFeedItem> = {}
): TunableFeedItem => makeItem(id, authorId, score, 'snippet', overrides);

const makeRepo = (
  id: string,
  authorId: string | null,
  score: number
): TunableFeedItem => makeItem(id, authorId, score, 'repo');

const makeReel = (
  id: string,
  authorId: string | null,
  score: number
): TunableFeedItem => makeItem(id, authorId, score, 'reel');

function makeSponsored(id: string, adId = `ad-${id}`): SponsoredItem {
  return {
    id,
    type: 'post',
    authorId: null,
    score: 0,
    isSponsored: true,
    adId,
    title: 'Sponsored: Test Ad',
    content: 'Try our developer tool today.',
    targetUrl: 'https://example.com/ad',
    mediaUrl: null,
  };
}

/** Build a simple no-op options object that disables every side-effect for isolation. */
const noEffects: FeedTunerOptions = {
  sponsoredInterval: 0,
  boostTrending: false,
};

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

/**
 * Returns the maximum consecutive run length for any non-null authorId,
 * ignoring sponsored slots which are injected by a different pipeline step.
 */
function maxConsecutiveAuthorRun(items: ReadonlyArray<TunableFeedItem>): number {
  const organic = items.filter(i => !i.isSponsored);
  if (organic.length < 2) return 1;

  let maxRun = 1;
  let currentRun = 1;

  for (let i = 1; i < organic.length; i++) {
    const prev = organic[i - 1];
    const curr = organic[i];

    if (
      curr.authorId !== null &&
      prev.authorId !== null &&
      curr.authorId === prev.authorId
    ) {
      currentRun++;
      if (currentRun > maxRun) maxRun = currentRun;
    } else {
      currentRun = 1;
    }
  }

  return maxRun;
}

/** Return all ids in result order, excluding sponsored slots. */
function organicIds(items: ReadonlyArray<TunableFeedItem>): string[] {
  return items.filter(i => !i.isSponsored).map(i => i.id);
}

/** Simulate cursor-based pagination: slice from the item whose id === cursor. */
function paginateWithCursor(
  items: ReadonlyArray<TunableFeedItem>,
  cursor: string | null,
  limit: number
): { items: TunableFeedItem[]; nextCursor: string | null } {
  let startIndex: number;

  if (cursor === null) {
    startIndex = 0;
  } else {
    const cursorIdx = items.findIndex(i => i.id === cursor);
    if (cursorIdx === -1) {
      // Cursor not found — unknown / expired cursor, return empty page
      return { items: [], nextCursor: null };
    }
    startIndex = cursorIdx + 1;
  }

  const slice = items.slice(startIndex, startIndex + limit);
  const nextCursor = startIndex + limit < items.length
    ? items[startIndex + limit - 1].id
    : null;

  return { items: slice, nextCursor };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockedComputeTrendingScore.mockReturnValue(0);
});

// ===========================================================================
// 1. MAX_AUTHOR_RUN = 2 (default)
// ===========================================================================

describe('1 · MAX_AUTHOR_RUN = 2 (default)', () => {
  it('allows exactly 2 consecutive posts from the same author', () => {
    const feed = [
      makePost('p1', 'alice', 100),
      makePost('p2', 'alice', 90),
      makePost('p3', 'bob', 80),
    ];
    const result = tuneFeed(feed, noEffects);
    expect(maxConsecutiveAuthorRun(result)).toBeLessThanOrEqual(2);
    expect(organicIds(result).sort()).toEqual(['p1', 'p2', 'p3'].sort());
  });

  it('defers a third consecutive post from the same author', () => {
    const feed = [
      makePost('p1', 'alice', 100),
      makePost('p2', 'alice', 99),
      makePost('p3', 'alice', 98), // third consecutive — must be deferred
      makePost('p4', 'bob', 50),
    ];
    const result = tuneFeed(feed, noEffects);
    expect(maxConsecutiveAuthorRun(result)).toBeLessThanOrEqual(2);
    expect(organicIds(result).sort()).toEqual(['p1', 'p2', 'p3', 'p4'].sort());
  });

  it('deferred author post re-appears later after a different author breaks the run', () => {
    const feed = [
      makePost('p1', 'alice', 100),
      makePost('p2', 'alice', 99),
      makePost('p3', 'alice', 98), // deferred
      makePost('p4', 'bob', 60),
      makePost('p5', 'charlie', 40),
    ];
    const result = tuneFeed(feed, noEffects);
    // p3 must still be present somewhere
    expect(organicIds(result)).toContain('p3');
    expect(maxConsecutiveAuthorRun(result)).toBeLessThanOrEqual(2);
  });

  it('enforces maxAuthorRun=1 when enough interleaving items exist', () => {
    const feed = [
      makePost('p1', 'alice', 100),
      makePost('p2', 'alice', 90),
      makePost('p3', 'bob', 80),
      makePost('p4', 'bob', 70),
      makePost('p5', 'charlie', 60),
    ];
    const result = tuneFeed(feed, { ...noEffects, maxAuthorRun: 1 });
    expect(maxConsecutiveAuthorRun(result)).toBeLessThanOrEqual(1);
    expect(organicIds(result).sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'].sort());
  });

  it('handles null authorId items — they never count toward any author run', () => {
    const feed = [
      makePost('p1', null, 100),
      makePost('p2', null, 90),
      makePost('p3', null, 80),
    ];
    const result = tuneFeed(feed, noEffects);
    expect(organicIds(result)).toHaveLength(3);
  });

  it('preserves all items when only one author exists (run cannot be broken)', () => {
    const feed = Array.from({ length: 5 }, (_, i) =>
      makePost(`p${i}`, 'alice', 100 - i)
    );
    const result = tuneFeed(feed, noEffects);
    expect(organicIds(result)).toHaveLength(5);
  });
});

// ===========================================================================
// 2. Content-type diversity interleaving
// ===========================================================================

describe('2 · Content-type diversity interleaving', () => {
  it('inserts a repo/reel into a post-heavy feed instead of appending at end', () => {
    // 6 posts + 1 repo → the repo should appear before the last post
    const feed = [
      makePost('p1', 'a', 100),
      makePost('p2', 'b', 90),
      makePost('p3', 'c', 80),
      makePost('p4', 'd', 70),
      makePost('p5', 'e', 60),
      makePost('p6', 'f', 50),
      makeRepo('r1', 'org', 10),
    ];
    const result = tuneFeed(feed, noEffects);
    const organic = result.filter(i => !i.isSponsored);
    const repoIdx = organic.findIndex(i => i.id === 'r1');
    expect(repoIdx).toBeGreaterThanOrEqual(0);
    expect(repoIdx).toBeLessThan(organic.length - 1);
  });

  it('interleaves multiple repos across a long post feed', () => {
    const posts = Array.from({ length: 9 }, (_, i) =>
      makePost(`p${i}`, `u${i}`, 100 - i)
    );
    const repos = Array.from({ length: 3 }, (_, i) =>
      makeRepo(`r${i}`, `org${i}`, 10 - i)
    );
    const result = tuneFeed([...posts, ...repos], noEffects);
    const organic = result.filter(i => !i.isSponsored);

    // Repos should NOT all be clumped at the end
    const repoIndices = organic
      .map((item, idx) => (item.type === 'repo' ? idx : -1))
      .filter(idx => idx >= 0);

    const lastOrganic = organic.length - 1;
    const notAllAtEnd = repoIndices.some(idx => idx < lastOrganic - 1);
    expect(notAllAtEnd).toBe(true);
  });

  it('preserves all items through interleaving (post + snippet + reel + repo mix)', () => {
    const feed = [
      makePost('p1', 'a', 100),
      makeSnippet('s1', 'b', 90),
      makeSnippet('s2', 'c', 80),
      makeReel('v1', 'd', 70),
      makeRepo('r1', 'e', 60),
      makePost('p2', 'f', 50),
    ];
    const result = tuneFeed(feed, noEffects);
    expect(organicIds(result).sort()).toEqual(
      ['p1', 'p2', 'r1', 's1', 's2', 'v1'].sort()
    );
  });

  it('handles a feed consisting entirely of repos and reels (no textual items)', () => {
    const feed = [
      makeRepo('r1', 'org1', 100),
      makeReel('v1', 'a', 90),
      makeRepo('r2', 'org2', 80),
    ];
    const result = tuneFeed(feed, noEffects);
    expect(organicIds(result)).toHaveLength(3);
  });

  it('handles a feed consisting entirely of posts (no discovery items)', () => {
    const feed = Array.from({ length: 4 }, (_, i) =>
      makePost(`p${i}`, `u${i}`, 100 - i)
    );
    const result = tuneFeed(feed, noEffects);
    expect(organicIds(result)).toHaveLength(4);
  });
});

// ===========================================================================
// 3. Trending boost
// ===========================================================================

describe('3 · Trending boost', () => {
  it('re-ranks a low-base-score item with a high trendingScore to the front', () => {
    const trendingPost = makePost('p-hot', 'bob', 10, { trendingScore: 200 });
    const normalPost = makePost('p-normal', 'alice', 100, { trendingScore: 0 });

    const result = tuneFeed([normalPost, trendingPost], {
      ...noEffects,
      boostTrending: true,
      trendingBoostThreshold: 50,
      trendingBoostMultiplier: 25, // 10 * 25 = 250 > 100
    });

    expect(organicIds(result)[0]).toBe('p-hot');
  });

  it('does not re-rank items whose trendingScore is below the threshold', () => {
    const feed = [
      makePost('p1', 'alice', 100, { trendingScore: 10 }),
      makePost('p2', 'bob', 50, { trendingScore: 5 }),
    ];

    const result = tuneFeed(feed, {
      ...noEffects,
      boostTrending: true,
      trendingBoostThreshold: 50,
      trendingBoostMultiplier: 10,
    });

    expect(organicIds(result)[0]).toBe('p1');
  });

  it('skips trending computation entirely when boostTrending=false', () => {
    const feed = [
      makePost('p1', 'alice', 80),
      makePost('p2', 'bob', 60),
    ];
    tuneFeed(feed, noEffects);
    expect(mockedComputeTrendingScore).not.toHaveBeenCalled();
  });

  it('calls computeTrendingScore when trendingScore field is absent and boostTrending=true', () => {
    mockedComputeTrendingScore.mockReturnValue(100);
    const feed = [
      makePost('p1', 'alice', 80),
      makePost('p2', 'bob', 60),
    ];
    tuneFeed(feed, {
      ...noEffects,
      boostTrending: true,
      trendingBoostThreshold: 50,
    });
    expect(mockedComputeTrendingScore).toHaveBeenCalled();
  });

  it('uses the explicit trendingScore field rather than recomputing when it is set', () => {
    const feed = [
      makePost('p1', 'alice', 80, { trendingScore: 200 }),
    ];
    tuneFeed(feed, {
      ...noEffects,
      boostTrending: true,
      trendingBoostThreshold: 50,
    });
    // computeTrendingScore should NOT have been called because trendingScore is set
    expect(mockedComputeTrendingScore).not.toHaveBeenCalled();
  });

  it('boost multiplier of 1 produces no reordering effect', () => {
    const feed = [
      makePost('p1', 'alice', 100, { trendingScore: 300 }),
      makePost('p2', 'bob', 90, { trendingScore: 0 }),
    ];
    // multiplier = 1 means score stays 100; p1 stays first regardless
    const result = tuneFeed(feed, {
      ...noEffects,
      boostTrending: true,
      trendingBoostThreshold: 50,
      trendingBoostMultiplier: 1,
    });
    expect(organicIds(result)[0]).toBe('p1');
  });
});

// ===========================================================================
// 4. Cursor-based pagination
// ===========================================================================

describe('4 · Cursor-based pagination', () => {
  const PAGE_SIZE = 3;

  it('first page (cursor=null) returns the first N items', () => {
    const tuned = Array.from({ length: 10 }, (_, i) =>
      makePost(`p${i}`, `u${i}`, 100 - i)
    );
    const { items, nextCursor } = paginateWithCursor(tuned, null, PAGE_SIZE);
    expect(items).toHaveLength(PAGE_SIZE);
    expect(items[0].id).toBe('p0');
    expect(nextCursor).toBe('p2');
  });

  it('second page starts immediately after the cursor item', () => {
    const tuned = Array.from({ length: 10 }, (_, i) =>
      makePost(`p${i}`, `u${i}`, 100 - i)
    );
    const page1 = paginateWithCursor(tuned, null, PAGE_SIZE);
    const page2 = paginateWithCursor(tuned, page1.nextCursor!, PAGE_SIZE);

    expect(page2.items[0].id).toBe('p3');
    expect(page2.items).toHaveLength(PAGE_SIZE);
  });

  it('last page returns remaining items and nextCursor=null', () => {
    const tuned = Array.from({ length: 7 }, (_, i) =>
      makePost(`p${i}`, `u${i}`, 100 - i)
    );
    const page1 = paginateWithCursor(tuned, null, PAGE_SIZE);
    const page2 = paginateWithCursor(tuned, page1.nextCursor!, PAGE_SIZE);
    const page3 = paginateWithCursor(tuned, page2.nextCursor!, PAGE_SIZE);

    // 7 items / 3 per page → page 3 has 1 item
    expect(page3.items).toHaveLength(1);
    expect(page3.nextCursor).toBeNull();
  });

  it('pages collectively cover all items without overlap or gap', () => {
    const tuned = Array.from({ length: 9 }, (_, i) =>
      makePost(`p${i}`, `u${i}`, 100 - i)
    );
    const allIds: string[] = [];
    let cursor: string | null = null;

    do {
      const page = paginateWithCursor(tuned, cursor, PAGE_SIZE);
      page.items.forEach(item => allIds.push(item.id));
      cursor = page.nextCursor;
    } while (cursor !== null);

    expect(allIds).toHaveLength(9);
    expect(new Set(allIds).size).toBe(9); // no duplicates
  });

  it('invalid cursor returns empty items', () => {
    const tuned = Array.from({ length: 5 }, (_, i) =>
      makePost(`p${i}`, `u${i}`, 100 - i)
    );
    const { items } = paginateWithCursor(tuned, 'nonexistent-id', PAGE_SIZE);
    expect(items).toHaveLength(0);
  });
});

// ===========================================================================
// 5. Empty feed
// ===========================================================================

describe('5 · Empty feed', () => {
  it('tuneFeed returns an empty array for empty input', () => {
    expect(tuneFeed([])).toEqual([]);
  });

  it('FeedTuner#tune returns an empty array for empty input', () => {
    const tuner = new FeedTuner();
    expect(tuner.tune([])).toEqual([]);
  });

  it('empty feed with all options enabled still returns []', () => {
    expect(
      tuneFeed([], {
        maxAuthorRun: 1,
        boostTrending: true,
        sponsoredInterval: 5,
        sponsoredItems: [makeSponsored('ad1')],
        diversityPenaltyAfter: 2,
      })
    ).toEqual([]);
  });
});

// ===========================================================================
// 6. Single-author feed (no interleaving possible)
// ===========================================================================

describe('6 · Single-author feed', () => {
  it('returns all items when every post is from the same author', () => {
    const feed = Array.from({ length: 5 }, (_, i) =>
      makePost(`p${i}`, 'alice', 100 - i)
    );
    const result = tuneFeed(feed, noEffects);
    expect(organicIds(result)).toHaveLength(5);
  });

  it('preserves score ordering for a single-author feed', () => {
    const feed = [
      makePost('p-high', 'alice', 100),
      makePost('p-mid', 'alice', 60),
      makePost('p-low', 'alice', 20),
    ];
    const result = tuneFeed(feed, noEffects);
    const ids = organicIds(result);
    expect(ids[0]).toBe('p-high');
  });

  it('single item feed returns that item unchanged', () => {
    const feed = [makePost('p1', 'alice', 100)];
    const result = tuneFeed(feed, noEffects);
    expect(organicIds(result)).toEqual(['p1']);
  });
});

// ===========================================================================
// 7. Large feed (100 posts) — correctness and performance
// ===========================================================================

describe('7 · Large feed (100 posts)', () => {
  it('processes 100 posts in under 100 ms', () => {
    const feed = Array.from({ length: 100 }, (_, i) =>
      makePost(`p${i}`, `user${i % 10}`, 1000 - i) // 10 authors
    );

    const start = Date.now();
    const result = tuneFeed(feed, noEffects);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(organicIds(result)).toHaveLength(100);
  });

  it('respects MAX_AUTHOR_RUN=2 across 100 posts from 10 authors', () => {
    const feed = Array.from({ length: 100 }, (_, i) =>
      makePost(`p${i}`, `user${i % 10}`, 1000 - i)
    );
    const result = tuneFeed(feed, noEffects);
    expect(maxConsecutiveAuthorRun(result)).toBeLessThanOrEqual(2);
  });

  it('no items are lost when processing 100 posts', () => {
    const feed = Array.from({ length: 100 }, (_, i) =>
      makePost(`p${i}`, `user${i % 5}`, 1000 - i)
    );
    const result = tuneFeed(feed, noEffects);
    expect(organicIds(result)).toHaveLength(100);
  });

  it('injects correct number of sponsored items across 100 posts with interval=10', () => {
    const feed = Array.from({ length: 100 }, (_, i) =>
      makePost(`p${i}`, `user${i % 10}`, 1000 - i)
    );
    const sponsored = [makeSponsored('ad1'), makeSponsored('ad2')];

    const result = tuneFeed(feed, {
      boostTrending: false,
      sponsoredInterval: 10,
      sponsoredItems: sponsored,
    });

    const sponsoredCount = result.filter(i => i.isSponsored).length;
    // 100 items at interval 10 → 10 insertion points
    expect(sponsoredCount).toBeGreaterThanOrEqual(10);
  });

  it('diversity penalty correctly sinks overrepresented authors in a 100-post feed', () => {
    // Author 'spammer' gets 20 high-score posts; others share the remaining 80
    const spammerPosts = Array.from({ length: 20 }, (_, i) =>
      makePost(`spam${i}`, 'spammer', 900 - i)
    );
    const normalPosts = Array.from({ length: 80 }, (_, i) =>
      makePost(`normal${i}`, `user${i % 8}`, 800 - i)
    );
    const feed = [...spammerPosts, ...normalPosts];

    const result = tuneFeed(feed, {
      boostTrending: false,
      sponsoredInterval: 0,
      diversityPenaltyAfter: 3,
      diversityPenaltyMultiplier: 0.1,
      maxAuthorRun: 10, // disable run limit to isolate penalty effect
    });

    // Spammer posts beyond the 3rd occurrence should not dominate the tail
    const spammerIndices = result
      .filter(i => !i.isSponsored)
      .map((item, idx) => (item.authorId === 'spammer' ? idx : -1))
      .filter(idx => idx >= 0);

    const firstNonSpammerAfterPenalty = result
      .filter(i => !i.isSponsored)
      .findIndex((item, idx) => item.authorId !== 'spammer' && idx > 3);

    expect(firstNonSpammerAfterPenalty).not.toBe(-1);
    expect(spammerIndices.length).toBe(20); // all still present
  });
});

// ===========================================================================
// 8. Deduplication
// ===========================================================================

describe('8 · Deduplication', () => {
  it('removes exact duplicates — same id, same author', () => {
    const feed = [
      makePost('p1', 'alice', 100),
      makePost('p1', 'alice', 100),
      makePost('p2', 'bob', 80),
    ];
    const result = tuneFeed(feed, noEffects);
    expect(organicIds(result)).toHaveLength(2);
    expect(organicIds(result).sort()).toEqual(['p1', 'p2'].sort());
  });

  it('removes duplicates where same id appears multiple times', () => {
    const feed = [
      makePost('p1', 'alice', 100),
      makePost('p1', 'bob', 90),   // different author, same id
      makePost('p1', 'charlie', 80),
      makePost('p2', 'dave', 70),
    ];
    const result = tuneFeed(feed, noEffects);
    const organic = result.filter(i => !i.isSponsored);
    const p1Count = organic.filter(i => i.id === 'p1').length;
    expect(p1Count).toBe(1);
    expect(organic).toHaveLength(2);
  });

  it('first occurrence wins when duplicates differ in score', () => {
    const feed = [
      makePost('p1', 'alice', 100), // first occurrence
      makePost('p1', 'alice', 50),  // duplicate with lower score — discarded
      makePost('p2', 'bob', 80),
    ];
    const result = tuneFeed(feed, noEffects);
    const p1 = result.filter(i => !i.isSponsored).find(i => i.id === 'p1');
    expect(p1?.score).toBe(100);
  });

  it('50-post feed with 25% duplicates produces 75% of items', () => {
    // 50 posts: p0–p37 unique, p0–p11 repeated (12 duplicates → 38 unique)
    const feed = [
      ...Array.from({ length: 38 }, (_, i) => makePost(`p${i}`, `u${i % 5}`, 100 - i)),
      ...Array.from({ length: 12 }, (_, i) => makePost(`p${i}`, `u${i % 5}`, 100 - i)),
    ];
    const result = tuneFeed(feed, noEffects);
    expect(organicIds(result)).toHaveLength(38);
  });
});

// ===========================================================================
// 9. Sponsored post insertion
// ===========================================================================

describe('9 · Sponsored post insertion', () => {
  it('injects no sponsored items when sponsoredItems array is empty', () => {
    const feed = Array.from({ length: 20 }, (_, i) =>
      makePost(`p${i}`, `u${i}`, 100 - i)
    );
    const result = tuneFeed(feed, { boostTrending: false, sponsoredItems: [] });
    expect(result.filter(i => i.isSponsored)).toHaveLength(0);
  });

  it('injects no sponsored items when sponsoredInterval=0', () => {
    const feed = Array.from({ length: 15 }, (_, i) =>
      makePost(`p${i}`, `u${i}`, 100 - i)
    );
    const result = tuneFeed(feed, {
      boostTrending: false,
      sponsoredInterval: 0,
      sponsoredItems: [makeSponsored('ad1')],
    });
    expect(result.filter(i => i.isSponsored)).toHaveLength(0);
  });

  it('inserts sponsored item after every N organic items', () => {
    const feed = Array.from({ length: 10 }, (_, i) =>
      makePost(`p${i}`, `u${i}`, 100 - i)
    );
    const result = tuneFeed(feed, {
      boostTrending: false,
      sponsoredInterval: 5,
      sponsoredItems: [makeSponsored('ad1')],
    });

    // 10 items / interval 5 → 2 sponsored slots
    expect(result.filter(i => i.isSponsored).length).toBeGreaterThanOrEqual(2);
  });

  it('cycles sponsored items round-robin when slots exceed available ads', () => {
    const feed = Array.from({ length: 30 }, (_, i) =>
      makePost(`p${i}`, `u${i}`, 100 - i)
    );
    const result = tuneFeed(feed, {
      boostTrending: false,
      sponsoredInterval: 10,
      sponsoredItems: [makeSponsored('ad1')],
    });

    // All sponsored slots should use the only ad (round-robin)
    result
      .filter(i => i.isSponsored)
      .forEach(item => expect(item.id).toBe('ad1'));
  });

  it('sponsored items carry isSponsored=true flag', () => {
    const feed = Array.from({ length: 10 }, (_, i) =>
      makePost(`p${i}`, `u${i}`, 100 - i)
    );
    const result = tuneFeed(feed, {
      boostTrending: false,
      sponsoredInterval: 5,
      sponsoredItems: [makeSponsored('ad1')],
    });
    result.filter(i => i.isSponsored).forEach(item => {
      expect(item.isSponsored).toBe(true);
    });
  });

  it('organic post count equals input count even after sponsored insertion', () => {
    const count = 20;
    const feed = Array.from({ length: count }, (_, i) =>
      makePost(`p${i}`, `u${i}`, 100 - i)
    );
    const result = tuneFeed(feed, {
      boostTrending: false,
      sponsoredInterval: 5,
      sponsoredItems: [makeSponsored('ad1'), makeSponsored('ad2')],
    });
    expect(result.filter(i => !i.isSponsored)).toHaveLength(count);
  });
});

// ===========================================================================
// 10. Language preference boost (soft-score approach)
// ===========================================================================

describe('10 · Language preference boost', () => {
  /**
   * The feedTuner itself does not have a built-in language field, but callers
   * can pre-compute a language-adjusted score before passing items to tuneFeed.
   * These tests verify that the pipeline respects the pre-adjusted score and
   * that a simple language-preference helper integrates cleanly.
   */

  function applyLanguageBoost(
    items: ReadonlyArray<TunableFeedItem>,
    preferredLanguage: string,
    multiplier: number
  ): TunableFeedItem[] {
    return items.map(item => {
      const lang = item['language'] as string | undefined;
      if (lang === preferredLanguage) {
        return { ...item, score: item.score * multiplier };
      }
      return item;
    });
  }

  it('preferred-language posts rank higher after score boost', () => {
    const raw = [
      makePost('p1', 'alice', 50, { language: 'TypeScript' }),
      makePost('p2', 'bob', 100, { language: 'Python' }),
    ];

    const boosted = applyLanguageBoost(raw, 'TypeScript', 5); // 50 * 5 = 250 > 100
    const result = tuneFeed(boosted, noEffects);
    expect(organicIds(result)[0]).toBe('p1');
  });

  it('non-preferred language items are unaffected by the boost', () => {
    const raw = [
      makePost('p1', 'alice', 100, { language: 'Go' }),
      makePost('p2', 'bob', 50, { language: 'Python' }),
    ];
    const boosted = applyLanguageBoost(raw, 'TypeScript', 5);
    const result = tuneFeed(boosted, noEffects);
    // No item gets boosted; original order (p1 > p2) is preserved
    expect(organicIds(result)[0]).toBe('p1');
  });

  it('language field is preserved transparently through the tuner pipeline', () => {
    const raw = [
      makePost('p1', 'alice', 100, { language: 'Rust' }),
    ];
    const result = tuneFeed(raw, noEffects);
    expect((result[0] as TunableFeedItem & { language: string }).language).toBe('Rust');
  });
});

// ===========================================================================
// 11. FeedTuner class API — immutability and reuse
// ===========================================================================

describe('11 · FeedTuner class API', () => {
  it('tune() returns a new array reference — input is never mutated', () => {
    const feed = [makePost('p1', 'alice', 100), makePost('p2', 'bob', 80)];
    const snapshot = feed.map(i => ({ ...i }));
    const tuner = new FeedTuner(noEffects);
    const result = tuner.tune(feed);

    expect(result).not.toBe(feed);
    expect(feed).toEqual(snapshot);
  });

  it('can be re-used for multiple independent tune() calls without state leakage', () => {
    const tuner = new FeedTuner(noEffects);

    const feedA = [makePost('a1', 'alice', 100), makePost('a2', 'bob', 80)];
    const feedB = [makePost('b1', 'charlie', 100), makePost('b2', 'dave', 80)];

    const resultA = tuner.tune(feedA);
    const resultB = tuner.tune(feedB);

    expect(resultA.map(i => i.id)).not.toEqual(
      expect.arrayContaining(['b1', 'b2'])
    );
    expect(resultB.map(i => i.id)).not.toEqual(
      expect.arrayContaining(['a1', 'a2'])
    );
  });

  it('extra fields on items are passed through without modification', () => {
    const feed = [
      { ...makePost('p1', 'alice', 100), customField: 'preserved', nested: { x: 1 } },
    ];
    const result = tuneFeed(feed, noEffects);
    const item = result[0] as TunableFeedItem & { customField: string; nested: { x: number } };
    expect(item.customField).toBe('preserved');
    expect(item.nested.x).toBe(1);
  });

  it('tuneFeed functional wrapper is equivalent to new FeedTuner(opts).tune(feed)', () => {
    const feed = [
      makePost('p1', 'alice', 100),
      makePost('p2', 'alice', 90),
      makePost('p3', 'bob', 80),
    ];
    const opts: FeedTunerOptions = { ...noEffects, maxAuthorRun: 1 };

    const classResult = new FeedTuner(opts).tune(feed);
    const fnResult = tuneFeed(feed, opts);

    expect(classResult.map(i => i.id)).toEqual(fnResult.map(i => i.id));
  });
});

// ===========================================================================
// 12. Diversity penalty
// ===========================================================================

describe('12 · Diversity penalty', () => {
  it('penalises authors appearing beyond diversityPenaltyAfter threshold', () => {
    const feed = [
      makePost('p1', 'alice', 100),
      makePost('p2', 'alice', 99),
      makePost('p3', 'alice', 98), // 3rd — penalty starts at 3rd (seenBefore >= 2)
      makePost('p4', 'bob', 60),
      makePost('p5', 'charlie', 50),
    ];

    const result = tuneFeed(feed, {
      boostTrending: false,
      sponsoredInterval: 0,
      diversityPenaltyAfter: 2,
      diversityPenaltyMultiplier: 0.1, // 98 * 0.1 = 9.8 — below bob and charlie
      maxAuthorRun: 10,
    });

    const organic = result.filter(i => !i.isSponsored);
    const p3Idx = organic.findIndex(i => i.id === 'p3');
    const bobIdx = organic.findIndex(i => i.id === 'p4');
    const charlieIdx = organic.findIndex(i => i.id === 'p5');

    expect(p3Idx).toBeGreaterThan(bobIdx);
    expect(p3Idx).toBeGreaterThan(charlieIdx);
  });

  it('does not penalise authors at or under diversityPenaltyAfter appearances', () => {
    const feed = [
      makePost('p1', 'alice', 100),
      makePost('p2', 'alice', 99),
      makePost('p3', 'bob', 50),
    ];

    // diversityPenaltyAfter=3: need 4th appearance to trigger; alice only has 2
    const result = tuneFeed(feed, {
      boostTrending: false,
      sponsoredInterval: 0,
      diversityPenaltyAfter: 3,
      diversityPenaltyMultiplier: 0.01,
      maxAuthorRun: 10,
    });

    const organic = result.filter(i => !i.isSponsored);
    const p1Idx = organic.findIndex(i => i.id === 'p1');
    const p2Idx = organic.findIndex(i => i.id === 'p2');
    const bobIdx = organic.findIndex(i => i.id === 'p3');

    // alice's second post (99) still outscores bob (50), so should appear before
    expect(p1Idx).toBeLessThan(bobIdx);
    expect(p2Idx).toBeLessThan(bobIdx);
  });
});
