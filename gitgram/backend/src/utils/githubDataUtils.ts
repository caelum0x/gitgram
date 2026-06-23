/**
 * Pure helpers for trimming GitHub API payloads to only the fields
 * Gitgram actually stores and displays.
 *
 * Ported from external/gh-social/src/server/helpers/trimGitHubData.ts (MIT).
 */

export interface GitHubUserProfile {
  id: number;
  node_id: string;
  login: string;
  name: string | null;
  avatar_url: string;
  bio: string | null;
  blog: string | null;
  followers: number;
  following: number;
  html_url: string;
  type: string;
  company: string | null;
}

export interface GitHubRepo {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  fork: boolean;
  forks_count: number;
  stargazers_count: number;
  watchers_count: number;
  topics: string[];
  owner: GitHubUserProfile;
}

export interface TrimmedGitHubProfile {
  id: number;
  node_id: string;
  login: string;
  name: string | null;
  avatar_url: string;
  bio: string | null;
  blog: string | null;
  followers: number;
  following: number;
  html_url: string;
  type: string;
  company: string | null;
}

export interface TrimmedGitHubRepo {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  fork: boolean;
  forks_count: number;
  stargazers_count: number;
  watchers_count: number;
  topics: string[];
  owner: TrimmedGitHubProfile;
}

export function trimGitHubProfileData(profile: GitHubUserProfile): TrimmedGitHubProfile {
  return {
    id: profile.id,
    node_id: profile.node_id,
    name: profile.name,
    login: profile.login,
    avatar_url: profile.avatar_url,
    bio: profile.bio,
    blog: profile.blog,
    followers: profile.followers,
    following: profile.following,
    html_url: profile.html_url,
    type: profile.type,
    company: profile.company,
  };
}

export function trimGitHubRepoData(repo: GitHubRepo): TrimmedGitHubRepo {
  return {
    id: repo.id,
    node_id: repo.node_id,
    name: repo.name,
    full_name: repo.full_name,
    html_url: repo.html_url,
    description: repo.description,
    fork: repo.fork,
    forks_count: repo.forks_count,
    stargazers_count: repo.stargazers_count,
    watchers_count: repo.watchers_count,
    topics: repo.topics ?? [],
    owner: trimGitHubProfileData(repo.owner),
  };
}
