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

/**
 * Switch to a different linked account
 * Returns new tokens for the target account
 */
export async function switchAccount(
  currentUserId: string,
  targetAccountId: string
): Promise<{ user: any; token: string; refreshToken: string }> {
  try {
    // Find the linked account
    const linkedAccount = await prisma.linkedAccount.findFirst({
      where: {
        OR: [
          { id: targetAccountId, userId: currentUserId },
          { providerId: targetAccountId },
        ],
      },
    });

    // The linked accounts point to the same user, so this feature is for
    // switching between different "views" or for future multi-user support
    // For now, we'll support switching to a linked provider's context

    if (!linkedAccount) {
      // Check if it's a user ID they have access to
      // For now, users can only switch within their own account
      const targetUser = await prisma.user.findUnique({
        where: { id: targetAccountId },
        include: {
          account: true,
        },
      });

      if (!targetUser || targetUser.id !== currentUserId) {
        throw new Error('Account not found or not accessible');
      }
    }

    // Get the user (in future, this could be a different user for multi-account)
    const user = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: {
        id: true,
        email: true,
        username: true,
        avatar: true,
        verified: true,
        githubId: true,
        googleId: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const account = await prisma.account.findFirst({
      where: { userId: user.id },
    });

    // Generate new tokens
    const token = jwt.sign(
      { userId: user.id },
      config.jwt.secret,
      { expiresIn: '7d' }
    );

    const refreshToken = jwt.sign(
      { userId: user.id },
      config.jwt.refreshSecret,
      { expiresIn: '30d' }
    );

    // Create new session
    await prisma.session.create({
      data: {
        userId: user.id,
        refreshToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    logger.info(`Account switched for user ${currentUserId}`);

    return {
      user: {
        ...user,
        account,
        activeProvider: linkedAccount?.provider || 'email',
      },
      token,
      refreshToken,
    };
  } catch (error) {
    logger.error('Switch account error:', error);
    throw error;
  }
}

export default {
  getLinkedAccounts,
  linkAccount,
  unlinkAccount,
  switchAccount,
};
