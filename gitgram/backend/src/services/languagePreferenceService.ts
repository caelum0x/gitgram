/**
 * languagePreferenceService.ts
 *
 * Natural-language (spoken-language) feed preferences.
 *
 * Ported from Bluesky's `FeedTuner.preferredLangOnly` + the
 * `src/state/preferences/feed-tuners.tsx` wiring (which feeds the viewer's
 * `contentLanguages` into the tuner). Bluesky calls `isPostInLanguage(post,
 * preferredLangsCode2)` per post; Gitgram precomputes the same per-post match
 * flag here so the tuner (services/feedTuner.ts) stays content-agnostic.
 *
 * The list of preferred natural languages is read from the existing
 * `UserLanguagePreference` model. That table is ALSO populated with PROGRAMMING
 * languages by the recommendation/search subsystems (e.g. "TypeScript",
 * "Python"), so this service filters the rows down to recognised spoken-language
 * codes only. Programming-language rows are simply ignored — they never
 * participate in feed language filtering, and this service never writes to the
 * table, so the recommendation feature is unaffected.
 *
 * Every export is a PURE function or a thin Prisma data-access wrapper; the
 * matcher performs no I/O and never mutates its inputs.
 */

import { prisma } from '../utils/prisma';

/**
 * Recognised spoken/natural-language codes (ISO 639-1, with a few common 639-2
 * codes). Used to distinguish a viewer's natural-language preferences from the
 * programming-language entries that share the `UserLanguagePreference` table.
 *
 * This is intentionally a curated allow-list rather than an exhaustive registry:
 * it covers the languages a content-language detector is realistically going to
 * emit, while reliably excluding programming-language names ("Go", "C", "R",
 * etc. are NOT spoken-language codes here).
 */
const SPOKEN_LANGUAGE_CODES: ReadonlySet<string> = new Set([
  'aa', 'ab', 'af', 'ak', 'am', 'ar', 'as', 'ay', 'az',
  'be', 'bg', 'bm', 'bn', 'bo', 'br', 'bs',
  'ca', 'cs', 'cy',
  'da', 'de', 'dv', 'dz',
  'ee', 'el', 'en', 'eo', 'es', 'et', 'eu',
  'fa', 'ff', 'fi', 'fo', 'fr', 'fy',
  'ga', 'gd', 'gl', 'gn', 'gu', 'gv',
  'ha', 'he', 'hi', 'hr', 'ht', 'hu', 'hy',
  'id', 'ig', 'is', 'it',
  'ja', 'jv',
  'ka', 'kk', 'km', 'kn', 'ko', 'ku', 'kw', 'ky',
  'la', 'lb', 'lo', 'lt', 'lv',
  'mg', 'mi', 'mk', 'ml', 'mn', 'mr', 'ms', 'mt', 'my',
  'nb', 'ne', 'nl', 'nn', 'no',
  'oc', 'om', 'or',
  'pa', 'pl', 'ps', 'pt',
  'qu',
  'rm', 'rn', 'ro', 'ru', 'rw',
  'sa', 'sd', 'se', 'sg', 'si', 'sk', 'sl', 'sn', 'so', 'sq', 'sr', 'su', 'sv', 'sw',
  'ta', 'te', 'tg', 'th', 'ti', 'tk', 'tl', 'tn', 'to', 'tr', 'ts', 'tt',
  'ug', 'uk', 'ur', 'uz',
  've', 'vi',
  'wo',
  'xh',
  'yi', 'yo',
  'zh', 'zu',
]);

/**
 * Normalise a language tag to its lowercase ISO 639-1/639-2 base code.
 *
 * Accepts BCP-47-ish tags ("en-US", "pt_BR", "zh-Hant") and reduces them to the
 * primary subtag ("en", "pt", "zh"). Returns '' when the input is unusable.
 * Mirrors Bluesky's `code3ToCode2`/`toCode2`-style normalisation at the
 * coarse-grained level the feed filter needs.
 */
export function normalizeLanguageCode(input: string | null | undefined): string {
  if (typeof input !== 'string') return '';
  const trimmed = input.trim().toLowerCase();
  if (trimmed.length === 0) return '';
  // Primary subtag only: split on '-' or '_'.
  const primary = trimmed.split(/[-_]/)[0];
  return primary;
}

/** Is `code` a recognised spoken/natural-language code (after normalisation)? */
export function isSpokenLanguageCode(code: string | null | undefined): boolean {
  const normalized = normalizeLanguageCode(code);
  return normalized.length > 0 && SPOKEN_LANGUAGE_CODES.has(normalized);
}

/**
 * Decide whether a post's content language matches the viewer's preferred
 * natural languages. Pure; performs no I/O. Mirrors the boolean returned by
 * Bluesky's `isPostInLanguage`.
 *
 * Semantics:
 *  - Empty `preferredLanguages` => no preference, everything matches (true).
 *  - Unknown/undetected `contentLanguage` => true (never hide undetected posts).
 *  - Otherwise => true iff the normalised content language is in the preferred
 *    set.
 *
 * @returns true when the post should be considered in-language for this viewer.
 */
export function isPostInPreferredLanguage(
  contentLanguage: string | null | undefined,
  preferredLanguages: ReadonlySet<string>
): boolean {
  if (preferredLanguages.size === 0) return true;
  const code = normalizeLanguageCode(contentLanguage);
  if (code.length === 0) return true; // unknown language: always keep
  return preferredLanguages.has(code);
}

/**
 * Load the viewer's PREFERRED NATURAL languages from `UserLanguagePreference`,
 * filtered to recognised spoken-language codes and ordered by descending weight
 * then score. Programming-language rows are excluded. Returns a normalised,
 * de-duplicated set of ISO-639 base codes (empty when the viewer has no spoken
 * language preferences configured).
 */
export async function getPreferredLanguagesForUser(
  userId: string
): Promise<Set<string>> {
  const rows = await prisma.userLanguagePreference.findMany({
    where: { userId },
    orderBy: [{ weight: 'desc' }, { score: 'desc' }],
    select: { language: true },
  });

  const preferred = new Set<string>();
  for (const row of rows) {
    if (isSpokenLanguageCode(row.language)) {
      preferred.add(normalizeLanguageCode(row.language));
    }
  }
  return preferred;
}

/** A feed post considered for preferred-language marking. */
export interface FeedLanguageCandidate {
  id: string;
  /** Detected content language code, or null when unknown. */
  contentLanguage: string | null;
}

/**
 * For each feed post, decide whether it is in one of the viewer's preferred
 * natural languages. Returns a map of post id -> match flag where:
 *
 *   - `true`      the post is in a preferred language (or its language is
 *                 unknown, which is always kept).
 *   - `false`     the post has a known, non-preferred language and should be
 *                 dropped by the tuner's `preferredLangOnly` step.
 *
 * When the viewer has NO spoken-language preferences configured, every value is
 * `true` (no filtering) and no per-post work is needed. This mirrors the feed
 * read path's `computeMutedFeedFlags` shape so the controller can apply both
 * uniformly.
 */
export async function computePreferredLanguageFlags(
  userId: string,
  candidates: ReadonlyArray<FeedLanguageCandidate>
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  for (const c of candidates) result.set(c.id, true);

  if (candidates.length === 0) return result;

  const preferred = await getPreferredLanguagesForUser(userId);
  if (preferred.size === 0) {
    // No preference => everything is "in language".
    return result;
  }

  for (const candidate of candidates) {
    result.set(
      candidate.id,
      isPostInPreferredLanguage(candidate.contentLanguage, preferred)
    );
  }

  return result;
}
