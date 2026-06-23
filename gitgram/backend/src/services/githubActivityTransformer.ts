/**
 * githubActivityTransformer.ts
 *
 * Transforms raw GitHub Events API payloads into Gitgram-native FeedItems.
 * Supports: PushEvent, PullRequestEvent, CreateEvent, WatchEvent, ForkEvent.
 *
 * All functions are pure (no I/O, no side-effects) and operate on typed
 * interfaces so no `any` escapes.
 */

// ---------------------------------------------------------------------------
// GitHub Events API types
// ---------------------------------------------------------------------------

export interface GitHubActor {
  login: string;
  avatar_url: string;
  url?: string;
}

export interface GitHubRepo {
  /** "owner/repo" format */
  name: string;
  url?: string;
}

export interface GitHubCommit {
  sha: string;
  message: string;
  author: {
    name: string;
    email?: string;
  };
}

export interface PushEventPayload {
  ref: string; // "refs/heads/main"
  size: number;
  distinct_size?: number;
  commits: GitHubCommit[];
  before?: string;
  head?: string;
}

export interface PullRequest {
  number: number;
  title: string;
  state: string;
  html_url: string;
  merged?: boolean;
  base?: { ref: string };
  head?: { ref: string };
  body?: string;
}

export interface PullRequestEventPayload {
  action: string; // "opened" | "closed" | "reopened" | "merged" | "synchronize"
  number: number;
  pull_request: PullRequest;
}

export interface CreateEventPayload {
  ref_type: 'repository' | 'branch' | 'tag';
  ref: string | null; // null when creating the repo itself
  master_branch?: string;
  description?: string;
}

export interface WatchEventPayload {
  action: 'started';
}

export interface ForkEventPayload {
  forkee: {
    full_name: string;
    html_url: string;
    owner: {
      login: string;
    };
  };
}

export type GitHubEventPayload =
  | PushEventPayload
  | PullRequestEventPayload
  | CreateEventPayload
  | WatchEventPayload
  | ForkEventPayload;

export type GitHubEventType =
  | 'PushEvent'
  | 'PullRequestEvent'
  | 'CreateEvent'
  | 'WatchEvent'
  | 'ForkEvent';

export interface GitHubEvent {
  id: string;
  type: GitHubEventType | string;
  actor: GitHubActor;
  repo: GitHubRepo;
  payload: GitHubEventPayload;
  created_at: string;
  public: boolean;
}

// ---------------------------------------------------------------------------
// Gitgram FeedItem type
// ---------------------------------------------------------------------------

export interface FeedItemMetadata {
  eventType: GitHubEventType | string;
  repo: string;
  action?: string;
  branch?: string;
  commitCount?: number;
  commits?: Array<{ sha: string; message: string; author: string }>;
  prNumber?: number;
  prTitle?: string;
  prState?: string;
  prMerged?: boolean;
  refType?: string;
  ref?: string;
  forkFullName?: string;
}

export interface FeedItem {
  type: 'github_activity';
  id: string;
  userId: string;
  username: string;
  avatar: string;
  content: string;
  metadata: FeedItemMetadata;
  createdAt: string;
  likes: 0;
  comments: 0;
}

// ---------------------------------------------------------------------------
// Content formatters (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * "Pushed 3 commits to owner/repo: first commit message"
 */
export function formatPushEventContent(event: GitHubEvent): string {
  const payload = event.payload as PushEventPayload;
  const repoName = event.repo.name;
  const count = payload.size ?? payload.commits.length;
  const branch = payload.ref.replace('refs/heads/', '');
  const firstMessage = payload.commits[0]?.message?.split('\n')[0] ?? '';

  const suffix = firstMessage ? `: ${firstMessage}` : '';
  return `Pushed ${count} commit${count !== 1 ? 's' : ''} to ${repoName} on ${branch}${suffix}`;
}

/**
 * "Opened PR #42: Add dark mode in owner/repo"
 * Handles "merged" as a distinct verb when action=closed and merged=true.
 */
