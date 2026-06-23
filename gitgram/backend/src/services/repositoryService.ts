import { Octokit } from '@octokit/rest';
import prisma from '../utils/prisma';
import { Errors } from '../middleware/errorHandler';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN, // Optional: for higher rate limits
});

export const repositoryService = {
  // Fetch and cache repository data from GitHub
  async fetchRepository(owner: string, name: string) {
    try {
      const { data } = await octokit.repos.get({ owner, repo: name });
      
      const repository = await prisma.repository.upsert({
        where: { owner_name: { owner, name } },
        create: {
          owner,
          name,
          fullName: data.full_name,
          description: data.description,
          stars: data.stargazers_count,
          forks: data.forks_count,
          language: data.language,
          topics: data.topics || [],
          htmlUrl: data.html_url,
          lastFetched: new Date(),
        },
        update: {
          description: data.description,
          stars: data.stargazers_count,
          forks: data.forks_count,
          language: data.language,
          topics: data.topics || [],
          lastFetched: new Date(),
        },
      });
      
      return repository;
    } catch (error: any) {
      if (error.status === 404) {
        throw Errors.notFound('Repository');
      }
      throw error;
    }
  },

  // Get or fetch repository
  async getRepository(owner: string, name: string) {
    const existing = await prisma.repository.findUnique({
      where: { owner_name: { owner, name } },
    });

    // Refresh if older than 1 hour
    if (existing && existing.lastFetched && Date.now() - existing.lastFetched.getTime() < 3600000) {
      return existing;
    }

    return this.fetchRepository(owner, name);
  },

  // Search repositories
  async searchRepositories(query: string, limit = 20) {
    const { data } = await octokit.search.repos({
      q: query,
      per_page: limit,
      sort: 'stars',
    });

    return data.items.map(repo => ({
      owner: repo.owner?.login || '',
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      stars: repo.stargazers_count,
      language: repo.language,
      htmlUrl: repo.html_url,
    }));
  },

  // Get trending repositories
  async getTrending(language?: string, limit = 20) {
    const date = new Date();
    date.setDate(date.getDate() - 7); // Last week
    
    let query = `created:>${date.toISOString().split('T')[0]}`;
    if (language) query += ` language:${language}`;

    const { data } = await octokit.search.repos({
      q: query,
      per_page: limit,
      sort: 'stars',
    });

    return data.items.map(repo => ({
      owner: repo.owner?.login || '',
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      stars: repo.stargazers_count,
      language: repo.language,
      htmlUrl: repo.html_url,
    }));
  },

  // Get repository with post count
  async getRepositoryWithStats(owner: string, name: string) {
    const repository = await this.getRepository(owner, name);
    
    const [postCount, followerCount] = await Promise.all([
      prisma.post.count({ where: { repositoryId: repository.id } }),
      prisma.repositoryFollow.count({ where: { repositoryId: repository.id } }),
    ]);

    return {
      ...repository,
      postCount,
      followerCount,
    };
  },

  // Follow repository
  async followRepository(userId: string, repositoryId: string) {
    return prisma.repositoryFollow.create({
      data: { userId, repositoryId },
    });
  },

  // Unfollow repository
  async unfollowRepository(userId: string, repositoryId: string) {
    return prisma.repositoryFollow.delete({
      where: { userId_repositoryId: { userId, repositoryId } },
    });
  },

  // Check if user follows repository
  async isFollowing(userId: string, repositoryId: string) {
    const follow = await prisma.repositoryFollow.findUnique({
      where: { userId_repositoryId: { userId, repositoryId } },
    });
    return !!follow;
  },
};
