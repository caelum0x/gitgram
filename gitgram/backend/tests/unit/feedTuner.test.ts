/**
 * Unit tests for feedTuner.ts
 *
 * Covers:
 *  - Empty feed handling
 *  - MAX_AUTHOR_RUN enforcement (default = 2, configurable)
 *  - Content-type interleaving (post/snippet vs repo/reel)
 *  - Sponsored item injection every N posts
 *  - Trending boost score adjustment
 *  - Diversity penalty for repeat authors
 *  - Deduplication by id
 *  - FeedTuner class construction and tune() method
 *  - tuneFeed() functional API
 *
 * Strategy: all tests operate purely on in-memory data — no Prisma or Redis
 * calls.  `trendingAlgorithmService` is mocked so trending score computation
 * is deterministic.
 */

// ---------------------------------------------------------------------------
// Module mocks — declared before any imports that touch these modules
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
} from '../../src/services/feedTuner';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockedComputeTrendingScore = computeTrendingScore as jest.MockedFunction<
  typeof computeTrendingScore
>;

function makePost(
  id: string,
  authorId: string | null,
  score: number,
  overrides: Partial<TunableFeedItem> = {}
): TunableFeedItem {
  return {
    id,
    type: 'post',
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

function makeRepo(
  id: string,
  authorId: string | null,
  score: number
): TunableFeedItem {
  return makePost(id, authorId, score, { type: 'repo' });
}

function makeReel(
  id: string,
  authorId: string | null,
  score: number
): TunableFeedItem {
  return makePost(id, authorId, score, { type: 'reel' });
}

function makeSnippet(
  id: string,
  authorId: string | null,
  score: number
): TunableFeedItem {
  return makePost(id, authorId, score, { type: 'snippet' });
}

function makeSponsored(id: string): SponsoredItem {
  return {
    id,
    type: 'post',
    authorId: null,
    score: 0,
    isSponsored: true,
    adId: `ad-${id}`,
    title: 'Test Ad',
    content: 'Buy our product',
    targetUrl: 'https://example.com',
    mediaUrl: null,
  };
}

/** Extract the authorId sequence from a result array for easy assertion. */
function authorSequence(items: TunableFeedItem[]): Array<string | null> {
  return items.map(i => i.authorId);
}

/** Count how many times authorId appears consecutively — returns max run length. */
function maxConsecutiveAuthorRun(items: TunableFeedItem[]): number {
  let maxRun = 0;
  let currentRun = 1;

  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1];
    const curr = items[i];

    if (
      curr.authorId !== null &&
      prev.authorId !== null &&
      curr.authorId === prev.authorId &&
      !curr.isSponsored &&
      !prev.isSponsored
    ) {
      currentRun++;
      maxRun = Math.max(maxRun, currentRun);
    } else {
      currentRun = 1;
    }
  }

  return maxRun;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockedComputeTrendingScore.mockReturnValue(0);
});

// ── Empty feed ───────────────────────────────────────────────────────────────

describe('empty feed handling', () => {
  it('tuneFeed returns [] for an empty array', () => {
    expect(tuneFeed([])).toEqual([]);
  });

  it('FeedTuner#tune returns [] for an empty array', () => {
    const tuner = new FeedTuner();
    expect(tuner.tune([])).toEqual([]);
  });

  it('returns [] when options are provided but array is empty', () => {
    expect(tuneFeed([], { maxAuthorRun: 1, boostTrending: true })).toEqual([]);
  });
});

// ── MAX_AUTHOR_RUN enforcement ───────────────────────────────────────────────

