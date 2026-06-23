import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';
import { Octokit } from '@octokit/rest';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

export const claimController = {
  // GET /api/claim/my-repos - Get user's claimable repos
  getMyRepos: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user?.githubAccessToken) {
      throw Errors.badRequest('GitHub not connected');
    }

    const octokit = new Octokit({ auth: user.githubAccessToken });
    const { data: repos } = await octokit.repos.listForAuthenticatedUser({
      per_page: 100,
      sort: 'updated',
    });

    const claimableRepos = repos.map(repo => ({
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      stars: repo.stargazers_count,
      language: repo.language,
      htmlUrl: repo.html_url,
    }));

    res.json({ repos: claimableRepos });
  }),

  // POST /api/claim/repository - Claim a repository
  claimRepository: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    const { owner, name, username } = req.body;

    if (!owner || !name) {
      throw Errors.badRequest('Owner and name are required');
    }

    // Verify the user actually has access to this repository via GitHub
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.githubAccessToken) {
      throw Errors.badRequest('GitHub not connected');
    }

    const octokit = new Octokit({ auth: user.githubAccessToken });
    try {
      const { data: repo } = await octokit.repos.get({ owner, repo: name });
      // Verify user has admin/push permissions (is owner or collaborator)
      if (!repo.permissions?.admin && !repo.permissions?.push) {
        throw Errors.forbidden('You do not have write access to this repository');
      }
    } catch (error: unknown) {
      if (error instanceof ApiError) throw error;
      throw Errors.badRequest('Repository not found or not accessible');
    }

    // Check if repo already claimed
    const existing = await prisma.repository.findUnique({
      where: { fullName: `${owner}/${name}` },
    });

    if (existing?.claimedBy) {
      throw Errors.badRequest('Repository already claimed');
    }

    // Create or update repository
    const repository = await prisma.repository.upsert({
      where: { fullName: `${owner}/${name}` },
      create: {
        owner,
        name,
        fullName: `${owner}/${name}`,
        htmlUrl: `https://github.com/${owner}/${name}`,
        claimedBy: userId,
        claimedAt: new Date(),
      },
      update: {
        claimedBy: userId,
        claimedAt: new Date(),
      },
    });

    // Create Account for repository
    const account = await prisma.account.create({
      data: {
        type: 'REPOSITORY',
        username: username || `${owner}-${name}`,
        displayName: name,
        repositoryId: repository.id,
      },
    });

    // Add user as manager
    await prisma.repositoryManager.create({
      data: {
        repositoryId: repository.id,
        userId,
        role: 'OWNER',
      },
    });

    res.json({ account, repository });
  }),

  // POST /api/v1/repositories/claim
  // Body: { repoFullName: "owner/name" }
  // Returns: { success: true, repository: { id, fullName, claimedAt } }
  claimByFullName: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;
    const { repoFullName } = req.body as { repoFullName: string };

    const slashIndex = repoFullName.indexOf('/');
    const owner = repoFullName.slice(0, slashIndex);
    const name = repoFullName.slice(slashIndex + 1);

    // Verify the user has a connected GitHub account
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.githubAccessToken) {
      throw Errors.badRequest('GitHub not connected. Connect your GitHub account to claim a repository.');
    }

    // Verify the authenticated user actually owns/has write access to the repo on GitHub
    const octokit = new Octokit({ auth: user.githubAccessToken });
    try {
      const { data: repo } = await octokit.repos.get({ owner, repo: name });
      if (!repo.permissions?.admin && !repo.permissions?.push) {
        throw Errors.forbidden('You do not have write access to this repository on GitHub');
      }
      // Extra ownership check: GitHub username must match the repo owner
      if (user.githubUsername && user.githubUsername.toLowerCase() !== owner.toLowerCase() && !repo.permissions?.admin) {
        throw Errors.forbidden('Repository owner does not match your GitHub username');
      }
    } catch (error: unknown) {
      if (error instanceof ApiError) throw error;
      throw Errors.badRequest('Repository not found or not accessible on GitHub');
    }

    // Prevent double-claiming by another user
    const existing = await prisma.repository.findUnique({
      where: { fullName: repoFullName },
      select: { claimedBy: true },
    });
    if (existing?.claimedBy && existing.claimedBy !== userId) {
      throw Errors.badRequest('This repository has already been claimed by another user');
    }

    const claimedAt = new Date();
    const repository = await prisma.repository.upsert({
      where: { fullName: repoFullName },
      create: {
        owner,
        name,
        fullName: repoFullName,
        htmlUrl: `https://github.com/${repoFullName}`,
        claimedBy: userId,
        claimedAt,
      },
      update: {
        claimedBy: userId,
        claimedAt,
      },
      select: {
        id: true,
        fullName: true,
        claimedAt: true,
      },
    });

    res.json({
      success: true,
      repository: {
        id: repository.id,
        fullName: repository.fullName,
        claimedAt: repository.claimedAt,
      },
    });
  }),
};
