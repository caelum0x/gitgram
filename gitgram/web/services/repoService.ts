import api from './api';
import { buildRepoPath } from '@/utils/repositoryRouting';

export interface Repository {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  description?: string;
  stars: number;
  forks: number;
  watchers?: number;
  language?: string;
  topics?: string[];
  htmlUrl: string;
  social: { comments: number; reactions: number; posts: number; followers: number };
  isFollowing: boolean;
  isSaved: boolean;
}

export interface RepoComment {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; username: string; avatar?: string };
}

export interface CodeSnippet {
  id: string;
  title: string;
  description?: string;
  code: string;
  language: string;
  likesCount: number;
  viewsCount: number;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; username: string; avatar?: string };
  repository?: { fullName: string };
}

export interface RepoDiscoveryParams {
  q?: string;
  tier?: 'HOT_NOW' | 'TRENDING_TODAY' | 'THIS_WEEK' | 'RISING_STARS';
  language?: string;
  topic?: string;
  limit?: number;
  offset?: number;
}

export interface PaginationResponse {
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

export interface RepoTextExportParams {
  maxFiles?: number;
  maxFileBytes?: number;
}

export const repoService = {
  parseUrl: (url: string) => api.get('/repositories/parse-url', { params: { url } }),
  getRepository: (owner: string, name: string) => api.get(`/repositories/${owner}/${name}`),
  getPosts: (owner: string, name: string, params?: { page?: number; limit?: number }) =>
    api.get(`/repositories/${owner}/${name}/posts`, { params }),
  getSnippets: (owner: string, name: string, params?: { page?: number; limit?: number }) =>
    api.get(`/repositories/${owner}/${name}/snippets`, { params }),
  getMedia: (owner: string, name: string, params?: { page?: number; limit?: number }) =>
    api.get(`/repositories/${owner}/${name}/media`, { params }),
  getActivity: (owner: string, name: string, params?: { page?: number; limit?: number; eventType?: string }) =>
    api.get(`/repositories/${owner}/${name}/activity`, { params }),
  createChangeStory: (
    owner: string,
    name: string,
    payload: {
      title?: string;
      summary?: string;
      checkpointId: string;
      fromCheckpointId?: string;
      aitmProjectId?: string;
      diffSummary?: { added?: number; removed?: number; modified?: number };
      changedFiles?: string[] | string;
    }
  ) => api.post(`/repositories/${owner}/${name}/change-story`, payload),
  follow: (owner: string, name: string) => api.post(`/repositories/${owner}/${name}/follow`),
  unfollow: (owner: string, name: string) => api.delete(`/repositories/${owner}/${name}/follow`),
  getFollowers: (owner: string, name: string) => api.get(`/repositories/${owner}/${name}/followers`),
  getComments: (owner: string, name: string) => api.get(`/repositories/${owner}/${name}/comments`),
  addComment: (owner: string, name: string, content: string) => api.post(`/repositories/${owner}/${name}/comments`, { content }),
  getReactions: (owner: string, name: string) => api.get(`/repositories/${owner}/${name}/reactions`),
  addReaction: (owner: string, name: string, type: string) => api.post(`/repositories/${owner}/${name}/reactions`, { type }),
  search: (params: RepoDiscoveryParams) => api.get('/v1/repositories/search', { params }),
  getTrending: (params?: RepoDiscoveryParams) => api.get('/v1/trending/repos', { params }),
  exportToText: async (owner: string, name: string, params?: RepoTextExportParams) => {
    const response = await api.get<string>(`/v1/repositories/${owner}/${name}/export/text`, {
      params,
      responseType: 'text',
    });
    return response.data;
  },

  // Share - copies the repo link
  shareRepo: async (owner: string, name: string) => {
    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}${buildRepoPath(owner, name)}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({ url, title: `${owner}/${name} on Gitgram` });
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
    }
    return url;
  },

  // AITM settings
  getAitmSettings: (owner: string, name: string) =>
    api.get(`/v1/repositories/${owner}/${name}/aitm-settings`),
  updateAitmSettings: (
    owner: string,
    name: string,
    payload: {
      aitmProjectId: string;
      aitmApiKey?: string;
      autoGenerateStories: boolean;
    }
  ) => api.put(`/v1/repositories/${owner}/${name}/aitm-settings`, payload),
  removeAitmSettings: (owner: string, name: string) =>
    api.delete(`/v1/repositories/${owner}/${name}/aitm-settings`),
};

export default repoService;
