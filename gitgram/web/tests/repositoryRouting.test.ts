import { describe, expect, it } from 'vitest'
import {
  buildLegacyRepoTextRawPath,
  buildLegacyRepoTextPath,
  buildLegacyRepoPath,
  buildRepoPath,
  buildRepoTextRawPath,
  buildRepoTextPath,
  isReservedRepoAliasSegment,
  parseRepositoryInput,
} from '@/utils/repositoryRouting'

describe('repositoryRouting', () => {
  it('parses full GitHub repository URLs', () => {
    expect(parseRepositoryInput('https://github.com/facebook/react')).toEqual({
      owner: 'facebook',
      name: 'react',
      fullName: 'facebook/react',
    })
  })

  it('parses GitHub URLs with trailing segments and query params', () => {
    expect(parseRepositoryInput('https://github.com/vercel/next.js/tree/canary?tab=readme-ov-file')).toEqual({
      owner: 'vercel',
      name: 'next.js',
      fullName: 'vercel/next.js',
    })
  })

  it('parses SSH GitHub repository URLs', () => {
    expect(parseRepositoryInput('git@github.com:openai/openai-cookbook.git')).toEqual({
      owner: 'openai',
      name: 'openai-cookbook',
      fullName: 'openai/openai-cookbook',
    })
  })

  it('parses owner/repo shorthand', () => {
    expect(parseRepositoryInput('microsoft/vscode')).toEqual({
      owner: 'microsoft',
      name: 'vscode',
      fullName: 'microsoft/vscode',
    })
  })

  it('rejects non-repository search text', () => {
    expect(parseRepositoryInput('react hooks')).toBeNull()
  })

  it('builds short and legacy repo paths', () => {
    expect(buildRepoPath('facebook', 'react')).toBe('/facebook/react')
    expect(buildLegacyRepoPath('facebook', 'react')).toBe('/repo/facebook/react')
    expect(buildRepoTextPath('facebook', 'react')).toBe('/facebook/react/text')
    expect(buildLegacyRepoTextPath('facebook', 'react')).toBe('/repo/facebook/react/text')
    expect(buildRepoTextRawPath('facebook', 'react')).toBe('/facebook/react/text/raw')
    expect(buildLegacyRepoTextRawPath('facebook', 'react')).toBe('/repo/facebook/react/text/raw')
  })

  it('marks reserved top-level segments', () => {
    expect(isReservedRepoAliasSegment('repo')).toBe(true)
    expect(isReservedRepoAliasSegment('profile')).toBe(true)
    expect(isReservedRepoAliasSegment('facebook')).toBe(false)
  })
})
