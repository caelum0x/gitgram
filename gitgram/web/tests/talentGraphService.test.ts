/// <reference types="vitest/globals" />
import { describe, it, expect, beforeEach } from 'vitest'
import MockAdapter from 'axios-mock-adapter'
import api from '@/services/api'
import { talentGraphService, type NeedCoverageAnalysis } from '@/services/talentGraphService'

const mock = new MockAdapter(api)

describe('talentGraphService.getOpportunityCoverage', () => {
  beforeEach(() => {
    mock.reset()
  })

  it('reads the coverage endpoint and returns the gap analysis for an opportunity', async () => {
    const coverage: NeedCoverageAnalysis = {
      requiredSkills: ['javascript', 'kubernetes'],
      coverage: [
        { skill: 'javascript', strength: 'verified', candidateCount: 3, evidencedCount: 2, verifiedCount: 1 },
        { skill: 'kubernetes', strength: 'unmet', candidateCount: 0, evidencedCount: 0, verifiedCount: 0 },
      ],
      unmetSkills: ['kubernetes'],
      coverageRatio: 0.5,
      status: 'partially-covered',
      candidatePool: 4,
    }

    mock.onGet('/v1/talent-graph/opportunities/opp-1/coverage').reply(200, {
      data: { opportunity: { id: 'opp-1' }, coverage },
    })

    const result = await talentGraphService.getOpportunityCoverage('opp-1')

    expect(result.opportunity.id).toBe('opp-1')
    expect(result.coverage.status).toBe('partially-covered')
    expect(result.coverage.unmetSkills).toEqual(['kubernetes'])
    expect(result.coverage.coverage[0].strength).toBe('verified')
  })

  it('encodes the opportunity id in the request path', async () => {
    let requestedUrl = ''
    mock.onGet(/\/talent-graph\/opportunities\/.*\/coverage/).reply((config) => {
      requestedUrl = config.url || ''
      return [200, { data: { opportunity: { id: 'a/b' }, coverage: { requiredSkills: [], coverage: [], unmetSkills: [], coverageRatio: 0, status: 'unmet', candidatePool: 0 } } }]
    })

    await talentGraphService.getOpportunityCoverage('a/b')

    expect(requestedUrl).toContain('/talent-graph/opportunities/a%2Fb/coverage')
  })
})