describe('MAX_AUTHOR_RUN enforcement', () => {
  it('does not reorder when no author appears more than maxAuthorRun times consecutively', () => {
    const feed = [
      makePost('p1', 'alice', 100),
      makePost('p2', 'alice', 90),
      makePost('p3', 'bob', 80),
    ];
    const result = tuneFeed(feed, { sponsoredInterval: 0, boostTrending: false });

    // alice appears twice in a row — that is exactly the default limit
    expect(maxConsecutiveAuthorRun(result.filter(i => !i.isSponsored))).toBeLessThanOrEqual(2);
  });

  it('enforces default MAX_AUTHOR_RUN=2: a third consecutive post from same author is deferred', () => {
    const feed = [
      makePost('p1', 'alice', 100),
      makePost('p2', 'alice', 99),
      makePost('p3', 'alice', 98), // third consecutive — should be deferred
      makePost('p4', 'bob', 50),
    ];

    const result = tuneFeed(feed, { sponsoredInterval: 0, boostTrending: false });
    const nonSponsored = result.filter(i => !i.isSponsored);

    expect(maxConsecutiveAuthorRun(nonSponsored)).toBeLessThanOrEqual(2);
    // All original items should still be present
    expect(nonSponsored.map(i => i.id).sort()).toEqual(['p1', 'p2', 'p3', 'p4'].sort());
  });

  it('enforces maxAuthorRun=1 when there are sufficient interleaving items', () => {
    // With 2 alice and 2 bob posts, maxAuthorRun=1 can be fully satisfied
    const feed = [
      makePost('p1', 'alice', 100),
      makePost('p2', 'alice', 90),
      makePost('p3', 'bob', 80),
      makePost('p4', 'bob', 70),
    ];

    const result = tuneFeed(feed, {
      maxAuthorRun: 1,
      sponsoredInterval: 0,
      boostTrending: false,
    });
    const nonSponsored = result.filter(i => !i.isSponsored);

    expect(maxConsecutiveAuthorRun(nonSponsored)).toBeLessThanOrEqual(1);
    expect(nonSponsored.map(i => i.id).sort()).toEqual(['p1', 'p2', 'p3', 'p4'].sort());
  });

  it('defers same-author excess and interleaves when possible, appending remainder', () => {
    // 3 alice posts + 1 bob: the tuner can interleave 1 bob, then 2 alices must
    // appear consecutively at the tail (no other authors available to break the run).
    const feed = [
      makePost('p1', 'alice', 100),
      makePost('p2', 'alice', 90),
      makePost('p3', 'alice', 80),
      makePost('p4', 'bob', 50),
    ];

    const result = tuneFeed(feed, {
      maxAuthorRun: 1,
      sponsoredInterval: 0,
      boostTrending: false,
    });
    const nonSponsored = result.filter(i => !i.isSponsored);

    // All items must be preserved
    expect(nonSponsored.map(i => i.id).sort()).toEqual(['p1', 'p2', 'p3', 'p4'].sort());
    // The leading portion (before we run out of breaker items) must respect the limit
    // alice, bob, alice is the best the algorithm can achieve; last alice-alice run
    // is unavoidable with only one non-alice item
    expect(nonSponsored[0].authorId).toBe('alice');
    expect(nonSponsored[1].authorId).toBe('bob');
  });

  it('preserves all items even when every post is from the same author', () => {
    // When only one author exists, the run limit cannot be enforced — but all items
    // must still be present in the output.
    const feed = [
      makePost('p1', 'alice', 100),
      makePost('p2', 'alice', 90),
      makePost('p3', 'alice', 80),
      makePost('p4', 'alice', 70),
      makePost('p5', 'alice', 60),
    ];

    const result = tuneFeed(feed, { sponsoredInterval: 0, boostTrending: false });
    const nonSponsored = result.filter(i => !i.isSponsored);

    // All items present — that is the hard guarantee
    expect(nonSponsored).toHaveLength(5);
    expect(nonSponsored.map(i => i.id).sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'].sort());
  });

  it('treats null authorId items as always safe to insert consecutively', () => {
    const feed = [
      makePost('p1', null, 100),
      makePost('p2', null, 90),
      makePost('p3', null, 80),
    ];
    const result = tuneFeed(feed, { sponsoredInterval: 0, boostTrending: false });
    // null authorId should not trigger author run limits
    expect(result.filter(i => !i.isSponsored)).toHaveLength(3);
  });
});

// ── Content-type interleaving ────────────────────────────────────────────────

describe('content type interleaving', () => {
  it('interleaves repo items into a post-heavy feed', () => {
    const feed = [
      makePost('p1', 'alice', 100),
      makePost('p2', 'alice', 90),
      makePost('p3', 'bob', 80),
      makePost('p4', 'charlie', 70),
      makePost('p5', 'dave', 60),
      makePost('p6', 'eve', 50),
      makeRepo('r1', 'org1', 40),
      makeRepo('r2', 'org2', 30),
    ];

    const result = tuneFeed(feed, { sponsoredInterval: 0, boostTrending: false });

    // The two repos should appear somewhere in the middle of the feed, not both
    // clumped at the very end
    const repoIndices = result
      .filter(i => !i.isSponsored)
      .map((item, idx) => ({ idx, type: item.type }))
      .filter(entry => entry.type === 'repo')
      .map(entry => entry.idx);

    // At least one repo should appear before the last position
    const lastIndex = result.filter(i => !i.isSponsored).length - 1;
    expect(repoIndices.some(i => i < lastIndex)).toBe(true);
  });

  it('preserves all items through interleaving', () => {
    const feed = [
      makePost('p1', 'alice', 100),
      makePost('p2', 'bob', 80),
      makeRepo('r1', 'org', 60),
      makeReel('v1', 'charlie', 50),
      makeSnippet('s1', 'dave', 40),
    ];

    const result = tuneFeed(feed, { sponsoredInterval: 0, boostTrending: false });
    const nonSponsored = result.filter(i => !i.isSponsored);

    expect(nonSponsored.map(i => i.id).sort()).toEqual(['p1', 'p2', 'r1', 's1', 'v1'].sort());
  });

  it('handles a feed with only repos and reels', () => {
    const feed = [
      makeRepo('r1', 'org1', 100),
      makeReel('v1', 'alice', 90),
      makeRepo('r2', 'org2', 80),
    ];

    const result = tuneFeed(feed, { sponsoredInterval: 0, boostTrending: false });
    expect(result.filter(i => !i.isSponsored)).toHaveLength(3);
  });

  it('handles a feed with only posts', () => {
    const feed = [
      makePost('p1', 'alice', 100),
      makePost('p2', 'bob', 90),
    ];
    const result = tuneFeed(feed, { sponsoredInterval: 0, boostTrending: false });
    expect(result.filter(i => !i.isSponsored)).toHaveLength(2);
  });
});

// ── Sponsored content injection ──────────────────────────────────────────────

describe('sponsored content injection', () => {
  it('injects a sponsored item every 10 posts by default', () => {
    const feed = Array.from({ length: 20 }, (_, i) =>
      makePost(`p${i}`, `user${i}`, 100 - i)
    );
    const sponsored = [makeSponsored('ad1'), makeSponsored('ad2')];

    const result = tuneFeed(feed, { boostTrending: false, sponsoredItems: sponsored });
    const sponsoredInResult = result.filter(i => i.isSponsored);

    // 20 posts → 2 insertion points (at position 10 and 20)
    expect(sponsoredInResult.length).toBeGreaterThanOrEqual(2);
  });

  it('injects no sponsored content when sponsoredItems is empty', () => {
    const feed = Array.from({ length: 20 }, (_, i) =>
      makePost(`p${i}`, `user${i}`, 100 - i)
    );

    const result = tuneFeed(feed, { boostTrending: false, sponsoredItems: [] });
    expect(result.filter(i => i.isSponsored)).toHaveLength(0);
  });

  it('injects no sponsored content when sponsoredInterval is 0', () => {
    const feed = Array.from({ length: 15 }, (_, i) =>
      makePost(`p${i}`, `user${i}`, 100 - i)
    );
    const sponsored = [makeSponsored('ad1')];

    const result = tuneFeed(feed, {
      boostTrending: false,
      sponsoredInterval: 0,
      sponsoredItems: sponsored,
    });
    expect(result.filter(i => i.isSponsored)).toHaveLength(0);
  });

  it('cycles through sponsored items round-robin when there are more slots than ads', () => {
    const feed = Array.from({ length: 30 }, (_, i) =>
      makePost(`p${i}`, `user${i}`, 100 - i)
    );
    const sponsored = [makeSponsored('ad1')];

    const result = tuneFeed(feed, {
      boostTrending: false,
      sponsoredInterval: 10,
      sponsoredItems: sponsored,
    });

    const sponsoredInResult = result.filter(i => i.isSponsored);
    // 30 posts / interval 10 = 3 slots; all should be 'ad1'
    expect(sponsoredInResult.length).toBeGreaterThanOrEqual(3);
    sponsoredInResult.forEach(item => expect(item.id).toBe('ad1'));
  });

  it('sponsored item appears at the correct position', () => {
    const feed = Array.from({ length: 10 }, (_, i) =>
      makePost(`p${i}`, `user${i}`, 100 - i)
    );
    const sponsored = [makeSponsored('ad1')];

    const result = tuneFeed(feed, {
      boostTrending: false,
      sponsoredInterval: 10,
      sponsoredItems: sponsored,
    });

    // After 10 non-sponsored items the ad should appear
    const nonSponsoredBeforeAd = result
      .slice(0, result.findIndex(i => i.isSponsored))
      .filter(i => !i.isSponsored).length;

    expect(nonSponsoredBeforeAd).toBe(10);
  });
});

// ── Trending boost ───────────────────────────────────────────────────────────

describe('trending boost', () => {
  it('boosts items with a high trendingScore so they rank earlier', () => {
    // Low base score but high explicit trendingScore
    const lowScoreHighTrend = makePost('p-trend', 'bob', 10, {
      trendingScore: 200,
    });
    // High base score but no trending
    const highScoreLowTrend = makePost('p-normal', 'alice', 100, {
      trendingScore: 0,
    });

    const feed = [highScoreLowTrend, lowScoreHighTrend];

    const result = tuneFeed(feed, {
      boostTrending: true,
      trendingBoostThreshold: 50,
      trendingBoostMultiplier: 20, // large multiplier to guarantee re-ordering
      sponsoredInterval: 0,
    });

    const nonSponsored = result.filter(i => !i.isSponsored);
    expect(nonSponsored[0].id).toBe('p-trend');
  });

  it('does not boost items below the trendingBoostThreshold', () => {
    const feed = [
      makePost('p-normal', 'alice', 100, { trendingScore: 10 }),
      makePost('p-low', 'bob', 50, { trendingScore: 5 }),
    ];

    const result = tuneFeed(feed, {
      boostTrending: true,
      trendingBoostThreshold: 50,
      trendingBoostMultiplier: 5,
      sponsoredInterval: 0,
    });

    const nonSponsored = result.filter(i => !i.isSponsored);
    // Neither crosses the threshold; order should remain by original score
    expect(nonSponsored[0].id).toBe('p-normal');
  });

  it('calls computeTrendingScore when trendingScore field is absent', () => {
    mockedComputeTrendingScore.mockReturnValue(100);

    const feed = [
      makePost('p1', 'alice', 80),
      makePost('p2', 'bob', 60),
    ];

    tuneFeed(feed, {
      boostTrending: true,
      trendingBoostThreshold: 50,
      trendingBoostMultiplier: 2,
      sponsoredInterval: 0,
    });

    expect(mockedComputeTrendingScore).toHaveBeenCalled();
  });

  it('skips trending computation entirely when boostTrending=false', () => {
    const feed = [
      makePost('p1', 'alice', 80),
      makePost('p2', 'bob', 60),
    ];

    tuneFeed(feed, { boostTrending: false, sponsoredInterval: 0 });

    expect(mockedComputeTrendingScore).not.toHaveBeenCalled();
  });
});

// ── Diversity penalty ────────────────────────────────────────────────────────

describe('diversity penalty', () => {
  it('applies score penalty to authors appearing more than diversityPenaltyAfter times', () => {
    // alice appears 4 times with high scores; without penalty she would dominate.
    // diversityPenaltyAfter=2 means the 3rd and 4th occurrences are penalised
    // (seenBefore >= 2 when processing p3 and p4).
    const feed = [
      makePost('p1', 'alice', 100),
      makePost('p2', 'alice', 99),
      makePost('p3', 'alice', 98),  // 3rd — seenBefore=2 → penalty
      makePost('p4', 'alice', 97),  // 4th — seenBefore=3 → penalty
      makePost('p5', 'bob', 60),
      makePost('p6', 'charlie', 50),
    ];

    const result = tuneFeed(feed, {
      boostTrending: false,
      sponsoredInterval: 0,
      diversityPenaltyAfter: 2,
      diversityPenaltyMultiplier: 0.1, // very aggressive: 98*0.1=9.8, 97*0.1=9.7
      maxAuthorRun: 10, // disable author-run so we see pure score effect
    });

    const nonSponsored = result.filter(i => !i.isSponsored);
    // alice's 3rd and 4th posts (penalised to ~9.8, 9.7) should appear after
    // bob (60) and charlie (50)
    const aliceIndices = nonSponsored
      .map((item, idx) => ({ idx, id: item.id }))
      .filter(e => e.id === 'p3' || e.id === 'p4')
      .map(e => e.idx);

    const bobIdx = nonSponsored.findIndex(i => i.id === 'p5');
    const charlieIdx = nonSponsored.findIndex(i => i.id === 'p6');

    expect(aliceIndices.every(i => i > bobIdx && i > charlieIdx)).toBe(true);
  });

  it('does not penalise authors appearing at or under diversityPenaltyAfter times', () => {
    // diversityPenaltyAfter=3: seenBefore must reach 3 before penalty triggers,
    // so the 1st (seenBefore=0), 2nd (1), and 3rd (2) appearances are safe.
    const feed = [
      makePost('p1', 'alice', 100),
      makePost('p2', 'alice', 99), // 2nd appearance — seenBefore=1, no penalty
      makePost('p3', 'alice', 98), // 3rd appearance — seenBefore=2, no penalty
      makePost('p4', 'bob', 50),
    ];

    const result = tuneFeed(feed, {
      boostTrending: false,
      sponsoredInterval: 0,
      diversityPenaltyAfter: 3,
      diversityPenaltyMultiplier: 0.1,
      maxAuthorRun: 10,
    });

    const nonSponsored = result.filter(i => !i.isSponsored);
    // alice's 2nd and 3rd posts still outscore bob, so should appear before bob
    const aliceP2Idx = nonSponsored.findIndex(i => i.id === 'p2');
    const aliceP3Idx = nonSponsored.findIndex(i => i.id === 'p3');
    const bobIdx = nonSponsored.findIndex(i => i.id === 'p4');
    expect(aliceP2Idx).toBeLessThan(bobIdx);
    expect(aliceP3Idx).toBeLessThan(bobIdx);
  });
});

// ── Deduplication ────────────────────────────────────────────────────────────

describe('deduplication', () => {
  it('removes duplicate ids, keeping the first occurrence', () => {
    const feed = [
      makePost('p1', 'alice', 100),
      makePost('p1', 'alice', 100), // exact duplicate
      makePost('p2', 'bob', 80),
    ];

    const result = tuneFeed(feed, { sponsoredInterval: 0, boostTrending: false });
    const nonSponsored = result.filter(i => !i.isSponsored);

    expect(nonSponsored).toHaveLength(2);
    expect(nonSponsored.map(i => i.id)).toEqual(['p1', 'p2']);
  });
});

// ── FeedTuner class API ──────────────────────────────────────────────────────

describe('FeedTuner class', () => {
  it('tune() returns a new array and does not mutate input', () => {
    const feed = [
      makePost('p1', 'alice', 100),
      makePost('p2', 'bob', 80),
    ];
    const original = [...feed];

    const tuner = new FeedTuner({ sponsoredInterval: 0, boostTrending: false });
    const result = tuner.tune(feed);

    expect(result).not.toBe(feed);
    expect(feed).toEqual(original); // original unchanged
  });

  it('respects constructor options', () => {
    // Equal number of alice and bob posts so maxAuthorRun=1 can be fully satisfied
    const feed = [
      makePost('p1', 'alice', 100),
      makePost('p2', 'alice', 99),
      makePost('p3', 'bob', 80),
      makePost('p4', 'bob', 70),
    ];

    const tuner = new FeedTuner({
      maxAuthorRun: 1,
      sponsoredInterval: 0,
      boostTrending: false,
    });

    const result = tuner.tune(feed);
    const nonSponsored = result.filter(i => !i.isSponsored);

    expect(maxConsecutiveAuthorRun(nonSponsored)).toBeLessThanOrEqual(1);
    expect(nonSponsored.map(i => i.id).sort()).toEqual(['p1', 'p2', 'p3', 'p4'].sort());
  });

  it('can be re-used across multiple tune() calls without state leakage', () => {
    const tuner = new FeedTuner({ sponsoredInterval: 0, boostTrending: false });

    const feedA = [makePost('a1', 'alice', 100), makePost('a2', 'bob', 80)];
    const feedB = [makePost('b1', 'charlie', 100), makePost('b2', 'dave', 80)];

    const resultA = tuner.tune(feedA);
    const resultB = tuner.tune(feedB);

    expect(resultA.map(i => i.id)).not.toEqual(expect.arrayContaining(['b1', 'b2']));
    expect(resultB.map(i => i.id)).not.toEqual(expect.arrayContaining(['a1', 'a2']));
  });
});

// ── tuneFeed functional API ──────────────────────────────────────────────────

describe('tuneFeed functional API', () => {
  it('returns a new array', () => {
    const feed = [makePost('p1', 'alice', 100)];
    const result = tuneFeed(feed, { sponsoredInterval: 0, boostTrending: false });
    expect(result).not.toBe(feed);
  });

  it('works without options argument', () => {
    const feed = [makePost('p1', 'alice', 100), makePost('p2', 'bob', 80)];
    expect(() => tuneFeed(feed)).not.toThrow();
  });

  it('preserves extra fields on items', () => {
    const feed = [
      { ...makePost('p1', 'alice', 100), customField: 'hello' },
    ];

    const result = tuneFeed(feed, { sponsoredInterval: 0, boostTrending: false });
    expect((result[0] as TunableFeedItem & { customField: string }).customField).toBe('hello');
  });
});
