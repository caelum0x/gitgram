import prisma from '../utils/prisma';
import logger from '../utils/logger';
import { normalizePublicHttpUrl } from '../utils/publicHttpUrl';
import { canonicalizeSkill, canonicalizeSkills, expandSkillQueryTokens } from './skillTaxonomyService';
import { deriveTalentEdges, type TalentGraphView } from './talentGraphEdges';
import { validateEdges, type EdgeBatchResult } from './talentGraphOntology';
import type { PrismaClient } from '@prisma/client';

type EvidenceLevel = 'verified' | 'linked' | 'recorded';

interface TalentEvidence {
  id: string;
  kind: 'repository_claim' | 'github_sync' | 'github_activity' | 'project_record' | 'institutional_pilot';
  label: string;
  detail: string;
  occurredAt: Date;
  sourceUrl: string | null;
}

interface TalentProject {
  id: string;
  source: 'repository' | 'project';
  name: string;
  fullName: string;
  description: string | null;
  url: string | null;
  language: string | null;
  topics: string[];
  stars: number;
  forks: number;
  role: string;
  verificationLevel: EvidenceLevel;
  lastVerifiedAt: Date;
  evidence: TalentEvidence[];
}

interface TalentMatchProject {
  id: string;
  fullName: string;
  url: string;
  matchedSkills: string[];
  verificationLevel: EvidenceLevel;
}

interface CompletedPilotEvidence {
  id: string;
  deliverableUrl: string;
  occurredAt: Date;
  title: string | null;
  organizationName: string | null;
  problem: string | null;
  requiredSkills: string[];
  successMetric: string | null;
}

type TalentMatchDb = Pick<PrismaClient, 'talentPublicProof' | 'user'>;

function projectKey(owner: string | null, name: string, fullName: string | null) {
  return (fullName || (owner ? `${owner}/${name}` : name)).toLowerCase();
}

/**
 * Non-breaking validation gate for the assembled talent graph.
 *
 * `getTalentGraph` assembles a read-only dossier; it does not persist edges. This
 * gate realizes the ontology guardrail on that read path: it derives typed,
 * provenanced candidate edges from the assembled view and vets them with
 * `validateEdges` (domain/range, provenance, symmetric dedup). It is WARN-ONLY —
 * it never mutates, drops, or reshapes the response. Ontology-invalid
 * ("hallucinated") structure is surfaced as a single structured warning (reason
 * codes + endpoint types) so violations are observable via logs/metrics without
 * changing any success-path output existing consumers depend on. Returns the
 * batch result so callers and tests can inspect what the gate saw.
 */
export function auditTalentGraphEdges(view: TalentGraphView): EdgeBatchResult {
  const result = validateEdges(deriveTalentEdges(view));
  if (result.rejected.length > 0) {
    logger.warn('talent-graph edge validation rejected ontology-invalid edges', {
      event: 'talent_graph.edge_validation.rejected',
      developerId: view.profile.id,
      acceptedCount: result.accepted.length,
      rejectedCount: result.rejected.length,
      rejections: result.rejected.map((entry) => ({
        edgeType: entry.input.type,
        fromType: entry.input.from?.type,
        toType: entry.input.to?.type,
        codes: entry.rejections.map((rejection) => rejection.code),
      })),
    });
  }
  return result;
}

