/**
 * Reel draft service.
 *
 * Reels are composed from a code snippet + metadata and published via
 * `reelService.createReel`. There is no server-side reel-draft model, so drafts
 * are persisted locally (the same local-first pattern used by `draftService`).
 * This lets users save an in-progress reel and resume it later from
 * `/reel/drafts`.
 */

export interface ReelDraft {
  id: string
  title: string
  description: string
  language: string
  code: string
  hashtags: string
  repositoryUrl: string
  createdAt: string
  updatedAt: string
}

export type ReelDraftInput = Omit<ReelDraft, 'id' | 'createdAt' | 'updatedAt'>

const REEL_DRAFTS_KEY = 'gitgram_reel_drafts'
const MAX_DRAFTS = 50

function readDrafts(): ReelDraft[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(REEL_DRAFTS_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? (parsed as ReelDraft[]) : []
  } catch {
    return []
  }
}

function writeDrafts(drafts: ReelDraft[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(REEL_DRAFTS_KEY, JSON.stringify(drafts.slice(0, MAX_DRAFTS)))
}

function generateId(): string {
  return `reel_draft_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

export const reelDraftService = {
  /** Return all reel drafts, newest first. */
  list(): ReelDraft[] {
    return readDrafts().sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
  },

  /** Return a single draft by id, or null. */
  get(id: string): ReelDraft | null {
    return readDrafts().find((d) => d.id === id) ?? null
  },

  /** Create a new draft and return it. */
  create(input: ReelDraftInput): ReelDraft {
    const now = new Date().toISOString()
    const draft: ReelDraft = { ...input, id: generateId(), createdAt: now, updatedAt: now }
    writeDrafts([draft, ...readDrafts()])
    return draft
  },

  /**
   * Update an existing draft (immutably) or create one if it does not exist.
   * Returns the saved draft.
   */
  save(id: string | null, input: ReelDraftInput): ReelDraft {
    if (!id) return reelDraftService.create(input)
    const drafts = readDrafts()
    const existing = drafts.find((d) => d.id === id)
    if (!existing) return reelDraftService.create(input)
    const updated: ReelDraft = { ...existing, ...input, updatedAt: new Date().toISOString() }
    writeDrafts(drafts.map((d) => (d.id === id ? updated : d)))
    return updated
  },

  /** Delete a draft by id. Returns true once removed. */
  remove(id: string): boolean {
    writeDrafts(readDrafts().filter((d) => d.id !== id))
    return true
  },

  /** Remove all reel drafts. */
  clear(): void {
    if (typeof window === 'undefined') return
    localStorage.removeItem(REEL_DRAFTS_KEY)
  },
}

export default reelDraftService
