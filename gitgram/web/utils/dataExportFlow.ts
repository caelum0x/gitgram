import { userService } from '@/services/userService'

/**
 * Drives the full GDPR data-export flow against the real backend
 * (backend/src/routes/dataExport.ts): request -> poll status -> download.
 *
 * The backend generates the export asynchronously (2-5 min estimate), so this
 * polls until the job is 'ready' (or fails/expires), then streams the file
 * and triggers a browser download. Used by both settings/privacy and
 * settings/data, which previously called endpoints that never existed on the
 * backend (`/v1/settings/data`, `/v1/compliance/export-data`) and always 404'd.
 */

const POLL_INTERVAL_MS = 3000
const MAX_POLL_ATTEMPTS = 60 // ~3 minutes

export type DataExportPhase = 'requesting' | 'processing' | 'downloading' | 'done'

export interface DataExportFlowResult {
  exportId: string
}

export class DataExportTimeoutError extends Error {
  constructor(public exportId: string) {
    super('Export is taking longer than expected. Check back in a few minutes.')
    this.name = 'DataExportTimeoutError'
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export async function requestAndDownloadDataExport(
  onPhaseChange?: (phase: DataExportPhase) => void
): Promise<DataExportFlowResult> {
  onPhaseChange?.('requesting')
  const requested = await userService.requestDataExport()
  const exportId = requested.data.exportId

  onPhaseChange?.('processing')
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const statusResult = await userService.getExportStatus(exportId)
    const { status } = statusResult.data

    if (status === 'ready') {
      onPhaseChange?.('downloading')
      const blob = await userService.downloadDataExport(exportId)
      triggerBlobDownload(blob, `gitgram-data-export-${new Date().toISOString()}.json`)
      onPhaseChange?.('done')
      return { exportId }
    }

    if (status === 'failed') {
      throw new Error('Data export failed. Please try again.')
    }

    if (status === 'expired') {
      throw new Error('Data export expired before it could be downloaded. Please request a new one.')
    }

    await sleep(POLL_INTERVAL_MS)
  }

  throw new DataExportTimeoutError(exportId)
}
