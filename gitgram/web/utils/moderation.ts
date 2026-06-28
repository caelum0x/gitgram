/**
 * Client-side moderation primitives: muted words (keyword content filter),
 * muted accounts (soft hide-without-block), and muted threads.
 *
 * Adapted from Bluesky's MutedWords / thread-mutes / ModerationMutedAccounts to
 * the product's stack. State is persisted in localStorage (mirroring the
 * FeedFilters convention) so it works without a dedicated backend endpoint, and
 * is exposed through pure functions plus a lightweight pub/sub for live updates.
 */

const STORAGE_KEY = 'gitgram:moderation'

export type MutedWordTarget = 'content' | 'tag'

export interface MutedWord {
  /** Normalized (lowercased, trimmed) word or phrase. */
  value: string
  /** Whether to match anywhere in text, or only hashtags. */
  target: MutedWordTarget
  /** Optional ISO expiry; when in the past the word is ignored. */
  expiresAt?: string
}

export interface ModerationState {
  mutedWords: MutedWord[]
  /** Lowercased usernames whose posts are hidden. */
  mutedAccounts: string[]
  /** Post ids whose threads are muted. */
  mutedThreads: string[]
}

const EMPTY_STATE: ModerationState = {
  mutedWords: [],
  mutedAccounts: [],
  mutedThreads: [],
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function isModerationState(value: unknown): value is ModerationState {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    Array.isArray(v.mutedWords) && Array.isArray(v.mutedAccounts) && Array.isArray(v.mutedThreads)
  )
}

export function loadModeration(): ModerationState {
  if (typeof window === 'undefined') return { ...EMPTY_STATE }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...EMPTY_STATE }
    const parsed: unknown = JSON.parse(raw)
    if (!isModerationState(parsed)) return { ...EMPTY_STATE }
    return {
      mutedWords: parsed.mutedWords,
      mutedAccounts: parsed.mutedAccounts,
      mutedThreads: parsed.mutedThreads,
    }
  } catch {
    return { ...EMPTY_STATE }
  }
}

type Listener = (state: ModerationState) => void
const listeners = new Set<Listener>()

function persist(state: ModerationState): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Storage may be unavailable (private mode); keep in-memory listeners updated.
    }
  }
  listeners.forEach((l) => l(state))
}

