/**
 * Unit tests for talentGapAnalysisService (ARCHITECTURE.md §3.1 CQ#7, §5.5 L3).
 *
 * `analyzeNeedCoverage` is pure — no Prisma, no I/O — so it runs against
 * hand-built match objects. `getNeedCoverage` takes the same injectable `db`
 * (Pick<PrismaClient, 'talentPublicProof' | 'user'>) as the matcher, so the
 * orchestration path also runs fully in-memory. These lock the gap-analysis
 * contract an org relies on to see which required skills its talent pool covers,
 * at what evidence strength, and which are unmet.
 */
import {
  analyzeNeedCoverage,
  getNeedCoverage,
  type CandidateCoverage,
} from '../../src/services/talentGapAnalysisService';

function candidate(
  matchedSkills: string[],
  projects: Array<{ matchedSkills: string[]; verificationLevel: 'verified' | 'linked' | 'recorded' }> = [],
): CandidateCoverage {
  return { matchedSkills, projects };
}

describe('analyzeNeedCoverage', () => {
  it('canonicalizes required skills before reporting coverage', () => {
    const analysis = analyzeNeedCoverage(['JavaScript', 'js'], []);
    // "JavaScript" and "js" collapse to one canonical skill row.
    expect(analysis.requiredSkills).toEqual(['javascript']);
    expect(analysis.coverage).toHaveLength(1);
  });

  it('flags every required skill as unmet when the pool is empty', () => {
    const analysis = analyzeNeedCoverage(['React', 'Go'], []);
    expect(analysis.unmetSkills.sort()).toEqual(['golang', 'react']);
    expect(analysis.coverageRatio).toBe(0);
    expect(analysis.status).toBe('unmet');
    expect(analysis.candidatePool).toBe(0);
    expect(analysis.coverage.every((entry) => entry.strength === 'unmet')).toBe(true);
  });

  it('reports verified strength when a candidate has verified evidence for a skill', () => {
    const matches = [
      candidate(['typescript'], [{ matchedSkills: ['typescript'], verificationLevel: 'verified' }]),
    ];
    const analysis = analyzeNeedCoverage(['TypeScript'], matches);
    const [entry] = analysis.coverage;
    expect(entry.strength).toBe('verified');
    expect(entry.verifiedCount).toBe(1);
    expect(entry.evidencedCount).toBe(1);
    expect(entry.candidateCount).toBe(1);
    expect(analysis.unmetSkills).toEqual([]);
    expect(analysis.status).toBe('fully-covered');
    expect(analysis.coverageRatio).toBe(1);
  });

  it('ranks recorded evidence below verified but above interest-only', () => {
    const matches = [
      candidate(['react'], [{ matchedSkills: ['react'], verificationLevel: 'recorded' }]),
    ];
    const [entry] = analyzeNeedCoverage(['React'], matches).coverage;
    expect(entry.strength).toBe('evidenced');
    expect(entry.verifiedCount).toBe(0);
    expect(entry.evidencedCount).toBe(1);
    expect(entry.candidateCount).toBe(1);
  });

  it('reports interest-only strength when a skill has a signal but no project evidence', () => {
    const matches = [candidate(['golang'], [])];
    const [entry] = analyzeNeedCoverage(['Go'], matches).coverage;
    expect(entry.strength).toBe('interest');
    expect(entry.evidencedCount).toBe(0);
    expect(entry.candidateCount).toBe(1);
  });

  it('produces a partially-covered status with the precise gap and ratio', () => {
    const matches = [
      candidate(['typescript'], [{ matchedSkills: ['typescript'], verificationLevel: 'verified' }]),
    ];
    const analysis = analyzeNeedCoverage(['TypeScript', 'kubernetes', 'python'], matches);
    expect(analysis.unmetSkills.sort()).toEqual(['kubernetes', 'python']);
    expect(analysis.status).toBe('partially-covered');
    // 1 of 3 covered → 0.33
    expect(analysis.coverageRatio).toBe(0.33);
    expect(analysis.candidatePool).toBe(1);
  });

  it('counts distinct candidates and keeps the strongest strength per skill', () => {
    const matches = [
      candidate(['react'], [{ matchedSkills: ['react'], verificationLevel: 'recorded' }]),
      candidate(['react'], [{ matchedSkills: ['react'], verificationLevel: 'verified' }]),
      candidate(['react'], []), // interest-only
    ];
    const [entry] = analyzeNeedCoverage(['React'], matches).coverage;
    expect(entry.candidateCount).toBe(3);
    expect(entry.evidencedCount).toBe(2);
    expect(entry.verifiedCount).toBe(1);
    // strongest wins
    expect(entry.strength).toBe('verified');
  });
});

describe('getNeedCoverage', () => {
  function makeDb(users: unknown[], proofs: unknown[] = []) {
    return {
      talentPublicProof: { findMany: async () => proofs },
      user: { findMany: async () => users },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  it('runs the matcher and folds results into a coverage report (verified via claimed repo)', async () => {
    const user = {
      id: 'u1',
      username: 'ada',
      displayName: null,
      avatar: null,
      avatarUrl: null,
      bio: null,
      githubUsername: null,
      interests: [],
      managedRepos: [
        {
          role: 'OWNER',
          repository: {
            id: 'r1',
            fullName: 'acme/r1',
            htmlUrl: 'https://github.com/acme/r1',
            language: 'js',
            topics: [],
            claimedBy: 'u1',
            lastFetched: null,
            lastSynced: null,
          },
        },
      ],
    };

    const analysis = await getNeedCoverage(['JavaScript', 'python'], 25, makeDb([user]));

    expect(analysis.requiredSkills).toEqual(['javascript', 'python']);
    expect(analysis.candidatePool).toBe(1);
    const js = analysis.coverage.find((entry) => entry.skill === 'javascript');
    expect(js?.strength).toBe('verified');
    expect(analysis.unmetSkills).toEqual(['python']);
    expect(analysis.status).toBe('partially-covered');
    expect(analysis.coverageRatio).toBe(0.5);
  });

  it('reports a fully-unmet Need when the matcher returns no candidates', async () => {
    const analysis = await getNeedCoverage(['Rust'], 25, makeDb([]));
    expect(analysis.status).toBe('unmet');
    expect(analysis.unmetSkills).toEqual(['rust']);
    expect(analysis.candidatePool).toBe(0);
  });
});
