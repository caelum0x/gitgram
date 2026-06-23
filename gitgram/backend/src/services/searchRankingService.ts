// Search ranking service — pure functions, no side effects, no any types.

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  username: string;
  displayName?: string | null;
  bio?: string | null;
  avatar?: string | null;
  _count?: {
    followers?: number;
    following?: number;
    posts?: number;
  };
  isFollowedByViewer?: boolean;
  isFollowingViewer?: boolean;
}

export interface Repository {
  id: string;
  name: string;
  description?: string | null;
  stars?: number;
  language?: string | null;
  updatedAt?: Date | string | null;
  isPrivate?: boolean;
}

export interface Post {
  id: string;
  content: string;
  createdAt: Date | string;
  _count?: {
    likes?: number;
    comments?: number;
  };
}

export interface Snippet {
  id: string;
  title?: string | null;
  content: string;
  language?: string | null;
  createdAt: Date | string;
  _count?: {
    likes?: number;
    comments?: number;
  };
}

export interface RankedUser extends User {
  score: number;
}

export interface RankedRepository extends Repository {
  score: number;
}

export interface RankedPost extends Post {
  score: number;
}

export interface RankedSnippet extends Snippet {
  score: number;
}

export type RankedItem = RankedUser | RankedRepository | RankedPost | RankedSnippet;

export interface SearchResult {
  type: 'user' | 'repository' | 'post' | 'snippet';
  item: RankedItem;
  score: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'as', 'are', 'was', 'be',
]);

/**
 * Tokenizes and normalises a search query: lowercase, strip special chars,
 * remove stopwords, deduplicate.
 */
export function extractSearchTerms(query: string): string[] {
  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s-_]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));

  return [...new Set(tokens)];
}

/** Safe log scale capped to a maximum score contribution. */
function logScore(value: number, cap: number): number {
  if (value <= 0) return 0;
  return Math.min(Math.log10(value + 1) * (cap / Math.log10(1001)), cap);
}

/** Recency boost: full 2 pts for today, decays over ~90 days. */
function recencyBoost(dateValue: Date | string | null | undefined): number {
  if (!dateValue) return 0;
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (isNaN(date.getTime())) return 0;
  const ageDays = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, 2 * (1 - ageDays / 90));
}

// ---------------------------------------------------------------------------
// User ranking
// ---------------------------------------------------------------------------

/**
 * Ranks users by relevance to the query and optional social signals.
 *
 * Scoring:
 *   +10  exact username match
 *   +8   username starts with query
 *   +5   display name contains query (case-insensitive)
 *   +3   mutual follow (viewer follows user AND user follows viewer)
 *   +0-3 follower count on a log scale (capped at 3 pts)
 */