export function subscribeModeration(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// ---------------------------------------------------------------------------
// Mutations (immutable — always return / persist a fresh state)
// ---------------------------------------------------------------------------

function normalizeWord(value: string): string {
  return value.trim().toLowerCase().replace(/^#/, '')
}

export function addMutedWord(value: string, target: MutedWordTarget = 'content'): ModerationState {
  const normalized = normalizeWord(value)
  const current = loadModeration()
  if (!normalized || current.mutedWords.some((w) => w.value === normalized && w.target === target)) {
    return current
  }
  const next: ModerationState = {
    ...current,
    mutedWords: [...current.mutedWords, { value: normalized, target }],
  }
  persist(next)
  return next
}

export function removeMutedWord(value: string, target: MutedWordTarget): ModerationState {
  const current = loadModeration()
  const next: ModerationState = {
    ...current,
    mutedWords: current.mutedWords.filter((w) => !(w.value === value && w.target === target)),
  }
  persist(next)
  return next
}

export function muteAccount(username: string): ModerationState {
  const normalized = username.trim().toLowerCase().replace(/^@/, '')
  const current = loadModeration()
  if (!normalized || current.mutedAccounts.includes(normalized)) return current
  const next: ModerationState = {
    ...current,
    mutedAccounts: [...current.mutedAccounts, normalized],
  }
  persist(next)
  return next
}

export function unmuteAccount(username: string): ModerationState {
  const normalized = username.trim().toLowerCase().replace(/^@/, '')
  const current = loadModeration()
  const next: ModerationState = {
    ...current,
    mutedAccounts: current.mutedAccounts.filter((a) => a !== normalized),
  }
  persist(next)
  return next
}

export function muteThread(postId: string): ModerationState {
  const current = loadModeration()
  if (!postId || current.mutedThreads.includes(postId)) return current
  const next: ModerationState = {
    ...current,
    mutedThreads: [...current.mutedThreads, postId],
  }
  persist(next)
  return next
}

export function unmuteThread(postId: string): ModerationState {
  const current = loadModeration()
  const next: ModerationState = {
    ...current,
    mutedThreads: current.mutedThreads.filter((id) => id !== postId),
  }
  persist(next)
  return next
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

function isActiveWord(word: MutedWord, now: number): boolean {
  if (!word.expiresAt) return true
  const expiry = Date.parse(word.expiresAt)
  return Number.isNaN(expiry) || expiry > now
}

function extractTags(text: string): string[] {
  const matches = text.toLowerCase().match(/#(\w+)/g)
  return matches ? matches.map((t) => t.slice(1)) : []
}

export interface ModeratablePost {
  id: string
  content: string
  username: string
  tags?: string[]
}

/**
 * Returns true if a post should be hidden given the current moderation state.
 * A post is muted when:
 *  - its author is in mutedAccounts, OR
 *  - its id is a muted thread, OR
 *  - a 'content' muted word appears in the text, OR
 *  - a 'tag' muted word matches one of its hashtags.
 */
export function isPostMuted(post: ModeratablePost, state: ModerationState): boolean {
  const now = Date.now()

  const username = post.username.toLowerCase()
  if (state.mutedAccounts.includes(username)) return true
  if (state.mutedThreads.includes(post.id)) return true

  const text = post.content.toLowerCase()
  const tags = new Set<string>([...(post.tags ?? []).map((t) => t.toLowerCase()), ...extractTags(post.content)])

  for (const word of state.mutedWords) {
    if (!isActiveWord(word, now)) continue
    if (word.target === 'tag') {
      if (tags.has(word.value)) return true
    } else if (text.includes(word.value)) {
      return true
    }
  }

  return false
}

export function filterMutedPosts<T extends ModeratablePost>(
  posts: T[],
  state: ModerationState,
): T[] {
  return posts.filter((post) => !isPostMuted(post, state))
}

// ---------------------------------------------------------------------------
// Self-labels / content warnings
// ---------------------------------------------------------------------------

/**
 * Author-applied content warnings, ported from Bluesky's self-labels to a
 * lightweight content-embedded marker (no backend field required). A post can
 * carry one self-label; flagged content is soft-hidden behind a reveal overlay
 * rather than removed outright.
 */
export type SelfLabel = 'sensitive' | 'spoiler' | 'nsfw'

export const SELF_LABELS: readonly SelfLabel[] = ['sensitive', 'spoiler', 'nsfw'] as const

interface SelfLabelMeta {
  /** Short word shown on the overlay badge. */
  label: string
  /** Sentence explaining why the content is hidden. */
  description: string
}

export const SELF_LABEL_META: Record<SelfLabel, SelfLabelMeta> = {
  sensitive: {
    label: 'Sensitive content',
    description: 'The author marked this content as sensitive.',
  },
  spoiler: {
    label: 'Spoiler',
    description: 'The author marked this as a spoiler.',
  },
  nsfw: {
    label: 'Adult content',
    description: 'The author marked this as adult content.',
  },
}

// Marker embedded at the start of a post's content, e.g. `[cw:spoiler]`.
// Mirrors the `aitm-change-story` fenced-block convention already used in feed.
const SELF_LABEL_MARKER = /^\s*\[cw:(sensitive|spoiler|nsfw)\]\s*/i

export function isSelfLabel(value: string): value is SelfLabel {
  return (SELF_LABELS as readonly string[]).includes(value)
}

/**
 * Prefix a content string with a self-label marker. Removes any existing marker
 * first so toggling is idempotent. Passing `null` strips the marker entirely.
 */
export function applySelfLabel(content: string, label: SelfLabel | null): string {
  const stripped = content.replace(SELF_LABEL_MARKER, '')
  if (!label) return stripped
  return `[cw:${label}] ${stripped}`
}

/**
 * Extract a self-label (if any) from a post's content and return the cleaned
 * text with the marker removed.
 */
export function parseSelfLabel(content: string): { label: SelfLabel | null; cleanContent: string } {
  const match = content.match(SELF_LABEL_MARKER)
  if (!match) return { label: null, cleanContent: content }
  const raw = match[1].toLowerCase()
  const label = isSelfLabel(raw) ? raw : null
  return { label, cleanContent: content.replace(SELF_LABEL_MARKER, '') }
}
