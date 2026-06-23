import api from './api';

export const verificationService = {
  requestVerification: async (data: {
    type: 'standard' | 'golden';
    reason: string;
    evidence?: string;
  }) => {
    const formData = new FormData();
    formData.append('type', data.type);
    formData.append('reason', data.reason);
    if (data.evidence) {
      formData.append('evidence', {
        uri: data.evidence,
        type: 'image/jpeg',
        name: 'evidence.jpg',
      } as any);
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
};

