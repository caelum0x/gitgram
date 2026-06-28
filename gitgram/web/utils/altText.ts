/**
 * Alt-text preferences, ported from Bluesky's `alt-text-required` preference to
 * the product's stack. The "require alt text" flag is stored alongside the
 * existing accessibility settings (localStorage key
 * `gitgram:accessibility-settings`) so it survives reloads without a dedicated
 * backend endpoint, and is read by the composer to optionally block posting
 * media that has no description.
 */

const ACCESSIBILITY_STORAGE_KEY = 'gitgram:accessibility-settings'

/** Max length for a single image description (mirrors Bluesky's 2000 cap). */
export const MAX_ALT_TEXT_LENGTH = 2000

interface AltTextPreferenceShape {
  requireAltText?: boolean
}

/**
 * Whether the user has opted into being required to add alt text before posting
 * media. Defaults to `false` when unset or unavailable (SSR / private mode).
 */
export function isAltTextRequired(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = window.localStorage.getItem(ACCESSIBILITY_STORAGE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as AltTextPreferenceShape
    return parsed.requireAltText === true
  } catch {
    return false
  }
}

/** Normalizes a raw alt-text input: trims and clamps to the max length. */
export function normalizeAltText(value: string): string {
  return value.trim().slice(0, MAX_ALT_TEXT_LENGTH)
}
