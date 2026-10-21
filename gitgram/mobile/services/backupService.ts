import api from './api';

export type DataExportStatus = 'processing' | 'ready' | 'expired' | 'failed';

export interface DataExportRequestResponse {
  success: boolean;
  data: {
    exportId: string;
    estimatedTime: string;
    createdAt: string;
  };
}

export interface DataExportStatusResponse {
  success: boolean;
  data: {
    exportId: string;
    status: DataExportStatus;
    progress: number;
  };
}

export const backupService = {
  /**
   * @deprecated Hits `/compliance/export-data`, which does not exist on the
   * backend (always 404s). Use `requestDataExport` + `getDataExportStatus` +
   * `utils/dataExportFlow.ts`'s `requestAndDownloadDataExport`, which drive the
   * real GDPR export pipeline at `/api/v1/data-export` (see
   * backend/src/routes/dataExport.ts). Matches the web fix in commit 842be56e.
   */
  exportData: async (format: 'json' | 'csv') => {
    const response = await api.post('/compliance/export-data', { format });
    return response.data;
  },

  // Data export (GDPR). Backend flow is async: request -> poll status -> download
  // once ready. See backend/src/routes/dataExport.ts + services/dataExportService.ts.
  requestDataExport: async (): Promise<DataExportRequestResponse> => {
    const { data } = await api.post('/data-export/request');
    return data;
  },

  getDataExportStatus: async (exportId: string): Promise<DataExportStatusResponse> => {
    const { data } = await api.get(`/data-export/${exportId}/status`);
    return data;
  },

  importData: async (fileUri: string) => {
    const formData = new FormData();
    formData.append('file', {
      uri: fileUri,
      type: 'application/json',
      name: 'data.json',
    } as any);

    const response = await api.post('/compliance/import-data', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};

