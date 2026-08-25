/**
 * Deterministic serialization of a retrieved talent subgraph into LLM-ready
 * context.
 *
 * The grounding contract of GraphRAG is only as strong as the context window is
 * faithful: the LLM may answer ONLY from what we hand it, so the serialized block
 * must (a) be deterministic — identical subgraph in, byte-identical text out, so
 * prompts are cacheable and tests are stable — and (b) expose the citation handle
 * (each edge's canonical `key`) the model is required to cite, alongside the
 * provenance (source, confidence, observedAt) that makes each fact auditable.
 *
 * Nodes are grouped by ontology type in a fixed order; edges are rendered as
 * subject–predicate–object triples with their provenance and citation key. No
 * prose, no I/O — pure formatting.
 */
import {
  TALENT_NODE_TYPES,
  type TalentEdge,
  type TalentNodeType,
} from './talentGraphOntology';
import type { SubgraphNode, TalentSubgraph } from './talentSubgraphRetrieval';

/** Human-facing labels for each node type, kept stable for prompt determinism. */
const NODE_TYPE_LABELS: Readonly<Record<TalentNodeType, string>> = {
  developer: 'Developers',
  repo: 'Repositories',
  org: 'Organizations',
  skill: 'Skills',
  contribution: 'Contributions',
};

/** Verb phrasing for each edge type so triples read naturally but stay stable. */
const EDGE_TYPE_PHRASES: Readonly<Record<string, string>> = {
  contributed_to: 'contributed to',
  member_of: 'is a member of',
  has_skill: 'has skill',
  collaborated_with: 'collaborated with',
};

function formatConfidence(value: number): string {
  return value.toFixed(2);
}

function formatNodeLine(node: SubgraphNode): string {
  return `  - ${node.type}:${node.id} (depth ${node.distance})`;
}

function formatEdgeLine(edge: TalentEdge): string {
  const phrase = EDGE_TYPE_PHRASES[edge.type] ?? edge.type;
  const provenance =
    `source=${edge.provenance.source}` +
    `, confidence=${formatConfidence(edge.provenance.confidence)}` +
    `, observedAt=${edge.provenance.observedAt.toISOString()}` +
    `, sourceUrl=${edge.provenance.sourceUrl ?? 'none'}`;
  return (
    `  - [${edge.key}] ${edge.from.type}:${edge.from.id} ` +
    `${phrase} ${edge.to.type}:${edge.to.id} {${provenance}}`
  );
}

/**
 * Render the subgraph as a deterministic text block for the LLM context window.
 * Structure:
 *   ROOT: <type>:<id>  (depth <k>)
 *   NODES
 *     <grouped by type, sorted>
 *   EDGES (facts — cite by [key])
 *     <sorted by key, one triple per line with provenance>
 *
 * The input is assumed already ordered by the retrieval layer; grouping here is a
 * stable re-projection, so the output is a pure function of the subgraph.
 */
export function serializeTalentSubgraphForLLM(subgraph: TalentSubgraph): string {
  if (!subgraph || typeof subgraph !== 'object') {
    throw new Error('serializeTalentSubgraphForLLM requires a subgraph');
  }

  const lines: string[] = [];
  lines.push(`ROOT: ${subgraph.root.type}:${subgraph.root.id} (depth ${subgraph.depth})`);

  lines.push('NODES');
  if (subgraph.nodes.length === 0) {
    lines.push('  (none)');
  } else {
    for (const type of TALENT_NODE_TYPES) {
      const ofType = subgraph.nodes.filter((node) => node.type === type);
      if (ofType.length === 0) continue;
      lines.push(`  ${NODE_TYPE_LABELS[type]}:`);
      for (const node of ofType) lines.push(`  ${formatNodeLine(node)}`);
    }
  }

  lines.push('EDGES (facts — cite by [key]):');
  if (subgraph.edges.length === 0) {
    lines.push('  (none)');
  } else {
    for (const edge of subgraph.edges) lines.push(formatEdgeLine(edge));
  }

  return lines.join('\n');
}
