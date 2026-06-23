/**
 * Unit tests for githubActivityTransformer.ts
 *
 * Covers every public export:
 *   - formatPushEventContent
 *   - formatPREventContent
 *   - formatCreateEventContent
 *   - formatWatchEventContent
 *   - formatForkEventContent
 *   - transformGitHubEvents (integration of all formatters + metadata)
 *
 * All tests are pure — no I/O, no mocks required.
 */

import {
  transformGitHubEvents,
  formatPushEventContent,
  formatPREventContent,
  formatCreateEventContent,
  formatWatchEventContent,
  formatForkEventContent,
  type GitHubEvent,
  type PushEventPayload,
  type PullRequestEventPayload,
  type CreateEventPayload,
  type WatchEventPayload,
  type ForkEventPayload,
  type FeedItem,
} from '../../src/services/githubActivityTransformer';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

function makeActor(login = 'octocat') {
  return {
    login,
    avatar_url: `https://avatars.githubusercontent.com/u/1?v=4`,
    url: `https://api.github.com/users/${login}`,
  };
}

function makeRepo(name = 'octocat/hello-world') {
  return { name, url: `https://api.github.com/repos/${name}` };
}

function makePushEvent(overrides: Partial<PushEventPayload> = {}): GitHubEvent {
  const payload: PushEventPayload = {
    ref: 'refs/heads/main',
    size: 2,
    commits: [
      { sha: 'abc1234567890', message: 'Fix bug in parser\n\nDetailed description', author: { name: 'Alice' } },
      { sha: 'def5678901234', message: 'Add unit tests', author: { name: 'Bob' } },
    ],
    ...overrides,
  };
  return {
    id: 'push-1',
    type: 'PushEvent',
    actor: makeActor(),
    repo: makeRepo(),
    payload,
    created_at: '2026-06-21T12:00:00Z',
    public: true,
  };
}

function makePREvent(overrides: Partial<PullRequestEventPayload> = {}): GitHubEvent {
  const payload: PullRequestEventPayload = {
    action: 'opened',
    number: 42,
    pull_request: {
      number: 42,
      title: 'Add dark mode support',
      state: 'open',
      html_url: 'https://github.com/octocat/hello-world/pull/42',
      merged: false,
      base: { ref: 'main' },
      head: { ref: 'feature/dark-mode' },
    },
    ...overrides,
  };
  return {
    id: 'pr-1',
    type: 'PullRequestEvent',
    actor: makeActor(),
    repo: makeRepo(),
    payload,
    created_at: '2026-06-21T12:00:00Z',
    public: true,
  };
}

function makeCreateEvent(overrides: Partial<CreateEventPayload> = {}): GitHubEvent {
  const payload: CreateEventPayload = {
    ref_type: 'tag',
    ref: 'v1.2.3',
    master_branch: 'main',
    ...overrides,
  };
  return {
    id: 'create-1',
    type: 'CreateEvent',
    actor: makeActor(),
    repo: makeRepo(),
    payload,
    created_at: '2026-06-21T12:00:00Z',
    public: true,
  };
}

function makeWatchEvent(): GitHubEvent {
  const payload: WatchEventPayload = { action: 'started' };
  return {
    id: 'watch-1',
    type: 'WatchEvent',
    actor: makeActor(),
    repo: makeRepo(),
    payload,
    created_at: '2026-06-21T12:00:00Z',
    public: true,
  };
}

function makeForkEvent(): GitHubEvent {
  const payload: ForkEventPayload = {
    forkee: {
      full_name: 'octocat/hello-world-fork',
      html_url: 'https://github.com/octocat/hello-world-fork',
      owner: { login: 'octocat' },
    },
  };
  return {
    id: 'fork-1',
    type: 'ForkEvent',
    actor: makeActor(),
    repo: makeRepo(),
    payload,
    created_at: '2026-06-21T12:00:00Z',
    public: true,
  };
}

// ---------------------------------------------------------------------------
// formatPushEventContent
// ---------------------------------------------------------------------------

