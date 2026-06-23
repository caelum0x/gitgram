/**
 * Unit tests for searchRankingService
 *
 * All functions are pure (no I/O, no Prisma, no Redis), so no mocks are needed.
 * Tests cover ranking signals, edge cases, and the result combiner.
 */

import {
  rankUsers,
  rankRepositories,
  rankPosts,
  rankSnippets,
  combineResults,
  extractSearchTerms,
  User,
  Repository,
  Post,
  Snippet,
  RankedUser,
  RankedRepository,
  RankedPost,
  RankedSnippet,
  SearchResult,
} from '../../src/services/searchRankingService';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    username: 'alice',
    displayName: 'Alice Smith',
    bio: 'Software engineer',
    avatar: null,
    _count: { followers: 0, following: 0, posts: 0 },
    isFollowedByViewer: false,
    isFollowingViewer: false,
    ...overrides,
  };
}

function makeRepo(overrides: Partial<Repository> = {}): Repository {
  return {
    id: 'repo-1',
    name: 'my-repo',
    description: 'A cool repository',
    stars: 0,
    language: 'TypeScript',
    updatedAt: new Date('2026-06-22T00:00:00.000Z'),
    isPrivate: false,
    ...overrides,
  };
}

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    content: 'Hello world from gitgram',
    createdAt: new Date('2026-06-22T00:00:00.000Z'),
    _count: { likes: 0, comments: 0 },
    ...overrides,
  };
}

function makeSnippet(overrides: Partial<Snippet> = {}): Snippet {
  return {
    id: 'snippet-1',
    title: 'My snippet',
    content: 'const x = 1;',
    language: 'typescript',
    createdAt: new Date('2026-06-22T00:00:00.000Z'),
    _count: { likes: 0, comments: 0 },
    ...overrides,
  };
}

// ===========================================================================
// extractSearchTerms
// ===========================================================================

describe('extractSearchTerms', () => {
  it('lowercases tokens', () => {
    expect(extractSearchTerms('TypeScript')).toContain('typescript');
  });

  it('removes stopwords', () => {
    const terms = extractSearchTerms('the best and worst');
    expect(terms).not.toContain('the');
    expect(terms).not.toContain('and');
    expect(terms).toContain('best');
    expect(terms).toContain('worst');
  });

  it('deduplicates tokens', () => {
    const terms = extractSearchTerms('foo foo bar foo');
    expect(terms.filter((t) => t === 'foo')).toHaveLength(1);
  });

  it('strips special characters', () => {
    const terms = extractSearchTerms('hello! world? test.');
    expect(terms).toContain('hello');
    expect(terms).toContain('world');
    expect(terms).toContain('test');
  });

  it('returns empty array for a stopword-only query', () => {
    expect(extractSearchTerms('the and or')).toEqual([]);
  });
});

// ===========================================================================
// rankUsers
// ===========================================================================

describe('rankUsers', () => {
  it('gives highest score to exact username match', () => {
    const users: User[] = [
      makeUser({ id: 'u1', username: 'alice' }),
      makeUser({ id: 'u2', username: 'alice_dev' }),
      makeUser({ id: 'u3', username: 'not_a_match' }),
    ];

    const ranked = rankUsers(users, 'alice');

    expect(ranked[0].id).toBe('u1');
  });

  it('prefix match outranks partial-contains match', () => {
    const users: User[] = [
      makeUser({ id: 'u1', username: 'xalicex' }),   // contains but does not start with
      makeUser({ id: 'u2', username: 'alice_dev' }), // startsWith
    ];

    const ranked = rankUsers(users, 'alice');

    expect(ranked[0].id).toBe('u2'); // starts-with wins (score 8 vs 4)
  });

  it('follower count boosts rank (higher followers → higher score)', () => {
    const low = makeUser({ id: 'u-low', username: 'dev_low', _count: { followers: 5 } });
    const high = makeUser({ id: 'u-high', username: 'dev_high', _count: { followers: 5000 } });

    const ranked = rankUsers([low, high], 'dev');

    expect(ranked[0].id).toBe('u-high');
  });

  it('mutual follow adds bonus to score', () => {
    const mutual = makeUser({
      id: 'u-mutual',
      username: 'mutual_friend',
      isFollowedByViewer: true,
      isFollowingViewer: true,
    });
    const notMutual = makeUser({
      id: 'u-solo',
      username: 'mutual_solo',
      isFollowedByViewer: false,
      isFollowingViewer: false,
    });

    const ranked = rankUsers([notMutual, mutual], 'mutual');

    expect(ranked[0].id).toBe('u-mutual');
  });

  it('display name match contributes to score', () => {
    // u1: username does NOT contain 'rust', display name does NOT contain 'rust' → score 0
    // u2: username does NOT contain 'rust', display name 'rust expert' contains 'rust' → score 5
    const noMatch = makeUser({ id: 'u1', username: 'janedoe', displayName: 'Jane Doe' });
    const byDisplayName = makeUser({ id: 'u2', username: 'xyzabc', displayName: 'rust expert' });

    const ranked = rankUsers([noMatch, byDisplayName], 'rust');

    expect(ranked[0].id).toBe('u2');
  });

  it('returns empty array for empty input', () => {
    expect(rankUsers([], 'test')).toEqual([]);
  });

  it('returns all users when none match query (preserves list)', () => {
    const users = [
      makeUser({ id: 'u1', username: 'foo' }),
      makeUser({ id: 'u2', username: 'bar' }),
    ];
    const ranked = rankUsers(users, 'zzz');
    expect(ranked).toHaveLength(2);
  });
});

