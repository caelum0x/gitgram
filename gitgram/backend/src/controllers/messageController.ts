import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { isUserOnline } from '../websocket/socket';
import { blockService } from '../services/blockService';
import logger from '../utils/logger';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

/**
 * Message.senderId / Message.receiverId / MessageReaction.userId are foreign
 * keys into Account, not User, even though every other identifier in this
 * file (req.userId, ChatMember.userId, UserBlock, socket room names,
 * isUserOnline) is a User id. Passing a raw User id into those columns
 * violates the FK constraint -- sending a message or reacting to one failed
 * outright for every caller until these helpers were introduced. Resolve the
 * caller's (or another participant's) Account id once per request instead.
 */
async function getOwnAccountId(userId: string): Promise<string> {
  const account = await prisma.account.findFirst({ where: { userId }, select: { id: true } });
  if (!account) {
    throw Errors.notFound('Account');
  }
  return account.id;
}

async function getAccountIdForUser(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({ where: { userId }, select: { id: true } });
  return account?.id ?? null;
}

async function getUserIdForAccount(accountId: string | null | undefined): Promise<string | null> {
  if (!accountId) return null;
  const account = await prisma.account.findUnique({ where: { id: accountId }, select: { userId: true } });
  return account?.userId ?? null;
}

export const sendMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { receiverId, content, mediaUrl, chatId } = req.body;

  // Check if there's a block relationship between users
  if (receiverId) {
    const hasBlock = await blockService.hasBlockRelationship(userId, receiverId);
    if (hasBlock) {
      throw Errors.forbidden('Cannot send message to this user');
    }
  }

  // Cross-tenant guard: a group-chat message must come from an actual member
  // of that chat, otherwise any authenticated user could inject messages into
  // any chat by guessing/supplying its chatId.
  if (chatId) {
    const membership = await prisma.chatMember.findFirst({
      where: { chatId, userId },
      select: { id: true },
    });
    if (!membership) {
      throw Errors.forbidden('Not authorized to send messages in this chat');
    }
  }

  const senderAccountId = await getOwnAccountId(userId);
  let receiverAccountId: string | null = null;
  if (receiverId) {
    receiverAccountId = await getAccountIdForUser(receiverId);
    if (!receiverAccountId) {
      throw Errors.notFound('Recipient');
    }
  } else if (!chatId) {
    throw Errors.badRequest('Either receiverId or chatId is required');
  }

  // Check if recipient is online to set deliveredAt
  const recipientOnline = isUserOnline(receiverId);
  const now = new Date();

  const message = await prisma.message.create({
    data: {
      senderId: senderAccountId,
      receiverId: receiverAccountId,
      chatId,
      content,
      mediaUrl,
      deliveredAt: recipientOnline ? now : null
    },
    include: {
      sender: {
        select: { id: true, username: true, avatar: true }
      },
      receiver: {
        select: { id: true, username: true, avatar: true }
      }
    }
  });

  // Emit WebSocket event to receiver
  if (global.io) {
    global.io.to(`user:${receiverId}`).emit('receive_message', {
      ...message,
      deliveredAt: message.deliveredAt?.toISOString() || null,
      status: recipientOnline ? 'delivered' : 'sent'
    });
  }

  res.status(201).json({
    ...message,
    deliveredAt: message.deliveredAt?.toISOString() || null,
    readAt: null,
    status: recipientOnline ? 'delivered' : 'sent'
  });
});

export const getMessages = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { otherUserId } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  // Check if there's a block relationship between users
  const hasBlock = await blockService.hasBlockRelationship(userId, otherUserId);
  if (hasBlock) {
    throw Errors.forbidden('Cannot access messages with this user');
  }

  const ownAccountId = await getOwnAccountId(userId);
  const otherAccountId = await getAccountIdForUser(otherUserId);
  if (!otherAccountId) {
    throw Errors.notFound('User');
  }

  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: ownAccountId, receiverId: otherAccountId },
        { senderId: otherAccountId, receiverId: ownAccountId }
      ]
    },
    include: {
      sender: {
        select: { id: true, username: true, avatar: true }
      },
      reactions: {
        select: { emoji: true, userId: true }
      }
    },
    orderBy: { createdAt: 'desc' },
    skip,
    take: Number(limit)
  });

  // Format messages with read receipt status and aggregated reactions
  const formattedMessages = messages.map(msg => ({
    ...msg,
    reactions: aggregateReactions(msg.reactions, ownAccountId),
    readAt: msg.readAt?.toISOString() || null,
    deliveredAt: msg.deliveredAt?.toISOString() || null,
    status: msg.read ? 'read' : (msg.deliveredAt ? 'delivered' : 'sent')
  }));

  res.json(formattedMessages.reverse());
});

