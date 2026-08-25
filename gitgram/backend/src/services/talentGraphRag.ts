/**
 * Talent GraphRAG serving layer — grounded "why does this developer match?" query.
 *
 * This is the top of the GraphRAG vertical slice. It composes the pieces that
 * were each built to be pure and testable:
 *   load view → buildTalentSubgraph (retrieve) → serializeTalentSubgraphForLLM
 *   → ask the LLM under a grounding contract → enforce grounding on the reply.
 *
 * Grounding is enforced on OUR side, not trusted from the model: the LLM is asked
 * to cite edges by their canonical key, and we intersect its citations with the
 * keys that actually exist in the retrieved subgraph. Any cited key that is not
 * in the subgraph is a hallucinated reference and is dropped; the returned
 * `evidence` therefore only ever references facts that were truly retrieved.
 *
 * The LLM call is injected via `deps.ask` so the retrieval + serialization +
 * grounding logic is fully unit-testable without a live API. `deps.loadView` is
 * likewise injectable; a default wires it to the existing `getTalentGraph`
 * dossier assembler, keeping the seam while reusing the read path.
 */
import logger from '../utils/logger';
import { getTalentGraph } from './talentGraphService';
import type { TalentGraphView } from './talentGraphEdges';
import type {
  EvidenceSource,
  NodeRef,
  TalentEdge,
  TalentEdgeType,
} from './talentGraphOntology';
import {
  buildTalentSubgraph,
  type TalentSubgraph,
} from './talentSubgraphRetrieval';
import { serializeTalentSubgraphForLLM } from './talentSubgraphSerializer';
import {
  buildRagPrompt,
  parseRagResponse,
  type RagAsk,
} from './talentGraphRagPrompt';

const DEFAULT_DEPTH = 2;
const MAX_QUERY_LENGTH = 2000;

/** A single cited fact returned to the caller — a projection of a subgraph edge. */
export interface EdgeReference {
  readonly key: string;
  readonly type: TalentEdgeType;
  readonly from: NodeRef;
  readonly to: NodeRef;
  readonly source: EvidenceSource;
  readonly confidence: number;
  readonly observedAt: string;
  readonly sourceUrl: string | null;
}

/** The grounded answer plus the evidence it is allowed to stand on. */
export interface ExplainTalentMatchResult {
  readonly developerId: string;
  readonly query: string;
  readonly answer: string;
  readonly evidence: readonly EdgeReference[];
  readonly retrieval: {
    readonly depth: number;
    readonly nodeCount: number;
    readonly edgeCount: number;
  };
  /**
   * Keys the model cited that were NOT in the subgraph. Always empty in a
   * well-behaved run; surfaced (not hidden) so grounding violations are
   * observable rather than silently absorbed.
   */
  readonly droppedCitations: readonly string[];
}

/** Injectable dependencies for {@link explainTalentMatch}. */
export interface ExplainTalentMatchDeps {
  /** The LLM seam. Required — there is no implicit network call. */
  readonly ask: RagAsk;
  /** How to obtain the assembled view. Defaults to {@link getTalentGraph}. */
  readonly loadView?: (developerId: string) => Promise<TalentGraphView | null>;
  /** k-hop retrieval depth. Defaults to {@link DEFAULT_DEPTH}. */
  readonly depth?: number;
}

/** Default view loader: reuse the existing dossier assembler on the read path. */
async function defaultLoadView(developerId: string): Promise<TalentGraphView | null> {
  return (await getTalentGraph(developerId)) as TalentGraphView | null;
}

function toEdgeReference(edge: TalentEdge): EdgeReference {
  return {
    key: edge.key,
    type: edge.type,
    from: edge.from,
    to: edge.to,
    source: edge.provenance.source,
    confidence: edge.provenance.confidence,
    observedAt: edge.provenance.observedAt.toISOString(),
    sourceUrl: edge.provenance.sourceUrl,
  };
}

/**
 * Enforce grounding: partition the model's cited keys into those present in the
 * subgraph (kept as evidence, de-duplicated, in subgraph order) and those that
 * are not (dropped as hallucinations). This is the guardrail that guarantees the
 * returned evidence only references retrieved facts.
 */
