import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../utils/prisma';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';
import {
  switchAccount as switchToUserAccount,
  grantAccountSwitch,
  revokeAccountSwitch,
  getSwitchableAccounts,
} from '../services/accountService';

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

  // GET /api/switch/switchable - users this caller may switch into (multi-account)
  getSwitchableAccounts: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const accounts = await getSwitchableAccounts(userId);
    res.json({ success: true, data: accounts });
  }),

  // POST /api/switch/switch-user - mint a session for an authorized target user
  switchToUser: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const { targetUserId } = req.body;

    try {
      const result = await switchToUserAccount(userId, targetUserId);
      res.json({ success: true, data: result });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to switch account';
      throw Errors.forbidden(message);
    }
  }),

  // POST /api/switch/grant - authorize switching into another user account
  grantSwitch: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const { targetUserId } = req.body;

    try {
      const grant = await grantAccountSwitch(userId, targetUserId);
      res.status(201).json({ success: true, data: grant });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to grant access';
      throw Errors.badRequest(message);
    }
  }),

  // DELETE /api/switch/grant - revoke a previously granted switch authorization
  revokeSwitch: asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const userId = authReq.userId!;
    const { targetUserId } = req.body;

    try {
      const result = await revokeAccountSwitch(userId, targetUserId);
      res.json({ success: true, data: result });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to revoke access';
      throw Errors.notFound(message);
    }
  }),
};
