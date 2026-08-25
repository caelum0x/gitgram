/**
 * k-hop subgraph retrieval for the talent GraphRAG serving layer.
 *
 * GraphRAG serves *structure*, not prose: before an LLM can ground an answer we
 * must first retrieve the bounded neighborhood of facts that are relevant to a
 * developer. This module is the retrieval half. It REUSES the existing graph
 * pipeline rather than rebuilding it:
 *   assembled view  →  deriveTalentEdges  →  validateEdges  →  k-hop subgraph
 * so every fact that reaches the LLM has already been vetted against the
 * ontology's domain/range and carries provenance (source, confidence, observedAt).
 *
 * Two entry points:
 *  - `buildSubgraphFromEdges` — the pure BFS core over an already-validated edge
 *    set. Traversal is undirected (a neighborhood, not a reachability query) so a
 *    developer's repos, skills, orgs and collaborators are all gathered, but never
 *    beyond `depth` hops. This is the unit-testable heart of retrieval.
 *  - `buildTalentSubgraph` — the view-based wrapper that runs the extract→validate
 *    pipeline before delegating to the BFS core.
 *
 * Pure and dependency-light: no Prisma, no I/O, immutable output.
 */
import {
  deriveTalentEdges,
  type TalentGraphView,
} from './talentGraphEdges';
import {
  validateEdges,
  type NodeRef,
  type TalentEdge,
  type TalentNodeType,
} from './talentGraphOntology';

/** A node that appears in a retrieved subgraph, tagged with its BFS distance. */
export interface SubgraphNode {
  readonly id: string;
  readonly type: TalentNodeType;
  /** Hops from the root developer. The root itself is 0. */
  readonly distance: number;
}

/** A bounded, validated neighborhood of the talent graph around one developer. */
export interface TalentSubgraph {
  readonly root: NodeRef;
  readonly depth: number;
  readonly nodes: readonly SubgraphNode[];
  readonly edges: readonly TalentEdge[];
}

const MAX_DEPTH = 6;

function nodeKey(type: TalentNodeType, id: string): string {
  return `${type}:${id}`;
}

/**
 * Validate the requested traversal depth at the boundary. Retrieval must always
 * terminate, so depth is a non-negative integer capped at MAX_DEPTH. Never trust
 * a caller-supplied bound.
 */
function normalizeDepth(depth: number): number {
  if (typeof depth !== 'number' || !Number.isInteger(depth) || depth < 0) {
    throw new RangeError('Subgraph depth must be a non-negative integer');
  }
  return Math.min(depth, MAX_DEPTH);
}

/**
 * Retrieve the k-hop neighborhood around `root` from a set of already-validated
 * edges. Undirected BFS assigns each reachable node its shortest hop distance;
 * nodes farther than `depth` are excluded, and an edge is kept only when BOTH of
 * its endpoints made it into the node set. This is what stops "wrong hops":
 * facts hanging off a node one step beyond the frontier never enter the context.
 *
 * The root is always present (distance 0) even when it has no edges, so callers
 * always get a well-formed subgraph. Termination is guaranteed: each node is
 * enqueued at most once.
 */
export function buildSubgraphFromEdges(
  edges: readonly TalentEdge[],
  root: NodeRef,
  depth: number,
): TalentSubgraph {
  if (!root || typeof root.id !== 'string' || root.id.trim() === '') {
    throw new Error('Subgraph retrieval requires a root node with a non-empty id');
  }
  const maxDepth = normalizeDepth(depth);
  const rootRef: NodeRef = { id: root.id, type: root.type };

  // Adjacency list over an undirected view of the (directed) edge set.
  const adjacency = new Map<string, { neighbor: NodeRef }[]>();
  const addAdjacency = (from: NodeRef, to: NodeRef) => {
    const key = nodeKey(from.type, from.id);
    const list = adjacency.get(key) ?? [];
    list.push({ neighbor: to });
    adjacency.set(key, list);
  };
  for (const edge of edges) {
    addAdjacency(edge.from, edge.to);
    addAdjacency(edge.to, edge.from);
  }

  // BFS from the root, recording the shortest distance to every node.
  const distances = new Map<string, SubgraphNode>();
  const rootKey = nodeKey(rootRef.type, rootRef.id);
  distances.set(rootKey, { id: rootRef.id, type: rootRef.type, distance: 0 });
  let frontier: NodeRef[] = [rootRef];

  for (let hop = 1; hop <= maxDepth && frontier.length > 0; hop += 1) {
    const next: NodeRef[] = [];
    for (const node of frontier) {
      for (const { neighbor } of adjacency.get(nodeKey(node.type, node.id)) ?? []) {
        const key = nodeKey(neighbor.type, neighbor.id);
        if (distances.has(key)) continue;
        distances.set(key, { id: neighbor.id, type: neighbor.type, distance: hop });
        next.push(neighbor);
      }
    }
    frontier = next;
  }

  // Keep only edges whose BOTH endpoints are inside the retrieved node set.
  const included = (node: NodeRef) => distances.has(nodeKey(node.type, node.id));
  const keptEdges = edges.filter((edge) => included(edge.from) && included(edge.to));

  const nodes = Array.from(distances.values());
  return {
    root: rootRef,
    depth: maxDepth,
    nodes: sortNodes(nodes),
    edges: sortEdges(keptEdges),
  };
}

/**
 * View-based retrieval entry point. Runs the existing extract→validate pipeline
 * (`deriveTalentEdges` + `validateEdges`) so only ontology-valid, provenance-
 * carrying edges are traversed, then returns the k-hop subgraph around the given
 * developer. `rootDeveloperId` is validated against the view's own profile to keep
 * the seam honest — you can only build a subgraph for the developer the view
 * describes.
 */
export function buildTalentSubgraph(
  view: TalentGraphView,
  rootDeveloperId: string,
  depth: number,
): TalentSubgraph {
  if (!view || typeof view !== 'object') {
    throw new Error('buildTalentSubgraph requires an assembled talent graph view');
  }
  const developerId = typeof rootDeveloperId === 'string' ? rootDeveloperId.trim() : '';
  if (!developerId) {
    throw new Error('buildTalentSubgraph requires a non-empty rootDeveloperId');
  }
  if (view.profile?.id !== developerId) {
    throw new Error(
      `rootDeveloperId "${developerId}" does not match the view profile "${view.profile?.id ?? ''}"`,
    );
  }

  const { accepted } = validateEdges(deriveTalentEdges(view));
  return buildSubgraphFromEdges(accepted, { id: developerId, type: 'developer' }, depth);
}

/** Deterministic node ordering: by distance, then type, then id. */
function sortNodes(nodes: readonly SubgraphNode[]): SubgraphNode[] {
  return [...nodes].sort(
    (a, b) =>
      a.distance - b.distance ||
      a.type.localeCompare(b.type) ||
      a.id.localeCompare(b.id),
  );
}

/** Deterministic edge ordering by canonical key. */
function sortEdges(edges: readonly TalentEdge[]): TalentEdge[] {
  return [...edges].sort((a, b) => a.key.localeCompare(b.key));
}
