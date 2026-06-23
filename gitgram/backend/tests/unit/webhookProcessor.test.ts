/**
 * Unit tests for webhookProcessor
 *
 * Prisma is mocked via tests/setup.ts (mockPrisma).
 * All tests run in-memory without database or network connections.
 *
 * NOTE: resolveUserByGitHubLogin uses prisma.user.findFirst with a nested
 * account select that the generic in-memory mock cannot resolve through
 * cross-table lookups.  For success-path tests we stub findFirst directly
 * (the same approach used in socialGraphService.test.ts).  Negative-path
 * tests (user not found) rely on the default mock returning null.
 */

import crypto from 'crypto';
import { mockPrisma } from '../setup';

// ---------------------------------------------------------------------------
// Service under test — imported after mocks are registered by setup.ts
// ---------------------------------------------------------------------------

import {
  verifyGitHubSignature,
  processGitHubPush,
  processGitHubPullRequest,
  processGitHubRelease,
  processGitHubStar,
  type GitHubPushPayload,
  type GitHubPRPayload,
  type GitHubReleasePayload,
  type GitHubStarPayload,
} from '../../src/services/webhookProcessor';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedRows(model: any, rows: any[]): void {
  model.__rows.length = 0;
  model.__rows.push(...rows);
}

function clearAllTables(): void {
  const models = ['user', 'account', 'post', 'repository'] as const;
  for (const m of models) {
    (mockPrisma as any)[m].__rows.length = 0;
  }
}

/** Stub user.findFirst to return a resolved user record (with nested account). */
function stubResolvedUser(userId = 'user-1', accountId = 'acc-1'): void {
  (mockPrisma.user.findFirst as jest.Mock).mockResolvedValueOnce({
    id: userId,
    account: { id: accountId },
  });
}

/** Stub user.findFirst to return null (no Gitgram account for GitHub login). */
function stubNoUser(): void {
  (mockPrisma.user.findFirst as jest.Mock).mockResolvedValueOnce(null);
}

function makeRepository(overrides: Record<string, unknown> = {}) {
  return {
    id: 'repo-1',
    fullName: 'octocat/Hello-World',
    claimedBy: 'user-1',
    htmlUrl: 'https://github.com/octocat/Hello-World',
    stars: 0,
    ...overrides,
  };
}

function makePushPayload(overrides: Partial<GitHubPushPayload> = {}): GitHubPushPayload {
  return {
    ref: 'refs/heads/main',
    after: 'abc123',
    before: '000000',
    compare: 'https://github.com/octocat/Hello-World/compare/000000...abc123',
    commits: [
      {
        id: 'abc123',
        message: 'fix: resolve null pointer',
        url: 'https://github.com/octocat/Hello-World/commit/abc123',
        author: { name: 'Octocat', username: 'octocat' },
      },
    ],
    forced: false,
    repository: {
      full_name: 'octocat/Hello-World',
      html_url: 'https://github.com/octocat/Hello-World',
      owner: { login: 'octocat' },
      name: 'Hello-World',
      stargazers_count: 42,
    },
    sender: {
      login: 'octocat',
      avatar_url: 'https://avatars.test/octocat.png',
      html_url: 'https://github.com/octocat',
    },
    pusher: { name: 'octocat', email: 'octocat@github.com' },
    ...overrides,
  };
}

function makePRPayload(overrides: Partial<GitHubPRPayload> = {}): GitHubPRPayload {
  return {
    action: 'opened',
    number: 42,
    pull_request: {
      number: 42,
      title: 'Add awesome feature',
      html_url: 'https://github.com/octocat/Hello-World/pull/42',
      body: 'This PR adds an awesome feature.',
      merged: false,
      state: 'open',
    },
    repository: {
      full_name: 'octocat/Hello-World',
      html_url: 'https://github.com/octocat/Hello-World',
      owner: { login: 'octocat' },
      name: 'Hello-World',
      stargazers_count: 42,
    },
    sender: {
      login: 'octocat',
      avatar_url: 'https://avatars.test/octocat.png',
      html_url: 'https://github.com/octocat',
    },
    ...overrides,
  };
}

function makeReleasePayload(overrides: Partial<GitHubReleasePayload> = {}): GitHubReleasePayload {
  return {
    action: 'published',
    release: {
      tag_name: 'v1.2.3',
      name: 'Release 1.2.3',
      html_url: 'https://github.com/octocat/Hello-World/releases/tag/v1.2.3',
      body: 'Changelog notes here.',
      prerelease: false,
      draft: false,
    },
    repository: {
      full_name: 'octocat/Hello-World',
      html_url: 'https://github.com/octocat/Hello-World',
      owner: { login: 'octocat' },
      name: 'Hello-World',
      stargazers_count: 42,
    },
    sender: {
      login: 'octocat',
      avatar_url: 'https://avatars.test/octocat.png',
      html_url: 'https://github.com/octocat',
    },
    ...overrides,
  };
}

