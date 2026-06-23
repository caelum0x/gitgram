import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

export const switchController = {
  // GET /api/switch/accounts - Get all accounts user can access
  getMyAccounts: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;

    // Get user's personal account
    const personalAccount = await prisma.account.findFirst({
      where: { userId },
    });

    // Get repositories user manages
    const managedRepos = await prisma.repositoryManager.findMany({
      where: { userId },
      include: {
        repository: {
          include: { account: true },
        },
      },
    });

    // Get organizations user is part of
    const orgMemberships = await prisma.organizationMember.findMany({
      where: { userId },
      include: {
        organization: {
          include: { account: true },
        },
      },
    });

    const accounts = [
      personalAccount,
      ...managedRepos.map(m => m.repository.account).filter(Boolean),
      ...orgMemberships.map(m => m.organization.account).filter(Boolean),
    ];

    res.json({ accounts });
  }),

  // POST /api/switch/account - Switch to different account
  switchAccount: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const { accountId } = req.body;

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: {
        user: true,
        repository: { include: { managers: true } },
        organization: { include: { members: true } },
      },
    });

    if (!account) {
      throw Errors.notFound('Account');
    }

    // Verify user has access
    const hasAccess =
      account.userId === userId ||
      account.repository?.managers.some(m => m.userId === userId) ||
      account.organization?.members.some(m => m.userId === userId);

    if (!hasAccess) {
      throw Errors.forbidden('Access denied');
    }

    res.json({ account, message: 'Switched successfully' });
  }),
};