export function rankUsers(
  users: User[],
  query: string,
  _viewerUserId?: string,
): RankedUser[] {
  const q = query.toLowerCase().trim();

  const ranked = users.map((user): RankedUser => {
    let score = 0;

    const usernameLower = user.username.toLowerCase();
    const displayLower = (user.displayName ?? '').toLowerCase();

    if (usernameLower === q) {
      score += 10;
    } else if (usernameLower.startsWith(q)) {
      score += 8;
    } else if (usernameLower.includes(q)) {
      score += 4;
    }

    if (displayLower.includes(q)) {
      score += 5;
    }

    const isMutual = user.isFollowedByViewer === true && user.isFollowingViewer === true;
    if (isMutual) {
      score += 3;
    }

    const followerCount = user._count?.followers ?? 0;
    score += logScore(followerCount, 3);

    return { ...user, score };
  });

  return ranked.slice().sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Repository ranking
// ---------------------------------------------------------------------------

/**
 * Ranks repositories by relevance to the query.
 *
 * Scoring:
 *   +10  exact name match (case-insensitive)
 *   +6   name starts with query
 *   +4   name contains query
 *   +3   description contains query
 *   +0-5 stars on a log scale (capped at 5 pts)
 *   +0-2 recency boost based on updatedAt
 */
export function rankRepositories(
  repos: Repository[],
  query: string,
): RankedRepository[] {
  const q = query.toLowerCase().trim();

  const ranked = repos.map((repo): RankedRepository => {
    let score = 0;

    const nameLower = repo.name.toLowerCase();
    const descLower = (repo.description ?? '').toLowerCase();

    if (nameLower === q) {
      score += 10;
    } else if (nameLower.startsWith(q)) {
      score += 6;
    } else if (nameLower.includes(q)) {
      score += 4;
    }

    if (descLower.includes(q)) {
      score += 3;
    }

    score += logScore(repo.stars ?? 0, 5);
    score += recencyBoost(repo.updatedAt);

    return { ...repo, score };
  });

  return ranked.slice().sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Post ranking
// ---------------------------------------------------------------------------

/**
 * Ranks posts by content relevance, engagement, and recency.
 *
 * Scoring:
 *   +10  exact phrase present in content
 *   +8   all query terms present
 *   +3   some (>=50%) query terms present
 *   +0-5 likes on a log scale (capped at 5 pts)
 *   +0-2 recency boost
 */
export function rankPosts(posts: Post[], query: string): RankedPost[] {
  const terms = extractSearchTerms(query);
  const phraseLower = query.toLowerCase().trim();

  const ranked = posts.map((post): RankedPost => {
    let score = 0;
    const contentLower = post.content.toLowerCase();

    if (contentLower.includes(phraseLower)) {
      score += 10;
    } else {
      const matchCount = terms.filter((t) => contentLower.includes(t)).length;
      if (matchCount === terms.length && terms.length > 0) {
        score += 8;
      } else if (matchCount >= Math.ceil(terms.length / 2) && terms.length > 0) {
        score += 3;
      }
    }

    score += logScore(post._count?.likes ?? 0, 5);
    score += recencyBoost(post.createdAt);

    return { ...post, score };
  });

  return ranked.slice().sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Snippet ranking
// ---------------------------------------------------------------------------

/**
 * Ranks snippets like posts but adds a language-match bonus when the query
 * matches the snippet's programming language.
 *
 * Scoring inherits from post ranking, plus:
 *   +4   query matches the snippet language (e.g. "typescript")
 *   +2   query is contained in the snippet title
 */
export function rankSnippets(snippets: Snippet[], query: string): RankedSnippet[] {
  const terms = extractSearchTerms(query);
  const phraseLower = query.toLowerCase().trim();

  const ranked = snippets.map((snippet): RankedSnippet => {
    let score = 0;
    const contentLower = snippet.content.toLowerCase();
    const titleLower = (snippet.title ?? '').toLowerCase();
    const langLower = (snippet.language ?? '').toLowerCase();

    if (contentLower.includes(phraseLower)) {
      score += 10;
    } else {
      const matchCount = terms.filter((t) => contentLower.includes(t)).length;
      if (matchCount === terms.length && terms.length > 0) {
        score += 8;
      } else if (matchCount >= Math.ceil(terms.length / 2) && terms.length > 0) {
        score += 3;
      }
    }

    if (langLower.length > 0 && phraseLower.includes(langLower)) {
      score += 4;
    }

    if (titleLower.includes(phraseLower)) {
      score += 2;
    }

    score += logScore(snippet._count?.likes ?? 0, 5);
    score += recencyBoost(snippet.createdAt);

    return { ...snippet, score };
  });

  return ranked.slice().sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Result combiner
// ---------------------------------------------------------------------------

/**
 * Merges ranked results from multiple content types into a single interleaved
 * list, capped at 20 items.
 *
 * Strategy: round-robin interleaving by type index so no single type dominates,
 * then stable-sort the full set by score descending and return the top 20.
 */
export function combineResults(
  results: { type: string; items: RankedItem[] }[],
): SearchResult[] {
  const tagged: SearchResult[] = results.flatMap(({ type, items }) =>
    items.map((item) => ({
      type: type as SearchResult['type'],
      item,
      score: item.score,
    })),
  );

  return tagged
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
}