function makeStarPayload(overrides: Partial<GitHubStarPayload> = {}): GitHubStarPayload {
  return {
    action: 'created',
    starred_at: new Date().toISOString(),
    repository: {
      full_name: 'octocat/Hello-World',
      html_url: 'https://github.com/octocat/Hello-World',
      owner: { login: 'octocat' },
      name: 'Hello-World',
      stargazers_count: 50,
    },
    sender: {
      login: 'some-stargazer',
      avatar_url: 'https://avatars.test/stargazer.png',
      html_url: 'https://github.com/some-stargazer',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// verifyGitHubSignature
// ---------------------------------------------------------------------------

describe('verifyGitHubSignature', () => {
  const secret = 'test-webhook-secret';
  const rawBody = '{"ref":"refs/heads/main"}';

  function buildSignature(body: string, s: string): string {
    return 'sha256=' + crypto.createHmac('sha256', s).update(body).digest('hex');
  }

  it('returns true for a valid signature', () => {
    const sig = buildSignature(rawBody, secret);
    expect(verifyGitHubSignature(rawBody, sig, secret)).toBe(true);
  });

  it('returns false when the signature does not match', () => {
    const wrongSig = buildSignature(rawBody, 'wrong-secret');
    expect(verifyGitHubSignature(rawBody, wrongSig, secret)).toBe(false);
  });

  it('returns false when the sha256= prefix is missing', () => {
    const hexOnly = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    // Different length from 'sha256=<hex>' so timingSafeEqual guard triggers
    expect(verifyGitHubSignature(rawBody, hexOnly, secret)).toBe(false);
  });

  it('returns false for an empty signature string', () => {
    expect(verifyGitHubSignature(rawBody, '', secret)).toBe(false);
  });

  it('returns false when the body has been tampered with', () => {
    const sig = buildSignature(rawBody, secret);
    const tamperedBody = '{"ref":"refs/heads/evil"}';
    expect(verifyGitHubSignature(tamperedBody, sig, secret)).toBe(false);
  });

  it('returns true for an empty body with matching signature', () => {
    const sig = buildSignature('', secret);
    expect(verifyGitHubSignature('', sig, secret)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// processGitHubPush
// ---------------------------------------------------------------------------

describe('processGitHubPush', () => {
  beforeEach(() => {
    clearAllTables();
  });

  it('creates a post when sender and repo are resolved', async () => {
    stubResolvedUser();
    seedRows(mockPrisma.repository, [makeRepository()]);

    await processGitHubPush(makePushPayload());

    expect(mockPrisma.post.create).toHaveBeenCalledTimes(1);
    const call = (mockPrisma.post.create as jest.Mock).mock.calls[0][0];
    expect(call.data.content).toContain('Pushed 1 commit to octocat/Hello-World');
    expect(call.data.content).toContain('(main)');
    expect(call.data.status).toBe('PUBLISHED');
    expect(call.data.repoUrl).toBe('https://github.com/octocat/Hello-World');
  });

  it('uses plural "commits" for multiple commits', async () => {
    stubResolvedUser();
    seedRows(mockPrisma.repository, [makeRepository()]);

    const commits = [
      { id: 'a1', message: 'first', url: 'u1', author: { name: 'A' } },
      { id: 'b2', message: 'second', url: 'u2', author: { name: 'B' } },
      { id: 'c3', message: 'third', url: 'u3', author: { name: 'C' } },
    ];
    await processGitHubPush(makePushPayload({ commits }));

    const call = (mockPrisma.post.create as jest.Mock).mock.calls[0][0];
    expect(call.data.content).toContain('Pushed 3 commits');
  });

  it('handles empty commits array without throwing', async () => {
    stubResolvedUser();
    seedRows(mockPrisma.repository, [makeRepository()]);

    await expect(processGitHubPush(makePushPayload({ commits: [] }))).resolves.toBeUndefined();

    const call = (mockPrisma.post.create as jest.Mock).mock.calls[0][0];
    expect(call.data.content).toContain('Pushed 0 commits');
  });

  it('extracts branch name from ref', async () => {
    stubResolvedUser();
    seedRows(mockPrisma.repository, [makeRepository()]);

    await processGitHubPush(makePushPayload({ ref: 'refs/heads/feature/my-branch' }));

    const call = (mockPrisma.post.create as jest.Mock).mock.calls[0][0];
    expect(call.data.content).toContain('(feature/my-branch)');
  });

  it('does nothing when sender has no Gitgram account', async () => {
    stubNoUser();
    seedRows(mockPrisma.repository, [makeRepository()]);

    await processGitHubPush(makePushPayload());

    expect(mockPrisma.post.create).not.toHaveBeenCalled();
  });

  it('does nothing when repository is not claimed', async () => {
    stubResolvedUser();
    seedRows(mockPrisma.repository, [makeRepository({ claimedBy: null })]);

    await processGitHubPush(makePushPayload());

    expect(mockPrisma.post.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// processGitHubPullRequest
// ---------------------------------------------------------------------------

describe('processGitHubPullRequest', () => {
  beforeEach(() => {
    clearAllTables();
  });

  it('creates an "Opened PR" post for action=opened', async () => {
    stubResolvedUser();
    seedRows(mockPrisma.repository, [makeRepository()]);

    await processGitHubPullRequest(makePRPayload({ action: 'opened' }));

    expect(mockPrisma.post.create).toHaveBeenCalledTimes(1);
    const call = (mockPrisma.post.create as jest.Mock).mock.calls[0][0];
    expect(call.data.content).toBe('Opened PR #42: Add awesome feature in octocat/Hello-World');
  });

  it('creates a "Merged PR" post for action=closed with merged=true', async () => {
    stubResolvedUser();
    seedRows(mockPrisma.repository, [makeRepository()]);

    const payload = makePRPayload({
      action: 'closed',
      pull_request: {
        number: 42,
        title: 'Add awesome feature',
        html_url: 'https://github.com/octocat/Hello-World/pull/42',
        body: null,
        merged: true,
        state: 'closed',
      },
    });

    await processGitHubPullRequest(payload);

    const call = (mockPrisma.post.create as jest.Mock).mock.calls[0][0];
    expect(call.data.content).toBe('Merged PR #42: Add awesome feature in octocat/Hello-World');
    expect(call.data.repoUrl).toBe('https://github.com/octocat/Hello-World/pull/42');
  });

  it('does nothing for action=closed without merge', async () => {
    const payload = makePRPayload({
      action: 'closed',
      pull_request: {
        number: 42,
        title: 'Abandoned feature',
        html_url: 'https://github.com/octocat/Hello-World/pull/42',
        body: null,
        merged: false,
        state: 'closed',
      },
    });

    await processGitHubPullRequest(payload);

    expect(mockPrisma.post.create).not.toHaveBeenCalled();
  });

  it('does nothing for unhandled actions like "review_requested"', async () => {
    await processGitHubPullRequest(makePRPayload({ action: 'review_requested' }));

    expect(mockPrisma.post.create).not.toHaveBeenCalled();
  });

  it('does nothing when sender has no Gitgram account', async () => {
    stubNoUser();
    seedRows(mockPrisma.repository, [makeRepository()]);

    await processGitHubPullRequest(makePRPayload());

    expect(mockPrisma.post.create).not.toHaveBeenCalled();
  });

  it('does nothing when repository is not claimed', async () => {
    stubResolvedUser();
    seedRows(mockPrisma.repository, [makeRepository({ claimedBy: null })]);

    await processGitHubPullRequest(makePRPayload());

    expect(mockPrisma.post.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// processGitHubRelease
// ---------------------------------------------------------------------------

describe('processGitHubRelease', () => {
  beforeEach(() => {
    clearAllTables();
  });

  it('creates a release announcement post for action=published', async () => {
    stubResolvedUser();
    seedRows(mockPrisma.repository, [makeRepository()]);

    await processGitHubRelease(makeReleasePayload());

    expect(mockPrisma.post.create).toHaveBeenCalledTimes(1);
    const call = (mockPrisma.post.create as jest.Mock).mock.calls[0][0];
    expect(call.data.content).toBe('Released v1.2.3: Release 1.2.3 in octocat/Hello-World');
    expect(call.data.repoUrl).toBe('https://github.com/octocat/Hello-World/releases/tag/v1.2.3');
  });

  it('falls back to tag_name when release.name is null', async () => {
    stubResolvedUser();
    seedRows(mockPrisma.repository, [makeRepository()]);

    const payload = makeReleasePayload({
      release: {
        tag_name: 'v2.0.0',
        name: null,
        html_url: 'https://github.com/octocat/Hello-World/releases/tag/v2.0.0',
        body: null,
        prerelease: false,
        draft: false,
      },
    });

    await processGitHubRelease(payload);

    const call = (mockPrisma.post.create as jest.Mock).mock.calls[0][0];
    expect(call.data.content).toBe('Released v2.0.0: v2.0.0 in octocat/Hello-World');
  });

  it('processes prerelease without changing post content', async () => {
    stubResolvedUser();
    seedRows(mockPrisma.repository, [makeRepository()]);

    const payload = makeReleasePayload({
      release: {
        tag_name: 'v1.3.0-beta.1',
        name: 'Beta Release',
        html_url: 'https://github.com/octocat/Hello-World/releases/tag/v1.3.0-beta.1',
        body: null,
        prerelease: true,
        draft: false,
      },
    });

    await processGitHubRelease(payload);

    expect(mockPrisma.post.create).toHaveBeenCalledTimes(1);
    const call = (mockPrisma.post.create as jest.Mock).mock.calls[0][0];
    expect(call.data.content).toContain('v1.3.0-beta.1');
  });

  it('does nothing for action=created (not published)', async () => {
    await processGitHubRelease(makeReleasePayload({ action: 'created' }));

    expect(mockPrisma.post.create).not.toHaveBeenCalled();
  });

  it('does nothing when sender has no Gitgram account', async () => {
    stubNoUser();
    seedRows(mockPrisma.repository, [makeRepository()]);

    await processGitHubRelease(makeReleasePayload());

    expect(mockPrisma.post.create).not.toHaveBeenCalled();
  });

  it('does nothing when repository is not claimed', async () => {
    stubResolvedUser();
    seedRows(mockPrisma.repository, [makeRepository({ claimedBy: null })]);

    await processGitHubRelease(makeReleasePayload());

    expect(mockPrisma.post.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// processGitHubStar
// ---------------------------------------------------------------------------

describe('processGitHubStar', () => {
  beforeEach(() => {
    clearAllTables();
  });

  it('updates star count on the repository record', async () => {
    seedRows(mockPrisma.repository, [makeRepository({ stars: 49 })]);

    await processGitHubStar(makeStarPayload({
      repository: {
        full_name: 'octocat/Hello-World',
        html_url: 'https://github.com/octocat/Hello-World',
        owner: { login: 'octocat' },
        name: 'Hello-World',
        stargazers_count: 50,
      },
    }));

    expect(mockPrisma.repository.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stars: 50 } })
    );
  });

  it('does nothing for action=deleted (un-star)', async () => {
    seedRows(mockPrisma.repository, [makeRepository()]);

    await processGitHubStar(makeStarPayload({ action: 'deleted', starred_at: null }));

    expect(mockPrisma.repository.update).not.toHaveBeenCalled();
    expect(mockPrisma.post.create).not.toHaveBeenCalled();
  });

  it('does nothing when repository is not claimed', async () => {
    seedRows(mockPrisma.repository, [makeRepository({ claimedBy: null })]);

    await processGitHubStar(makeStarPayload());

    expect(mockPrisma.repository.update).not.toHaveBeenCalled();
  });

  it('creates a 100-star milestone post when threshold is crossed', async () => {
    // Seed repo with all fields needed by both findUnique calls:
    // call #1 (resolveClaimedRepo): matches on fullName, needs id + claimedBy
    // call #2 (after update, lookup claimedBy+htmlUrl): matches on id, needs claimedBy + htmlUrl
    seedRows(mockPrisma.repository, [
      makeRepository({ stars: 99, htmlUrl: 'https://github.com/octocat/Hello-World' }),
    ]);

    // user.findUnique is called for the claiming user's account
    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 'user-1', account: { id: 'acc-1' } });

    await processGitHubStar(makeStarPayload({
      repository: {
        full_name: 'octocat/Hello-World',
        html_url: 'https://github.com/octocat/Hello-World',
        owner: { login: 'octocat' },
        name: 'Hello-World',
        stargazers_count: 100,
      },
    }));

    const postCall = (mockPrisma.post.create as jest.Mock).mock.calls[0]?.[0];
    expect(postCall?.data.content).toContain('100');
    expect(postCall?.data.content).toContain('octocat/Hello-World');
  });

  it('does not create a milestone post for non-milestone star counts', async () => {
    seedRows(mockPrisma.repository, [makeRepository({ stars: 55 })]);

    await processGitHubStar(makeStarPayload({
      repository: {
        full_name: 'octocat/Hello-World',
        html_url: 'https://github.com/octocat/Hello-World',
        owner: { login: 'octocat' },
        name: 'Hello-World',
        stargazers_count: 56,
      },
    }));

    expect(mockPrisma.post.create).not.toHaveBeenCalled();
  });

  it('creates a 1000-star milestone post when threshold is crossed', async () => {
    seedRows(mockPrisma.repository, [
      makeRepository({ stars: 999, htmlUrl: 'https://github.com/octocat/Hello-World' }),
    ]);

    (mockPrisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 'user-1', account: { id: 'acc-1' } });

    await processGitHubStar(makeStarPayload({
      repository: {
        full_name: 'octocat/Hello-World',
        html_url: 'https://github.com/octocat/Hello-World',
        owner: { login: 'octocat' },
        name: 'Hello-World',
        stargazers_count: 1000,
      },
    }));

    const postCall = (mockPrisma.post.create as jest.Mock).mock.calls[0]?.[0];
    expect(postCall?.data.content).toContain('1,000');
  });
});
