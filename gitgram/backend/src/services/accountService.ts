import prisma from '../utils/prisma';
import logger from '../utils/logger';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';

export interface LinkedAccountData {
  id: string;
  provider: string;
  providerId: string;
  email: string | null;
  username: string | null;
  avatar: string | null;
  createdAt: Date;
}

/**
 * Get all linked accounts for a user
 */
export async function getLinkedAccounts(userId: string): Promise<LinkedAccountData[]> {
  try {
    const linkedAccounts = await prisma.linkedAccount.findMany({
      where: { userId },
      select: {
        id: true,
        provider: true,
        providerId: true,
        email: true,
        username: true,
        avatar: true,
        createdAt: true,
      },
    });

    // Also include the primary account info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        githubId: true,
        githubUsername: true,
        googleId: true,
        email: true,
        avatar: true,
      },
    });

    const accounts: LinkedAccountData[] = linkedAccounts;

    // Add GitHub if directly linked to user
    if (user?.githubId && !linkedAccounts.some(a => a.provider === 'github')) {
      accounts.push({
        id: `primary-github-${user.githubId}`,
        provider: 'github',
        providerId: user.githubId,
        email: user.email,
        username: user.githubUsername,
        avatar: user.avatar,
        createdAt: new Date(),
      });
    }

    // Add Google if directly linked to user
    if (user?.googleId && !linkedAccounts.some(a => a.provider === 'google')) {
      accounts.push({
        id: `primary-google-${user.googleId}`,
        provider: 'google',
        providerId: user.googleId,
        email: user.email,
        username: null,
        avatar: user.avatar,
        createdAt: new Date(),
      });
    }

    return accounts;
  } catch (error) {
    logger.error('Get linked accounts error:', error);
    throw error;
  }
}

/**
 * Link an OAuth provider account to an existing user
 */
export async function linkAccount(
  userId: string,
  provider: string,
  providerId: string,
  email?: string,
  username?: string,
  avatar?: string
): Promise<LinkedAccountData> {
  try {
    // Check if this provider account is already linked to another user
    const existingLink = await prisma.linkedAccount.findUnique({
      where: {
        provider_providerId: {
          provider,
          providerId,
        },
      },
    });

    if (existingLink) {
      if (existingLink.userId === userId) {
        throw new Error('This account is already linked');
      }
      throw new Error('This account is already linked to another user');
    }

    // Also check if the provider ID is on the main user record
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { githubId: provider === 'github' ? providerId : undefined },
          { googleId: provider === 'google' ? providerId : undefined },
        ],
      },
    });

    if (existingUser && existingUser.id !== userId) {
      throw new Error('This account is already linked to another user');
    }

    // Create the linked account
    const linkedAccount = await prisma.linkedAccount.create({
      data: {
        userId,
        provider,
        providerId,
        email,
        username,
        avatar,
      },
    });

    logger.info(`Account linked: ${provider} for user ${userId}`);

    return {
      id: linkedAccount.id,
      provider: linkedAccount.provider,
      providerId: linkedAccount.providerId,
      email: linkedAccount.email,
      username: linkedAccount.username,
      avatar: linkedAccount.avatar,
      createdAt: linkedAccount.createdAt,
    };
  } catch (error) {
    logger.error('Link account error:', error);
    throw error;
  }
}

/**
 * Unlink an OAuth provider account from a user
 */
export async function unlinkAccount(
  userId: string,
  accountIdOrProvider: string
): Promise<{ success: boolean; message: string }> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        password: true,
        githubId: true,
        googleId: true,
        linkedAccounts: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Count total auth methods
    let authMethodCount = 0;
    if (user.password) authMethodCount++;
    if (user.githubId) authMethodCount++;
    if (user.googleId) authMethodCount++;
    authMethodCount += user.linkedAccounts.length;

    if (authMethodCount <= 1) {
      throw new Error('Cannot unlink last authentication method. Please add another login method first.');
    }

    // Check if it's a LinkedAccount ID or provider name
    const linkedAccount = await prisma.linkedAccount.findFirst({
      where: {
        userId,
        OR: [
          { id: accountIdOrProvider },
          { provider: accountIdOrProvider },
        ],
      },
    });

    if (linkedAccount) {
      await prisma.linkedAccount.delete({
        where: { id: linkedAccount.id },
      });
      logger.info(`Account unlinked: ${linkedAccount.provider} for user ${userId}`);
      return { success: true, message: `${linkedAccount.provider} account unlinked successfully` };
    }

    // Check if trying to unlink primary provider (GitHub or Google on User model)
    if (accountIdOrProvider === 'github' || accountIdOrProvider.startsWith('primary-github')) {
      if (!user.githubId) {
        throw new Error('GitHub account is not linked');
      }
      await prisma.user.update({
        where: { id: userId },
        data: { githubId: null, githubUsername: null, githubAccessToken: null },
      });
      logger.info(`Primary GitHub unlinked for user ${userId}`);
      return { success: true, message: 'GitHub account unlinked successfully' };
    }

    if (accountIdOrProvider === 'google' || accountIdOrProvider.startsWith('primary-google')) {
      if (!user.googleId) {
        throw new Error('Google account is not linked');
      }
      await prisma.user.update({
        where: { id: userId },
        data: { googleId: null },
      });
      logger.info(`Primary Google unlinked for user ${userId}`);
      return { success: true, message: 'Google account unlinked successfully' };
    }

    throw new Error('Account not found');
  } catch (error) {
    logger.error('Unlink account error:', error);
    throw error;
  }
}

export interface SwitchableAccountSummary {
  id: string;
  email: string;
  username: string | null;
  avatar: string | null;
  verified: boolean;
  githubId: string | null;
  googleId: string | null;
  account: unknown;
  activeProvider: string;
}

