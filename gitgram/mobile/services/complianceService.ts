import api from './api';

export const complianceService = {
  exportUserData: async () => {
    const response = await api.get('/v1/compliance/export-data');
    return response.data;
  },

  deleteAccount: async () => {
    const response = await api.delete('/v1/compliance/account');
    return response.data;
  },

  updateDataRetention: async (retentionDays: number) => {
    const response = await api.put('/v1/compliance/retention', {
      retentionDays,
    });
    return response.data;
  },
};

