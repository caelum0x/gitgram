/**
 * Unit tests for the talent-graph ontology + edge validation and extraction.
 *
 * These are pure (no Prisma, no I/O), mirroring skillTaxonomyService /
 * talentGapAnalysisService tests. They pin the load-bearing behavior of this
 * rung: edges are validated against the ontology's domain/range so
 * type-incompatible ("hallucinated") structure is rejected, provenance is
 * required on every fact, symmetric edges de-duplicate, and edges extracted from
 * a graph view all pass validation.
 */
import {
  validateEdge,
  validateEdges,
  edgeKey,
  TALENT_ONTOLOGY,
  type TalentEdgeInput,
} from '../../src/services/talentGraphOntology';
import { deriveTalentEdges, type TalentGraphView } from '../../src/services/talentGraphEdges';

function makeInput(overrides: Partial<TalentEdgeInput> = {}): TalentEdgeInput {
  return {
    type: 'contributed_to',
    from: { id: 'dev-1', type: 'developer' },
    to: { id: 'repo-1', type: 'repo' },
    provenance: {
      source: 'repository_claim',
      observedAt: new Date('2026-01-01T00:00:00Z'),
      confidence: 1,
      sourceUrl: 'https://github.com/acme/repo-1',
    },
    ...overrides,
  };
}

describe('validateEdge', () => {
  it('accepts a well-typed developer→repo contribution and normalizes it', () => {
    const result = validateEdge(makeInput());
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.edge.type).toBe('contributed_to');
    expect(result.edge.from).toEqual({ id: 'dev-1', type: 'developer' });
    expect(result.edge.to).toEqual({ id: 'repo-1', type: 'repo' });
    expect(result.edge.provenance.confidence).toBe(1);
    expect(result.edge.provenance.observedAt).toBeInstanceOf(Date);
    expect(result.edge.key).toBe('contributed_to|developer:dev-1|repo:repo-1');
  });

  it('rejects an unknown edge type', () => {
    const result = validateEdge(makeInput({ type: 'founded' }));
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.rejections.map((r) => r.code)).toContain('unknown_edge_type');
  });

  it('rejects a domain violation (repo cannot be the source of contributed_to)', () => {
    const result = validateEdge(
      makeInput({ from: { id: 'repo-1', type: 'repo' }, to: { id: 'repo-2', type: 'repo' } }),
    );
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.rejections.map((r) => r.code)).toContain('domain_violation');
  });

  it('rejects a range violation (has_skill must target a skill, not a repo)', () => {
    const result = validateEdge(
      makeInput({ type: 'has_skill', to: { id: 'repo-1', type: 'repo' } }),
    );
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.rejections.map((r) => r.code)).toContain('range_violation');
  });

  it('rejects an unknown node type', () => {
    const result = validateEdge(
      makeInput({ type: 'member_of', to: { id: 'x', type: 'company' } }),
    );
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.rejections.map((r) => r.code)).toContain('unknown_to_type');
  });

  it('rejects a self-referential collaborated_with edge', () => {
    const result = validateEdge(
      makeInput({
        type: 'collaborated_with',
        from: { id: 'dev-1', type: 'developer' },
        to: { id: 'dev-1', type: 'developer' },
      }),
    );
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.rejections.map((r) => r.code)).toContain('self_reference');
  });

  it('rejects missing endpoint ids', () => {
    const result = validateEdge(makeInput({ from: { id: '  ', type: 'developer' } }));
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.rejections.map((r) => r.code)).toContain('missing_from_id');
  });

  it('rejects out-of-range and non-finite confidence', () => {
    for (const confidence of [0, 1.5, -0.2, Number.NaN]) {
      const result = validateEdge(
        makeInput({ provenance: { source: 'github_sync', observedAt: new Date(), confidence, sourceUrl: null } }),
      );
      expect(result.valid).toBe(false);
      if (result.valid) continue;
      expect(result.rejections.map((r) => r.code)).toContain('invalid_confidence');
    }
  });

  it('rejects an unknown provenance source and an invalid date together', () => {
    const result = validateEdge(
      makeInput({ provenance: { source: 'psychic_intuition', observedAt: 'not-a-date', confidence: 0.5 } }),
    );
    expect(result.valid).toBe(false);
    if (result.valid) return;
    const codes = result.rejections.map((r) => r.code);
    expect(codes).toContain('unknown_source');
    expect(codes).toContain('invalid_observed_at');
  });

  it('coerces an ISO-string observedAt into a Date', () => {
    const result = validateEdge(
      makeInput({ provenance: { source: 'github_activity', observedAt: '2026-02-01T12:00:00Z', confidence: 0.75, sourceUrl: null } }),
    );
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.edge.provenance.observedAt.toISOString()).toBe('2026-02-01T12:00:00.000Z');
  });
});

