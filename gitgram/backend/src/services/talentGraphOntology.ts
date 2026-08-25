/**
 * Talent-graph ontology + edge validation.
 *
 * A graph is a PRODUCT WITH A SCHEMA, not a pile of triples. Before this rung the
 * talent graph was assembled implicitly inside `getTalentGraph` — projects,
 * collaborators and skills were derived on read, but no typed contract said which
 * relationships are *legal*. This module promotes that implicit structure to an
 * explicit ontology and adds the single guardrail that removes hallucinated
 * structure: every candidate edge is validated against its edge type's
 * domain/range, and type-incompatible edges are rejected with a reason.
 *
 * Entities (node types): developer, repo, org, skill, contribution.
 * Relations (edge types): contributed_to, member_of, has_skill, collaborated_with.
 *
 * Discipline applied here (not recited):
 *  - Model types BEFORE writing edges (TALENT_ONTOLOGY below).
 *  - Provenance on EVERY fact: source, observedAt, confidence, sourceUrl.
 *  - Validate edges against domain/range; reject type-incompatible ones.
 *  - Incremental & pure: no Prisma, no I/O — unit-testable in isolation, mirroring
 *    skillTaxonomyService / talentGapAnalysisService.
 *
 * The evidence `source` union is deliberately aligned with the `kind` field of
 * `TalentEvidence` in talentGraphService.ts (plus `profile_interest`) so edges
 * derived from that service carry provenance the rest of the graph already speaks.
 */

export const TALENT_NODE_TYPES = ['developer', 'repo', 'org', 'skill', 'contribution'] as const;
export type TalentNodeType = (typeof TALENT_NODE_TYPES)[number];

export const TALENT_EDGE_TYPES = ['contributed_to', 'member_of', 'has_skill', 'collaborated_with'] as const;
export type TalentEdgeType = (typeof TALENT_EDGE_TYPES)[number];

/**
 * Provenance sources. Kept in lock-step with `TalentEvidence['kind']` in
 * talentGraphService.ts, extended with `profile_interest` for the weakest signal
 * (a self-declared interest with no repository/pilot evidence behind it).
 */
export const EVIDENCE_SOURCES = [
  'repository_claim',
  'github_sync',
  'github_activity',
  'project_record',
  'institutional_pilot',
  'profile_interest',
] as const;
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

/**
 * Domain/range contract for one edge type. `domain` is the set of legal source
 * node types, `range` the set of legal target node types. `symmetric` marks
 * undirected relations (collaborated_with) so A→B and B→A collapse to one edge.
 * `reflexiveAllowed` guards self-loops (a developer cannot collaborate with self).
 */
export interface EdgeTypeDefinition {
  readonly type: TalentEdgeType;
  readonly domain: readonly TalentNodeType[];
  readonly range: readonly TalentNodeType[];
  readonly symmetric: boolean;
  readonly reflexiveAllowed: boolean;
}

export const TALENT_ONTOLOGY: Readonly<Record<TalentEdgeType, EdgeTypeDefinition>> = {
  contributed_to: {
    type: 'contributed_to',
    domain: ['developer'],
    range: ['repo'],
    symmetric: false,
    reflexiveAllowed: false,
  },
  member_of: {
    type: 'member_of',
    domain: ['developer'],
    range: ['org'],
    symmetric: false,
    reflexiveAllowed: false,
  },
  has_skill: {
    type: 'has_skill',
    domain: ['developer'],
    range: ['skill'],
    symmetric: false,
    reflexiveAllowed: false,
  },
  collaborated_with: {
    type: 'collaborated_with',
    domain: ['developer'],
    range: ['developer'],
    symmetric: true,
    reflexiveAllowed: false,
  },
};

export interface NodeRef {
  readonly id: string;
  readonly type: TalentNodeType;
}

