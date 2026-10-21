import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  requestAndDownloadDataExport,
  shareExportFile,
  DataExportTimeoutError,
} from '../../utils/dataExportFlow';
import { backupService } from '../../services/backupService';
import { useAuthStore } from '../../store/authStore';

jest.mock('../../services/backupService');
jest.mock('../../store/authStore');

describe('dataExportFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();

    (useAuthStore.getState as jest.Mock) = jest.fn(() => ({
      accessToken: 'test-access-token',
      refreshAccessToken: jest.fn(),
    }));
  });

  describe('requestAndDownloadDataExport', () => {
    it('requests the export, polls until ready, then downloads the file', async () => {
      (backupService.requestDataExport as jest.Mock).mockResolvedValue({
        success: true,
        data: { exportId: 'export-abc', estimatedTime: '2-5 minutes', createdAt: 'now' },
      });

      (backupService.getDataExportStatus as jest.Mock)
        .mockResolvedValueOnce({
          success: true,
          data: { exportId: 'export-abc', status: 'processing', progress: 20 },
        })
        .mockResolvedValueOnce({
          success: true,
          data: { exportId: 'export-abc', status: 'ready', progress: 100 },
        });

      jest.useFakeTimers();
      const phases: string[] = [];
      const resultPromise = requestAndDownloadDataExport((phase) => phases.push(phase));
      await jest.advanceTimersByTimeAsync(3000);
      const result = await resultPromise;
      jest.useRealTimers();

      expect(backupService.requestDataExport).toHaveBeenCalledTimes(1);
      expect(backupService.getDataExportStatus).toHaveBeenCalledTimes(2);
      expect(FileSystem.downloadAsync).toHaveBeenCalledWith(
        expect.stringContaining('/data-export/export-abc/download'),
        expect.stringContaining('export-abc'),
        { headers: { Authorization: 'Bearer test-access-token' } }
      );
      expect(result).toEqual({
        exportId: 'export-abc',
        fileUri: 'file:///mock-cache/mock-export.json',
      });
      expect(phases).toEqual(['requesting', 'processing', 'downloading', 'done']);
    });

    it('falls back to a refreshed token when there is no access token yet', async () => {
      const refreshAccessToken = jest.fn().mockResolvedValue('refreshed-token');
      (useAuthStore.getState as jest.Mock).mockReturnValue({
        accessToken: null,
        refreshAccessToken,
      });

      (backupService.requestDataExport as jest.Mock).mockResolvedValue({
        success: true,
        data: { exportId: 'export-xyz', estimatedTime: '2-5 minutes', createdAt: 'now' },
      });
      (backupService.getDataExportStatus as jest.Mock).mockResolvedValue({
        success: true,
        data: { exportId: 'export-xyz', status: 'ready', progress: 100 },
      });

      await requestAndDownloadDataExport();

      expect(refreshAccessToken).toHaveBeenCalledTimes(1);
      expect(FileSystem.downloadAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        { headers: { Authorization: 'Bearer refreshed-token' } }
      );
    });

    it('throws when the user is not signed in and cannot refresh a token', async () => {
      (useAuthStore.getState as jest.Mock).mockReturnValue({
        accessToken: null,
        refreshAccessToken: jest.fn().mockResolvedValue(null),
      });

      (backupService.requestDataExport as jest.Mock).mockResolvedValue({
        success: true,
        data: { exportId: 'export-xyz', estimatedTime: '2-5 minutes', createdAt: 'now' },
      });
      (backupService.getDataExportStatus as jest.Mock).mockResolvedValue({
        success: true,
        data: { exportId: 'export-xyz', status: 'ready', progress: 100 },
      });

      await expect(requestAndDownloadDataExport()).rejects.toThrow(
        'You must be signed in to export your data.'
      );
    });

    it('throws a user-visible error when the export fails server-side', async () => {
      (backupService.requestDataExport as jest.Mock).mockResolvedValue({
        success: true,
        data: { exportId: 'export-fail', estimatedTime: '2-5 minutes', createdAt: 'now' },
      });
      (backupService.getDataExportStatus as jest.Mock).mockResolvedValue({
        success: true,
        data: { exportId: 'export-fail', status: 'failed', progress: 0 },
      });

      await expect(requestAndDownloadDataExport()).rejects.toThrow(
        'Data export failed. Please try again.'
      );
    });

    it('throws a user-visible error when the export expires before download', async () => {
      (backupService.requestDataExport as jest.Mock).mockResolvedValue({
        success: true,
        data: { exportId: 'export-expired', estimatedTime: '2-5 minutes', createdAt: 'now' },
      });
      (backupService.getDataExportStatus as jest.Mock).mockResolvedValue({
        success: true,
        data: { exportId: 'export-expired', status: 'expired', progress: 100 },
      });

      await expect(requestAndDownloadDataExport()).rejects.toThrow(
        'Data export expired before it could be downloaded. Please request a new one.'
      );
    });

    it('propagates the request error without silently swallowing it', async () => {
      (backupService.requestDataExport as jest.Mock).mockRejectedValue(
        new Error('Network request failed')
      );

      await expect(requestAndDownloadDataExport()).rejects.toThrow('Network request failed');
      expect(backupService.getDataExportStatus).not.toHaveBeenCalled();
    });

    it('throws DataExportTimeoutError when the export never becomes ready', async () => {
      (backupService.requestDataExport as jest.Mock).mockResolvedValue({
        success: true,
        data: { exportId: 'export-slow', estimatedTime: '2-5 minutes', createdAt: 'now' },
      });
      (backupService.getDataExportStatus as jest.Mock).mockResolvedValue({
        success: true,
        data: { exportId: 'export-slow', status: 'processing', progress: 10 },
      });

      jest.useFakeTimers();
      // Attach the rejection assertion synchronously, right when the promise
      // is created, so Node never sees it as unhandled while the fake timers
      // are advanced below.
      const assertion = expect(requestAndDownloadDataExport()).rejects.toBeInstanceOf(
        DataExportTimeoutError
      );
      // Let every poll's sleep() resolve without waiting real wall-clock time.
      await jest.advanceTimersByTimeAsync(3000 * 61);

      await assertion;
      jest.useRealTimers();
    }, 15000);

    it('surfaces a non-2xx download status as a thrown error', async () => {
      (backupService.requestDataExport as jest.Mock).mockResolvedValue({
        success: true,
        data: { exportId: 'export-bad', estimatedTime: '2-5 minutes', createdAt: 'now' },
      });
      (backupService.getDataExportStatus as jest.Mock).mockResolvedValue({
        success: true,
        data: { exportId: 'export-bad', status: 'ready', progress: 100 },
      });
      (FileSystem.downloadAsync as jest.Mock).mockResolvedValueOnce({
        uri: 'file:///mock-cache/export-bad.json',
        status: 410,
      });

      await expect(requestAndDownloadDataExport()).rejects.toThrow(
        'Failed to download export (status 410).'
      );
    });
  });

  describe('shareExportFile', () => {
    it('shares the downloaded file via the OS share sheet', async () => {
      await shareExportFile('file:///mock-cache/mock-export.json');

      expect(Sharing.isAvailableAsync).toHaveBeenCalledTimes(1);
      expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///mock-cache/mock-export.json', {
        mimeType: 'application/json',
        dialogTitle: 'Save or share your data export',
      });
    });

    it('throws a user-visible error when sharing is unavailable on this device', async () => {
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(false);

      await expect(shareExportFile('file:///mock-cache/mock-export.json')).rejects.toThrow(
        'Sharing is not available on this device. The file was saved to app storage.'
      );
      expect(Sharing.shareAsync).not.toHaveBeenCalled();
    });
  });
});
