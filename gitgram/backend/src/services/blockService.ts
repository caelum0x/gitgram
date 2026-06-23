import prisma from '../utils/prisma';
import logger from '../utils/logger';

/**
 * Service for managing user blocks
 */
export class BlockService {
  /**
   * Check if userA has blocked userB
   */
  async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    const block = await prisma.userBlock.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId,
          blockedId,
        },
      },
    });
    return !!block;
  }

  /**
   * Check if there is any block between two users (either direction)
   */
  async hasBlockRelationship(userId1: string, userId2: string): Promise<boolean> {
    const block = await prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: userId1, blockedId: userId2 },
          { blockerId: userId2, blockedId: userId1 },
        ],
      },
    });
    return !!block;
  }

  /**
   * Get the list of user IDs that a user has blocked
   */
  async getBlockedUserIds(userId: string): Promise<string[]> {
    const blocks = await prisma.userBlock.findMany({
      where: { blockerId: userId },
      select: { blockedId: true },
    });
    return blocks.map((b) => b.blockedId);
  }

  /**
   * Get the list of user IDs that have blocked a user
   */
  async getBlockedByUserIds(userId: string): Promise<string[]> {
    const blocks = await prisma.userBlock.findMany({
      where: { blockedId: userId },
      select: { blockerId: true },
    });
    return blocks.map((b) => b.blockerId);
  }

  /**
   * Get all user IDs that should be filtered out for a user
   * (users they blocked + users who blocked them)
   */
  async getAllBlockedIds(userId: string): Promise<string[]> {
    const blocks = await prisma.userBlock.findMany({
      where: {
        OR: [{ blockerId: userId }, { blockedId: userId }],
      },
      select: { blockerId: true, blockedId: true },
    });

    const blockedIds = new Set<string>();
    blocks.forEach((b) => {
      if (b.blockerId !== userId) blockedIds.add(b.blockerId);
      if (b.blockedId !== userId) blockedIds.add(b.blockedId);
    });

    return Array.from(blockedIds);
  }

  /**
   * Block a user - also removes any existing follow relationships
   */
  async blockUser(blockerId: string, blockedId: string): Promise<void> {
    // Verify target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: blockedId },
      select: { id: true },
    });

    if (!targetUser) {
      throw new Error('User not found');
    }

    // Check if already blocked
    const existingBlock = await prisma.userBlock.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId,
          blockedId,
        },
      },
    });

    if (existingBlock) {
      throw new Error('User is already blocked');
    }

    // Use transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      // Create the block
      await tx.userBlock.create({
        data: {
          blockerId,
          blockedId,
        },
      });

      // Remove any follow relationship from blocker to blocked
      await tx.follow.deleteMany({
        where: {
          OR: [
            { followerId: blockerId, followingId: blockedId },
            { followerUserId: blockerId, followingUserId: blockedId },
          ],
        },
      });

      // Remove any follow relationship from blocked to blocker
      await tx.follow.deleteMany({
        where: {
          OR: [
            { followerId: blockedId, followingId: blockerId },
            { followerUserId: blockedId, followingUserId: blockerId },
          ],
        },
      });

      // Remove any pending follow requests between them
      await tx.followRequest.deleteMany({
        where: {
          OR: [
            { requesterId: blockerId, targetId: blockedId },
            { requesterId: blockedId, targetId: blockerId },
          ],
        },
      });

      logger.info(`User ${blockerId} blocked user ${blockedId}`);
    });
  }

  /**
   * Unblock a user
   */
  async unblockUser(blockerId: string, blockedId: string): Promise<void> {
    const existingBlock = await prisma.userBlock.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId,
          blockedId,
        },
      },
    });

    if (!existingBlock) {
      throw new Error('User is not blocked');
    }

    await prisma.userBlock.delete({
      where: {
        blockerId_blockedId: {
          blockerId,
          blockedId,
        },
      },
    });

    logger.info(`User ${blockerId} unblocked user ${blockedId}`);
  }

  /**
   * Get paginated list of blocked users with details
   */
  async getBlockedUsers(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{
    users: Array<{
      id: string;
      username: string | null;
      avatar: string | null;
      bio: string | null;
      blockedAt: Date;
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  }> {
    const skip = (page - 1) * limit;

    const [blocks, total] = await Promise.all([
      prisma.userBlock.findMany({
        where: { blockerId: userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          blockedId: true,
          createdAt: true,
        },
      }),
      prisma.userBlock.count({
        where: { blockerId: userId },
      }),
    ]);

    const blockedIds = blocks.map((b) => b.blockedId);
    const users = await prisma.user.findMany({
      where: { id: { in: blockedIds } },
      select: {
        id: true,
        username: true,
        avatar: true,
        bio: true,
      },
    });

    // Map users with blockedAt timestamp
    const userMap = new Map(users.map((u) => [u.id, u]));
    const result = blocks.map((b) => {
      const user = userMap.get(b.blockedId);
      return {
        id: b.blockedId,
        username: user?.username ?? null,
        avatar: user?.avatar ?? null,
        bio: user?.bio ?? null,
        blockedAt: b.createdAt,
      };
    });

    return {
      users: result,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }
}

export const blockService = new BlockService();
export default blockService;
