/**
 * Edge extraction from the assembled talent graph.
 *
 * `getTalentGraph` (talentGraphService.ts) already assembles a developer's
 * projects, collaborators and evidence on read, but returns them as nested view
 * objects — not as typed, provenanced edges. This module is the extraction step
 * of the graph pipeline: it turns that view into flat candidate edges
 * (`TalentEdgeInput`) which the ontology's `validateEdges` then vets against
 * domain/range before anything is persisted. Extract → validate → serve.
 *
 * It REUSES rather than rebuilds:
 *  - the shapes produced by `getTalentGraph` (structural subset below),
 *  - `canonicalizeSkill` from skillTaxonomyService for skill-node identity,
 *  - the ontology's `EvidenceSource` union, aligned with `TalentEvidence.kind`.
 *
 * Pure and dependency-light: takes an already-fetched graph view, does no I/O.
 */
import { canonicalizeSkill } from './skillTaxonomyService';
import { EVIDENCE_SOURCES, type EvidenceSource, type TalentEdgeInput } from './talentGraphOntology';

type EvidenceLevel = 'verified' | 'linked' | 'recorded';

/** Confidence for an edge derived from a project at a given verification tier. */
const CONFIDENCE_BY_LEVEL: Readonly<Record<EvidenceLevel, number>> = {
  verified: 1,
  linked: 0.75,
  recorded: 0.5,
};

const SOURCE_SET: ReadonlySet<string> = new Set(EVIDENCE_SOURCES);

/** Structural subset of one project as returned by `getTalentGraph`. */
export interface GraphProjectView {
  readonly id: string;
  readonly url: string | null;
  readonly topics: readonly string[];
  readonly verificationLevel: EvidenceLevel;
  readonly lastVerifiedAt: Date;
  readonly evidence: readonly { readonly kind: string; readonly sourceUrl: string | null }[];
}

/** Structural subset of one collaborator as returned by `getTalentGraph`. */
export interface GraphCollaboratorView {
  readonly id: string;
  readonly sharedProjects: readonly { readonly id: string; readonly url: string }[];
}

/** Structural subset of the whole graph view `deriveTalentEdges` consumes. */
export interface TalentGraphView {
  readonly profile: { readonly id: string };
  readonly projects: readonly GraphProjectView[];
  readonly collaborators: readonly GraphCollaboratorView[];
}

/**
 * Pick the provenance source for a project-derived edge from its strongest
 * evidence record, falling back to `project_record` when the evidence carries no
 * recognized kind. Keeps edge provenance traceable to the same evidence the
 * dossier shows the user.
 */
function projectSource(project: GraphProjectView): EvidenceSource {
  const known = project.evidence.find((item) => SOURCE_SET.has(item.kind));
  return (known?.kind as EvidenceSource) ?? 'project_record';
}

/**
 * Extract candidate edges from a talent graph view. The output is intentionally
 * untrusted `TalentEdgeInput[]`: run it through `validateEdges` to get the vetted,
 * de-duplicated edge set. Emits three relation families:
 *  - developer —contributed_to→ repo   (one per project)
 *  - developer —has_skill→ skill        (one per canonicalized project topic)
 *  - developer —collaborated_with→ developer (one per collaborator, symmetric)
 */
export function deriveTalentEdges(graph: TalentGraphView): TalentEdgeInput[] {
  const developerId = graph.profile.id;
  const edges: TalentEdgeInput[] = [];
  if (!developerId) return edges;

  for (const project of graph.projects) {
    const source = projectSource(project);
    const confidence = CONFIDENCE_BY_LEVEL[project.verificationLevel];

    edges.push({
      type: 'contributed_to',
      from: { id: developerId, type: 'developer' },
      to: { id: project.id, type: 'repo' },
      provenance: {
        source,
        observedAt: project.lastVerifiedAt,
        confidence,
        sourceUrl: project.url,
      },
    });

    const seenSkills = new Set<string>();
    for (const topic of project.topics) {
      const skill = canonicalizeSkill(topic);
      if (!skill || seenSkills.has(skill)) continue;
      seenSkills.add(skill);
      edges.push({
        type: 'has_skill',
        from: { id: developerId, type: 'developer' },
        to: { id: skill, type: 'skill' },
        provenance: {
          source,
          observedAt: project.lastVerifiedAt,
          // A skill inferred from a repo topic is weaker than the contribution
          // itself; cap it at the "recorded" tier.
          confidence: Math.min(confidence, CONFIDENCE_BY_LEVEL.recorded),
          sourceUrl: project.url,
        },
      });
    }
  }

  for (const collaborator of graph.collaborators) {
    if (!collaborator.id || collaborator.id === developerId) continue;
    const shared = collaborator.sharedProjects[0];
    edges.push({
      type: 'collaborated_with',
      from: { id: developerId, type: 'developer' },
      to: { id: collaborator.id, type: 'developer' },
      provenance: {
        source: 'github_sync',
        observedAt: new Date(),
        confidence: CONFIDENCE_BY_LEVEL.recorded,
        sourceUrl: shared?.url ?? null,
      },
    });
  }

  return edges;
}
