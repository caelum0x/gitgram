import api from './api';

export const complianceService = {
  exportUserData: async () => {
    const response = await api.get('/compliance/export-data');
    return response.data;
  },

  /**
   * Deletes the account. The backend lives at `DELETE /auth/delete-account`
   * (not `/compliance/account`, which never existed and always 404'd).
   * Password accounts must pass `password`; OAuth-only accounts omit it.
   */
  deleteAccount: async (password?: string) => {
    const response = await api.delete('/auth/delete-account', {
      data: password ? { password } : {},
    });
    return response.data;
  },

  updateDataRetention: async (retentionDays: number) => {
    const response = await api.put('/compliance/retention', {
      retentionDays,
    });
    return response.data;
  },
};

