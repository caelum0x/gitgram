import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { API_BASE_URL } from '../constants/Config';
import { useAuthStore } from '../store/authStore';
import { backupService } from '../services/backupService';

/**
 * Drives the full GDPR data-export flow against the real backend
 * (backend/src/routes/dataExport.ts): request -> poll status -> download ->
 * share/save. Mirrors web/utils/dataExportFlow.ts (fixed in commit 842be56e).
 *
 * The backend generates the export asynchronously (2-5 min estimate), so this
 * polls until the job is 'ready' (or fails/expires), downloads the resulting
 * file into app storage via expo-file-system, then hands it to expo-sharing
 * so the user can save or share it. Used by app/backup/export.tsx, which
 * previously called `backupService.exportData` -> `/compliance/export-data`,
 * an endpoint that never existed on the backend and always 404'd.
 */

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 60; // ~3 minutes

export type DataExportPhase = 'requesting' | 'processing' | 'downloading' | 'done';

export interface DataExportFlowResult {
  exportId: string;
  fileUri: string;
}

export class DataExportTimeoutError extends Error {
  constructor(public exportId: string) {
    super('Export is taking longer than expected. Check back in a few minutes.');
    this.name = 'DataExportTimeoutError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAuthHeader(): Promise<Record<string, string>> {
  const { accessToken, refreshAccessToken } = useAuthStore.getState();
  const token = accessToken ?? (await refreshAccessToken());

  if (!token) {
    throw new Error('You must be signed in to export your data.');
  }

  return { Authorization: `Bearer ${token}` };
}

async function downloadExportFile(exportId: string): Promise<string> {
  const headers = await getAuthHeader();
  const url = `${API_BASE_URL}/data-export/${exportId}/download`;
  const destUri = `${FileSystem.cacheDirectory}gitgram-data-export-${exportId}.json`;

  const result = await FileSystem.downloadAsync(url, destUri, { headers });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Failed to download export (status ${result.status}).`);
  }

  return result.uri;
}

/**
 * Requests a new export, polls until it is ready, and downloads the file to
 * local app storage. Does not share/save the file — call `shareExportFile`
 * with the returned `fileUri` to let the user save or share it.
 */
export async function requestAndDownloadDataExport(
  onPhaseChange?: (phase: DataExportPhase) => void
): Promise<DataExportFlowResult> {
  onPhaseChange?.('requesting');
  const requested = await backupService.requestDataExport();
  const { exportId } = requested.data;

  onPhaseChange?.('processing');
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const statusResult = await backupService.getDataExportStatus(exportId);
    const { status } = statusResult.data;

    if (status === 'ready') {
      onPhaseChange?.('downloading');
      const fileUri = await downloadExportFile(exportId);
      onPhaseChange?.('done');
      return { exportId, fileUri };
    }

    if (status === 'failed') {
      throw new Error('Data export failed. Please try again.');
    }

    if (status === 'expired') {
      throw new Error('Data export expired before it could be downloaded. Please request a new one.');
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new DataExportTimeoutError(exportId);
}

/**
 * Hands the downloaded export file to the OS share sheet so the user can
 * save it (Files app, Drive, etc.) or share it elsewhere.
 */
export async function shareExportFile(fileUri: string): Promise<void> {
  const canShare = await Sharing.isAvailableAsync();

  if (!canShare) {
    throw new Error('Sharing is not available on this device. The file was saved to app storage.');
  }

  await Sharing.shareAsync(fileUri, {
    mimeType: 'application/json',
    dialogTitle: 'Save or share your data export',
  });
}
