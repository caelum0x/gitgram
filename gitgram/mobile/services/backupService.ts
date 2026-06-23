import api from './api';

export const backupService = {
  exportData: async (format: 'json' | 'csv') => {
    const response = await api.post('/v1/compliance/export-data', { format });
    return response.data;
  },

  importData: async (fileUri: string) => {
    const formData = new FormData();
    formData.append('file', {
      uri: fileUri,
      type: 'application/json',
      name: 'data.json',
    } as any);

    const response = await api.post('/v1/compliance/import-data', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};

