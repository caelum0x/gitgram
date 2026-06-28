import { describe, it, expect } from 'vitest'
import { parseGithubUrl } from '../utils/repositoryRouting'

describe('GitHub URL -> Gitgram account transformation', () => {
  it('maps a GitHub user URL to a Gitgram user account', () => {
    const ref = parseGithubUrl('https://github.com/caelum0x')
    expect(ref).toEqual({ type: 'user', owner: 'caelum0x', gitgramPath: '/caelum0x' })
  })

  it('maps a GitHub repo URL to a Gitgram repo account', () => {
    const ref = parseGithubUrl('https://github.com/caelum0x/settlekit')
    expect(ref).toEqual({
      type: 'repo',
      owner: 'caelum0x',
      name: 'settlekit',
      gitgramPath: '/caelum0x/settlekit',
    })
  })

  it('handles www, trailing slash, .git, and deep paths', () => {
    expect(parseGithubUrl('https://www.github.com/caelum0x/')?.gitgramPath).toBe('/caelum0x')
    expect(parseGithubUrl('https://github.com/caelum0x/settlekit.git')?.gitgramPath).toBe('/caelum0x/settlekit')
    expect(parseGithubUrl('https://github.com/caelum0x/settlekit/tree/main')?.gitgramPath).toBe('/caelum0x/settlekit')
    expect(parseGithubUrl('git@github.com:caelum0x/settlekit.git')?.gitgramPath).toBe('/caelum0x/settlekit')
  })

  it('handles shorthand (owner, owner/repo, @handle)', () => {
    expect(parseGithubUrl('caelum0x')).toEqual({ type: 'user', owner: 'caelum0x', gitgramPath: '/caelum0x' })
    expect(parseGithubUrl('@caelum0x')?.owner).toBe('caelum0x')
    expect(parseGithubUrl('caelum0x/settlekit')?.gitgramPath).toBe('/caelum0x/settlekit')
  })

  it('rejects reserved route segments and junk', () => {
    expect(parseGithubUrl('https://github.com/settings')).toBeNull()
    expect(parseGithubUrl('explore')).toBeNull()
    expect(parseGithubUrl('')).toBeNull()
  })
})
