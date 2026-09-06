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

describe('talentGraphService recruiter unlock revenue', () => {
  beforeEach(() => {
    mock.reset()
  })

  it('lists placement entitlements for an opportunity', async () => {
    mock.onGet('/v1/talent-graph/opportunities/opp-1/unlocks').reply(200, {
      data: [{ id: 'plc-1', opportunityId: 'opp-1', candidateId: 'cand-1', status: 'paid', feeCents: 4900 }],
    })

    const placements = await talentGraphService.listUnlocks('opp-1')

    expect(placements).toHaveLength(1)
    expect(placements[0].status).toBe('paid')
  })

  it('posts an unlock request with the idempotency header and returns a checkout URL', async () => {
    let sentHeaders: Record<string, unknown> = {}
    let sentBody: unknown = null
    mock.onPost('/v1/talent-graph/opportunities/opp-1/unlocks').reply((config) => {
      sentHeaders = (config.headers ?? {}) as Record<string, unknown>
      sentBody = JSON.parse(config.data)
      return [201, {
        data: {
          placement: { id: 'plc-1', status: 'pending', feeCents: 4900 },
          checkoutUrl: 'https://test-api.creem.io/checkout/abc',
          alreadyUnlocked: false,
        },
      }]
    })

    const result = await talentGraphService.requestUnlock('opp-1', 'cand-1', 'idem-key-1')

    expect(sentHeaders['Idempotency-Key']).toBe('idem-key-1')
    expect(sentBody).toEqual({ candidateId: 'cand-1' })
    expect(result.checkoutUrl).toBe('https://test-api.creem.io/checkout/abc')
    expect(result.alreadyUnlocked).toBe(false)
  })

  it('includes the placement amount when a success fee is requested', async () => {
    let sentBody: unknown = null
    mock.onPost('/v1/talent-graph/opportunities/opp-1/unlocks').reply((config) => {
      sentBody = JSON.parse(config.data)
      return [201, { data: { placement: { id: 'plc-1', status: 'pending' }, checkoutUrl: 'https://x', alreadyUnlocked: false } }]
    })

    await talentGraphService.requestUnlock('opp-1', 'cand-1', 'idem-key-2', 1_500_000)

    expect(sentBody).toEqual({ candidateId: 'cand-1', placementAmountCents: 1_500_000 })
  })

  it('reports an already-unlocked entitlement with no checkout URL', async () => {
    mock.onPost('/v1/talent-graph/opportunities/opp-1/unlocks').reply(200, {
      data: { placement: { id: 'plc-1', status: 'paid' }, checkoutUrl: null, alreadyUnlocked: true },
    })

    const result = await talentGraphService.requestUnlock('opp-1', 'cand-1', 'idem-key-3')

    expect(result.alreadyUnlocked).toBe(true)
    expect(result.checkoutUrl).toBeNull()
  })

  it('reads gated candidate contact + evidence once unlocked', async () => {
    mock.onGet('/v1/talent-graph/opportunities/opp-1/candidates/cand-1/contact').reply(200, {
      data: {
        contact: { id: 'cand-1', username: 'octocat', displayName: 'Octo Cat', email: 'octo@example.com', githubUsername: 'octocat' },
        evidence: { profile: { id: 'cand-1' }, projects: [] },
      },
    })

    const contact = await talentGraphService.getCandidateContact('opp-1', 'cand-1')

    expect(contact.contact.email).toBe('octo@example.com')
    expect(contact.contact.githubUsername).toBe('octocat')
  })

  it('propagates a 402 Payment Required when the candidate is not yet unlocked', async () => {
    mock.onGet('/v1/talent-graph/opportunities/opp-1/candidates/cand-1/contact').reply(402, {
      error: { message: 'Unlock this candidate to view their contact details and full evidence' },
    })

    await expect(talentGraphService.getCandidateContact('opp-1', 'cand-1')).rejects.toMatchObject({
      response: { status: 402 },
    })
  })

  it('encodes ids in the contact request path', async () => {
    let requestedUrl = ''
    mock.onGet(/\/talent-graph\/opportunities\/.*\/candidates\/.*\/contact/).reply((config) => {
      requestedUrl = config.url || ''
      return [200, { data: { contact: { id: 'a/b' }, evidence: { profile: { id: 'a/b' }, projects: [] } } }]
    })

    await talentGraphService.getCandidateContact('opp/1', 'cand/2')

    expect(requestedUrl).toContain('/talent-graph/opportunities/opp%2F1/candidates/cand%2F2/contact')
  })
})