export const getConversations = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const ownAccountId = await getOwnAccountId(userId);

  // Get blocked user IDs to filter out from conversations, translated to the
  // Account ids that Message.senderId/receiverId actually store.
  const blockedUserIds = await blockService.getAllBlockedIds(userId);
  const blockedAccounts = blockedUserIds.length
    ? await prisma.account.findMany({ where: { userId: { in: blockedUserIds } }, select: { id: true } })
    : [];
  const blockedAccountIds = new Set(blockedAccounts.map(a => a.id));

  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: ownAccountId },
        { receiverId: ownAccountId }
      ]
    },
    distinct: ['senderId', 'receiverId'],
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      sender: {
        select: { id: true, username: true, avatar: true }
      },
      receiver: {
        select: { id: true, username: true, avatar: true }
      }
    }
  });

  const conversations = new Map();
  const conversationPartnerIds: string[] = [];

  messages.forEach(msg => {
    const otherId = msg.senderId === ownAccountId ? msg.receiverId : msg.senderId;
    if (!otherId) return; // group-chat message with no single receiver
    // Skip blocked users
    if (blockedAccountIds.has(otherId)) {
      return;
    }
    if (!conversations.has(otherId)) {
      conversationPartnerIds.push(otherId);
      conversations.set(otherId, {
        user: msg.senderId === ownAccountId ? msg.receiver : msg.sender,
        lastMessage: {
          ...msg,
          readAt: msg.readAt?.toISOString() || null,
          deliveredAt: msg.deliveredAt?.toISOString() || null
        },
        unreadCount: 0
      });
    }
  });

  // Get unread counts for each conversation
  if (conversationPartnerIds.length > 0) {
    const unreadCounts = await prisma.message.groupBy({
      by: ['senderId'],
      where: {
        senderId: { in: conversationPartnerIds },
        receiverId: ownAccountId,
        read: false,
        deletedForSender: false
      },
      _count: { id: true }
    });

    unreadCounts.forEach(count => {
      const conversation = conversations.get(count.senderId);
      if (conversation) {
        conversation.unreadCount = count._count.id;
      }
    });
  }

  res.json(Array.from(conversations.values()));
});

export const markAsRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { otherUserId } = req.params;
  const now = new Date();

  const ownAccountId = await getOwnAccountId(userId);
  const otherAccountId = await getAccountIdForUser(otherUserId);
  if (!otherAccountId) {
    throw Errors.notFound('User');
  }

  const result = await prisma.message.updateMany({
    where: {
      senderId: otherAccountId,
      receiverId: ownAccountId,
      read: false
    },
    data: {
      read: true,
      readAt: now
    }
  });

  // Emit WebSocket event to notify the sender
  if (global.io && result.count > 0) {
    // Get the message IDs that were marked as read
    const readMessages = await prisma.message.findMany({
      where: {
        senderId: otherAccountId,
        receiverId: ownAccountId,
        readAt: now
      },
      select: { id: true }
    });

    const messageIds = readMessages.map(m => m.id);

    global.io.to(`user:${otherUserId}`).emit('message:read', {
      readBy: userId,
      messageIds,
      readAt: now.toISOString()
    });
  }

  res.json({
    message: 'Messages marked as read',
    count: result.count,
    readAt: now.toISOString()
  });
});

export const createGroupChat = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { name, memberIds } = req.body;

  const chat = await prisma.chat.create({
    data: {
      name,
      isGroup: true,
      members: {
        create: [
          { userId, role: 'ADMIN' },
          ...memberIds.map((id: string) => ({ userId: id, role: 'MEMBER' as const }))
        ]
      }
    },
    include: {
      members: true
    }
  });

  res.status(201).json(chat);
});

