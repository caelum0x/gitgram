/**
 * Redis-backed GitHub profile + repo cache.
 *
 * Ported from gh-social's usernameCache pattern (MIT) — stores trimmed
 * GitHub API payloads so repeated lookups (feed rendering, claim flow, etc.)
 * don't re-hit the GitHub API.
 *
 * TTL: 24 hours for profiles, 6 hours for repos.
 */

import { cache } from '../services/redisService';
import {
  trimGitHubProfileData,
  trimGitHubRepoData,
  type GitHubUserProfile,
  type GitHubRepo,
  type TrimmedGitHubProfile,
  type TrimmedGitHubRepo,
} from './githubDataUtils';

const TTL_PROFILE = 24 * 60 * 60;
const TTL_REPO = 6 * 60 * 60;

function profileKey(login: string) {
  return `gh:profile:${login.toLowerCase()}`;
}

function repoKey(fullName: string) {
  return `gh:repo:${fullName.toLowerCase()}`;
}

export async function getCachedProfile(login: string): Promise<TrimmedGitHubProfile | null> {
  return cache.get(profileKey(login));
}

export async function setCachedProfile(raw: GitHubUserProfile): Promise<TrimmedGitHubProfile> {
  const trimmed = trimGitHubProfileData(raw);
  await cache.set(profileKey(raw.login), trimmed, TTL_PROFILE);
  return trimmed;
}

export async function getCachedRepo(fullName: string): Promise<TrimmedGitHubRepo | null> {
  return cache.get(repoKey(fullName));
}

export async function setCachedRepo(raw: GitHubRepo): Promise<TrimmedGitHubRepo> {
  const trimmed = trimGitHubRepoData(raw);
  await cache.set(repoKey(raw.full_name), trimmed, TTL_REPO);
  return trimmed;
}

export async function invalidateProfileCache(login: string): Promise<void> {
  await cache.del(profileKey(login));
}