export interface EdgeProvenance {
  readonly source: EvidenceSource;
  readonly observedAt: Date;
  /** Confidence in (0, 1]. Verified evidence is 1; weaker signals score lower. */
  readonly confidence: number;
  readonly sourceUrl: string | null;
}

/** An accepted, well-typed edge. `key` is its canonical dedup identity. */
export interface TalentEdge {
  readonly type: TalentEdgeType;
  readonly from: NodeRef;
  readonly to: NodeRef;
  readonly provenance: EdgeProvenance;
  readonly key: string;
}

/**
 * Untrusted edge input, exactly as it might arrive from an extractor, a GitHub
 * sync, or an LLM. Every field is loosely typed on purpose — validation is what
 * narrows it. Never trust external data.
 */
export interface TalentEdgeInput {
  readonly type: string;
  readonly from: { readonly id: string; readonly type: string };
  readonly to: { readonly id: string; readonly type: string };
  readonly provenance: {
    readonly source: string;
    readonly observedAt: Date | string | number;
    readonly confidence: number;
    readonly sourceUrl?: string | null;
  };
}

export type EdgeRejectionCode =
  | 'unknown_edge_type'
  | 'missing_from_id'
  | 'missing_to_id'
  | 'unknown_from_type'
  | 'unknown_to_type'
  | 'domain_violation'
  | 'range_violation'
  | 'self_reference'
  | 'unknown_source'
  | 'invalid_confidence'
  | 'invalid_observed_at';

export interface EdgeRejection {
  readonly code: EdgeRejectionCode;
  readonly message: string;
}

export type EdgeValidation =
  | { readonly valid: true; readonly edge: TalentEdge }
  | { readonly valid: false; readonly rejections: readonly EdgeRejection[] };

export interface EdgeBatchResult {
  readonly accepted: readonly TalentEdge[];
  readonly rejected: readonly { readonly input: TalentEdgeInput; readonly rejections: readonly EdgeRejection[] }[];
}

const NODE_TYPE_SET: ReadonlySet<string> = new Set(TALENT_NODE_TYPES);
const SOURCE_SET: ReadonlySet<string> = new Set(EVIDENCE_SOURCES);

function isTalentEdgeType(value: string): value is TalentEdgeType {
  return Object.prototype.hasOwnProperty.call(TALENT_ONTOLOGY, value);
}

function coerceDate(value: Date | string | number): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Canonical identity of an edge. For symmetric edge types the two endpoints are
 * sorted so that A—B and B—A share one key; for directed edges the order is kept.
 */
export function edgeKey(type: TalentEdgeType, from: NodeRef, to: NodeRef): string {
  const left = `${from.type}:${from.id}`;
  const right = `${to.type}:${to.id}`;
  const [a, b] = TALENT_ONTOLOGY[type].symmetric && right < left ? [right, left] : [left, right];
  return `${type}|${a}|${b}`;
}

/**
 * Validate a single untrusted edge against the ontology. Returns the normalized,
 * accepted edge, or ALL the reasons it was rejected (validation is comprehensive
 * rather than fail-fast so callers can surface every problem at once).
 */
