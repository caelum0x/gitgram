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
    const response = await api.get(`/users/${userId}`);
    return response.data;
  },

  updateUser: async (data: FormData) => {
    const response = await api.put('/users', data, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  updateProfile: async (data: { username?: string; bio?: string; isPrivate?: boolean }) => {
    const response = await api.put('/users', data);
    return response.data;
  },

  followUser: async (userId: string) => {
    const response = await api.post(`/users/${userId}/follow`);
    return response.data;
  },

  getFollowers: async (userId: string, page = 1, limit = 20) => {
    const response = await api.get(`/users/${userId}/followers`, {
      params: { page, limit },
    });
    return response.data;
  },

  getFollowing: async (userId: string, page = 1, limit = 20) => {
    const response = await api.get(`/users/${userId}/following`, {
      params: { page, limit },
    });
    return response.data;
  },

  searchUsers: async (query: string, page = 1, limit = 20) => {
    const response = await api.get('/users/search', {
      params: { q: query, page, limit },
    });
    return response.data;
  },

  getBlockedUsers: async (page = 1, limit = 20) => {
    const response = await api.get('/users/blocked', {
      params: { page, limit },
    });
    return response.data;
  },

  blockUser: async (userId: string) => {
    const response = await api.post(`/users/${userId}/block`);
    return response.data;
  },

  unblockUser: async (userId: string) => {
    const response = await api.delete(`/users/${userId}/block`);
    return response.data;
  },

  unfollowUser: async (userId: string) => {
    // Backend followUser endpoint toggles, so calling it again will unfollow
    const response = await api.post(`/users/${userId}/follow`);
    return response.data;
  },

  requestVerification: async (type: 'standard' | 'golden', reason: string, evidence?: string) => {
    const formData = new FormData();
    formData.append('type', type);
    formData.append('reason', reason);
    if (evidence) {
      formData.append('evidence', evidence);
    }
    const response = await api.post('/verification/request', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  getVerificationStatus: async () => {
    const response = await api.get('/verification/status');
    return response.data;
  },

  updateEmail: async (email: string) => {
    const response = await api.put('/users/email', { email });
    return response.data;
  },

  getSuggestedUsers: async (page = 1, limit = 20) => {
    const response = await api.get('/users/suggested', {
      params: { page, limit },
    });
    return response.data;
  },

  getActivity: async (type: 'all' | 'posts' | 'likes' | 'comments' = 'all', page = 1, limit = 20) => {
    const response = await api.get('/users/activity', {
      params: { type, page, limit },
    });
    return response.data;
  },

  getLinkedAccounts: async () => {
    const response = await api.get('/users/linked-accounts');
    return response.data;
  },

  linkAccount: async (accountId: string) => {
    const response = await api.post('/users/link-account', { accountId });
    return response.data;
  },

  unlinkAccount: async (accountId: string) => {
    const response = await api.delete(`/users/linked-accounts/${accountId}`);
    return response.data;
  },

  switchAccount: async (accountId: string) => {
    const response = await api.post('/users/switch-account', { accountId });
    return response.data;
  },

  saveInterests: async (interests: string[]) => {
    const response = await api.post('/users/interests', { interests });
    return response.data;
  },

  // Follow Requests (for private accounts)
  getFollowRequests: async (page = 1, limit = 20) => {
    const response = await api.get('/follow-requests', {
      params: { page, limit },
    });
    return response.data;
  },

  sendFollowRequest: async (targetId: string) => {
    const response = await api.post('/follow-requests', { targetId });
    return response.data;
  },

  acceptFollowRequest: async (requestId: string) => {
    const response = await api.post(`/follow-requests/${requestId}/accept`);
    return response.data;
  },

  rejectFollowRequest: async (requestId: string) => {
    const response = await api.post(`/follow-requests/${requestId}/reject`);
    return response.data;
  },

  cancelFollowRequest: async (targetId: string) => {
    const response = await api.delete(`/follow-requests/${targetId}`);
    return response.data;
  },

  getFollowRequestStatus: async (targetId: string) => {
    const response = await api.get(`/follow-requests/status/${targetId}`);
    return response.data;
  },

  // Content Insights
  getInsightsOverview: async (days = 30) => {
    const response = await api.get('/insights', {
      params: { days },
    });
    return response.data;
  },

  getTopPosts: async (limit = 10) => {
    const response = await api.get('/insights/top-posts', {
      params: { limit },
    });
    return response.data;
  },

  getAudienceDemographics: async () => {
    const response = await api.get('/insights/audience');
    return response.data;
  },

  getContentPerformance: async (days = 30) => {
    const response = await api.get('/insights/performance', {
      params: { days },
    });
    return response.data;
  },

  // ---------------------------------------------------------------------------
  // Reading list (save-for-later queue)
  // ---------------------------------------------------------------------------

  getReadingList: async (params: GetReadingListParams = {}): Promise<ReadingListResponse> => {
    const { filter = 'unread', page = 1, limit = 20 } = params;
    const response = await api.get<ReadingListResponse>('/users/reading-list', {
      params: { filter, page, limit },
    });
    const data = response.data;
    return {
      items: Array.isArray(data?.items) ? data.items : [],
      nextPage: typeof data?.nextPage === 'number' ? data.nextPage : null,
    };
  },

  updateReadingItem: async (id: string, status: ReadingStatus): Promise<void> => {
    await api.patch(`/users/reading-list/${id}`, { status });
  },

  removeFromReadingList: async (id: string): Promise<void> => {
    await api.delete(`/users/reading-list/${id}`);
  },
};

