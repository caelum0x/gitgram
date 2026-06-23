import api from './api'

export interface Draft {
  id: string
  localId?: string
  content: string | null
  mediaUrls: string[]
  createdAt: string
  updatedAt: string
  synced?: boolean
}

const DRAFTS_KEY = 'gitgram_drafts'

// Local storage helpers
const getLocalDrafts = (): Draft[] => {
  if (typeof window === 'undefined') return []
  try {
    const data = localStorage.getItem(DRAFTS_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

const saveLocalDrafts = (drafts: Draft[]) => {
  if (typeof window === 'undefined') return
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts))
}

// API methods
export const draftService = {
  // Get all drafts (from API with localStorage fallback)
  async getDrafts(): Promise<Draft[]> {
    try {
      const response = await api.get('/drafts')
      return response.data
    } catch {
      // Fallback to localStorage
      return getLocalDrafts()
    }
  },

  // Get a specific draft
  async getDraft(id: string): Promise<Draft | null> {
    try {
      const response = await api.get(`/drafts/${id}`)
      return response.data
    } catch {
      const localDrafts = getLocalDrafts()
      return localDrafts.find(d => d.id === id || d.localId === id) || null
    }
  },

  // Create a new draft
  async createDraft(content: string, mediaUrls: string[] = []): Promise<Draft> {
    const now = new Date().toISOString()
    const localId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Always save locally first
    const localDraft: Draft = {
      id: localId,
      localId,
      content,
      mediaUrls,
      createdAt: now,
      updatedAt: now,
      synced: false,
    }

    const localDrafts = getLocalDrafts()
    localDrafts.unshift(localDraft)
    saveLocalDrafts(localDrafts)

    // Try to sync with server
    try {
      const response = await api.post('/drafts', { content, mediaUrls })
      const serverDraft = response.data

      // Update local storage with server ID
      const updatedDrafts = localDrafts.map(d =>
        d.localId === localId ? { ...serverDraft, localId, synced: true } : d
      )
      saveLocalDrafts(updatedDrafts)

      return { ...serverDraft, localId, synced: true }
    } catch {
      return localDraft
    }
  },

  // Update a draft
  async updateDraft(id: string, content: string, mediaUrls?: string[]): Promise<Draft | null> {
    const now = new Date().toISOString()

    // Update locally first
    const localDrafts = getLocalDrafts()
    const index = localDrafts.findIndex(d => d.id === id || d.localId === id)

    if (index !== -1) {
      localDrafts[index] = {
        ...localDrafts[index],
        content,
        mediaUrls: mediaUrls ?? localDrafts[index].mediaUrls,
        updatedAt: now,
        synced: false,
      }
      saveLocalDrafts(localDrafts)
    }

    // Try to sync with server
    try {
      const serverId = localDrafts[index]?.id.startsWith('local_')
        ? null
        : localDrafts[index]?.id

      if (serverId) {
        const response = await api.patch(`/drafts/${serverId}`, { content, mediaUrls })
        const serverDraft = response.data

        // Update local storage with synced status
        if (index !== -1) {
          localDrafts[index] = { ...serverDraft, localId: localDrafts[index].localId, synced: true }
          saveLocalDrafts(localDrafts)
        }

        return { ...serverDraft, synced: true }
      }
    } catch {
      // Keep local version
    }

    return localDrafts[index] || null
  },

  // Delete a draft
  async deleteDraft(id: string): Promise<boolean> {
    // Delete locally first
    const localDrafts = getLocalDrafts()
    const draft = localDrafts.find(d => d.id === id || d.localId === id)
    const filteredDrafts = localDrafts.filter(d => d.id !== id && d.localId !== id)
    saveLocalDrafts(filteredDrafts)

    // Try to delete from server
    if (draft && !draft.id.startsWith('local_')) {
      try {
        await api.delete(`/drafts/${draft.id}`)
      } catch {
        // Ignore server errors, local deletion already done
      }
    }

    return true
  },

  // Publish a draft as a post
  async publishDraft(id: string): Promise<any> {
    const localDrafts = getLocalDrafts()
    const draft = localDrafts.find(d => d.id === id || d.localId === id)

    if (!draft) {
      throw new Error('Draft not found')
    }

    // If it's a server draft, use the publish endpoint
    if (!draft.id.startsWith('local_')) {
      const response = await api.post(`/drafts/${draft.id}/publish`)

      // Remove from local storage
      const filteredDrafts = localDrafts.filter(d => d.id !== id && d.localId !== id)
      saveLocalDrafts(filteredDrafts)

      return response.data
    }

    // For local-only drafts, create a post directly
    const response = await api.post('/posts', {
      content: draft.content,
      mediaUrls: draft.mediaUrls,
    })

    // Remove from local storage
    const filteredDrafts = localDrafts.filter(d => d.id !== id && d.localId !== id)
    saveLocalDrafts(filteredDrafts)

    return response.data
  },

  // Sync local drafts to server
  async syncDrafts(): Promise<{ synced: number; failed: number }> {
    const localDrafts = getLocalDrafts()
    const unsyncedDrafts = localDrafts.filter(d => !d.synced || d.id.startsWith('local_'))

    if (unsyncedDrafts.length === 0) {
      return { synced: 0, failed: 0 }
    }

    let synced = 0
    let failed = 0

    for (const draft of unsyncedDrafts) {
      try {
        const response = await api.post('/drafts', {
          content: draft.content,
          mediaUrls: draft.mediaUrls,
        })

        // Update local storage with server ID
        const updatedDrafts = localDrafts.map(d =>
          d.localId === draft.localId
            ? { ...response.data, localId: draft.localId, synced: true }
            : d
        )
        saveLocalDrafts(updatedDrafts)
        synced++
      } catch {
        failed++
      }
    }

    return { synced, failed }
  },

  // Clear local drafts cache
  clearLocalCache() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(DRAFTS_KEY)
    }
  },
}

export default draftService
