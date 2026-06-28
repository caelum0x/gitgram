/**
 * mutedWordsService.ts
 *
 * Per-user keyword / hashtag muting.
 *
 * Ported from Bluesky's `hasMutedWord` matcher (@atproto/api moderation) and the
 * `AppBskyActorDefs.MutedWord` config shape (value / targets / actorTarget /
 * expiresAt). The atproto implementation lives in a non-portable package, so the
 * matcher is re-implemented here against Gitgram's stack while preserving the
 * original semantics:
 *
 *   - `targets: ['content']`     matches post text AND tags.
 *   - `targets: ['tag']`         matches tags only.
 *   - a value beginning with '#' is always treated as a hashtag (tag-only) match,
 *     regardless of `targets` (mirrors atproto's tag handling).
 *   - `actorTarget: 'exclude-following'` skips the mute when the post author is
 *     someone the viewer follows.
 *   - `expiresAt` in the past => the entry is inert (ignored by the matcher).
 *   - single-token values are matched on word boundaries (so "art" does not mute
 *     "cart"); multi-word phrases are matched as a normalized substring.
 *
 * Every export is a PURE function or a thin Prisma data-access wrapper; the
 * matcher itself performs no I/O and never mutates its inputs.
 */

import { prisma } from '../utils/prisma';

/** Surfaces a muted word can apply to. Mirrors atproto's MutedWord.targets. */
export type MutedWordTarget = 'content' | 'tag';

/** Whether the mute applies to everyone or skips followed authors. */
export type MutedWordActorTarget = 'all' | 'exclude-following';

export const MUTED_WORD_TARGETS: readonly MutedWordTarget[] = ['content', 'tag'];
export const MUTED_WORD_ACTOR_TARGETS: readonly MutedWordActorTarget[] = [
  'all',
  'exclude-following',
];

/** The maximum length of a single muted-word value (matches atproto's limit). */
export const MAX_MUTED_WORD_LENGTH = 1000;

/** Config shape for a single muted word. Mirrors AppBskyActorDefs.MutedWord. */
export interface MutedWordConfig {
  value: string;
  targets: MutedWordTarget[];
  actorTarget: MutedWordActorTarget;
  /** ISO-8601 string or Date; null/undefined means "never expires". */
  expiresAt?: string | Date | null;
}

/** A muted word as persisted/returned to the client. */
export interface StoredMutedWord extends MutedWordConfig {
  id: string;
  /** True when `expiresAt` is in the past. The client can offer to renew it. */
  isExpired: boolean;
}

/** The fields of a post the matcher inspects. */
export interface MutedWordSubject {
  /** Post body text (may be empty). */
  text: string;
  /** Hashtag/tag values associated with the post (without leading '#'). */
  tags?: ReadonlyArray<string>;
  /** Author identifier, used for the exclude-following check. */
  authorId?: string | null;
}

// ---------------------------------------------------------------------------
// Normalisation helpers (pure)
// ---------------------------------------------------------------------------

/**
 * Normalise a raw user-entered value into the stored token form.
 *
 * Mirrors atproto's `sanitizeMutedWordValue`: trim, lowercase, and strip a
 * single leading '#'. The original "was this a tag?" intent is preserved by the
 * caller via `targets`; for storage we keep the bare token. Returns '' when the
 * value is unusable (empty after trimming).
 */
export function sanitizeMutedWordValue(value: string): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) return '';
  // Strip a single leading '#'; a bare '#' becomes ''.
  return trimmed.startsWith('#') ? trimmed.slice(1).trim() : trimmed;
}