export const getChatMessages = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { chatId } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  // Cross-tenant guard: only members of this chat may read its messages.
  // Without this check any authenticated user could read any group chat's
  // messages by chatId alone.
  const membership = await prisma.chatMember.findFirst({
    where: { chatId, userId },
    select: { id: true },
  });

  if (!membership) {
    throw Errors.forbidden('Not authorized to view this chat');
  }

  const messages = await prisma.message.findMany({
    where: { chatId },
    include: {
      sender: {
        select: { id: true, username: true, avatar: true }
      }
    },
    orderBy: { createdAt: 'desc' },
    skip,
    take: Number(limit)
  });

  res.json(messages.reverse());
});

export const getUserChats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;

  const chatMembers = await prisma.chatMember.findMany({
    where: { userId },
    include: {
      chat: {
        include: {
          members: {
            select: {
              userId: true
            }
          },
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' }
          }
        }
      }
    }
  });

  res.json(chatMembers.map(cm => cm.chat));
});

/**
 * Edit a message
 * PUT /api/v1/messages/:messageId
 */
export const editMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { messageId } = req.params;
  const { content } = req.body;

  if (!content || content.trim().length === 0) {
    throw Errors.badRequest('Content is required');
  }

  const message = await prisma.message.findUnique({
    where: { id: messageId }
  });

  if (!message) {
    throw Errors.notFound('Message');
  }

  const ownAccountId = await getOwnAccountId(userId);
  if (message.senderId !== ownAccountId) {
    throw Errors.forbidden('Not authorized to edit this message');
  }

  // Check if message is too old to edit (e.g., 24 hours)
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (message.createdAt < twentyFourHoursAgo) {
    throw Errors.badRequest('Message is too old to edit');
  }

  const updatedMessage = await prisma.message.update({
    where: { id: messageId },
    data: {
      content: content.trim(),
      editedAt: new Date()
    },
    include: {
      sender: {
        select: { id: true, username: true, avatar: true }
      },
      receiver: {
        select: { id: true, username: true, avatar: true }
      }
    }
  });

  // Emit socket event for real-time update. Socket rooms are keyed by User
  // id, so the Account id on the message has to be translated back.
  if (global.io && message.receiverId) {
    const receiverUserId = await getUserIdForAccount(message.receiverId);
    if (receiverUserId) {
      global.io.to(`user:${receiverUserId}`).emit('message:edited', updatedMessage);
    }
  }
  if (global.io && message.chatId) {
    global.io.to(`chat:${message.chatId}`).emit('message:edited', updatedMessage);
  }

  res.json(updatedMessage);
});

/**
 * Delete a message
 * DELETE /api/v1/messages/:messageId
 */
export const deleteMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { messageId } = req.params;
  const { forEveryone } = req.query;

  const message = await prisma.message.findUnique({
    where: { id: messageId }
  });

  if (!message) {
    throw Errors.notFound('Message');
  }

  const ownAccountId = await getOwnAccountId(userId);
  if (message.senderId !== ownAccountId) {
    throw Errors.forbidden('Not authorized to delete this message');
  }

  if (forEveryone === 'true') {
    // Check if message is too old to delete for everyone (e.g., 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (message.createdAt < oneHourAgo) {
      throw Errors.badRequest('Message is too old to delete for everyone');
    }

    await prisma.message.delete({ where: { id: messageId } });

    // Emit socket event for real-time update
    if (global.io && message.receiverId) {
      const receiverUserId = await getUserIdForAccount(message.receiverId);
      if (receiverUserId) {
        global.io.to(`user:${receiverUserId}`).emit('message:deleted', { messageId, forEveryone: true });
      }
    }
    if (global.io && message.chatId) {
      global.io.to(`chat:${message.chatId}`).emit('message:deleted', { messageId, forEveryone: true });
    }

    res.json({ message: 'Message deleted for everyone' });
  } else {
    // Soft delete - just mark as deleted for the sender
    await prisma.message.update({
      where: { id: messageId },
      data: { deletedForSender: true }
    });

    res.json({ message: 'Message deleted' });
  }
});

/**
 * Get a single message
 * GET /api/v1/messages/single/:messageId
 */
export const getMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { messageId } = req.params;

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      sender: {
        select: { id: true, username: true, avatar: true }
      },
      receiver: {
        select: { id: true, username: true, avatar: true }
      }
    }
  });

  if (!message) {
    throw Errors.notFound('Message');
  }

  // Ensure user is participant
  const ownAccountId = await getOwnAccountId(userId);
  if (message.senderId !== ownAccountId && message.receiverId !== ownAccountId) {
    // Check if user is in the chat
    if (message.chatId) {
      const membership = await prisma.chatMember.findFirst({
        where: { chatId: message.chatId, userId }
      });
      if (!membership) {
        throw Errors.forbidden('Not authorized to view this message');
      }
    } else {
      throw Errors.forbidden('Not authorized to view this message');
    }
  }

  res.json(message);
});

