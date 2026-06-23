import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';
import { repositoryService } from '../services/repositoryService';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

const ensureRepositoryAccount = async (owner: string, repo: string) => {
  const repository = await repositoryService.getRepository(owner, repo);
  return prisma.account.upsert({
    where: { username: repository.fullName || `${owner}/${repo}` },
    create: {
      type: 'REPOSITORY',
      username: repository.fullName || `${owner}/${repo}`,
      displayName: repository.name,
      bio: repository.description,
      repositoryId: repository.id,
    },
    update: {
      displayName: repository.name,
      bio: repository.description,
      repositoryId: repository.id,
    },
    include: {
      repository: true,
    },
  });
};

export const accountController = {
  // GET /api/accounts/:owner/:repo - Get repository account profile
  getRepositoryAccount: asyncHandler(async (req: Request, res: Response) => {
    const { owner, repo } = req.params;
    const account = await ensureRepositoryAccount(owner, repo);
    res.json({ account });
  }),

  // GET /api/accounts/:owner/:repo/posts - Get repository account posts
  getRepositoryPosts: asyncHandler(async (req: Request, res: Response) => {
    const { owner, repo } = req.params;
    const account = await ensureRepositoryAccount(owner, repo);

    const posts = await prisma.post.findMany({
      where: { accountId: account.id },
      include: {
        account: { select: { username: true, avatar: true, type: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ posts });
  }),

  // POST /api/accounts/:owner/:repo/follow - Follow repository account
  followRepositoryAccount: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { owner, repo } = req.params;
    const userId = authReq.userId!;

    let followerAccount = await prisma.account.findFirst({
      where: { userId },
    });
    const followingAccount = await ensureRepositoryAccount(owner, repo);

    if (!followerAccount) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user?.username) {
        throw Errors.notFound('Account');
      }
      followerAccount = await prisma.account.create({
        data: {
          type: 'USER',
          username: user.username,
          userId,
        },
      });
    }

    await prisma.follow.create({
      data: {
        followerId: followerAccount.id,
        followingId: followingAccount.id,
      },
    });

    res.json({ message: 'Followed successfully', following: true });
  }),

  // GET /api/accounts/:username - Get any account (user/repo/org)
  getAccount: asyncHandler(async (req: Request, res: Response) => {
    const { username } = req.params;

    const account = await prisma.account.findUnique({
      where: { username },
      include: {
        user: true,
        repository: true,
        organization: true,
      },
    });

    if (!account) {
      throw Errors.notFound('Account');
    }

    res.json({ account });
  }),

  // GET /api/accounts/:username/posts - Get account posts
  getPosts: asyncHandler(async (req: Request, res: Response) => {
    const { username } = req.params;

    const account = await prisma.account.findUnique({
      where: { username },
    });

    if (!account) {
      throw Errors.notFound('Account');
    }

    const posts = await prisma.post.findMany({
      where: { accountId: account.id },
      include: {
        account: { select: { username: true, avatar: true, type: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ posts });
  }),

  // POST /api/accounts/:username/follow - Follow account
  follow: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { username } = req.params;
    const userId = authReq.userId!;

    const followerAccount = await prisma.account.findFirst({
      where: { userId },
    });

    const followingAccount = await prisma.account.findUnique({
      where: { username },
    });

    if (!followerAccount || !followingAccount) {
      throw Errors.notFound('Account');
    }

    await prisma.follow.create({
      data: {
        followerId: followerAccount.id,
        followingId: followingAccount.id,
      },
    });

    res.json({ message: 'Followed successfully' });
  }),

  // DELETE /api/accounts/:username/follow - Unfollow account
  unfollow: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { username } = req.params;
    const userId = authReq.userId!;

    const followerAccount = await prisma.account.findFirst({
      where: { userId },
    });

    const followingAccount = await prisma.account.findUnique({
      where: { username },
    });

    if (!followerAccount || !followingAccount) {
      throw Errors.notFound('Account');
    }

    await prisma.follow.deleteMany({
      where: {
        followerId: followerAccount.id,
        followingId: followingAccount.id,
      },
    });

    res.json({ message: 'Unfollowed successfully' });
  }),
};