/** Lowercase + collapse internal whitespace for boundary-aware matching. */
function normalizeForMatch(input: string): string {
  return input.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Strip a leading '#' and lowercase a tag for comparison. */
function normalizeTag(tag: string): string {
  const t = tag.trim().toLowerCase();
  return t.startsWith('#') ? t.slice(1) : t;
}

/** Escape a string for safe use inside a RegExp. */
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Does `haystack` contain `needle` as a whole word/phrase?
 *
 * Single-token needles are matched on Unicode word boundaries so "art" does not
 * mute "cart" or "smart" (atproto applies the same whole-word rule). Multi-word
 * needles fall back to a normalized substring match, since enforcing a boundary
 * on each side of a phrase is both sufficient and what atproto does in practice.
 */
function containsWord(haystack: string, needle: string): boolean {
  const normalizedHay = normalizeForMatch(haystack);
  const normalizedNeedle = normalizeForMatch(needle);
  if (normalizedNeedle.length === 0) return false;

  const isSingleToken = !normalizedNeedle.includes(' ');
  if (isSingleToken) {
    // \b is ASCII-only; pair it with a manual boundary check using lookarounds
    // over "word" characters (letters, digits, underscore) so accented input
    // still behaves. We approximate with a boundary on either side of the token.
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}_])${escapeRegExp(normalizedNeedle)}(?![\\p{L}\\p{N}_])`,
      'u'
    );
    return pattern.test(normalizedHay);
  }

  return normalizedHay.includes(normalizedNeedle);
}

// ---------------------------------------------------------------------------
// Expiry + applicability (pure)
// ---------------------------------------------------------------------------

/** Has this muted word expired relative to `now`? */
export function isMutedWordExpired(
  word: Pick<MutedWordConfig, 'expiresAt'>,
  now: Date = new Date()
): boolean {
  if (word.expiresAt == null) return false;
  const expires =
    word.expiresAt instanceof Date ? word.expiresAt : new Date(word.expiresAt);
  if (Number.isNaN(expires.getTime())) return false;
  return expires.getTime() <= now.getTime();
}

// ---------------------------------------------------------------------------
// Core matcher (pure)  — the port of atproto's hasMutedWord
// ---------------------------------------------------------------------------

/**
 * Determine whether `subject` should be muted for a viewer given their muted
 * words. Pure; performs no I/O.
 *
 * @param mutedWords    the viewer's muted-word config list.
 * @param subject       the post under inspection (text + tags + author).
 * @param followingIds  set of author ids the viewer follows; used to honour
 *                      `actorTarget: 'exclude-following'`. Pass an empty set when
 *                      follow data is unavailable (the exclusion simply never
 *                      triggers, i.e. the mute still applies).
 * @param now           injectable clock for expiry checks (defaults to now).
 * @returns the first matching muted word, or null when nothing matches.
 */
export function findMatchingMutedWord(
  mutedWords: ReadonlyArray<MutedWordConfig>,
  subject: MutedWordSubject,
  followingIds: ReadonlySet<string> = new Set(),
  now: Date = new Date()
): MutedWordConfig | null {
  if (mutedWords.length === 0) return null;

  const tags = (subject.tags ?? []).map(normalizeTag).filter(t => t.length > 0);
  const text = typeof subject.text === 'string' ? subject.text : '';
  const authorId = subject.authorId ?? null;

  for (const word of mutedWords) {
    const token = sanitizeMutedWordValue(word.value);
    if (token.length === 0) continue;

    // Inert if expired.
    if (isMutedWordExpired(word, now)) continue;

    // Skip authors the viewer follows when configured to do so.
    if (
      word.actorTarget === 'exclude-following' &&
      authorId !== null &&
      followingIds.has(authorId)
    ) {
      continue;
    }

    const targets = word.targets.length > 0 ? word.targets : ['content'];
    const appliesToTags = targets.includes('tag') || targets.includes('content');
    const appliesToContent = targets.includes('content');

    // Tag match: the token equals any of the post's tags.
    if (appliesToTags && tags.includes(token)) {
      return word;
    }

    // Content (text) match.
    if (appliesToContent && text.length > 0 && containsWord(text, token)) {
      return word;
    }
  }

  return null;
}

/** Boolean convenience wrapper around {@link findMatchingMutedWord}. */
export function hasMutedWord(
  mutedWords: ReadonlyArray<MutedWordConfig>,
  subject: MutedWordSubject,
  followingIds: ReadonlySet<string> = new Set(),
  now: Date = new Date()
): boolean {
  return findMatchingMutedWord(mutedWords, subject, followingIds, now) !== null;
}

// ---------------------------------------------------------------------------
// Data access (thin Prisma wrappers)
// ---------------------------------------------------------------------------

interface MutedWordRow {
  id: string;
  value: string;
  targets: string[];
  actorTarget: string;
  expiresAt: Date | null;
}

function toStored(row: MutedWordRow, now: Date = new Date()): StoredMutedWord {
  const targets = row.targets.filter(
    (t): t is MutedWordTarget => t === 'content' || t === 'tag'
  );
  const actorTarget: MutedWordActorTarget =
    row.actorTarget === 'exclude-following' ? 'exclude-following' : 'all';
  return {
    id: row.id,
    value: row.value,
    targets: targets.length > 0 ? targets : ['content'],
    actorTarget,
    expiresAt: row.expiresAt,
    isExpired: isMutedWordExpired({ expiresAt: row.expiresAt }, now),
  };
}

/**
 * Load all of a user's muted words as matcher-ready configs (expired entries
 * included; the matcher ignores them, and the API surfaces them for renewal).
 */
export async function getMutedWordsForUser(userId: string): Promise<StoredMutedWord[]> {
  const rows = await prisma.mutedWord.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  const now = new Date();
  return rows.map(row => toStored(row, now));
}

/**
 * Load only the ACTIVE (non-expired) muted-word configs for a user, ready to
 * feed straight into the matcher. Used by the feed/notification read paths.
 */
export async function getActiveMutedWordConfigs(
  userId: string
): Promise<MutedWordConfig[]> {
  const now = new Date();
  const rows = await prisma.mutedWord.findMany({
    where: {
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
  return rows.map(row => ({
    value: row.value,
    targets: row.targets.filter(
      (t): t is MutedWordTarget => t === 'content' || t === 'tag'
    ),
    actorTarget:
      row.actorTarget === 'exclude-following'
        ? ('exclude-following' as const)
        : ('all' as const),
    expiresAt: row.expiresAt,
  }));
}

/** Input for creating / upserting a muted word. */
export interface UpsertMutedWordInput {
  value: string;
  targets: MutedWordTarget[];
  actorTarget: MutedWordActorTarget;
  expiresAt?: string | Date | null;
}

/**
 * Create or update (by normalized value) a muted word for a user. Upsert keeps
 * the list deduplicated by token, matching atproto's `upsertMutedWords`.
 */
export async function upsertMutedWord(
  userId: string,
  input: UpsertMutedWordInput
): Promise<StoredMutedWord> {
  const value = sanitizeMutedWordValue(input.value);
  if (value.length === 0) {
    throw new Error('Muted word value must not be empty');
  }
  if (value.length > MAX_MUTED_WORD_LENGTH) {
    throw new Error(`Muted word value must be at most ${MAX_MUTED_WORD_LENGTH} characters`);
  }

  const targets =
    input.targets.length > 0 ? Array.from(new Set(input.targets)) : ['content'];
  const expiresAt =
    input.expiresAt == null
      ? null
      : input.expiresAt instanceof Date
        ? input.expiresAt
        : new Date(input.expiresAt);

  if (expiresAt !== null && Number.isNaN(expiresAt.getTime())) {
    throw new Error('Muted word expiresAt is not a valid date');
  }

  const row = await prisma.mutedWord.upsert({
    where: { userId_value: { userId, value } },
    create: {
      userId,
      value,
      targets,
      actorTarget: input.actorTarget,
      expiresAt,
    },
    update: {
      targets,
      actorTarget: input.actorTarget,
      expiresAt,
    },
  });

  return toStored(row);
}

/**
 * Remove a muted word for a user, identified by its database id. Returns true
 * when a row was deleted (scoped to the owning user).
 */
export async function removeMutedWord(userId: string, id: string): Promise<boolean> {
  const result = await prisma.mutedWord.deleteMany({ where: { id, userId } });
  return result.count > 0;
}

/**
 * Resolve the set of USER ids the given user follows, used to honour
 * `actorTarget: 'exclude-following'`. Returns an empty set when the user follows
 * no one. The Follow model is dual-keyed (account + user); muted-word matching
 * operates on the user-level edge since notification actors are users.
 */
async function getFollowingUserIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.follow.findMany({
    where: { followerUserId: userId, followingUserId: { not: null } },
    select: { followingUserId: true },
  });
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.followingUserId) ids.add(row.followingUserId);
  }
  return ids;
}

/** A notification candidate considered for muted-word filtering. */
export interface NotificationFilterCandidate {
  id: string;
  /** The author who triggered the notification (for exclude-following). */
  actorId: string | null;
  /** The subject post's id, when the notification references a post. */
  postId: string | null;
  /** The subject post's text, when available. */
  postText: string | null;
}

/**
 * Filter a list of notification candidates, dropping those whose subject post
 * matches one of the viewer's ACTIVE muted words/tags.
 *
 * This is the notification read-path analogue of the feed's `removeMutedWords`
 * step (mirrors Bluesky's `shouldFilterNotif` muted-word branch). Only
 * notifications that reference a post are eligible; non-post notifications
 * (follows, etc.) are always kept.
 *
 * When the viewer has no active muted words the input is returned unchanged
 * (no extra queries are issued).
 *
 * @returns a new array containing only the notifications that survive filtering.
 */
export async function filterMutedNotifications<T extends NotificationFilterCandidate>(
  userId: string,
  candidates: ReadonlyArray<T>
): Promise<T[]> {
  const configs = await getActiveMutedWordConfigs(userId);
  if (configs.length === 0) {
    return [...candidates];
  }

  const postIds = Array.from(
    new Set(
      candidates
        .map(c => c.postId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
  );

  // Resolve post tags and the viewer's following set in parallel.
  const [hashtagRows, followingIds] = await Promise.all([
    postIds.length > 0
      ? prisma.postHashtag.findMany({
          where: { postId: { in: postIds } },
          select: { postId: true, hashtag: { select: { name: true } } },
        })
      : Promise.resolve([]),
    getFollowingUserIds(userId),
  ]);

  const tagsByPost = new Map<string, string[]>();
  for (const row of hashtagRows) {
    const existing = tagsByPost.get(row.postId);
    if (existing) {
      existing.push(row.hashtag.name);
    } else {
      tagsByPost.set(row.postId, [row.hashtag.name]);
    }
  }

  const now = new Date();
  return candidates.filter(candidate => {
    if (!candidate.postId) return true; // non-post notifications are never muted
    const subject: MutedWordSubject = {
      text: candidate.postText ?? '',
      tags: tagsByPost.get(candidate.postId) ?? [],
      authorId: candidate.actorId,
    };
    return !hasMutedWord(configs, subject, followingIds, now);
  });
}

/** A feed post considered for muted-word marking. */
export interface FeedMuteCandidate {
  id: string;
  text: string;
  authorId: string | null;
  /** Tags already present on the item (optional; supplemented from the DB). */
  tags?: ReadonlyArray<string>;
}

/**
 * For each feed post, decide whether it matches one of the viewer's ACTIVE muted
 * words/tags. Returns a map of post id -> boolean (true = muted). When the viewer
 * has no active muted words, every value is false and no extra queries run.
 *
 * The feed read path (postController.getFeed) uses this to set `isMutedWord` on
 * each TunableFeedItem before `tuneFeed`'s `removeMutedWords` step drops them.
 */
export async function computeMutedFeedFlags(
  userId: string,
  candidates: ReadonlyArray<FeedMuteCandidate>
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  for (const c of candidates) result.set(c.id, false);

  const configs = await getActiveMutedWordConfigs(userId);
  if (configs.length === 0 || candidates.length === 0) {
    return result;
  }

  const postIds = Array.from(new Set(candidates.map(c => c.id)));
  const [hashtagRows, followingIds] = await Promise.all([
    prisma.postHashtag.findMany({
      where: { postId: { in: postIds } },
      select: { postId: true, hashtag: { select: { name: true } } },
    }),
    getFollowingUserIds(userId),
  ]);

  const tagsByPost = new Map<string, string[]>();
  for (const row of hashtagRows) {
    const existing = tagsByPost.get(row.postId);
    if (existing) existing.push(row.hashtag.name);
    else tagsByPost.set(row.postId, [row.hashtag.name]);
  }

  const now = new Date();
  for (const candidate of candidates) {
    const dbTags = tagsByPost.get(candidate.id) ?? [];
    const tags = candidate.tags ? [...candidate.tags, ...dbTags] : dbTags;
    const subject: MutedWordSubject = {
      text: candidate.text,
      tags,
      authorId: candidate.authorId,
    };
    result.set(candidate.id, hasMutedWord(configs, subject, followingIds, now));
  }

  return result;
}
