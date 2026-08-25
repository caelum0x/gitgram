/**
 * Unit tests for the talent GraphRAG serving layer.
 *
 * Pure (no Prisma, no network): the LLM call and the view loader are both
 * injected. These tests pin the three load-bearing guarantees of the layer:
 *  1. Retrieval correctness — the k-hop subgraph contains the right nodes at the
 *     right depth, takes no wrong hops, and always terminates.
 *  2. Deterministic serialization — identical subgraph in, byte-identical text.
 *  3. Grounding — the answer's evidence only ever references edges that were
 *     actually retrieved; hallucinated citations are dropped.
 */
import { validateEdge, type TalentEdge } from '../../src/services/talentGraphOntology';
import {
  buildSubgraphFromEdges,
  buildTalentSubgraph,
} from '../../src/services/talentSubgraphRetrieval';
import { serializeTalentSubgraphForLLM } from '../../src/services/talentSubgraphSerializer';
import { parseRagResponse } from '../../src/services/talentGraphRagPrompt';
import {
  explainTalentMatch,
  type ExplainTalentMatchDeps,
} from '../../src/services/talentGraphRag';
import type { TalentGraphView } from '../../src/services/talentGraphEdges';

// --- helpers ---------------------------------------------------------------

function edge(
  type: string,
  from: { id: string; type: string },
  to: { id: string; type: string },
  confidence = 1,
  source = 'repository_claim',
): TalentEdge {
  const result = validateEdge({
    type,
    from,
    to,
    provenance: { source, observedAt: new Date('2026-01-01T00:00:00Z'), confidence, sourceUrl: null },
  });
  if (!result.valid) throw new Error(`test edge invalid: ${result.rejections.map((r) => r.code).join(',')}`);
  return result.edge;
}

const DEV = (id: string) => ({ id, type: 'developer' as const });
const REPO = (id: string) => ({ id, type: 'repo' as const });

/** A multi-hop edge set: dev-1 is the root; repo-2 sits two hops away. */
function multiHopEdges(): TalentEdge[] {
  return [
    edge('contributed_to', DEV('dev-1'), REPO('repo-1')),
    edge('has_skill', DEV('dev-1'), { id: 'react', type: 'skill' }),
    edge('member_of', DEV('dev-1'), { id: 'org-1', type: 'org' }),
    edge('collaborated_with', DEV('dev-1'), DEV('dev-2'), 0.5, 'github_sync'),
    // dev-2's own contribution — reachable only at depth 2 from dev-1
    edge('contributed_to', DEV('dev-2'), REPO('repo-2')),
  ];
}

// --- retrieval correctness -------------------------------------------------

describe('buildSubgraphFromEdges (k-hop retrieval)', () => {
  it('depth 0 returns only the root, no edges', () => {
    const sub = buildSubgraphFromEdges(multiHopEdges(), DEV('dev-1'), 0);
    expect(sub.nodes).toHaveLength(1);
    expect(sub.nodes[0]).toMatchObject({ id: 'dev-1', type: 'developer', distance: 0 });
    expect(sub.edges).toHaveLength(0);
  });

  it('depth 1 includes direct neighbors but takes no wrong hops', () => {
    const sub = buildSubgraphFromEdges(multiHopEdges(), DEV('dev-1'), 1);
    const nodeIds = sub.nodes.map((n) => `${n.type}:${n.id}`).sort();
    expect(nodeIds).toEqual([
      'developer:dev-1',
      'developer:dev-2',
      'org:org-1',
      'repo:repo-1',
      'skill:react',
    ]);
    // repo-2 is two hops away — it must NOT appear, and neither must its edge.
    expect(nodeIds).not.toContain('repo:repo-2');
    expect(sub.edges.some((e) => e.to.id === 'repo-2' || e.from.id === 'repo-2')).toBe(false);
    // every edge kept has both endpoints inside the node set
    const present = new Set(nodeIds);
    for (const e of sub.edges) {
      expect(present.has(`${e.from.type}:${e.from.id}`)).toBe(true);
      expect(present.has(`${e.to.type}:${e.to.id}`)).toBe(true);
    }
  });

  it('depth 2 expands to the second hop and includes the bridging edge', () => {
    const sub = buildSubgraphFromEdges(multiHopEdges(), DEV('dev-1'), 2);
    const repo2 = sub.nodes.find((n) => n.id === 'repo-2');
    expect(repo2).toBeDefined();
    expect(repo2?.distance).toBe(2);
    expect(sub.edges.some((e) => e.from.id === 'dev-2' && e.to.id === 'repo-2')).toBe(true);
  });

  it('terminates on cycles and caps runaway depth', () => {
    const cyclic = [
      edge('collaborated_with', DEV('dev-1'), DEV('dev-2'), 0.5, 'github_sync'),
      edge('collaborated_with', DEV('dev-2'), DEV('dev-3'), 0.5, 'github_sync'),
      edge('collaborated_with', DEV('dev-3'), DEV('dev-1'), 0.5, 'github_sync'),
    ];
    const sub = buildSubgraphFromEdges(cyclic, DEV('dev-1'), 1000);
    // three developers, each visited once; depth is capped, not 1000
    expect(sub.nodes).toHaveLength(3);
    expect(sub.depth).toBeLessThanOrEqual(6);
  });

  it('rejects a negative or non-integer depth at the boundary', () => {
    expect(() => buildSubgraphFromEdges(multiHopEdges(), DEV('dev-1'), -1)).toThrow();
    expect(() => buildSubgraphFromEdges(multiHopEdges(), DEV('dev-1'), 1.5)).toThrow();
  });

  it('rejects an empty root id', () => {
    expect(() => buildSubgraphFromEdges(multiHopEdges(), DEV('  '), 1)).toThrow();
  });
});

