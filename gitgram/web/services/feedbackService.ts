import api from './api'

interface UploadImageResponse {
  url: string
}

export const feedbackService = {
  /**
   * Upload a screenshot image and return its hosted URL.
   * Uses the shared image upload endpoint (multipart/form-data).
   */
  uploadScreenshot: async (file: File): Promise<string> => {
    const formData = new FormData()
    formData.append('file', file)
    const { data } = await api.post<UploadImageResponse>('/v1/upload/image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data.url
  },

  createFeedback: async (data: {
    type: 'bug' | 'feature' | 'other'
    title: string
    content: string
    screenshotUrl?: string
  }) => {
    const response = await api.post('/v1/feedback', data)
    return response.data
  },

  getFeedbacks: async (page = 1, limit = 20) => {
    const response = await api.get('/v1/feedback', {
      params: { page, limit },
    })
    return response.data
  },

  getFeedback: async (feedbackId: string) => {
    const response = await api.get(`/v1/feedback/${feedbackId}`)
    return response.data
  },
}

