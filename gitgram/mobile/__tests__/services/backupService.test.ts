import { backupService } from '../../services/backupService';
import api from '../../services/api';

jest.mock('../../services/api');

describe('backupService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requestDataExport', () => {
    it('calls the real GDPR export request endpoint', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: {
            exportId: 'export-123',
            estimatedTime: '2-5 minutes',
            createdAt: '2026-10-21T00:00:00.000Z',
          },
        },
      };

      (api.post as jest.Mock).mockResolvedValue(mockResponse);

      const result = await backupService.requestDataExport();

      expect(api.post).toHaveBeenCalledWith('/data-export/request');
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('getDataExportStatus', () => {
    it('calls the status endpoint with the exportId path param', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: { exportId: 'export-123', status: 'processing', progress: 40 },
        },
      };

      (api.get as jest.Mock).mockResolvedValue(mockResponse);

      const result = await backupService.getDataExportStatus('export-123');

      expect(api.get).toHaveBeenCalledWith('/data-export/export-123/status');
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('exportData (legacy, deprecated)', () => {
    it('still calls the old non-existent compliance endpoint', async () => {
      const mockResponse = { data: { message: 'queued' } };
      (api.post as jest.Mock).mockResolvedValue(mockResponse);

      await backupService.exportData('json');

      expect(api.post).toHaveBeenCalledWith('/compliance/export-data', { format: 'json' });
    });
  });
});
