/// <reference types="vitest/globals" />
import { describe, it, expect, vi, beforeEach } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import api from '@/services/api'
import { repoService } from '@/services/repoService'

const mock = new MockAdapter(api)

describe('repoService', () => {
  beforeEach(() => {
    mock.reset()
  })

  it('exports repository text through the v1 endpoint', async () => {
    mock.onGet('/v1/repositories/vercel/next.js/export/text').reply((config) => {
      expect(config.params).toEqual({ maxFiles: 10, maxFileBytes: 5000 })
      expect(config.responseType).toBe('text')
      return [200, '<repo-to-text>ok</repo-to-text>']
    })

    const result = await repoService.exportToText('vercel', 'next.js', {
      maxFiles: 10,
      maxFileBytes: 5000,
    })

    expect(result).toBe('<repo-to-text>ok</repo-to-text>')
  })
})
