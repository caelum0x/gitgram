import api from './api'

export type TalentVerificationLevel = 'verified' | 'linked' | 'recorded'

export interface TalentEvidence {
  id: string
  kind: 'repository_claim' | 'github_sync' | 'github_activity' | 'project_record' | 'institutional_pilot'
  label: string
  detail: string
  occurredAt: string
  sourceUrl: string | null
}

export interface TalentProject {
  id: string
  source: 'repository' | 'project'
  name: string
  fullName: string
  description: string | null
  url: string | null
  language: string | null
  topics: string[]
  stars: number
  forks: number
  role: string
  verificationLevel: TalentVerificationLevel
  lastVerifiedAt: string
  evidence: TalentEvidence[]
}

export interface TalentCollaborator {
  id: string
  username: string | null
  displayName: string | null
  avatarUrl: string | null
  githubUsername: string | null
  sharedProjects: Array<{
    id: string
    fullName: string
    url: string
    theirRole: string
    yourRole: string
  }>
}

export interface TalentGraph {
  profile: {
    id: string
    username: string | null
    displayName: string | null
    avatarUrl: string | null
    bio: string | null
    githubUsername: string | null
    githubConnected: boolean
    memberSince: string
  }
  summary: {
    projectCount: number
    verifiedProjectCount: number
    recordedActivityCount: number
    collaboratorCount: number
  }
  projects: TalentProject[]
  collaborators: TalentCollaborator[]
  generatedAt: string
}

export type TalentOpportunityStatus = 'OPEN' | 'MATCHING' | 'PILOT' | 'CLOSED'

export interface TalentPilotSummary {
  id: string
  participantId: string
  status: 'PLANNED' | 'ACTIVE' | 'REVIEW' | 'COMPLETED' | 'CANCELLED'
  updatedAt: string
  revision: number
}

export interface TalentPilotStatusTransition {
  id: string
  pilotId: string
  actorId: string
  previousStatus: TalentPilotSummary['status']
  nextStatus: TalentPilotSummary['status']
  revision: number
  createdAt: string
}

export interface TalentPilot extends TalentPilotSummary {
  opportunityId: string
  referralId: string | null
  deliverableUrl: string | null
  feedback: string | null
  publicEvidenceConsent: boolean
  startedAt: string | null
  completedAt: string | null
  viewerRole: 'participant' | 'institution'
  opportunity: TalentOpportunity
  referral: Omit<TalentReferral, 'opportunity' | 'viewerRole'> | null
  statusTransitions: TalentPilotStatusTransition[]
}

export interface UpdateTalentPilotInput {
  expectedRevision: number
  status?: TalentPilotSummary['status']
  deliverableUrl?: string
  publicEvidenceConsent?: boolean
}

export interface TalentOpportunity {
  id: string
  organizationName: string
  title: string
  problem: string
  requiredSkills: string[]
  successMetric: string
  durationWeeks: number
  sourceChannel: 'direct' | 'gitgram' | 'zemin360' | 'zen-talent'
  communityReferralConsent: boolean
  viewerRole?: 'institution' | 'public'
  status: TalentOpportunityStatus
  revision: number
  pilotSummary?: {
    total: number
    active: number
    completed: number
  }
  referralSummary?: {
    total: number
    contacted: number
    accepted: number
    declined: number
  }
  createdAt: string
  updatedAt: string
}

export interface TalentReferral {
  id: string
  opportunityId: string
  participantId: string
  referredById: string
  status: 'CONTACTED' | 'ACCEPTED' | 'DECLINED'
  revision: number
  respondedAt: string | null
  createdAt: string
  updatedAt: string
  viewerRole: 'participant' | 'institution'
  opportunity: TalentOpportunity
}

export interface TalentMatch {
  profile: {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    bio: string | null
    githubUsername: string | null
  }
  score: number
  matchedSkills: string[]
  missingSkills: string[]
  reason: string
  projects: Array<{
    id: string
    fullName: string
    url: string
    matchedSkills: string[]
    verificationLevel: TalentVerificationLevel
  }>
}

export type CoverageStrength = 'verified' | 'evidenced' | 'interest' | 'unmet'

export interface SkillCoverage {
  skill: string
  strength: CoverageStrength
  candidateCount: number
  evidencedCount: number
  verifiedCount: number
}