describe('edgeKey', () => {
  it('is order-independent for symmetric edges and directed for others', () => {
    const a = { id: 'dev-a', type: 'developer' as const };
    const b = { id: 'dev-b', type: 'developer' as const };
    expect(edgeKey('collaborated_with', a, b)).toBe(edgeKey('collaborated_with', b, a));

    const dev = { id: 'dev-a', type: 'developer' as const };
    const repo = { id: 'repo-1', type: 'repo' as const };
    expect(edgeKey('contributed_to', dev, repo)).not.toBe(edgeKey('contributed_to', repo as never, dev as never));
  });

  it('every ontology edge type has a coherent domain/range', () => {
    for (const def of Object.values(TALENT_ONTOLOGY)) {
      expect(def.domain.length).toBeGreaterThan(0);
      expect(def.range.length).toBeGreaterThan(0);
    }
  });
});

describe('validateEdges (batch)', () => {
  it('partitions accepted from rejected and dedups symmetric edges keeping strongest confidence', () => {
    const inputs: TalentEdgeInput[] = [
      makeInput(),
      // duplicate symmetric collaboration in both directions, second stronger
      makeInput({
        type: 'collaborated_with',
        from: { id: 'dev-1', type: 'developer' },
        to: { id: 'dev-2', type: 'developer' },
        provenance: { source: 'github_sync', observedAt: new Date(), confidence: 0.5, sourceUrl: null },
      }),
      makeInput({
        type: 'collaborated_with',
        from: { id: 'dev-2', type: 'developer' },
        to: { id: 'dev-1', type: 'developer' },
        provenance: { source: 'github_sync', observedAt: new Date(), confidence: 0.9, sourceUrl: null },
      }),
      // hallucinated / type-incompatible: a skill cannot contribute to a repo
      makeInput({ from: { id: 'skill-x', type: 'skill' } }),
    ];

    const { accepted, rejected } = validateEdges(inputs);

    // one contribution + one deduped collaboration
    expect(accepted).toHaveLength(2);
    const collab = accepted.find((e) => e.type === 'collaborated_with');
    expect(collab?.provenance.confidence).toBe(0.9);

    expect(rejected).toHaveLength(1);
    expect(rejected[0].rejections.map((r) => r.code)).toContain('domain_violation');
  });
});

describe('deriveTalentEdges', () => {
  const view: TalentGraphView = {
    profile: { id: 'dev-1' },
    projects: [
      {
        id: 'repo-1',
        url: 'https://github.com/acme/repo-1',
        topics: ['reactjs', 'k8s', 'reactjs'], // alias + duplicate → one skill
        verificationLevel: 'verified',
        lastVerifiedAt: new Date('2026-01-01T00:00:00Z'),
        evidence: [{ kind: 'repository_claim', sourceUrl: 'https://github.com/acme/repo-1' }],
      },
    ],
    collaborators: [
      { id: 'dev-2', sharedProjects: [{ id: 'repo-1', url: 'https://github.com/acme/repo-1' }] },
      { id: 'dev-1', sharedProjects: [] }, // self — must be skipped
    ],
  };

  it('emits contributed_to, canonicalized+deduped has_skill, and collaborated_with edges', () => {
    const edges = deriveTalentEdges(view);
    const byType = edges.reduce<Record<string, TalentEdgeInput[]>>((acc, e) => {
      (acc[e.type] ??= []).push(e);
      return acc;
    }, {});

    expect(byType.contributed_to).toHaveLength(1);
    expect(byType.has_skill.map((e) => e.to.id).sort()).toEqual(['kubernetes', 'react']);
    // self-collaborator dev-1 skipped, only dev-2 remains
    expect(byType.collaborated_with).toHaveLength(1);
    expect(byType.collaborated_with[0].to.id).toBe('dev-2');
  });

  it('produces edges that all pass ontology validation', () => {
    const { accepted, rejected } = validateEdges(deriveTalentEdges(view));
    expect(rejected).toHaveLength(0);
    expect(accepted.length).toBeGreaterThan(0);
    // skill edges are capped at the recorded tier even for a verified project
    const skillEdge = accepted.find((e) => e.type === 'has_skill');
    expect(skillEdge?.provenance.confidence).toBe(0.5);
  });
});