/**
 * Report a message
 * POST /api/v1/messages/:messageId/report
 */
export const reportMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { messageId } = req.params;
  const { reason, description } = req.body;

  if (!reason) {
    throw Errors.badRequest('Reason is required');
  }

  const validReasons = ['spam', 'harassment', 'hate_speech', 'violence', 'inappropriate', 'scam', 'other'];
  if (!validReasons.includes(reason)) {
    throw Errors.badRequest('Invalid reason. Must be one of: ' + validReasons.join(', '));
  }

  const message = await prisma.message.findUnique({
    where: { id: messageId }
  });

  if (!message) {
    throw Errors.notFound('Message');
  }

  // Verify user has access to this message
  const ownAccountId = await getOwnAccountId(userId);
  if (message.senderId !== ownAccountId && message.receiverId !== ownAccountId) {
    if (message.chatId) {
      const membership = await prisma.chatMember.findFirst({
        where: { chatId: message.chatId, userId }
      });
      if (!membership) {
        throw Errors.forbidden('Not authorized to report this message');
      }
    } else {
      throw Errors.forbidden('Not authorized to report this message');
    }
  }

  // Create moderation log for the report
  await prisma.moderationLog.create({
    data: {
      moderatorId: userId,
      action: 'MESSAGE_REPORTED',
      targetType: 'MESSAGE',
      targetId: messageId,
      reason: `${reason}: ${description || 'No additional details'}`
    }
  });

  res.json({ message: 'Message reported successfully. Our team will review it.' });
});

/**
 * Mark all messages in a conversation as read
 * POST /api/v1/messages/conversations/:id/read
 */
export const markConversationAsRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { id: conversationPartnerId } = req.params;

  const now = new Date();

  const ownAccountId = await getOwnAccountId(userId);
  const partnerAccountId = await getAccountIdForUser(conversationPartnerId);
  if (!partnerAccountId) {
    throw Errors.notFound('User');
  }

  // Mark all unread messages from the other user as read
  const result = await prisma.message.updateMany({
    where: {
      senderId: partnerAccountId,
      receiverId: ownAccountId,
      read: false
    },
    data: {
      read: true,
      readAt: now
    }
  });

  // Get the IDs of messages that were marked as read for WebSocket notification
  const readMessages = await prisma.message.findMany({
    where: {
      senderId: partnerAccountId,
      receiverId: ownAccountId,
      readAt: now
    },
    select: { id: true }
  });

  const messageIds = readMessages.map(m => m.id);

  // Emit WebSocket event to notify sender that their messages were read
  if (global.io && messageIds.length > 0) {
    global.io.to(`user:${conversationPartnerId}`).emit('message:read', {
      readBy: userId,
      messageIds,
      readAt: now.toISOString(),
      conversationId: conversationPartnerId
    });
  }

  res.json({
    message: 'Conversation marked as read',
    count: result.count,
    readAt: now.toISOString()
  });
});

/**
 * Mark a specific message as read
 * POST /api/v1/messages/:id/read
 */
export const markMessageAsRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { id: messageId } = req.params;

  const message = await prisma.message.findUnique({
    where: { id: messageId }
  });

  if (!message) {
    throw Errors.notFound('Message');
  }

  // Only the receiver can mark a message as read
  const ownAccountId = await getOwnAccountId(userId);
  if (message.receiverId !== ownAccountId) {
    throw Errors.forbidden('Not authorized to mark this message as read');
  }

  // If already read, just return success
  if (message.read) {
    return res.json({
      message: 'Message already marked as read',
      readAt: message.readAt?.toISOString()
    });
  }

  const now = new Date();

  const updatedMessage = await prisma.message.update({
    where: { id: messageId },
    data: {
      read: true,
      readAt: now
    },
    include: {
      sender: {
        select: { id: true, username: true, avatar: true }
      },
      receiver: {
        select: { id: true, username: true, avatar: true }
      }
    }
  });

  // Emit WebSocket event to notify sender that their message was read
  if (global.io) {
    const senderUserId = await getUserIdForAccount(message.senderId);
    if (senderUserId) {
      global.io.to(`user:${senderUserId}`).emit('message:read', {
        readBy: userId,
        messageIds: [messageId],
        readAt: now.toISOString()
      });
    }

    // Also emit to chat room if it's a group chat
    if (message.chatId) {
      global.io.to(`chat:${message.chatId}`).emit('message:read', {
        readBy: userId,
        messageIds: [messageId],
        readAt: now.toISOString()
      });
    }
  }

  res.json({
    message: 'Message marked as read',
    readAt: now.toISOString(),
    data: updatedMessage
  });
});

