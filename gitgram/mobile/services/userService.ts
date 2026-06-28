import api from './api';

// ---------------------------------------------------------------------------
// Reading-list types (GET /v1/users/reading-list, DELETE /v1/users/reading-list/:id)
// ---------------------------------------------------------------------------

export type ReadingStatus = 'unread' | 'reading' | 'read' | 'archived';
export type ReadingSourceType = 'post' | 'snippet' | 'repository';
export type ReadingFilter = 'unread' | 'all' | 'archived';

/** A single reading-list entry returned from the API. */
export interface ReadingItem {
  /** Id of the reading-list record (used for status updates and removal). */
  id: string;
  /** Id of the underlying entity (post/snippet/repository). */
  entityId: string;
  sourceType: ReadingSourceType;
  title: string;
  author: string | null;
  /** Estimated reading time in minutes. */
  estimatedMinutes: number | null;
  /** ISO timestamp the item was saved. */
  savedAt: string | null;
  /** Read progress 0–1. */
  progress: number;
  status: ReadingStatus;
}

export interface ReadingListResponse {
  items: ReadingItem[];
  nextPage: number | null;
}

export interface GetReadingListParams {
  filter?: ReadingFilter;
  page?: number;
  limit?: number;
}

export const userService = {
  getUser: async (userId: string) => {
    const response = await api.get(`/v1/users/${userId}`);
    return response.data;
  },

  updateUser: async (data: FormData) => {
    const response = await api.put('/v1/users', data, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  updateProfile: async (data: { username?: string; bio?: string; isPrivate?: boolean }) => {
    const response = await api.put('/v1/users', data);
    return response.data;
  },

  followUser: async (userId: string) => {
    const response = await api.post(`/v1/users/${userId}/follow`);
    return response.data;
  },

  getFollowers: async (userId: string, page = 1, limit = 20) => {
    const response = await api.get(`/v1/users/${userId}/followers`, {
      params: { page, limit },
    });
    return response.data;
  },

  getFollowing: async (userId: string, page = 1, limit = 20) => {
    const response = await api.get(`/v1/users/${userId}/following`, {
      params: { page, limit },
    });
    return response.data;
  },

  searchUsers: async (query: string, page = 1, limit = 20) => {
    const response = await api.get('/v1/users/search', {
      params: { q: query, page, limit },
    });
    return response.data;
  },

  getBlockedUsers: async (page = 1, limit = 20) => {
    const response = await api.get('/v1/users/blocked', {
      params: { page, limit },
    });
    return response.data;
  },

  blockUser: async (userId: string) => {
    const response = await api.post(`/v1/users/${userId}/block`);
    return response.data;
  },

  unblockUser: async (userId: string) => {
    const response = await api.delete(`/v1/users/${userId}/block`);
    return response.data;
  },

  unfollowUser: async (userId: string) => {
    // Backend followUser endpoint toggles, so calling it again will unfollow
    const response = await api.post(`/v1/users/${userId}/follow`);
    return response.data;
  },

  requestVerification: async (type: 'standard' | 'golden', reason: string, evidence?: string) => {
    const formData = new FormData();
    formData.append('type', type);
    formData.append('reason', reason);
    if (evidence) {
      formData.append('evidence', evidence);
    }
    const response = await api.post('/v1/verification/request', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  getVerificationStatus: async () => {
    const response = await api.get('/v1/verification/status');
    return response.data;
  },

  updateEmail: async (email: string) => {
    const response = await api.put('/v1/users/email', { email });
    return response.data;
  },

  getSuggestedUsers: async (page = 1, limit = 20) => {
    const response = await api.get('/v1/users/suggested', {
      params: { page, limit },
    });
    return response.data;
  },

  getActivity: async (type: 'all' | 'posts' | 'likes' | 'comments' = 'all', page = 1, limit = 20) => {
    const response = await api.get('/v1/users/activity', {
      params: { type, page, limit },
    });
    return response.data;
  },

  getLinkedAccounts: async () => {
    const response = await api.get('/v1/users/linked-accounts');
    return response.data;
  },

  linkAccount: async (accountId: string) => {
    const response = await api.post('/v1/users/link-account', { accountId });
    return response.data;
  },

  unlinkAccount: async (accountId: string) => {
    const response = await api.delete(`/v1/users/linked-accounts/${accountId}`);
    return response.data;
  },

  switchAccount: async (accountId: string) => {
    const response = await api.post('/v1/users/switch-account', { accountId });
    return response.data;
  },

  saveInterests: async (interests: string[]) => {
    const response = await api.post('/v1/users/interests', { interests });
    return response.data;
  },

  // Follow Requests (for private accounts)
  getFollowRequests: async (page = 1, limit = 20) => {
    const response = await api.get('/v1/follow-requests', {
      params: { page, limit },
    });
    return response.data;
  },

  sendFollowRequest: async (targetId: string) => {
    const response = await api.post('/v1/follow-requests', { targetId });
    return response.data;
  },

  acceptFollowRequest: async (requestId: string) => {
    const response = await api.post(`/v1/follow-requests/${requestId}/accept`);
    return response.data;
  },

  rejectFollowRequest: async (requestId: string) => {
    const response = await api.post(`/v1/follow-requests/${requestId}/reject`);
    return response.data;
  },

  cancelFollowRequest: async (targetId: string) => {
    const response = await api.delete(`/v1/follow-requests/${targetId}`);
    return response.data;
  },

  getFollowRequestStatus: async (targetId: string) => {
    const response = await api.get(`/v1/follow-requests/status/${targetId}`);
    return response.data;
  },

  // Content Insights
  getInsightsOverview: async (days = 30) => {
    const response = await api.get('/v1/insights', {
      params: { days },
    });
    return response.data;
  },

  getTopPosts: async (limit = 10) => {
    const response = await api.get('/v1/insights/top-posts', {
      params: { limit },
    });
    return response.data;
  },

  getAudienceDemographics: async () => {
    const response = await api.get('/v1/insights/audience');
    return response.data;
  },

  getContentPerformance: async (days = 30) => {
    const response = await api.get('/v1/insights/performance', {
      params: { days },
    });
    return response.data;
  },

  // ---------------------------------------------------------------------------
  // Reading list (save-for-later queue)
  // ---------------------------------------------------------------------------

  getReadingList: async (params: GetReadingListParams = {}): Promise<ReadingListResponse> => {
    const { filter = 'unread', page = 1, limit = 20 } = params;
    const response = await api.get<ReadingListResponse>('/v1/users/reading-list', {
      params: { filter, page, limit },
    });
    const data = response.data;
    return {
      items: Array.isArray(data?.items) ? data.items : [],
      nextPage: typeof data?.nextPage === 'number' ? data.nextPage : null,
    };
  },

  updateReadingItem: async (id: string, status: ReadingStatus): Promise<void> => {
    await api.patch(`/v1/users/reading-list/${id}`, { status });
  },

  removeFromReadingList: async (id: string): Promise<void> => {
    await api.delete(`/v1/users/reading-list/${id}`);
  },
};

