import api from './api'

export const storeService = {
  getItems: async (page = 1, limit = 20, category?: string, search?: string) => {
    const response = await api.get('/v1/store/items', {
      params: { page, limit, category, search },
    })
    return response.data
  },

  getItem: async (itemId: string) => {
    const response = await api.get(`/v1/store/items/${itemId}`)
    return response.data
  },

  createItem: async (formData: FormData) => {
    const response = await api.post('/v1/store/items', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },

  updateItem: async (itemId: string, data: FormData) => {
    const response = await api.put(`/v1/store/items/${itemId}`, data, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },

  deleteItem: async (itemId: string) => {
    const response = await api.delete(`/v1/store/items/${itemId}`)
    return response.data
  },

  purchaseItem: async (itemId: string) => {
    const response = await api.post(`/v1/store/items/${itemId}/purchase`)
    return response.data
  },

  getMyItems: async () => {
    const response = await api.get('/v1/store/my/items')
    return response.data
  },

  getPurchaseHistory: async () => {
    const response = await api.get('/v1/store/my/purchases')
    return response.data
  },
}

