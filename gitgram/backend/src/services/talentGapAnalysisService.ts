/**
 * Need-coverage / gap analysis.
 *
 * Answers ARCHITECTURE.md §3.1 competency question #7 — "Which needs are
 * currently unmatched because no person covers skill set S?" — and delivers the
 * L3 done-ladder "unmatched-need gap analysis" (ARCHITECTURE.md §5.5).
 *
 * Rung 2 canonicalized skills and taught `findTalentMatches` to score candidates
 * per Need. This rung inverts that view: instead of "who matches this Need", it
 * asks "which required skills does the current talent pool actually cover, and at
 * what evidence strength". An org posting a Need needs to know its *gaps* — the
 * skills for which no verifiable person exists — not just its top candidates.
 *
 * Design mirrors skillTaxonomyService: the core `analyzeNeedCoverage` is pure and
 * dependency-free (no Prisma, no I/O) so it is unit-testable in isolation against
 * plain match objects. `getNeedCoverage` is the thin orchestrator that runs the
 * matcher and feeds it in; its `db` is injectable so it too tests without a live
 * Postgres. Coverage strength ranks evidence exactly as the matcher does:
 * verified > evidenced (any repo/pilot proof) > interest-only > unmet.
 */
import { canonicalizeSkills } from './skillTaxonomyService';
import { findTalentMatches } from './talentGraphService';
import prisma from '../utils/prisma';

type EvidenceLevel = 'verified' | 'linked' | 'recorded';

/**
 * The strongest signal any candidate offers for a single required skill, ranked
 * the way the matcher ranks evidence.
 */
export type CoverageStrength = 'verified' | 'evidenced' | 'interest' | 'unmet';

/**
 * The minimal, structural shape of a match this analyzer reads. Compatible with
 * (a superset of) the objects returned by `findTalentMatches`, but decoupled from
 * its full inferred type so it can be unit-tested with hand-built fixtures.
 */
export interface CandidateCoverage {
  readonly matchedSkills: readonly string[];
  readonly projects: readonly {
    readonly matchedSkills: readonly string[];
    readonly verificationLevel: EvidenceLevel;
  }[];
}

export interface SkillCoverage {
  /** Canonical skill token. */
  skill: string;
  /** Strongest evidence strength any candidate offers for this skill. */
  strength: CoverageStrength;
  /** Candidates with any signal (repo/pilot evidence or interest) for the skill. */
  candidateCount: number;
  /** Candidates whose repo/pilot evidence covers the skill. */
  evidencedCount: number;
  /** Candidates whose *verified-tier* evidence covers the skill. */
  verifiedCount: number;
}

export interface NeedCoverageAnalysis {
  /** Canonicalized, de-duplicated required skills the analysis was run over. */
  requiredSkills: string[];
  /** Per-skill coverage, in the input skill order. */
  coverage: SkillCoverage[];
  /** Required skills no candidate covers with any signal — the gap. */
  unmetSkills: string[];
  /** Fraction of required skills covered by at least one candidate (0..1). */
  coverageRatio: number;
  /** Roll-up status for the whole Need. */
  status: 'fully-covered' | 'partially-covered' | 'unmet';
  /** Size of the candidate pool the analysis considered. */
  candidatePool: number;
}

type TalentCoverageDb = Parameters<typeof findTalentMatches>[2];

function classify(verifiedCount: number, evidencedCount: number, candidateCount: number): CoverageStrength {
  if (verifiedCount > 0) return 'verified';
  if (evidencedCount > 0) return 'evidenced';
  if (candidateCount > 0) return 'interest';
  return 'unmet';
}

/**
 * Pure gap analysis: given the raw required skills of a Need and the candidate
 * matches for it, report which skills the pool covers and how strongly. No I/O.
 *
 * Skills are canonicalized first (reusing rung 2) so the report keys line up with
 * the canonical tokens the matcher scores on — an org asking for "JavaScript" and
 * a candidate whose repo language is "js" resolve to the same coverage row.
 */
export function analyzeNeedCoverage(
  requiredSkills: readonly string[],
  matches: readonly CandidateCoverage[],
): NeedCoverageAnalysis {
  const skills = canonicalizeSkills([...requiredSkills]);

  const coverage: SkillCoverage[] = skills.map((skill) => {
    let candidateCount = 0;
    let evidencedCount = 0;
    let verifiedCount = 0;

    for (const match of matches) {
      const evidencedProjects = match.projects.filter((project) => project.matchedSkills.includes(skill));
      const hasEvidence = evidencedProjects.length > 0;
      const hasVerified = evidencedProjects.some((project) => project.verificationLevel === 'verified');
      // `matchedSkills` already unions evidence + interest signals, so it is the
      // "any signal" test; evidence/verified are the stronger nested tiers.
      const hasAnySignal = match.matchedSkills.includes(skill) || hasEvidence;

      if (hasAnySignal) candidateCount += 1;
      if (hasEvidence) evidencedCount += 1;
      if (hasVerified) verifiedCount += 1;
    }

    return {
      skill,
      strength: classify(verifiedCount, evidencedCount, candidateCount),
      candidateCount,
      evidencedCount,
      verifiedCount,
    };
  });

  const unmetSkills = coverage.filter((entry) => entry.candidateCount === 0).map((entry) => entry.skill);
  const coveredCount = skills.length - unmetSkills.length;
  const coverageRatio = skills.length === 0 ? 0 : Math.round((coveredCount / skills.length) * 100) / 100;
  const status: NeedCoverageAnalysis['status'] =
    skills.length === 0 || unmetSkills.length === skills.length
      ? 'unmet'
      : unmetSkills.length === 0
      ? 'fully-covered'
      : 'partially-covered';

  return {
    requiredSkills: skills,
    coverage,
    unmetSkills,
    coverageRatio,
    status,
    candidatePool: matches.length,
  };
}

/**
 * Orchestrator: run the evidence matcher for a Need's required skills, then fold
 * the results into a coverage/gap report. `db` is injectable (defaults to the
 * shared Prisma client) so callers and tests can supply a fake, mirroring
 * `findTalentMatches`.
 */
export async function getNeedCoverage(
  requiredSkills: string[],
  limit = 25,
  db: TalentCoverageDb = prisma,
): Promise<NeedCoverageAnalysis> {
  const matches = await findTalentMatches(requiredSkills, limit, db);
  return analyzeNeedCoverage(requiredSkills, matches);
}