export interface NeedCoverageAnalysis {
  requiredSkills: string[]
  coverage: SkillCoverage[]
  unmetSkills: string[]
  coverageRatio: number
  status: 'fully-covered' | 'partially-covered' | 'unmet'
  candidatePool: number
}

export interface CreateTalentOpportunityInput {
  organizationName: string
  title: string
  problem: string
  requiredSkills: string[]
  successMetric: string
  durationWeeks: number
  sourceChannel: 'direct' | 'gitgram' | 'zemin360' | 'zen-talent'
  communityReferralConsent: boolean
}

export const talentGraphService = {
  getMine: async (): Promise<TalentGraph> => {
    const { data } = await api.get<{ data: TalentGraph }>('/talent-graph/me')
    return data.data
  },

  getPublic: async (username: string): Promise<TalentGraph> => {
    const { data } = await api.get<{ data: TalentGraph }>(`/talent-graph/public/${encodeURIComponent(username)}`)
    return data.data
  },

  listOpportunities: async (): Promise<TalentOpportunity[]> => {
    const { data } = await api.get<{ data: TalentOpportunity[] }>('/talent-graph/opportunities')
    return data.data
  },

  createOpportunity: async (input: CreateTalentOpportunityInput, idempotencyKey: string): Promise<TalentOpportunity> => {
    const { data } = await api.post<{ data: TalentOpportunity }>('/talent-graph/opportunities', input, mutationConfig(idempotencyKey))
    return data.data
  },

  getOpportunityMatches: async (id: string): Promise<{ opportunity: TalentOpportunity; matches: TalentMatch[] }> => {
    const { data } = await api.get<{ data: { opportunity: TalentOpportunity; matches: TalentMatch[] } }>(`/talent-graph/opportunities/${encodeURIComponent(id)}/matches`)
    return data.data
  },

  getOpportunityCoverage: async (id: string): Promise<{ opportunity: TalentOpportunity; coverage: NeedCoverageAnalysis }> => {
    const { data } = await api.get<{ data: { opportunity: TalentOpportunity; coverage: NeedCoverageAnalysis } }>(`/talent-graph/opportunities/${encodeURIComponent(id)}/coverage`)
    return data.data
  },

  startPilot: async (opportunityId: string, participantId: string, milestones: string[], idempotencyKey: string): Promise<TalentPilot> => {
    const { data } = await api.post<{ data: TalentPilot }>(`/talent-graph/opportunities/${encodeURIComponent(opportunityId)}/pilots`, { participantId, milestones }, mutationConfig(idempotencyKey))
    return data.data
  },

  createReferral: async (opportunityId: string, participantId: string, idempotencyKey: string): Promise<TalentReferral> => {
    const { data } = await api.post<{ data: TalentReferral }>(`/talent-graph/opportunities/${encodeURIComponent(opportunityId)}/referrals`, { participantId }, mutationConfig(idempotencyKey))
    return data.data
  },

  listMyReferrals: async (): Promise<TalentReferral[]> => {
    const { data } = await api.get<{ data: TalentReferral[] }>('/talent-graph/referrals/mine')
    return data.data
  },

  updateReferral: async (referralId: string, status: 'ACCEPTED' | 'DECLINED', expectedRevision: number, idempotencyKey: string): Promise<TalentReferral> => {
    const { data } = await api.patch<{ data: TalentReferral }>(`/talent-graph/referrals/${encodeURIComponent(referralId)}`, { status, expectedRevision }, mutationConfig(idempotencyKey))
    return data.data
  },

  listMyPilots: async (): Promise<TalentPilot[]> => {
    const { data } = await api.get<{ data: TalentPilot[] }>('/talent-graph/pilots/mine')
    return data.data
  },

  updatePilot: async (pilotId: string, input: UpdateTalentPilotInput, idempotencyKey: string): Promise<TalentPilot> => {
    const { data } = await api.patch<{ data: TalentPilot }>(`/talent-graph/pilots/${encodeURIComponent(pilotId)}`, input, mutationConfig(idempotencyKey))
    return data.data
  },
}

function mutationConfig(idempotencyKey: string) {
  return { headers: { 'Idempotency-Key': idempotencyKey } }
}
