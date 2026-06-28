/**
 * Extracts bare http(s) URLs from free text.
 *
 * Used by RichContent to detect external links worth turning into an inline
 * embed player or a link-preview card. Only the first few unique URLs are
 * surfaced to keep the feed light. Trailing punctuation commonly adjacent to a
 * URL in prose (`,`, `.`, `)`, etc.) is trimmed off.
 */

const URL_PATTERN = /\bhttps?:\/\/[^\s<>()]+/gi
const TRAILING_PUNCTUATION = /[.,!?;:'")\]]+$/

export interface ExtractUrlsOptions {
  /** Maximum number of unique URLs to return (default 3). */
  limit?: number
}

export function extractUrls(text: string, options: ExtractUrlsOptions = {}): string[] {
  const limit = options.limit ?? 3
  if (!text) return []

  const seen = new Set<string>()
  const result: string[] = []

  const matches = text.match(URL_PATTERN)
  if (!matches) return result

  for (const raw of matches) {
    const cleaned = raw.replace(TRAILING_PUNCTUATION, '')
    if (!cleaned || seen.has(cleaned)) continue

    // Validate it's a real, well-formed URL before surfacing it.
    try {
      const u = new URL(cleaned)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue
    } catch {
      continue
    }

    seen.add(cleaned)
    result.push(cleaned)
    if (result.length >= limit) break
  }

  return result
}