// --- view-based retrieval --------------------------------------------------

const VIEW: TalentGraphView = {
  profile: { id: 'dev-1' },
  projects: [
    {
      id: 'repo-1',
      url: 'https://github.com/acme/repo-1',
      topics: ['reactjs', 'k8s'],
      verificationLevel: 'verified',
      lastVerifiedAt: new Date('2026-01-01T00:00:00Z'),
      evidence: [{ kind: 'repository_claim', sourceUrl: 'https://github.com/acme/repo-1' }],
    },
  ],
  collaborators: [
    { id: 'dev-2', sharedProjects: [{ id: 'repo-1', url: 'https://github.com/acme/repo-1' }] },
  ],
};

describe('buildTalentSubgraph (view-based)', () => {
  it('retrieves the developer neighborhood from an assembled view', () => {
    const sub = buildTalentSubgraph(VIEW, 'dev-1', 1);
    const types = sub.nodes.map((n) => n.type);
    expect(types).toContain('developer'); // root + collaborator
    expect(types).toContain('repo');
    expect(types).toContain('skill');
    // canonicalized skills present
    expect(sub.nodes.some((n) => n.type === 'skill' && n.id === 'react')).toBe(true);
    expect(sub.nodes.some((n) => n.type === 'skill' && n.id === 'kubernetes')).toBe(true);
    // every edge carries provenance
    for (const e of sub.edges) {
      expect(e.provenance.confidence).toBeGreaterThan(0);
      expect(e.provenance.observedAt).toBeInstanceOf(Date);
      expect(typeof e.provenance.source).toBe('string');
    }
  });

  it('rejects a rootDeveloperId that does not match the view profile', () => {
    expect(() => buildTalentSubgraph(VIEW, 'someone-else', 1)).toThrow();
  });
});

// --- deterministic serialization ------------------------------------------

describe('serializeTalentSubgraphForLLM', () => {
  it('is deterministic: the same subgraph produces byte-identical text', () => {
    // Serialization is a pure function of the subgraph, so a single retrieved
    // subgraph must serialize identically every time (cacheable prompts). We
    // build once and serialize twice; edge order is fixed by the retrieval layer.
    const sub = buildSubgraphFromEdges(multiHopEdges(), DEV('dev-1'), 2);
    expect(serializeTalentSubgraphForLLM(sub)).toBe(serializeTalentSubgraphForLLM(sub));
  });

  it('orders edges canonically regardless of input edge order', () => {
    const forward = buildSubgraphFromEdges(multiHopEdges(), DEV('dev-1'), 2);
    const shuffled = buildSubgraphFromEdges([...multiHopEdges()].reverse(), DEV('dev-1'), 2);
    expect(serializeTalentSubgraphForLLM(forward)).toBe(serializeTalentSubgraphForLLM(shuffled));
  });

  it('exposes edge citation keys and provenance in the context', () => {
    const sub = buildTalentSubgraph(VIEW, 'dev-1', 2);
    const text = serializeTalentSubgraphForLLM(sub);
    expect(text).toContain('ROOT: developer:dev-1');
    expect(text).toContain('EDGES (facts — cite by [key]):');
    for (const e of sub.edges) {
      expect(text).toContain(`[${e.key}]`);
    }
    expect(text).toMatch(/source=/);
    expect(text).toMatch(/confidence=/);
  });

  it('renders an empty subgraph without crashing', () => {
    const empty = buildSubgraphFromEdges([], DEV('dev-1'), 1);
    const text = serializeTalentSubgraphForLLM(empty);
    expect(text).toContain('ROOT: developer:dev-1');
    expect(text).toContain('(none)');
  });
});

// --- response parsing ------------------------------------------------------