// ===========================================================================
// rankRepositories
// ===========================================================================

describe('rankRepositories', () => {
  it('gives highest score to exact name match', () => {
    const repos: Repository[] = [
      makeRepo({ id: 'r1', name: 'typescript' }),
      makeRepo({ id: 'r2', name: 'typescript-utils' }),
      makeRepo({ id: 'r3', name: 'my-typescript-lib' }),
    ];

    const ranked = rankRepositories(repos, 'typescript');
    expect(ranked[0].id).toBe('r1');
  });

  it('stars count is the primary ranking signal', () => {
    const low = makeRepo({ id: 'r-low', name: 'react-helper', stars: 10 });
    const high = makeRepo({ id: 'r-high', name: 'react-utils', stars: 10000 });

    const ranked = rankRepositories([low, high], 'react');

    expect(ranked[0].id).toBe('r-high');
  });

  it('description match adds score', () => {
    const withDesc = makeRepo({
      id: 'r-desc',
      name: 'my-lib',
      description: 'A blazing fast graphql client',
      stars: 0,
    });
    const withoutDesc = makeRepo({
      id: 'r-nodesc',
      name: 'my-tool',
      description: null,
      stars: 0,
    });

    const ranked = rankRepositories([withoutDesc, withDesc], 'graphql');

    expect(ranked[0].id).toBe('r-desc');
  });

  it('recent activity secondary boost: recently updated beats stale', () => {
    const recent = makeRepo({
      id: 'r-recent',
      name: 'cool-project',
      stars: 100,
      updatedAt: new Date(), // today
    });
    const stale = makeRepo({
      id: 'r-stale',
      name: 'cool-tool',
      stars: 100,
      updatedAt: new Date('2020-01-01'), // >90 days ago → 0 boost
    });

    const ranked = rankRepositories([stale, recent], 'cool');
    expect(ranked[0].id).toBe('r-recent');
  });

  it('returns empty array for empty input', () => {
    expect(rankRepositories([], 'test')).toEqual([]);
  });
});

// ===========================================================================
// rankPosts
// ===========================================================================

describe('rankPosts', () => {
  it('exact phrase in content gives top score', () => {
    const exact = makePost({ id: 'p1', content: 'using rust for systems programming' });
    const partial = makePost({ id: 'p2', content: 'rust is good and systems are cool' });

    const ranked = rankPosts([partial, exact], 'rust for systems programming');

    expect(ranked[0].id).toBe('p1');
  });

  it('likes count is a primary engagement signal', () => {
    const popular = makePost({
      id: 'p-popular',
      content: 'open source contribution guide',
      _count: { likes: 5000 },
    });
    const unpopular = makePost({
      id: 'p-unpopular',
      content: 'open source contribution tips',
      _count: { likes: 1 },
    });

    const ranked = rankPosts([unpopular, popular], 'open source contribution');
    expect(ranked[0].id).toBe('p-popular');
  });

  it('recency decay applied: newer post outranks older post with same likes', () => {
    const newPost = makePost({
      id: 'p-new',
      content: 'test driven development practices',
      createdAt: new Date(), // today
      _count: { likes: 10 },
    });
    const oldPost = makePost({
      id: 'p-old',
      content: 'test driven development guide',
      createdAt: new Date('2025-01-01'), // >90 days ago
      _count: { likes: 10 },
    });

    const ranked = rankPosts([oldPost, newPost], 'test driven development');
    expect(ranked[0].id).toBe('p-new');
  });

  it('all query terms present (but not exact phrase) gets score 8', () => {
    const allTerms = makePost({
      id: 'p-all',
      content: 'typescript types strict mode',
    });
    const someTerms = makePost({
      id: 'p-some',
      content: 'typescript is great',
    });

    const ranked = rankPosts([someTerms, allTerms], 'typescript strict mode');
    expect(ranked[0].id).toBe('p-all');
  });

  it('returns empty array for empty input', () => {
    expect(rankPosts([], 'query')).toEqual([]);
  });
});

