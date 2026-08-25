/**
 * Tests for the talent-graph validation GATE (not just the ontology library).
 *
 * The ontology unit tests (talentGraphOntology.test.ts) prove validateEdge /
 * validateEdges are correct in isolation. These tests prove that the gate is
 * actually WIRED into the service read path — `getTalentGraph` runs the assembled
 * graph through `auditTalentGraphEdges` — and that it is non-breaking:
 *  - valid edges pass through with no warning and the response shape is unchanged,
 *  - an ontology-invalid edge (here: unparseable provenance timestamp from a
 *    corrupt DB row) triggers exactly one structured warning while the dossier is
 *    still returned intact (warn-only, nothing dropped, nothing reshaped).
 *
 * Prisma and the logger are mocked globally by tests/setup.ts.
 */
import { auditTalentGraphEdges, getTalentGraph } from '../../src/services/talentGraphService';
import type { TalentGraphView } from '../../src/services/talentGraphEdges';
import { mockPrisma } from '../setup';
import logger from '../../src/utils/logger';

const warn = logger.warn as jest.Mock;

function makeView(overrides: Partial<TalentGraphView> = {}): TalentGraphView {
  return {
    profile: { id: 'dev-1' },
    projects: [
      {
        id: 'repo-1',
        url: 'https://github.com/acme/repo-1',
        topics: ['typescript'],
        verificationLevel: 'verified',
        lastVerifiedAt: new Date('2026-01-01T00:00:00Z'),
        evidence: [{ kind: 'repository_claim', sourceUrl: 'https://github.com/acme/repo-1' }],
      },
    ],
    collaborators: [],
    ...overrides,
  };
}

describe('auditTalentGraphEdges (the gate)', () => {
  it('accepts well-typed edges from a clean view and emits no warning', () => {
    const result = auditTalentGraphEdges(makeView());

    expect(result.rejected).toHaveLength(0);
    // developer→repo contribution + developer→skill has_skill.
    expect(result.accepted.length).toBeGreaterThanOrEqual(2);
    expect(warn).not.toHaveBeenCalled();
  });

  it('rejects an ontology-invalid edge and emits one structured warning (warn-only)', () => {
    // A corrupt DB timestamp flows into edge provenance as an unparseable date.
    const corrupt = makeView({
      projects: [
        {
          id: 'repo-1',
          url: 'https://github.com/acme/repo-1',
          topics: [],
          verificationLevel: 'verified',
          lastVerifiedAt: new Date('not-a-real-date'),
          evidence: [{ kind: 'repository_claim', sourceUrl: null }],
        },
      ],
    });

    const result = auditTalentGraphEdges(corrupt);

    expect(result.rejected.length).toBeGreaterThan(0);
    expect(result.rejected[0].rejections.map((r) => r.code)).toContain('invalid_observed_at');

    expect(warn).toHaveBeenCalledTimes(1);
    const [message, meta] = warn.mock.calls[0];
    expect(message).toMatch(/edge validation rejected/i);
    expect(meta).toMatchObject({
      event: 'talent_graph.edge_validation.rejected',
      developerId: 'dev-1',
      rejectedCount: result.rejected.length,
    });
    expect(meta.rejections[0].codes).toContain('invalid_observed_at');
  });
});

describe('getTalentGraph invokes the gate on the real read path', () => {
  const userId = 'dev-real-1';

  function seedUser() {
    mockPrisma.user.__rows = [
      {
        id: userId,
        username: 'dev-real',
        displayName: 'Dev Real',
        avatar: null,
        avatarUrl: null,
        bio: null,
        githubId: null,
        githubUsername: null,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        isPrivate: false,
      },
    ];
    // Unused-but-queried tables must resolve to empty sets.
    mockPrisma.repositoryManager.__rows = [];
    mockPrisma.repositoryActivity.__rows = [];
    // The talent* models are not part of the shared prisma mock; stub the reads
    // getTalentGraph performs so the assembly runs without touching a real DB.
    mockPrisma.talentPilot = { findMany: jest.fn().mockResolvedValue([]) };
    mockPrisma.talentPublicProof = { findMany: jest.fn().mockResolvedValue([]) };
  }

  function seedProject(updatedAt: Date) {
    mockPrisma.project.__rows = [
      {
        id: 'proj-1',
        userId,
        owner: 'acme',
        name: 'repo-1',
        fullName: 'acme/repo-1',
        description: 'a project',
        url: 'https://github.com/acme/repo-1',
        repoUrl: 'https://github.com/acme/repo-1',
        language: 'TypeScript',
        tags: ['typescript'],
        stars: 3,
        forks: 1,
        githubId: null,
        updatedAt,
      },
    ];
  }

  it('runs the gate and returns the unchanged dossier shape for clean data (no warning)', async () => {
    seedUser();
    seedProject(new Date('2026-02-01T00:00:00Z'));

    const graph = await getTalentGraph(userId);

    // Success-path response shape is exactly what consumers depend on.
    expect(graph).not.toBeNull();
    expect(graph).toEqual(
      expect.objectContaining({
        profile: expect.objectContaining({ id: userId }),
        summary: expect.objectContaining({ projectCount: 1 }),
        projects: expect.any(Array),
        collaborators: expect.any(Array),
        generatedAt: expect.any(Date),
      }),
    );
    expect(graph!.projects).toHaveLength(1);
    // Clean data => the gate found nothing to warn about.
    expect(warn).not.toHaveBeenCalled();
  });

  it('emits a gate warning when the assembled graph carries an ontology-invalid edge, still returning the dossier', async () => {
    seedUser();
    // Corrupt persisted timestamp -> invalid edge provenance on the read path.
    seedProject(new Date('totally-invalid'));

    const graph = await getTalentGraph(userId);

    // Warn-only: the dossier is still returned intact, nothing dropped.
    expect(graph).not.toBeNull();
    expect(graph!.projects).toHaveLength(1);

    // The gate actually ran inside getTalentGraph and flagged the violation.
    expect(warn).toHaveBeenCalledTimes(1);
    const [, meta] = warn.mock.calls[0];
    expect(meta).toMatchObject({
      event: 'talent_graph.edge_validation.rejected',
      developerId: userId,
    });
  });
});
