import api from './api'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CollectionOwner {
  id: string
  username: string
  avatar: string | null
}

export interface Collection {
  id: string
  name: string
  description: string | null
  isPrivate: boolean
  user: CollectionOwner
  itemCount: number
  updatedAt: string
  createdAt: string
  /** Cover image URL derived from the first item in the collection */
  coverUrl?: string | null
}

export interface CollectionsListResponse {
  collections: Collection[]
  total: number
  page: number
  totalPages: number
}

export type CollectionSort = 'updatedAt' | 'itemCount' | 'name'
export type CollectionTab = 'mine' | 'following' | 'discover'

export interface ListCollectionsParams {
  tab?: CollectionTab
  search?: string
  sort?: CollectionSort
  page?: number
  limit?: number
}

export interface CreateCollectionPayload {
  name: string
  description?: string
  isPrivate: boolean
}

// ── Service ───────────────────────────────────────────────────────────────────

export const collectionsService = {
  list: async (params: ListCollectionsParams = {}): Promise<CollectionsListResponse> => {
    const { data } = await api.get<CollectionsListResponse>('/collections', { params })
    return data
  },

  get: async (id: string): Promise<Collection> => {
    const { data } = await api.get<Collection>(`/collections/${id}`)
    return data
  },

  create: async (payload: CreateCollectionPayload): Promise<Collection> => {
    const { data } = await api.post<Collection>('/collections', payload)
    return data
  },

  update: async (
    id: string,
    payload: Partial<CreateCollectionPayload>
  ): Promise<Collection> => {
    const { data } = await api.patch<Collection>(`/collections/${id}`, payload)
    return data
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/collections/${id}`)
  },
}