// ===========================================================================
// rankSnippets
// ===========================================================================

describe('rankSnippets', () => {
  it('language filter (query matches language) adds bonus', () => {
    const tsSnippet = makeSnippet({
      id: 's-ts',
      title: 'array helper',
      content: 'const arr = [1,2,3];',
      language: 'typescript',
    });
    const jsSnippet = makeSnippet({
      id: 's-js',
      title: 'array helper',
      content: 'const arr = [1,2,3];',
      language: 'javascript',
    });

    const ranked = rankSnippets([jsSnippet, tsSnippet], 'typescript');
    expect(ranked[0].id).toBe('s-ts');
  });

  it('title match adds bonus score', () => {
    const withTitle = makeSnippet({
      id: 's-title',
      title: 'debounce utility',
      content: 'function debounce() {}',
      language: 'javascript',
    });
    const withoutTitle = makeSnippet({
      id: 's-notitle',
      title: null,
      content: 'function debounce() {}',
      language: 'javascript',
    });

    const ranked = rankSnippets([withoutTitle, withTitle], 'debounce');
    expect(ranked[0].id).toBe('s-title');
  });

  it('likes signal applied: popular snippet ranks higher', () => {
    const popular = makeSnippet({
      id: 's-pop',
      content: 'quicksort implementation',
      _count: { likes: 200 },
    });
    const unpopular = makeSnippet({
      id: 's-unpop',
      content: 'quicksort algorithm',
      _count: { likes: 0 },
    });

    const ranked = rankSnippets([unpopular, popular], 'quicksort');
    expect(ranked[0].id).toBe('s-pop');
  });

  it('returns empty array for empty input', () => {
    expect(rankSnippets([], 'query')).toEqual([]);
  });
});

// ===========================================================================
// combineResults
// ===========================================================================

describe('combineResults', () => {
  it('merges results from multiple types into a single sorted list', () => {
    const users: RankedUser[] = [
      { ...makeUser({ id: 'u1', username: 'highscore' }), score: 15 },
    ];
    const repos: RankedRepository[] = [
      { ...makeRepo({ id: 'r1', name: 'midrepo' }), score: 8 },
    ];
    const posts: RankedPost[] = [
      { ...makePost({ id: 'p1' }), score: 5 },
    ];

    const results = combineResults([
      { type: 'user', items: users },
      { type: 'repository', items: repos },
      { type: 'post', items: posts },
    ]);

    expect(results).toHaveLength(3);
    expect(results[0].type).toBe('user');
    expect(results[0].score).toBe(15);
    expect(results[1].type).toBe('repository');
    expect(results[2].type).toBe('post');
  });

  it('caps total results at 20', () => {
    const manyUsers: RankedUser[] = Array.from({ length: 25 }, (_, i) => ({
      ...makeUser({ id: `u${i}`, username: `user${i}` }),
      score: 25 - i,
    }));

    const results = combineResults([{ type: 'user', items: manyUsers }]);
    expect(results.length).toBeLessThanOrEqual(20);
  });

  it('handles empty input arrays gracefully', () => {
    expect(combineResults([])).toEqual([]);
  });

  it('handles arrays where some types are empty', () => {
    const users: RankedUser[] = [
      { ...makeUser({ id: 'u1', username: 'alice' }), score: 10 },
    ];

    const results = combineResults([
      { type: 'user', items: users },
      { type: 'repository', items: [] },
      { type: 'post', items: [] },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('user');
  });

  it('preserves type tag on each SearchResult', () => {
    const snippets: RankedSnippet[] = [
      { ...makeSnippet({ id: 's1' }), score: 3 },
    ];

    const results = combineResults([{ type: 'snippet', items: snippets }]);
    expect(results[0].type).toBe('snippet');
    expect(results[0].item.id).toBe('s1');
    expect(results[0].score).toBe(3);
  });

  it('deduplicates by score ordering (highest scores first)', () => {
    const users: RankedUser[] = [
      { ...makeUser({ id: 'u-low', username: 'lowscore' }), score: 1 },
      { ...makeUser({ id: 'u-high', username: 'highscore' }), score: 20 },
      { ...makeUser({ id: 'u-mid', username: 'midscore' }), score: 10 },
    ];

    const results = combineResults([{ type: 'user', items: users }]);
    const scores = results.map((r) => r.score);

    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
    }
  });
});