describe('formatPushEventContent', () => {
  it('includes commit count and repo name', () => {
    const result = formatPushEventContent(makePushEvent());
    expect(result).toContain('2 commits');
    expect(result).toContain('octocat/hello-world');
  });

  it('strips refs/heads/ prefix to show branch name', () => {
    const result = formatPushEventContent(makePushEvent({ ref: 'refs/heads/feature/dark-mode' }));
    expect(result).toContain('feature/dark-mode');
    expect(result).not.toContain('refs/heads/');
  });

  it('uses singular "commit" for a single commit', () => {
    const result = formatPushEventContent(
      makePushEvent({
        size: 1,
        commits: [{ sha: 'aaa', message: 'Single fix', author: { name: 'Alice' } }],
      })
    );
    expect(result).toMatch(/1 commit[^s]/);
  });

  it('appends first commit message headline (strips body after newline)', () => {
    const result = formatPushEventContent(makePushEvent());
    expect(result).toContain('Fix bug in parser');
    expect(result).not.toContain('Detailed description');
  });

  it('omits suffix when commits array is empty', () => {
    const result = formatPushEventContent(makePushEvent({ size: 0, commits: [] }));
    expect(result).toContain('0 commits');
    expect(result).not.toMatch(/: $/);
  });
});

// ---------------------------------------------------------------------------
// formatPREventContent
// ---------------------------------------------------------------------------

describe('formatPREventContent', () => {
  it('includes PR number and title', () => {
    const result = formatPREventContent(makePREvent());
    expect(result).toContain('#42');
    expect(result).toContain('Add dark mode support');
  });

  it('labels "opened" action correctly', () => {
    expect(formatPREventContent(makePREvent({ action: 'opened' }))).toMatch(/^Opened PR/);
  });

  it('labels "merged" when action=closed and pr.merged=true', () => {
    const event = makePREvent({
      action: 'closed',
      pull_request: {
        number: 42,
        title: 'Add dark mode support',
        state: 'closed',
        html_url: 'https://github.com/octocat/hello-world/pull/42',
        merged: true,
      },
    } as Partial<PullRequestEventPayload>);
    expect(formatPREventContent(event)).toMatch(/^Merged PR/);
  });

  it('labels "Closed" when action=closed and pr.merged=false', () => {
    const event = makePREvent({
      action: 'closed',
      pull_request: {
        number: 42,
        title: 'Add dark mode support',
        state: 'closed',
        html_url: 'https://github.com/octocat/hello-world/pull/42',
        merged: false,
      },
    } as Partial<PullRequestEventPayload>);
    expect(formatPREventContent(event)).toMatch(/^Closed PR/);
  });

  it('includes repo name', () => {
    const result = formatPREventContent(makePREvent());
    expect(result).toContain('octocat/hello-world');
  });
});

// ---------------------------------------------------------------------------
// formatCreateEventContent
// ---------------------------------------------------------------------------

describe('formatCreateEventContent', () => {
  it('formats a tag creation', () => {
    const result = formatCreateEventContent(makeCreateEvent({ ref_type: 'tag', ref: 'v1.2.3' }));
    expect(result).toBe('Created tag v1.2.3 in octocat/hello-world');
  });

  it('formats a branch creation', () => {
    const result = formatCreateEventContent(
      makeCreateEvent({ ref_type: 'branch', ref: 'feature/new-ui' })
    );
    expect(result).toBe('Created branch feature/new-ui in octocat/hello-world');
  });

  it('formats a repository creation (ref is null)', () => {
    const result = formatCreateEventContent(
      makeCreateEvent({ ref_type: 'repository', ref: null })
    );
    expect(result).toBe('Created repository octocat/hello-world');
  });
});

// ---------------------------------------------------------------------------
// formatWatchEventContent
// ---------------------------------------------------------------------------

describe('formatWatchEventContent', () => {
  it('returns "Starred <repo>"', () => {
    expect(formatWatchEventContent(makeWatchEvent())).toBe('Starred octocat/hello-world');
  });
});

// ---------------------------------------------------------------------------
// formatForkEventContent
// ---------------------------------------------------------------------------

describe('formatForkEventContent', () => {
  it('returns "Forked <repo>"', () => {
    expect(formatForkEventContent(makeForkEvent())).toBe('Forked octocat/hello-world');
  });
});

// ---------------------------------------------------------------------------
// transformGitHubEvents — structure & metadata
// ---------------------------------------------------------------------------

