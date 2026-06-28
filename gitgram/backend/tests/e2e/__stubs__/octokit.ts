/**
 * CommonJS stub for @octokit/rest.
 *
 * @octokit/rest is published as native ESM, which Jest's CommonJS test runtime
 * cannot import. The E2E suite never configures a GitHub token and never makes
 * real GitHub calls, so this stub satisfies the `import { Octokit }` used across
 * the app without dragging in the ESM module graph. Any accidental call rejects
 * loudly so we never silently treat GitHub data as real.
 */

function notConfigured(): never {
  throw new Error('GitHub API is not available in the E2E test environment');
}

export class Octokit {
  repos = {
    get: notConfigured,
    listForUser: notConfigured,
    listForAuthenticatedUser: notConfigured,
    listLanguages: notConfigured,
  };

  search = {
    repos: notConfigured,
  };

  users = {
    getAuthenticated: notConfigured,
    getByUsername: notConfigured,
  };

  rateLimit = {
    get: notConfigured,
  };

  rest = {
    repos: { get: notConfigured },
    users: { getAuthenticated: notConfigured },
  };
}

export default { Octokit };
