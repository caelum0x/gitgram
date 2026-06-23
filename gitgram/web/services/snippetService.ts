import api from './api';

export interface Snippet {
  id: string;
  userId: string;
  repositoryId?: string;
  title?: string;
  description?: string;
  code: string;
  language: string;
  likesCount: number;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    username: string;
    avatar?: string;
  };
  repository?: {
    fullName: string;
    htmlUrl?: string;
  };
  isLiked?: boolean;
}

export interface SnippetListResponse {
  snippets: Snippet[];
  total: number;
  page: number;
  totalPages: number;
}

export const snippetService = {
  // Create a new snippet
  async createSnippet(data: {
    title?: string;
    description?: string;
    code: string;
    language: string;
    repositoryId?: string;
  }): Promise<Snippet> {
    const response = await api.post('/v1/snippets', data);
    return response.data;
  },

  // Get snippets with optional filters
  async getSnippets(params: {
    language?: string;
    repositoryId?: string;
    userId?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<SnippetListResponse> {
    const response = await api.get('/v1/snippets', { params });
    return response.data;
  },

  // Get a single snippet
  async getSnippet(id: string): Promise<Snippet> {
    const response = await api.get(`/v1/snippets/${id}`);
    return response.data;
  },

  // Update a snippet
  async updateSnippet(
    id: string,
    data: {
      title?: string;
      description?: string;
      code?: string;
      language?: string;
    }
  ): Promise<Snippet> {
    const response = await api.put(`/v1/snippets/${id}`, data);
    return response.data;
  },

  // Delete a snippet
  async deleteSnippet(id: string): Promise<void> {
    await api.delete(`/v1/snippets/${id}`);
  },

  // Like/unlike a snippet
  async likeSnippet(id: string): Promise<{ liked: boolean }> {
    const response = await api.post(`/v1/snippets/${id}/like`);
    return response.data;
  },

  // Get trending snippets
  async getTrendingSnippets(params: {
    language?: string;
    limit?: number;
  } = {}): Promise<Snippet[]> {
    const response = await api.get('/v1/snippets/trending', { params });
    return response.data;
  },
};

export default snippetService;
