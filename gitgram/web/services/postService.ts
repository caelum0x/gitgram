import api from './api'

/** Response shape for cursor-based feed endpoints */
interface CursorFeedResponse<T> {
  posts: T[]
  nextCursor: string | null
}

/**
 * Who is allowed to reply to a post (threadgate), ported from Bluesky's
 * reply-control settings. `everyone` is the default; the others progressively
 * restrict replies. Stored as a single field on the post.
 */
export type ReplyPermission = 'everyone' | 'followers' | 'mentioned' | 'nobody'

export const REPLY_PERMISSIONS: readonly ReplyPermission[] = [
  'everyone',
  'followers',
  'mentioned',
  'nobody',
] as const

interface ReplyPermissionMeta {
  label: string
  /** Notice shown on the post for viewers. */
  notice: string
}

export const REPLY_PERMISSION_META: Record<ReplyPermission, ReplyPermissionMeta> = {
  everyone: { label: 'Everyone', notice: 'Everybody can reply' },
  followers: { label: 'Followers', notice: 'Only followers can reply' },
  mentioned: { label: 'Mentioned only', notice: 'Only mentioned users can reply' },
  nobody: { label: 'Nobody', notice: 'Replies are disabled' },
}

export function isReplyPermission(value: unknown): value is ReplyPermission {
  return typeof value === 'string' && (REPLY_PERMISSIONS as readonly string[]).includes(value)
}

/** Normalizes an unknown reply-permission value to a safe default. */
export function normalizeReplyPermission(value: unknown): ReplyPermission {
  return isReplyPermission(value) ? value : 'everyone'
}

export const postService = {
  getFeed: async (page = 1, limit = 10) => {
    const { data } = await api.get('/posts/feed', { params: { page, limit } })
    return data
  },

  /**
   * Cursor-based feed — prevents duplicate / missing posts when new content
   * is published between page fetches.  Pass the `nextCursor` value from the
   * previous response to get the next page; omit `cursor` for the first page.
   */
  getFeedCursor: async (cursor?: string, limit: number = 10): Promise<CursorFeedResponse<Record<string, unknown>>> => {
    const params: Record<string, string | number> = { limit }
    if (cursor) {
      params.cursor = cursor
    }
    const { data } = await api.get('/posts/feed', { params })
    return data as CursorFeedResponse<Record<string, unknown>>
  },

  getPost: async (id: string) => {
    const { data } = await api.get(`/posts/${id}`)
    return data
  },

  createPost: async (formData: FormData) => {
    const { data } = await api.post('/posts', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  updatePost: async (
    id: string,
    updates: { content?: string; visibility?: string; hashtags?: string[]; replyPermission?: ReplyPermission },
  ) => {
    const { data } = await api.put(`/posts/${id}`, updates)
    return data
  },

  /** Update who is allowed to reply to a post (threadgate). */
  setReplyPermission: async (id: string, replyPermission: ReplyPermission) => {
    const { data } = await api.put(`/posts/${id}`, { replyPermission })
    return data
  },

  deletePost: async (id: string) => {
    await api.delete(`/posts/${id}`)
  },

  likePost: async (id: string) => {
    const { data } = await api.post(`/posts/${id}/like`)
    return data
  },

  unlikePost: async (id: string) => {
    await api.delete(`/posts/${id}/like`)
  },

  getComments: async (postId: string) => {
    const { data } = await api.get(`/posts/${postId}/comments`)
    return data
  },

  addComment: async (postId: string, content: string) => {
    const { data } = await api.post(`/posts/${postId}/comments`, { content })
    return data
  },

  deleteComment: async (postId: string, commentId: string) => {
    await api.delete(`/posts/${postId}/comments/${commentId}`)
  },

  // Comment actions
  likeComment: async (postId: string, commentId: string) => {
    const { data } = await api.post(`/v1/posts/${postId}/comments/${commentId}/like`)
    return data
  },

  getCommentLikes: async (postId: string, commentId: string) => {
    const { data } = await api.get(`/v1/posts/${postId}/comments/${commentId}/likes`)
    return data
  },

  updateComment: async (postId: string, commentId: string, content: string) => {
    const { data } = await api.put(`/v1/posts/${postId}/comments/${commentId}`, { content })
    return data
  },

  savePost: async (id: string) => {
    const { data } = await api.post(`/post-actions/save/${id}`)
    return data
  },

  unsavePost: async (id: string) => {
    await api.delete(`/post-actions/save/${id}`)
  },

  sharePost: async (id: string) => {
    const { data } = await api.post(`/post-actions/share/${id}`)
    return data
  },

  reportPost: async (id: string, reason: string) => {
    const { data } = await api.post(`/post-actions/report/${id}`, { reason })
    return data
  },

  retweetPost: async (id: string, comment?: string) => {
    const { data } = await api.post(`/posts/${id}/retweet`, { comment })
    return data
  },

  searchPosts: async (query: string) => {
    const { data } = await api.get('/search/posts', { params: { q: query } })
    return data
  },

  getSavedPosts: async () => {
    const { data } = await api.get('/post-actions/saved')
    return data
  },

  /**
   * Create a post with optional AITM checkpoint linkage.
   * Attaches checkpoint metadata to the FormData before sending.
   */
  createPostWithCheckpoint: async (
    formData: FormData,
    checkpoint: {
      checkpointId: string
      projectId: string
      fromCheckpointId?: string
      diffSummary?: { added: number; removed: number; modified: number }
      changedFiles?: string[]
      changeStoryTitle?: string
    }
  ) => {
    formData.append('checkpointId', checkpoint.checkpointId)
    formData.append('aitmProjectId', checkpoint.projectId)
    if (checkpoint.fromCheckpointId) {
      formData.append('fromCheckpointId', checkpoint.fromCheckpointId)
    }
    if (checkpoint.diffSummary) {
      formData.append('diffSummary', JSON.stringify(checkpoint.diffSummary))
    }
    if (checkpoint.changedFiles) {
      formData.append('changedFiles', JSON.stringify(checkpoint.changedFiles))
    }
    if (checkpoint.changeStoryTitle) {
      formData.append('changeStoryTitle', checkpoint.changeStoryTitle)
    }
    const { data } = await api.post('/posts', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  /**
   * Create a post directly from an AITM checkpoint.
   * Uses the dedicated `/posts/from-checkpoint` endpoint.
   */
  createPostFromCheckpoint: async (params: {
    checkpointId: string
    projectId: string
    message?: string
    visibility?: 'public' | 'followers' | 'private'
  }) => {
    const { data } = await api.post('/posts/from-checkpoint', params)
    return data
  },
}

