import { prisma } from '../utils/prisma';
import logger from '../utils/logger';
import { createMentionNotification } from './notificationService';

// Regex to match @username mentions
// Supports alphanumeric usernames with underscores, 3-30 characters
const MENTION_REGEX = /@([a-zA-Z0-9_]{3,30})\b/g;

interface MentionResult {
  mentionedUserIds: string[];
  mentionedUsernames: string[];
  invalidMentions: string[];
}

/**
 * Parse @username mentions from content
 * Returns unique usernames found in the content
 */
export function parseMentions(content: string): string[] {
  if (!content) return [];

  const matches = content.match(MENTION_REGEX);
  if (!matches) return [];

  // Extract usernames without @ symbol and deduplicate
  const usernames = Array.from(new Set(matches.map(m => m.slice(1).toLowerCase())));
  return usernames;
}

/**
 * Validate mentioned users exist in the database
 * Returns user IDs for valid mentions
 */
export async function validateMentionedUsers(usernames: string[]): Promise<MentionResult> {
  if (!usernames.length) {
    return { mentionedUserIds: [], mentionedUsernames: [], invalidMentions: [] };
  }

  try {
    // Find users by username (case-insensitive)
    const users = await prisma.user.findMany({
      where: {
        username: {
          in: usernames,
          mode: 'insensitive'
        }
      },
      select: {
        id: true,
        username: true
      }
    });

    const foundUsernames = users.map(u => u.username?.toLowerCase());
    const invalidMentions = usernames.filter(
      username => !foundUsernames.includes(username.toLowerCase())
    );

    return {
      mentionedUserIds: users.map(u => u.id),
      mentionedUsernames: users.map(u => u.username!),
      invalidMentions
    };
  } catch (error) {
    logger.error('Error validating mentioned users:', error);
    return { mentionedUserIds: [], mentionedUsernames: [], invalidMentions: usernames };
  }
}

/**
 * Extract and validate mentions from content
 * Returns validated user IDs
 */
export async function extractMentions(content: string): Promise<MentionResult> {
  const usernames = parseMentions(content);
  return validateMentionedUsers(usernames);
}

/**
 * Process mentions for a post: validate users and send notifications
 */
export async function processMentionsForPost(
  content: string,
  postId: string,
  authorId: string,
  authorUsername: string
): Promise<string[]> {
  try {
    const { mentionedUserIds } = await extractMentions(content);

    if (!mentionedUserIds.length) return [];

    // Don't notify the author if they mention themselves
    const usersToNotify = mentionedUserIds.filter(id => id !== authorId);

    // Send notifications to mentioned users
    await Promise.all(
      usersToNotify.map(userId =>
        createMentionNotification(userId, authorId, authorUsername, postId)
      )
    );

    logger.debug(`Processed ${usersToNotify.length} mentions for post ${postId}`);
    return mentionedUserIds;
  } catch (error) {
    logger.error('Error processing mentions for post:', error);
    return [];
  }
}

/**
 * Process mentions for a comment: validate users and send notifications
 */
export async function processMentionsForComment(
  content: string,
  postId: string,
  commentId: string,
  authorId: string,
  authorUsername: string
): Promise<string[]> {
  try {
    const { mentionedUserIds } = await extractMentions(content);

    if (!mentionedUserIds.length) return [];

    // Don't notify the author if they mention themselves
    const usersToNotify = mentionedUserIds.filter(id => id !== authorId);

    // Send notifications to mentioned users
    await Promise.all(
      usersToNotify.map(userId =>
        createMentionNotification(userId, authorId, authorUsername, postId)
      )
    );

    logger.debug(`Processed ${usersToNotify.length} mentions for comment ${commentId}`);
    return mentionedUserIds;
  } catch (error) {
    logger.error('Error processing mentions for comment:', error);
    return [];
  }
}

/**
 * Process mentions for a message: validate users (no notifications for DMs)
 */
export async function processMentionsForMessage(
  content: string
): Promise<string[]> {
  try {
    const { mentionedUserIds } = await extractMentions(content);
    return mentionedUserIds;
  } catch (error) {
    logger.error('Error processing mentions for message:', error);
    return [];
  }
}

/**
 * Search users for mention autocomplete
 * Returns users matching the query prefix
 */
export async function searchUsersForMention(
  query: string,
  currentUserId?: string,
  limit: number = 10
): Promise<Array<{
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  verified: boolean;
}>> {
  if (!query || query.length < 1) return [];

  try {
    const users = await prisma.user.findMany({
      where: {
        AND: [
          {
            OR: [
              { username: { startsWith: query, mode: 'insensitive' } },
              { displayName: { startsWith: query, mode: 'insensitive' } }
            ]
          },
          // Exclude the current user
          currentUserId ? { id: { not: currentUserId } } : {},
          // Only include users with usernames
          { username: { not: null } },
          // Exclude banned users
          { isBanned: false }
        ]
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatar: true,
        verified: true
      },
      orderBy: [
        // Prioritize verified users
        { verified: 'desc' },
        // Then by follower count (if available)
        { createdAt: 'asc' }
      ],
      take: limit
    });

    return users.map(u => ({
      id: u.id,
      username: u.username!,
      displayName: u.displayName,
      avatar: u.avatar,
      verified: u.verified
    }));
  } catch (error) {
    logger.error('Error searching users for mention:', error);
    return [];
  }
}

/**
 * Get posts where a user is mentioned
 */
export async function getPostsWithUserMention(
  username: string,
  page: number = 1,
  limit: number = 20
): Promise<any[]> {
  try {
    const skip = (page - 1) * limit;

    const posts = await prisma.post.findMany({
      where: {
        content: {
          contains: `@${username}`,
          mode: 'insensitive'
        }
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
            verified: true
          }
        },
        _count: {
          select: { likes: true, comments: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    });

    return posts;
  } catch (error) {
    logger.error('Error getting posts with user mention:', error);
    return [];
  }
}

export default {
  parseMentions,
  validateMentionedUsers,
  extractMentions,
  processMentionsForPost,
  processMentionsForComment,
  processMentionsForMessage,
  searchUsersForMention,
  getPostsWithUserMention
};
