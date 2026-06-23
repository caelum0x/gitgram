import api from './api';

export interface CodeSnippet {
  id: string;
  title: string;
  description?: string;
  code: string;
  language: string;
  isPublic: boolean;
  likesCount: number;
  viewsCount: number;
  createdAt: string;
  user?: {
    id: string;
    username: string;
    avatar?: string;
  };
  repository?: {
    fullName: string;
    htmlUrl: string;
  };
}

export interface CreateSnippetData {
  title?: string;
  description?: string;
  code: string;
  language: string;
  repositoryId?: string;
  isPublic?: boolean;
}

export const snippetService = {
  getSnippets: async (params?: {
    language?: string;
    repositoryId?: string;
    userId?: string;
    mine?: boolean;
    q?: string;
    page?: number;
    limit?: number;
  }) => {
    const { data } = await api.get('/v1/snippets', { params });
    return data;
  },

  getSnippet: async (id: string) => {
    const { data } = await api.get(`/v1/snippets/${id}`);
    return data;
  },

  createSnippet: async (snippetData: CreateSnippetData) => {
    const { data } = await api.post('/v1/snippets', snippetData);
    return data;
  },

  updateSnippet: async (id: string, snippetData: Partial<CreateSnippetData>) => {
    const { data } = await api.put(`/v1/snippets/${id}`, snippetData);
    return data;
  },

  deleteSnippet: async (id: string) => {
    const { data } = await api.delete(`/v1/snippets/${id}`);
    return data;
  },

  likeSnippet: async (id: string) => {
    const { data } = await api.post(`/v1/snippets/${id}/like`);
    return data;
  },

  getTrendingSnippets: async (language?: string, limit = 10) => {
    const params: any = { limit };
    if (language) params.language = language;
    const { data } = await api.get('/v1/snippets/trending', { params });
    return data;
  },

  // Get snippets from a specific repository
  getRepositorySnippets: async (repositoryId: string, page = 1, limit = 20) => {
    const { data } = await api.get('/v1/snippets', {
      params: { repositoryId, page, limit },
    });
    return data;
  },

  // Get current user's snippets
  getMySnippets: async (page = 1, limit = 20) => {
    const { data } = await api.get('/v1/snippets', {
      params: { mine: true, page, limit },
    });
    return data;
  },

  // Search snippets
  searchSnippets: async (query: string, language?: string, page = 1, limit = 20) => {
    const params: any = { q: query, page, limit };
    if (language) params.language = language;
    const { data } = await api.get('/v1/snippets', { params });
    return data;
  },
};