describe('transformGitHubEvents', () => {
  it('returns an empty array for empty input', () => {
    expect(transformGitHubEvents([])).toEqual([]);
  });

  it('sets type to "github_activity" on every item', () => {
    const items = transformGitHubEvents([makePushEvent(), makeWatchEvent(), makeForkEvent()]);
    expect(items.every((i) => i.type === 'github_activity')).toBe(true);
  });

  it('prefixes id with "gh_"', () => {
    const [item] = transformGitHubEvents([makePushEvent()]);
    expect(item.id).toBe('gh_push-1');
  });

  it('maps actor login to userId and username', () => {
    const [item] = transformGitHubEvents([makePushEvent()]);
    expect(item.userId).toBe('octocat');
    expect(item.username).toBe('octocat');
  });

  it('maps actor avatar_url to avatar', () => {
    const [item] = transformGitHubEvents([makePushEvent()]);
    expect(item.avatar).toContain('avatars.githubusercontent.com');
  });

  it('initialises likes and comments to 0', () => {
    const [item] = transformGitHubEvents([makePushEvent()]) as FeedItem[];
    expect(item.likes).toBe(0);
    expect(item.comments).toBe(0);
  });

  it('preserves created_at as createdAt', () => {
    const [item] = transformGitHubEvents([makePushEvent()]);
    expect(item.createdAt).toBe('2026-06-21T12:00:00Z');
  });

  it('includes branch and commitCount in PushEvent metadata', () => {
    const [item] = transformGitHubEvents([makePushEvent()]);
    expect(item.metadata.branch).toBe('main');
    expect(item.metadata.commitCount).toBe(2);
    expect(item.metadata.commits).toHaveLength(2);
    expect(item.metadata.commits?.[0].sha).toHaveLength(7);
  });

  it('includes prNumber and prMerged in PullRequestEvent metadata', () => {
    const [item] = transformGitHubEvents([makePREvent()]);
    expect(item.metadata.prNumber).toBe(42);
    expect(item.metadata.prMerged).toBe(false);
    expect(item.metadata.action).toBe('opened');
  });

  it('marks action as "merged" in metadata for a closed+merged PR', () => {
    const event = makePREvent({
      action: 'closed',
      pull_request: {
        number: 7,
        title: 'Merge feature',
        state: 'closed',
        html_url: 'https://github.com/octocat/hello-world/pull/7',
        merged: true,
      },
    } as Partial<PullRequestEventPayload>);
    const [item] = transformGitHubEvents([event]);
    expect(item.metadata.action).toBe('merged');
  });

  it('includes refType and ref in CreateEvent metadata', () => {
    const [item] = transformGitHubEvents([makeCreateEvent()]);
    expect(item.metadata.refType).toBe('tag');
    expect(item.metadata.ref).toBe('v1.2.3');
  });

  it('includes action="starred" in WatchEvent metadata', () => {
    const [item] = transformGitHubEvents([makeWatchEvent()]);
    expect(item.metadata.action).toBe('starred');
  });

  it('includes forkFullName in ForkEvent metadata', () => {
    const [item] = transformGitHubEvents([makeForkEvent()]);
    expect(item.metadata.forkFullName).toBe('octocat/hello-world-fork');
  });

  it('handles unknown event types with a generic content string', () => {
    const unknownEvent: GitHubEvent = {
      id: 'unk-1',
      type: 'DeleteEvent',
      actor: makeActor(),
      repo: makeRepo(),
      payload: {} as WatchEventPayload,
      created_at: '2026-06-21T12:00:00Z',
      public: true,
    };
    const [item] = transformGitHubEvents([unknownEvent]);
    expect(item.content).toContain('octocat/hello-world');
    expect(item.type).toBe('github_activity');
  });

  it('processes a mixed batch of event types without throwing', () => {
    const events = [
      makePushEvent(),
      makePREvent(),
      makeCreateEvent(),
      makeWatchEvent(),
      makeForkEvent(),
    ];
    const items = transformGitHubEvents(events);
    expect(items).toHaveLength(5);
    items.forEach((item) => {
      expect(item.type).toBe('github_activity');
      expect(typeof item.content).toBe('string');
      expect(item.content.length).toBeGreaterThan(0);
    });
  });
});