describe('parseRagResponse', () => {
  it('parses a clean JSON object', () => {
    const parsed = parseRagResponse('{"answer":"ok","citedEdgeKeys":["k1","k2"]}');
    expect(parsed.answer).toBe('ok');
    expect(parsed.citedEdgeKeys).toEqual(['k1', 'k2']);
  });

  it('tolerates a ```json code fence', () => {
    const parsed = parseRagResponse('```json\n{"answer":"x","citedEdgeKeys":[]}\n```');
    expect(parsed.answer).toBe('x');
  });

  it('throws on non-JSON, wrong shape, or non-string citations', () => {
    expect(() => parseRagResponse('not json')).toThrow();
    expect(() => parseRagResponse('[]')).toThrow();
    expect(() => parseRagResponse('{"answer":1,"citedEdgeKeys":[]}')).toThrow();
    expect(() => parseRagResponse('{"answer":"x","citedEdgeKeys":[1]}')).toThrow();
    expect(() => parseRagResponse('')).toThrow();
  });
});

// --- grounding (the core guarantee) ---------------------------------------

describe('explainTalentMatch (grounding)', () => {
  const loadView: ExplainTalentMatchDeps['loadView'] = async () => VIEW;

  it('returns an answer whose evidence only references retrieved edges', async () => {
    // Discover the real edge keys the subgraph will contain.
    const sub = buildTalentSubgraph(VIEW, 'dev-1', 2);
    const realKey = sub.edges[0].key;
    const hallucinatedKey = 'collaborated_with|developer:ghost|developer:phantom';

    const ask: ExplainTalentMatchDeps['ask'] = async (req) => {
      // sanity: the grounding contract and the serialized context were passed
      expect(req.system).toMatch(/ONLY using the facts/i);
      expect(req.context).toContain('ROOT: developer:dev-1');
      return JSON.stringify({
        answer: 'dev-1 matches because of contributed repositories and skills.',
        citedEdgeKeys: [realKey, hallucinatedKey],
      });
    };

    const result = await explainTalentMatch('dev-1', 'Why does this developer match React work?', {
      ask,
      loadView,
      depth: 2,
    });

    const subgraphKeys = new Set(sub.edges.map((e) => e.key));
    // INVARIANT: every cited piece of evidence exists in the retrieved subgraph
    for (const ev of result.evidence) {
      expect(subgraphKeys.has(ev.key)).toBe(true);
    }
    expect(result.evidence.map((e) => e.key)).toContain(realKey);
    // the hallucinated citation was dropped, not returned as evidence
    expect(result.evidence.map((e) => e.key)).not.toContain(hallucinatedKey);
    expect(result.droppedCitations).toContain(hallucinatedKey);
    // evidence carries provenance for auditability
    expect(result.evidence[0].source).toBeDefined();
    expect(result.evidence[0].confidence).toBeGreaterThan(0);
    expect(result.retrieval.edgeCount).toBe(sub.edges.length);
  });

  it('de-duplicates repeated citations and preserves the answer text', async () => {
    const sub = buildTalentSubgraph(VIEW, 'dev-1', 2);
    const key = sub.edges[0].key;
    const ask: ExplainTalentMatchDeps['ask'] = async () =>
      JSON.stringify({ answer: 'grounded answer', citedEdgeKeys: [key, key, key] });

    const result = await explainTalentMatch('dev-1', 'why match', { ask, loadView, depth: 2 });
    expect(result.answer).toBe('grounded answer');
    expect(result.evidence.filter((e) => e.key === key)).toHaveLength(1);
    expect(result.droppedCitations).toHaveLength(0);
  });

  it('returns no evidence when the model cites nothing', async () => {
    const ask: ExplainTalentMatchDeps['ask'] = async () =>
      JSON.stringify({ answer: 'insufficient information in the subgraph', citedEdgeKeys: [] });
    const result = await explainTalentMatch('dev-1', 'why match', { ask, loadView });
    expect(result.evidence).toHaveLength(0);
    expect(result.answer).toMatch(/insufficient/);
  });

  it('validates inputs and surfaces a missing view', async () => {
    const ask: ExplainTalentMatchDeps['ask'] = async () => '{"answer":"x","citedEdgeKeys":[]}';
    await expect(explainTalentMatch('', 'q', { ask, loadView })).rejects.toThrow(/rootDeveloperId/);
    await expect(explainTalentMatch('dev-1', '   ', { ask, loadView })).rejects.toThrow(/query/);
    await expect(
      explainTalentMatch('dev-1', 'q', { ask, loadView: async () => null }),
    ).rejects.toThrow(/No talent graph view/);
  });

  it('requires an injected ask function', async () => {
    await expect(
      explainTalentMatch('dev-1', 'q', { loadView } as unknown as ExplainTalentMatchDeps),
    ).rejects.toThrow(/deps.ask/);
  });

  it('propagates a malformed LLM reply as an explicit error', async () => {
    const ask: ExplainTalentMatchDeps['ask'] = async () => 'garbage not json';
    await expect(explainTalentMatch('dev-1', 'q', { ask, loadView })).rejects.toThrow(/JSON/);
  });
});