export async function getTalentGraph(userId: string, options: { publicView?: boolean } = {}) {
  const [user, syncedProjects, managedRepositories] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatar: true,
        avatarUrl: true,
        bio: true,
        githubId: true,
        githubUsername: true,
        createdAt: true,
      },
    }),
    prisma.project.findMany({
      where: { userId },
      orderBy: [{ stars: 'desc' }, { updatedAt: 'desc' }],
    }),
    prisma.repositoryManager.findMany({
      where: { userId },
      include: {
        repository: {
          include: {
            managers: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatar: true,
                    avatarUrl: true,
                    githubUsername: true,
                    isPrivate: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  if (!user) return null;

  // Public reads consume the privacy-safe projection only. Owner reads retain
  // institution context from the private pilot record.
  const completedPilots: CompletedPilotEvidence[] = options.publicView
    ? (await prisma.talentPublicProof.findMany({
        where: { participantId: userId, schemaVersion: 1 },
        orderBy: { completedAt: 'desc' },
      })).flatMap((proof) => {
        const deliverableUrl = normalizePublicHttpUrl(proof.deliverableUrl);
        return deliverableUrl ? [{
          id: proof.publicId,
          deliverableUrl,
          occurredAt: proof.completedAt,
          title: null,
          organizationName: null,
          problem: null,
          requiredSkills: [],
          successMetric: null,
        }] : [];
      })
    : (await prisma.talentPilot.findMany({
        where: {
          participantId: userId,
          status: 'COMPLETED',
          publicEvidenceConsent: true,
          deliverableUrl: { not: null },
        },
        include: { opportunity: true },
        orderBy: { completedAt: 'desc' },
      })).flatMap((pilot) => {
        const deliverableUrl = normalizePublicHttpUrl(pilot.deliverableUrl);
        return deliverableUrl ? [{
          id: pilot.id,
          deliverableUrl,
          occurredAt: pilot.completedAt || pilot.updatedAt,
          title: pilot.opportunity.title,
          organizationName: pilot.opportunity.organizationName,
          problem: pilot.opportunity.problem,
          requiredSkills: pilot.opportunity.requiredSkills,
          successMetric: pilot.opportunity.successMetric,
        }] : [];
      });

  const visibleManagedRepositories = options.publicView
    ? managedRepositories.filter((manager) => !manager.repository.isPrivate)
    : managedRepositories;
  const repositoryIds = visibleManagedRepositories.map((manager) => manager.repositoryId);
  const githubActivity = user.githubUsername && repositoryIds.length > 0
    ? await prisma.repositoryActivity.findMany({
        where: {
          repositoryId: { in: repositoryIds },
          actorLogin: user.githubUsername,
        },
        select: {
          id: true,
          repositoryId: true,
          eventType: true,
          action: true,
          title: true,
          url: true,
          occurredAt: true,
        },
        orderBy: { occurredAt: 'desc' },
      })
    : [];

  const activityByRepository = new Map<string, typeof githubActivity>();
  for (const activity of githubActivity) {
    const activities = activityByRepository.get(activity.repositoryId) || [];
    activities.push(activity);
    activityByRepository.set(activity.repositoryId, activities);
  }

  const projects = new Map<string, TalentProject>();

  // Project does not store repository visibility. Keep these owner-only rather
  // than risk publishing a private repository imported from GitHub.
  for (const project of options.publicView ? [] : syncedProjects) {
    const fullName = project.fullName || (project.owner ? `${project.owner}/${project.name}` : project.name);
    const linked = Boolean(project.githubId && user.githubId);
    const evidence: TalentEvidence = linked
      ? {
          id: `github-sync:${project.id}`,
          kind: 'github_sync',
          label: 'Linked GitHub project',
          detail: 'Imported through the connected GitHub account.',
          occurredAt: project.updatedAt,
          sourceUrl: project.url || project.repoUrl,
        }
      : {
          id: `project-record:${project.id}`,
          kind: 'project_record',
          label: 'Gitgram project record',
          detail: 'Project details saved by this Gitgram account.',
          occurredAt: project.updatedAt,
          sourceUrl: project.url || project.repoUrl,
        };

    projects.set(projectKey(project.owner, project.name, project.fullName), {
      id: project.id,
      source: 'project',
      name: project.name,
      fullName,
      description: project.description,
      url: project.url || project.repoUrl,
      language: project.language,
      topics: project.tags,
      stars: project.stars,
      forks: project.forks,
      role: 'OWNER',
      verificationLevel: linked ? 'linked' : 'recorded',
      lastVerifiedAt: project.updatedAt,
      evidence: [evidence],
    });
  }

  for (const manager of visibleManagedRepositories) {
    const repository = manager.repository;
    const activityEvidence: TalentEvidence[] = (activityByRepository.get(repository.id) || [])
      .slice(0, 8)
      .map((activity) => ({
        id: activity.id,
        kind: 'github_activity',
        label: activity.eventType.split('_').join(' '),
        detail: activity.title || activity.action || `GitHub ${activity.eventType.toLowerCase().split('_').join(' ')} event`,
        occurredAt: activity.occurredAt,
        sourceUrl: activity.url,
      }));

    const claimedByUser = repository.claimedBy === userId;
    const claimEvidence: TalentEvidence = claimedByUser && repository.claimedAt
      ? {
          id: `repository-claim:${repository.id}`,
          kind: 'repository_claim',
          label: 'Repository ownership verified',
          detail: 'GitHub write access was confirmed when this repository was claimed.',
          occurredAt: repository.claimedAt,
          sourceUrl: repository.htmlUrl,
        }
      : {
          id: `repository-manager:${manager.id}`,
          kind: 'project_record',
          label: `${manager.role.toLowerCase()} access recorded`,
          detail: 'Maintainer access is recorded in Gitgram for this repository.',
          occurredAt: manager.createdAt,
          sourceUrl: repository.htmlUrl,
        };

    const key = repository.fullName.toLowerCase();
    const existing = projects.get(key);
    projects.set(key, {
      id: repository.id,
      source: 'repository',
      name: repository.name,
      fullName: repository.fullName,
      description: repository.description || existing?.description || null,
      url: repository.htmlUrl,
      language: repository.language || existing?.language || null,
      topics: repository.topics.length > 0 ? repository.topics : existing?.topics || [],
      stars: repository.stars || existing?.stars || 0,
      forks: repository.forks || existing?.forks || 0,
      role: manager.role,
      verificationLevel: claimedByUser ? 'verified' : existing?.verificationLevel || 'recorded',
      lastVerifiedAt: repository.lastFetched || repository.lastSynced || claimEvidence.occurredAt,
      evidence: [claimEvidence, ...activityEvidence, ...(existing?.evidence || [])],
    });
  }

  for (const pilot of completedPilots) {
    if (!pilot.deliverableUrl) continue;
    const occurredAt = pilot.occurredAt;
    const publicPilot = options.publicView === true;
    projects.set(`institutional-pilot:${pilot.id}`, {
      id: pilot.id,
      source: 'project',
      name: publicPilot ? 'Institutional pilot' : pilot.title || 'Institutional pilot',
      fullName: publicPilot
        ? 'Completed institutional pilot'
        : `${pilot.organizationName || 'Institution'} / ${pilot.title || 'Pilot'}`,
      description: publicPilot ? null : pilot.problem,
      url: pilot.deliverableUrl,
      language: null,
      // Required skills are institution-authored strings. Keep them out of the
      // public dossier because they can contain names or other free text.
      topics: publicPilot ? [] : pilot.requiredSkills,
      stars: 0,
      forks: 0,
      role: 'PILOT PARTICIPANT',
      verificationLevel: 'verified',
      lastVerifiedAt: occurredAt,
      evidence: [{
        id: `institutional-pilot:${pilot.id}`,
        kind: 'institutional_pilot',
        label: 'Completed institutional pilot',
        detail: publicPilot
          ? 'Completion was recorded by the institution and publication was approved by the participant.'
          : `Completed against the institution's published success metric: ${pilot.successMetric || 'recorded outcome'}`,
        occurredAt,
        sourceUrl: pilot.deliverableUrl,
      }],
    });
  }

  const collaborators = new Map<string, {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    githubUsername: string | null;
    sharedProjects: Array<{
      id: string;
      fullName: string;
      url: string;
      theirRole: string;
      yourRole: string;
    }>;
  }>();

  for (const manager of visibleManagedRepositories) {
    for (const peer of manager.repository.managers) {
      if (peer.userId === userId) continue;
      if (options.publicView && peer.user.isPrivate) continue;

      const collaborator = collaborators.get(peer.userId) || {
        id: peer.user.id,
        username: peer.user.username,
        displayName: peer.user.displayName,
        avatarUrl: peer.user.avatarUrl || peer.user.avatar,
        githubUsername: peer.user.githubUsername,
        sharedProjects: [],
      };

      collaborator.sharedProjects.push({
        id: manager.repository.id,
        fullName: manager.repository.fullName,
        url: manager.repository.htmlUrl,
        theirRole: peer.role,
        yourRole: manager.role,
      });
      collaborators.set(peer.userId, collaborator);
    }
  }

  const talentProjects = Array.from(projects.values()).sort((a, b) => {
    const levelOrder: Record<EvidenceLevel, number> = { verified: 0, linked: 1, recorded: 2 };
    return levelOrder[a.verificationLevel] - levelOrder[b.verificationLevel]
      || b.lastVerifiedAt.getTime() - a.lastVerifiedAt.getTime();
  });
  const talentCollaborators = Array.from(collaborators.values()).sort(
    (a, b) => b.sharedProjects.length - a.sharedProjects.length,
  );

  const graph = {
    profile: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl || user.avatar,
      bio: user.bio,
      githubUsername: user.githubUsername,
      githubConnected: Boolean(user.githubId),
      memberSince: user.createdAt,
    },
    summary: {
      projectCount: talentProjects.length,
      verifiedProjectCount: talentProjects.filter((project) => project.verificationLevel === 'verified').length,
      recordedActivityCount: githubActivity.length,
      collaboratorCount: talentCollaborators.length,
    },
    projects: talentProjects,
    collaborators: talentCollaborators,
    generatedAt: new Date(),
  };

  // Realize the ontology guardrail on the read path. Warn-only and defensive:
  // the gate observes ontology-invalid structure but never changes `graph`, and a
  // failure here must never break a dossier read.
  try {
    auditTalentGraphEdges(graph);
  } catch (error) {
    logger.error('talent-graph edge validation gate failed', {
      event: 'talent_graph.edge_validation.error',
      developerId: user.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return graph;
}

export async function findTalentMatches(requiredSkills: string[], limit = 12, db: TalentMatchDb = prisma) {
  // Entity-link the Need: resolve required skills to canonical Skill tokens
  // (ARCHITECTURE.md §3.5, step 1). Scoring compares canonical-to-canonical.
  const skills = canonicalizeSkills(requiredSkills).slice(0, 12);
  if (skills.length === 0) return [];

  // Widen the retrieval filters to every known alias so array-overlap queries
  // catch rows stored under a surface form (e.g. "js") before re-canonicalizing.
  const queryTokens = expandSkillQueryTokens(skills);

  const completedPilots = await db.talentPublicProof.findMany({
    where: {
      schemaVersion: 1,
      evidenceSkills: { hasSome: queryTokens },
    },
    orderBy: { completedAt: 'desc' },
    take: 200,
  });
  const pilotParticipantIds = Array.from(new Set(completedPilots.map((pilot) => pilot.participantId)));
  const pilotsByParticipant = new Map<string, typeof completedPilots>();
  for (const pilot of completedPilots) {
    const participantPilots = pilotsByParticipant.get(pilot.participantId) || [];
    participantPilots.push(pilot);
    pilotsByParticipant.set(pilot.participantId, participantPilots);
  }

  const users = await db.user.findMany({
    where: {
      isPrivate: false,
      isBanned: false,
      isSuspended: false,
      username: { not: null },
      OR: [
        { interests: { hasSome: queryTokens } },
        ...(pilotParticipantIds.length > 0 ? [{ id: { in: pilotParticipantIds } }] : []),
        {
          managedRepos: {
            some: {
              repository: {
                isPrivate: false,
                OR: [
                  { topics: { hasSome: queryTokens } },
                  { language: { in: queryTokens, mode: 'insensitive' } },
                ],
              },
            },
          },
        },
      ],
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatar: true,
      avatarUrl: true,
      bio: true,
      githubUsername: true,
      interests: true,
      managedRepos: {
        where: { repository: { isPrivate: false } },
        select: {
          role: true,
          repository: {
            select: {
              id: true,
              fullName: true,
              htmlUrl: true,
              language: true,
              topics: true,
              claimedBy: true,
              lastFetched: true,
              lastSynced: true,
            },
          },
        },
      },
    },
    take: Math.min(100, limit * 6),
  });

  return users
    .map((user) => {
      const interestMatches = user.interests.map(canonicalizeSkill).filter((skill) => skills.includes(skill));
      const repositoryProjects: TalentMatchProject[] = user.managedRepos.flatMap((manager) => {
        const repositorySkills = [manager.repository.language || '', ...manager.repository.topics].map(canonicalizeSkill);
        const matchedSkills = skills.filter((skill) => repositorySkills.includes(skill));
        if (matchedSkills.length === 0) return [];
        return [{
          id: manager.repository.id,
          fullName: manager.repository.fullName,
          url: manager.repository.htmlUrl,
          matchedSkills,
          verificationLevel: manager.repository.claimedBy === user.id ? 'verified' : 'recorded',
        } satisfies TalentMatchProject];
      });
      const pilotProjects: TalentMatchProject[] = (pilotsByParticipant.get(user.id) || []).flatMap((pilot) => {
        const deliverableUrl = normalizePublicHttpUrl(pilot.deliverableUrl);
        if (!deliverableUrl) return [];
        const matchedSkills = skills.filter((skill) => pilot.evidenceSkills.map(canonicalizeSkill).includes(skill));
        if (matchedSkills.length === 0) return [];
        return [{
          id: pilot.publicId,
          // Match responses are public. Never disclose institution-authored
          // organization, title, problem, or success-metric text through proof.
          fullName: 'Completed institutional pilot',
          url: deliverableUrl,
          matchedSkills,
          verificationLevel: 'verified',
        } satisfies TalentMatchProject];
      });
      const projects = [...pilotProjects, ...repositoryProjects];
      const evidenceSkills = Array.from(new Set(projects.flatMap((project) => project.matchedSkills)));
      const matchedSkills = Array.from(new Set([...evidenceSkills, ...interestMatches]));
      const verifiedProjects = projects.filter((project) => project.verificationLevel === 'verified').length;
      const coverage = matchedSkills.length / skills.length;
      const score = Math.min(100, Math.round(coverage * 75 + Math.min(verifiedProjects, 2) * 10 + Math.min(projects.length, 3) * 5));

      return {
        profile: {
          id: user.id,
          username: user.username!,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl || user.avatar,
          bio: user.bio,
          githubUsername: user.githubUsername,
        },
        score,
        matchedSkills,
        missingSkills: skills.filter((skill) => !matchedSkills.includes(skill)),
        projects: projects.slice(0, 4),
        reason: pilotProjects.length > 0
          ? `${evidenceSkills.length} aranan beceri tamamlanmış kurum pilotu veya açık depo kanıtıyla eşleşiyor.`
          : evidenceSkills.length > 0
          ? `${evidenceSkills.length} aranan beceri herkese açık depo kanıtıyla eşleşiyor.`
          : `${interestMatches.length} aranan beceri profil ilgi alanıyla eşleşiyor; depo kanıtı henüz yok.`,
      };
    })
    .filter((match) => match.matchedSkills.length > 0)
    .sort((a, b) => b.score - a.score || b.projects.length - a.projects.length)
    .slice(0, Math.max(1, Math.min(limit, 25)));
}