export function formatPREventContent(event: GitHubEvent): string {
  const payload = event.payload as PullRequestEventPayload;
  const pr = payload.pull_request;
  const repoName = event.repo.name;

  const rawAction = payload.action;
  const verb = rawAction === 'closed' && pr.merged ? 'Merged' : capitalize(rawAction);

  return `${verb} PR #${pr.number}: ${pr.title} in ${repoName}`;
}

/**
 * "Created tag v1.2.3 in owner/repo"
 * When ref_type is "repository", ref is null so we omit it.
 */
export function formatCreateEventContent(event: GitHubEvent): string {
  const payload = event.payload as CreateEventPayload;
  const repoName = event.repo.name;
  const refType = payload.ref_type;
  const ref = payload.ref;

  if (ref) {
    return `Created ${refType} ${ref} in ${repoName}`;
  }
  return `Created ${refType} ${repoName}`;
}

/**
 * "Starred owner/repo"
 */
export function formatWatchEventContent(event: GitHubEvent): string {
  return `Starred ${event.repo.name}`;
}

/**
 * "Forked owner/repo"
 */
export function formatForkEventContent(event: GitHubEvent): string {
  return `Forked ${event.repo.name}`;
}

// ---------------------------------------------------------------------------
// Content dispatcher
// ---------------------------------------------------------------------------

function formatContent(event: GitHubEvent): string {
  switch (event.type) {
    case 'PushEvent':
      return formatPushEventContent(event);
    case 'PullRequestEvent':
      return formatPREventContent(event);
    case 'CreateEvent':
      return formatCreateEventContent(event);
    case 'WatchEvent':
      return formatWatchEventContent(event);
    case 'ForkEvent':
      return formatForkEventContent(event);
    default:
      return `Activity on ${event.repo.name}`;
  }
}

// ---------------------------------------------------------------------------
// Metadata builder
// ---------------------------------------------------------------------------

function buildMetadata(event: GitHubEvent): FeedItemMetadata {
  const base: FeedItemMetadata = {
    eventType: event.type,
    repo: event.repo.name,
  };

  switch (event.type) {
    case 'PushEvent': {
      const p = event.payload as PushEventPayload;
      return {
        ...base,
        branch: p.ref.replace('refs/heads/', ''),
        commitCount: p.size ?? p.commits.length,
        commits: p.commits.slice(0, 5).map((c) => ({
          sha: c.sha.slice(0, 7),
          message: c.message.split('\n')[0],
          author: c.author.name,
        })),
      };
    }

    case 'PullRequestEvent': {
      const p = event.payload as PullRequestEventPayload;
      const pr = p.pull_request;
      const mergedVerb = p.action === 'closed' && pr.merged ? 'merged' : p.action;
      return {
        ...base,
        action: mergedVerb,
        prNumber: pr.number,
        prTitle: pr.title,
        prState: pr.state,
        prMerged: pr.merged ?? false,
      };
    }

    case 'CreateEvent': {
      const p = event.payload as CreateEventPayload;
      return {
        ...base,
        refType: p.ref_type,
        ref: p.ref ?? undefined,
      };
    }

    case 'WatchEvent':
      return { ...base, action: 'starred' };

    case 'ForkEvent': {
      const p = event.payload as ForkEventPayload;
      return { ...base, forkFullName: p.forkee.full_name };
    }

    default:
      return base;
  }
}

// ---------------------------------------------------------------------------
// Main transformer
// ---------------------------------------------------------------------------

/**
 * Transforms an array of raw GitHub Events API events into Gitgram FeedItems.
 * Events with unrecognised types are still transformed with a generic content string.
 */
export function transformGitHubEvents(events: GitHubEvent[]): FeedItem[] {
  return events.map((event) => ({
    type: 'github_activity' as const,
    id: `gh_${event.id}`,
    userId: event.actor.login,
    username: event.actor.login,
    avatar: event.actor.avatar_url,
    content: formatContent(event),
    metadata: buildMetadata(event),
    createdAt: event.created_at,
    likes: 0,
    comments: 0,
  }));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}