export interface SwitchAccountResult {
  user: SwitchableAccountSummary;
  token: string;
  refreshToken: string;
}

const TOKEN_TTL = '7d';
const REFRESH_TTL = '30d';
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Resolve which user the caller is allowed to switch *into*.
 *
 * Resolution order:
 *  1. A LinkedAccount of the current user      -> stay on currentUser, set provider context
 *  2. The current user's own id                -> stay on currentUser
 *  3. A different user authorized by an active  -> switch to that user
 *     AccountSwitchGrant (true multi-account)
 *
 * Throws when no authorized target can be resolved.
 */
async function resolveSwitchTarget(
  currentUserId: string,
  targetAccountId: string
): Promise<{ targetUserId: string; activeProvider: string }> {
  // (1) Linked provider context belonging to the current user.
  const linkedAccount = await prisma.linkedAccount.findFirst({
    where: { id: targetAccountId, userId: currentUserId },
  });
  if (linkedAccount) {
    return { targetUserId: currentUserId, activeProvider: linkedAccount.provider };
  }

  // (2) The caller's own user id.
  if (targetAccountId === currentUserId) {
    return { targetUserId: currentUserId, activeProvider: 'email' };
  }

  // (3) A different user the caller is explicitly granted to assume.
  const grant = await prisma.accountSwitchGrant.findUnique({
    where: {
      ownerUserId_targetUserId: {
        ownerUserId: currentUserId,
        targetUserId: targetAccountId,
      },
    },
  });
  if (grant && !grant.revokedAt) {
    return { targetUserId: targetAccountId, activeProvider: 'switched' };
  }

  throw new Error('Account not found or not accessible');
}

/**
 * Switch into an account the caller is authorized to use and mint fresh tokens
 * + a session for the resolved target user.
 *
 * Supports both same-user provider-context switching and true multi-account
 * switching into a *different* user authorized via AccountSwitchGrant.
 */
export async function switchAccount(
  currentUserId: string,
  targetAccountId: string
): Promise<SwitchAccountResult> {
  try {
    if (!targetAccountId) {
      throw new Error('Target account id is required');
    }

    const { targetUserId, activeProvider } = await resolveSwitchTarget(
      currentUserId,
      targetAccountId
    );

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        email: true,
        username: true,
        avatar: true,
        verified: true,
        isBanned: true,
        isSuspended: true,
        githubId: true,
        googleId: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }
    if (user.isBanned) {
      throw new Error('Target account is banned');
    }
    if (user.isSuspended) {
      throw new Error('Target account is suspended');
    }

    const account = await prisma.account.findFirst({ where: { userId: user.id } });

    const token = jwt.sign({ userId: user.id }, config.jwt.secret, { expiresIn: TOKEN_TTL });
    const refreshToken = jwt.sign({ userId: user.id }, config.jwt.refreshSecret, {
      expiresIn: REFRESH_TTL,
    });

    await prisma.session.create({
      data: {
        userId: user.id,
        refreshToken,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });

    logger.info(
      `Account switch: user ${currentUserId} -> ${user.id} (provider=${activeProvider})`
    );

    const { isBanned, isSuspended, ...publicUser } = user;
    return {
      user: { ...publicUser, account, activeProvider },
      token,
      refreshToken,
    };
  } catch (error) {
    logger.error('Switch account error:', error);
    throw error;
  }
}

/**
 * Grant another user (target) the right to be switched into by the owner.
 * Idempotent: re-granting a revoked grant re-activates it.
 */
export async function grantAccountSwitch(
  ownerUserId: string,
  targetUserId: string
): Promise<{ id: string; ownerUserId: string; targetUserId: string }> {
  if (ownerUserId === targetUserId) {
    throw new Error('Cannot grant switching to your own account');
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });
  if (!targetUser) {
    throw new Error('Target user not found');
  }

  const grant = await prisma.accountSwitchGrant.upsert({
    where: {
      ownerUserId_targetUserId: { ownerUserId, targetUserId },
    },
    update: { revokedAt: null },
    create: { ownerUserId, targetUserId },
    select: { id: true, ownerUserId: true, targetUserId: true },
  });

  logger.info(`Account switch granted: ${ownerUserId} -> ${targetUserId}`);
  return grant;
}

/** Revoke a previously granted account-switch authorization. */
export async function revokeAccountSwitch(
  ownerUserId: string,
  targetUserId: string
): Promise<{ success: boolean }> {
  const existing = await prisma.accountSwitchGrant.findUnique({
    where: { ownerUserId_targetUserId: { ownerUserId, targetUserId } },
  });
  if (!existing) {
    throw new Error('Grant not found');
  }

  await prisma.accountSwitchGrant.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });

  logger.info(`Account switch revoked: ${ownerUserId} -> ${targetUserId}`);
  return { success: true };
}

/** List the accounts the owner is currently authorized to switch into. */
export async function getSwitchableAccounts(
  ownerUserId: string
): Promise<Array<{ id: string; username: string | null; avatar: string | null; email: string }>> {
  const grants = await prisma.accountSwitchGrant.findMany({
    where: { ownerUserId, revokedAt: null },
    include: {
      targetUser: { select: { id: true, username: true, avatar: true, email: true } },
    },
  });
  return grants.map((g) => ({
    id: g.targetUser.id,
    username: g.targetUser.username,
    avatar: g.targetUser.avatar,
    email: g.targetUser.email,
  }));
}

export default {
  getLinkedAccounts,
  linkAccount,
  unlinkAccount,
  switchAccount,
  grantAccountSwitch,
  revokeAccountSwitch,
  getSwitchableAccounts,
};
