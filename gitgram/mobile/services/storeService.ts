import api from './api';

export interface StoreItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  category?: string;
  images?: string[];
  rating?: number;
  purchaseCount?: number;
  isActive?: boolean;
  createdAt?: string;
  seller?: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
}

export const storeService = {
  getItems: async (category?: string, page = 1, limit = 20, searchQuery?: string) => {
    const params: Record<string, string | number> = { page, limit };
    if (category) params.category = category;
    if (searchQuery) {
      params.q = searchQuery;
    }
    const response = await api.get('/store/items', { params });
    return response.data;
  },

  getItem: async (itemId: string) => {
    const response = await api.get(`/store/items/${itemId}`);
    return response.data;
  },

  createItem: async (data: FormData | {
    title: string;
    description: string;
    price: number;
    category: string;
    images: string[];
  }) => {
    const headers = data instanceof FormData 
      ? { 'Content-Type': 'multipart/form-data' }
      : {};
    const response = await api.post('/store/items', data, { headers });
    return response.data;
  },

  purchaseItem: async (itemId: string) => {
    const response = await api.post(`/store/items/${itemId}/purchase`);
    return response.data;
  },

  getMyItems: async () => {
    const response = await api.get('/store/my/items');
    return response.data;
  },

  getPurchaseHistory: async () => {
    const response = await api.get('/store/my/purchases');
    return response.data;
  },

  updateItem: async (itemId: string, data: {
    title?: string;
    description?: string;
    price?: number;
    category?: string;
    isActive?: boolean;
  }) => {
    const response = await api.put(`/store/${itemId}`, data);
    return response.data;
  },

  deleteItem: async (itemId: string) => {
    const response = await api.delete(`/store/${itemId}`);
    return response.data;
  },

  getCategoryCounts: async () => {
    const response = await api.get('/store/categories');
    return response.data;
  },
};

