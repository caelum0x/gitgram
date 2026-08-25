/**
 * Unit tests for findTalentMatches (the evidence matcher, ARCHITECTURE.md §1.3B).
 *
 * The service accepts an injectable `db` (Pick<PrismaClient, 'talentPublicProof'
 * | 'user'>), so these run fully in-memory against a hand-built fake — no live
 * Postgres. They assert the load-bearing behavior added in this rung: required
 * skills and candidate evidence are canonicalized before scoring, so aliased
 * tokens (e.g. Need "JavaScript" vs repo language "js") still match.
 */
import { findTalentMatches } from '../../src/services/talentGraphService';

type FakeUser = {
  id: string;
  username: string | null;
  displayName: string | null;
  avatar: string | null;
  avatarUrl: string | null;
  bio: string | null;
  githubUsername: string | null;
  interests: string[];
  managedRepos: Array<{
    role: string;
    repository: {
      id: string;
      fullName: string;
      htmlUrl: string;
      language: string | null;
      topics: string[];
      claimedBy: string | null;
      lastFetched: Date | null;
      lastSynced: Date | null;
    };
  }>;
};

type FakeProof = {
  publicId: string;
  participantId: string;
  deliverableUrl: string | null;
  evidenceSkills: string[];
  completedAt: Date;
};

function makeUser(overrides: Partial<FakeUser> & { id: string }): FakeUser {
  return {
    username: `user-${overrides.id}`,
    displayName: null,
    avatar: null,
    avatarUrl: null,
    bio: null,
    githubUsername: null,
    interests: [],
    managedRepos: [],
    ...overrides,
  };
}

function makeRepo(overrides: Partial<FakeUser['managedRepos'][number]['repository']> & { id: string }) {
  return {
    fullName: `acme/${overrides.id}`,
    htmlUrl: `https://github.com/acme/${overrides.id}`,
    language: null,
    topics: [],
    claimedBy: null,
    lastFetched: null,
    lastSynced: null,
    ...overrides,
  };
}

function makeDb(users: FakeUser[], proofs: FakeProof[] = []) {
  return {
    talentPublicProof: { findMany: async () => proofs },
    user: { findMany: async () => users },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('findTalentMatches', () => {
  it('returns an empty array when no skills are requested', async () => {
    const result = await findTalentMatches(['   ', ''], 12, makeDb([]));
    expect(result).toEqual([]);
  });

  it('matches a repo whose language is an alias of the required skill (verified)', async () => {
    const user = makeUser({
      id: 'u1',
      username: 'ada',
      managedRepos: [
        { role: 'OWNER', repository: makeRepo({ id: 'r1', language: 'js', claimedBy: 'u1' }) },
      ],
    });

    const [match] = await findTalentMatches(['JavaScript'], 12, makeDb([user]));

    expect(match.profile.username).toBe('ada');
    expect(match.matchedSkills).toEqual(['javascript']);
    expect(match.missingSkills).toEqual([]);
    expect(match.projects).toHaveLength(1);
    expect(match.projects[0].verificationLevel).toBe('verified');
    // coverage 1.0*75 + verified(1)*10 + projects(1)*5 = 90
    expect(match.score).toBe(90);
    expect(match.reason).toContain('depo kanıtıyla');
  });

  it('canonicalizes topics so aliased repo topics still count as evidence', async () => {
    const user = makeUser({
      id: 'u2',
      username: 'grace',
      managedRepos: [
        { role: 'MAINTAINER', repository: makeRepo({ id: 'r2', topics: ['reactjs', 'k8s'] }) },
      ],
    });

    const [match] = await findTalentMatches(['React', 'kubernetes'], 12, makeDb([user]));

    expect(match.matchedSkills.sort()).toEqual(['kubernetes', 'react']);
    expect(match.missingSkills).toEqual([]);
    // recorded (not claimed) → verifiedProjects 0
    expect(match.projects[0].verificationLevel).toBe('recorded');
  });

  it('treats interest-only overlap as the weakest signal', async () => {
    const user = makeUser({
      id: 'u3',
      username: 'linus',
      interests: ['Go'],
    });

    const [match] = await findTalentMatches(['golang'], 12, makeDb([user]));

    expect(match.matchedSkills).toEqual(['golang']);
    expect(match.projects).toEqual([]);
    // coverage 1.0*75 only, no evidence projects
    expect(match.score).toBe(75);
    expect(match.reason).toContain('profil ilgi alanıyla');
  });

  it('ranks stronger evidence above interest-only matches', async () => {
    const evidenced = makeUser({
      id: 'strong',
      username: 'strong',
      managedRepos: [
        { role: 'OWNER', repository: makeRepo({ id: 'rs', language: 'typescript', claimedBy: 'strong' }) },
      ],
    });
    const interestOnly = makeUser({ id: 'weak', username: 'weak', interests: ['ts'] });

    const results = await findTalentMatches(['TypeScript'], 12, makeDb([interestOnly, evidenced]));

    expect(results.map((m) => m.profile.username)).toEqual(['strong', 'weak']);
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('surfaces completed pilot proof as verified evidence', async () => {
    const user = makeUser({ id: 'p1', username: 'pilot-dev' });
    const proof: FakeProof = {
      publicId: 'proof-1',
      participantId: 'p1',
      deliverableUrl: 'https://example.com/deliverable',
      evidenceSkills: ['python3'],
      completedAt: new Date('2026-01-01'),
    };

    const [match] = await findTalentMatches(['Python'], 12, makeDb([user], [proof]));

    expect(match.matchedSkills).toEqual(['python']);
    expect(match.projects[0].verificationLevel).toBe('verified');
    expect(match.projects[0].url).toBe('https://example.com/deliverable');
    expect(match.reason).toContain('kurum pilotu');
  });
});
