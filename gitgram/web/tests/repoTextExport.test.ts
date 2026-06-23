import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REPO_TEXT_MAX_FILE_BYTES,
  DEFAULT_REPO_TEXT_MAX_FILES,
  buildRepoTextExportSearchParams,
  normalizeRepoTextExportOptions,
} from '@/utils/repoTextExport'

describe('repoTextExport', () => {
  it('normalizes invalid values to defaults', () => {
    expect(
      normalizeRepoTextExportOptions({
        maxFiles: 'abc',
        maxFileBytes: null,
      })
    ).toEqual({
      maxFiles: DEFAULT_REPO_TEXT_MAX_FILES,
      maxFileBytes: DEFAULT_REPO_TEXT_MAX_FILE_BYTES,
    })
  })

  it('clamps export values into supported bounds', () => {
    expect(
      normalizeRepoTextExportOptions({
        maxFiles: '999',
        maxFileBytes: '50',
      })
    ).toEqual({
      maxFiles: 200,
      maxFileBytes: 1000,
    })
  })

  it('omits default values from the query string', () => {
    expect(
      buildRepoTextExportSearchParams({
        maxFiles: DEFAULT_REPO_TEXT_MAX_FILES,
        maxFileBytes: DEFAULT_REPO_TEXT_MAX_FILE_BYTES,
      }).toString()
    ).toBe('')
  })

  it('serializes non-default values into query params', () => {
    expect(
      buildRepoTextExportSearchParams({
        maxFiles: 80,
        maxFileBytes: 50000,
      }).toString()
    ).toBe('maxFiles=80&maxFileBytes=50000')
  })
})