/**
 * Get unread message count for a user
 * GET /api/v1/messages/unread/count
 */
export const getUnreadCount = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const ownAccountId = await getOwnAccountId(userId);

  const count = await prisma.message.count({
    where: {
      receiverId: ownAccountId,
      read: false,
      deletedForSender: false
    }
  });

  res.json({ unreadCount: count });
});

// Allowed reaction emoji. Mirrors the Bluesky quick-reaction set plus a small
// curated extra; anything outside this list is rejected at the controller so we
// never persist arbitrary user-supplied strings as "emoji".
const ALLOWED_REACTIONS = ['❤️', '👍', '😆', '👀', '😢', '🎉', '🔥', '👎'];
// Maximum distinct emoji a single user may attach to one message.
const MAX_REACTIONS_PER_USER = 5;

/**
 * Assert the current user participates in the conversation the message belongs
 * to (DM sender/receiver or a member of the group chat). Throws otherwise.
 */
async function assertMessageAccess(
  message: { senderId: string; receiverId: string | null; chatId: string | null },
  userId: string,
  ownAccountId: string,
): Promise<void> {
  if (message.senderId === ownAccountId || message.receiverId === ownAccountId) {
    return;
  }
  if (message.chatId) {
    const membership = await prisma.chatMember.findFirst({
      where: { chatId: message.chatId, userId },
    });
    if (membership) {
      return;
    }
  }
  throw Errors.forbidden('Not authorized to react to this message');
}

/**
 * Shape returned to clients: each distinct emoji with its count and whether the
 * current user has reacted with it. This is the aggregation Bluesky derives from
 * its reaction list (getReactionInfo) computed server-side here instead.
 */
function aggregateReactions(
  reactions: { emoji: string; userId: string }[] | undefined | null,
  currentUserId: string,
): { emoji: string; count: number; reactedByMe: boolean }[] {
  const map = new Map<string, { count: number; reactedByMe: boolean }>();
  for (const r of reactions ?? []) {
    const entry = map.get(r.emoji) ?? { count: 0, reactedByMe: false };
    entry.count += 1;
    if (r.userId === currentUserId) {
      entry.reactedByMe = true;
    }
    map.set(r.emoji, entry);
  }
  return Array.from(map.entries()).map(([emoji, { count, reactedByMe }]) => ({
    emoji,
    count,
    reactedByMe,
  }));
}

/**
 * Add an emoji reaction to a message (idempotent per emoji/user).
 * POST /api/v1/messages/:messageId/reactions  { emoji }
 */
export const addReaction = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { messageId } = req.params;
  const { emoji } = req.body;

  if (!emoji || typeof emoji !== 'string' || !ALLOWED_REACTIONS.includes(emoji)) {
    throw Errors.badRequest('Invalid reaction emoji');
  }

  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message) {
    throw Errors.notFound('Message');
  }

  const ownAccountId = await getOwnAccountId(userId);
  await assertMessageAccess(message, userId, ownAccountId);

  // Enforce the per-user reaction cap, but allow re-adding an emoji the user
  // already has (idempotent) so the cap can't lock a user out of a no-op.
  // MessageReaction.userId is an Account id FK, like Message.senderId/receiverId.
  const existing = await prisma.messageReaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId: ownAccountId, emoji } },
  });

  if (!existing) {
    const distinctCount = await prisma.messageReaction.count({
      where: { messageId, userId: ownAccountId },
    });
    if (distinctCount >= MAX_REACTIONS_PER_USER) {
      throw Errors.badRequest(
        `You can add at most ${MAX_REACTIONS_PER_USER} reactions to a message`,
      );
    }
    await prisma.messageReaction.create({
      data: { messageId, userId: ownAccountId, emoji },
    });
  }

  const reactions = await prisma.messageReaction.findMany({
    where: { messageId },
    select: { emoji: true, userId: true },
  });
  const aggregated = aggregateReactions(reactions, ownAccountId);

  // Notify the other participant(s) so reactions appear in real time. Socket
  // rooms are keyed by User id, so translate the Account ids back.
  if (global.io) {
    const payload = { messageId, userId, emoji, reactions: aggregated };
    const [receiverUserId, senderUserId] = await Promise.all([
      getUserIdForAccount(message.receiverId),
      getUserIdForAccount(message.senderId),
    ]);
    if (receiverUserId) {
      global.io.to(`user:${receiverUserId}`).emit('message:reaction', payload);
    }
    if (senderUserId) {
      global.io.to(`user:${senderUserId}`).emit('message:reaction', payload);
    }
    if (message.chatId) {
      global.io.to(`chat:${message.chatId}`).emit('message:reaction', payload);
    }
  }

  res.json({ messageId, reactions: aggregated });
});