function groundCitations(
  subgraph: TalentSubgraph,
  citedKeys: readonly string[],
): { evidence: EdgeReference[]; dropped: string[] } {
  const edgesByKey = new Map(subgraph.edges.map((edge) => [edge.key, edge]));
  const seen = new Set<string>();
  const dropped: string[] = [];

  for (const key of citedKeys) {
    if (!edgesByKey.has(key)) {
      if (!dropped.includes(key)) dropped.push(key);
    }
  }

  // Preserve deterministic subgraph edge order for cited, in-subgraph keys.
  const citedSet = new Set(citedKeys);
  const evidence: EdgeReference[] = [];
  for (const edge of subgraph.edges) {
    if (citedSet.has(edge.key) && !seen.has(edge.key)) {
      seen.add(edge.key);
      evidence.push(toEdgeReference(edge));
    }
  }

  return { evidence, dropped };
}

function normalizeQuery(query: string): string {
  const cleaned = typeof query === 'string' ? query.trim() : '';
  if (!cleaned) throw new Error('A non-empty query is required to explain a talent match');
  if (cleaned.length > MAX_QUERY_LENGTH) {
    throw new Error(`Query must be at most ${MAX_QUERY_LENGTH} characters`);
  }
  return cleaned;
}

/**
 * Explain, grounded in the retrieved subgraph, why/how a developer matches a
 * query. Retrieves the k-hop neighborhood, serializes it, asks the injected LLM
 * under the grounding contract, then enforces that the returned evidence only
 * references retrieved edges.
 *
 * @throws if inputs are invalid, the developer has no assembled view, or the LLM
 *         reply cannot be parsed. Errors are explicit — never silently swallowed.
 */
export async function explainTalentMatch(
  rootDeveloperId: string,
  query: string,
  deps: ExplainTalentMatchDeps,
): Promise<ExplainTalentMatchResult> {
  const developerId = typeof rootDeveloperId === 'string' ? rootDeveloperId.trim() : '';
  if (!developerId) throw new Error('explainTalentMatch requires a non-empty rootDeveloperId');
  if (!deps || typeof deps.ask !== 'function') {
    throw new Error('explainTalentMatch requires deps.ask (the injectable LLM call)');
  }
  const cleanedQuery = normalizeQuery(query);
  const depth = deps.depth ?? DEFAULT_DEPTH;
  const loadView = deps.loadView ?? defaultLoadView;

  const view = await loadView(developerId);
  if (!view) throw new Error(`No talent graph view found for developer "${developerId}"`);

  const subgraph = buildTalentSubgraph(view, developerId, depth);
  const context = serializeTalentSubgraphForLLM(subgraph);
  const prompt = buildRagPrompt(cleanedQuery, context);

  const raw = await deps.ask(prompt);
  const parsed = parseRagResponse(raw);
  const { evidence, dropped } = groundCitations(subgraph, parsed.citedEdgeKeys);

  if (dropped.length > 0) {
    logger.warn('talent-graphrag dropped hallucinated citations not present in the subgraph', {
      event: 'talent_graph.rag.hallucinated_citation',
      developerId,
      droppedCount: dropped.length,
      dropped,
    });
  }

  return {
    developerId,
    query: cleanedQuery,
    answer: parsed.answer,
    evidence,
    retrieval: {
      depth: subgraph.depth,
      nodeCount: subgraph.nodes.length,
      edgeCount: subgraph.edges.length,
    },
    droppedCitations: dropped,
  };
}

/**
 * Default LLM seam. There is no LLM client wired into gitgram-ai yet, so this
 * default fails loudly rather than pretending to answer — production wiring
 * should replace it with a real client (e.g. via `deps.ask`) while keeping this
 * exact signature. Kept as a named export so the controller can depend on the
 * seam and tests can substitute their own `ask`.
 */
export const defaultRagAsk: RagAsk = async () => {
  throw new Error(
    'No LLM client is configured for talent GraphRAG. Provide deps.ask to explainTalentMatch.',
  );
};
