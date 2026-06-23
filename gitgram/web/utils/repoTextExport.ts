export const DEFAULT_REPO_TEXT_MAX_FILES = 60
export const MIN_REPO_TEXT_MAX_FILES = 1
export const MAX_REPO_TEXT_MAX_FILES = 200

export const DEFAULT_REPO_TEXT_MAX_FILE_BYTES = 20_000
export const MIN_REPO_TEXT_MAX_FILE_BYTES = 1_000
export const MAX_REPO_TEXT_MAX_FILE_BYTES = 100_000

export interface RepoTextExportOptions {
  maxFiles: number
  maxFileBytes: number
}

type QueryValue = string | number | null | undefined

export const clampRepoTextMaxFiles = (value: QueryValue) =>
  clampInteger(value, DEFAULT_REPO_TEXT_MAX_FILES, MIN_REPO_TEXT_MAX_FILES, MAX_REPO_TEXT_MAX_FILES)

export const clampRepoTextMaxFileBytes = (value: QueryValue) =>
  clampInteger(
    value,
    DEFAULT_REPO_TEXT_MAX_FILE_BYTES,
    MIN_REPO_TEXT_MAX_FILE_BYTES,
    MAX_REPO_TEXT_MAX_FILE_BYTES
  )

export const normalizeRepoTextExportOptions = (input: {
  maxFiles?: QueryValue
  maxFileBytes?: QueryValue
}): RepoTextExportOptions => ({
  maxFiles: clampRepoTextMaxFiles(input.maxFiles),
  maxFileBytes: clampRepoTextMaxFileBytes(input.maxFileBytes),
})

export const buildRepoTextExportSearchParams = (options: RepoTextExportOptions) => {
  const params = new URLSearchParams()

  if (options.maxFiles !== DEFAULT_REPO_TEXT_MAX_FILES) {
    params.set('maxFiles', String(options.maxFiles))
  }

  if (options.maxFileBytes !== DEFAULT_REPO_TEXT_MAX_FILE_BYTES) {
    params.set('maxFileBytes', String(options.maxFileBytes))
  }

  return params
}

function clampInteger(value: QueryValue, fallback: number, min: number, max: number) {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN

  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.min(max, Math.max(min, Math.floor(parsed)))
}