/**
 * Remove an emoji reaction from a message.
 * DELETE /api/v1/messages/:messageId/reactions/:emoji
 */
export const removeReaction = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { messageId, emoji } = req.params;

  // Express has already URL-decoded the path param, so compare it directly
  // against the allow-list rather than decoding again (which would mangle it).
  if (!ALLOWED_REACTIONS.includes(emoji)) {
    throw Errors.badRequest('Invalid reaction emoji');
  }

  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message) {
    throw Errors.notFound('Message');
  }

  const ownAccountId = await getOwnAccountId(userId);
  await assertMessageAccess(message, userId, ownAccountId);

  await prisma.messageReaction.deleteMany({
    where: { messageId, userId: ownAccountId, emoji },
  });

  const reactions = await prisma.messageReaction.findMany({
    where: { messageId },
    select: { emoji: true, userId: true },
  });
  const aggregated = aggregateReactions(reactions, ownAccountId);

  if (global.io) {
    const payload = { messageId, userId, emoji, removed: true, reactions: aggregated };
    const [receiverUserId, senderUserId] = await Promise.all([
      getUserIdForAccount(message.receiverId),
      getUserIdForAccount(message.senderId),
    ]);
    if (receiverUserId) {
      global.io.to(`user:${receiverUserId}`).emit('message:reaction', payload);
    }
    if (senderUserId) {
      global.io.to(`user:${senderUserId}`).emit('message:reaction', payload);
    }
    if (message.chatId) {
      global.io.to(`chat:${message.chatId}`).emit('message:reaction', payload);
    }
  }

  res.json({ messageId, reactions: aggregated });
});

/**
 * Search messages by content
 * GET /api/v1/messages/search?q=:query&limit=20
 *
 * Only returns messages from conversations the user participates in.
 * Results are grouped by conversationId (either the other user's id for DMs
 * or the chatId for group chats) so the caller can render them by thread.
 */
export const searchMessages = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { q: query } = req.query;
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    throw Errors.badRequest('Search query is required');
  }

  const searchTerm = query.trim();
  const ownAccountId = await getOwnAccountId(userId);

  // Fetch matching messages where the current user is a participant
  const messages = await prisma.message.findMany({
    where: {
      content: { contains: searchTerm, mode: 'insensitive' },
      OR: [
        { senderId: ownAccountId },
        { receiverId: ownAccountId },
        {
          chatId: {
            in: (
              await prisma.chatMember.findMany({
                where: { userId },
                select: { chatId: true }
              })
            ).map((cm: { chatId: string }) => cm.chatId)
          }
        }
      ],
      deletedForSender: false
    },
    include: {
      sender: {
        select: { id: true, username: true, avatar: true }
      },
      receiver: {
        select: { id: true, username: true, avatar: true }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: limit
  });

  // Group results by conversationId
  const conversationMap = new Map<string, {
    conversationId: string;
    messages: typeof messages;
  }>();

  for (const msg of messages) {
    // Derive a stable conversation key
    const convId = msg.chatId
      ? msg.chatId
      : [msg.senderId, msg.receiverId].sort().join(':');

    if (!conversationMap.has(convId)) {
      conversationMap.set(convId, { conversationId: convId, messages: [] });
    }
    conversationMap.get(convId)!.messages.push(msg);
  }

  res.json({
    messages,
    conversations: Array.from(conversationMap.values())
  });
});