export function validateEdge(input: TalentEdgeInput): EdgeValidation {
  const rejections: EdgeRejection[] = [];

  const type = typeof input.type === 'string' ? input.type.trim() : '';
  const fromId = typeof input.from?.id === 'string' ? input.from.id.trim() : '';
  const toId = typeof input.to?.id === 'string' ? input.to.id.trim() : '';
  const fromType = typeof input.from?.type === 'string' ? input.from.type.trim() : '';
  const toType = typeof input.to?.type === 'string' ? input.to.type.trim() : '';

  if (!isTalentEdgeType(type)) {
    rejections.push({ code: 'unknown_edge_type', message: `Unknown edge type "${input.type}"` });
  }
  if (!fromId) rejections.push({ code: 'missing_from_id', message: 'Edge is missing a source node id' });
  if (!toId) rejections.push({ code: 'missing_to_id', message: 'Edge is missing a target node id' });
  if (!NODE_TYPE_SET.has(fromType)) {
    rejections.push({ code: 'unknown_from_type', message: `Unknown source node type "${fromType}"` });
  }
  if (!NODE_TYPE_SET.has(toType)) {
    rejections.push({ code: 'unknown_to_type', message: `Unknown target node type "${toType}"` });
  }

  // Domain/range only make sense once the edge type is known.
  if (isTalentEdgeType(type)) {
    const def = TALENT_ONTOLOGY[type];
    if (NODE_TYPE_SET.has(fromType) && !def.domain.includes(fromType as TalentNodeType)) {
      rejections.push({
        code: 'domain_violation',
        message: `${type} requires a source of type [${def.domain.join(', ')}], got "${fromType}"`,
      });
    }
    if (NODE_TYPE_SET.has(toType) && !def.range.includes(toType as TalentNodeType)) {
      rejections.push({
        code: 'range_violation',
        message: `${type} requires a target of type [${def.range.join(', ')}], got "${toType}"`,
      });
    }
    if (!def.reflexiveAllowed && fromId && toId && fromType === toType && fromId === toId) {
      rejections.push({
        code: 'self_reference',
        message: `${type} cannot connect a node to itself (${fromType}:${fromId})`,
      });
    }
  }

  const source = typeof input.provenance?.source === 'string' ? input.provenance.source.trim() : '';
  if (!SOURCE_SET.has(source)) {
    rejections.push({ code: 'unknown_source', message: `Unknown provenance source "${source}"` });
  }
  const confidence = input.provenance?.confidence;
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence <= 0 || confidence > 1) {
    rejections.push({ code: 'invalid_confidence', message: 'Provenance confidence must be a number in (0, 1]' });
  }
  const observedAt = input.provenance?.observedAt === undefined ? null : coerceDate(input.provenance.observedAt);
  if (!observedAt) {
    rejections.push({ code: 'invalid_observed_at', message: 'Provenance observedAt must be a valid date' });
  }

  if (rejections.length > 0) return { valid: false, rejections };

  const edgeType = type as TalentEdgeType;
  const from: NodeRef = { id: fromId, type: fromType as TalentNodeType };
  const to: NodeRef = { id: toId, type: toType as TalentNodeType };
  const provenance: EdgeProvenance = {
    source: source as EvidenceSource,
    observedAt: observedAt as Date,
    confidence: confidence as number,
    sourceUrl: input.provenance.sourceUrl ?? null,
  };

  return {
    valid: true,
    edge: { type: edgeType, from, to, provenance, key: edgeKey(edgeType, from, to) },
  };
}

/**
 * Validate a batch of untrusted edges, partitioning into accepted and rejected.
 * Accepted edges are de-duplicated by canonical `key` (first writer wins); when a
 * duplicate carries higher confidence the stronger provenance is kept.
 *
 * This is the "single validation step that removes hallucinated structure": feed
 * it raw extraction output, persist only `accepted`, and inspect `rejected` to
 * see exactly which type-incompatible triples were dropped and why.
 */
export function validateEdges(inputs: readonly TalentEdgeInput[]): EdgeBatchResult {
  const acceptedByKey = new Map<string, TalentEdge>();
  const rejected: EdgeBatchResult['rejected'] = [];

  for (const input of inputs) {
    const result = validateEdge(input);
    if (!result.valid) {
      (rejected as { input: TalentEdgeInput; rejections: readonly EdgeRejection[] }[]).push({
        input,
        rejections: result.rejections,
      });
      continue;
    }
    const existing = acceptedByKey.get(result.edge.key);
    if (!existing || result.edge.provenance.confidence > existing.provenance.confidence) {
      acceptedByKey.set(result.edge.key, result.edge);
    }
  }

  return { accepted: Array.from(acceptedByKey.values()), rejected };
}
