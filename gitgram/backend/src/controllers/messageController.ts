import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { isUserOnline } from '../websocket/socket';
import { blockService } from '../services/blockService';
import logger from '../utils/logger';
import { asyncHandler, Errors, ApiError } from '../middleware/errorHandler';

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

  // Check if recipient is online to set deliveredAt
  const recipientOnline = isUserOnline(receiverId);
  const now = new Date();

  const message = await prisma.message.create({
    data: {
      senderId: userId,
      receiverId,
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

  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: userId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: userId }
      ]
    },
    include: {
      sender: {
        select: { id: true, username: true, avatar: true }
      }
    },
    orderBy: { createdAt: 'desc' },
    skip,
    take: Number(limit)
  });

  // Format messages with read receipt status
  const formattedMessages = messages.map(msg => ({
    ...msg,
    readAt: msg.readAt?.toISOString() || null,
    deliveredAt: msg.deliveredAt?.toISOString() || null,
    status: msg.read ? 'read' : (msg.deliveredAt ? 'delivered' : 'sent')
  }));

  res.json(formattedMessages.reverse());
});

export const getConversations = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;

  // Get blocked user IDs to filter out from conversations
  const blockedIds = await blockService.getAllBlockedIds(userId);

  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: userId },
        { receiverId: userId }
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
    const otherId = msg.senderId === userId ? msg.receiverId : msg.senderId;
    // Skip blocked users
    if (blockedIds.includes(otherId)) {
      return;
    }
    if (!conversations.has(otherId)) {
      conversationPartnerIds.push(otherId);
      conversations.set(otherId, {
        user: msg.senderId === userId ? msg.receiver : msg.sender,
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
        receiverId: userId,
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

  const result = await prisma.message.updateMany({
    where: {
      senderId: otherUserId,
      receiverId: userId,
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
        senderId: otherUserId,
        receiverId: userId,
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
  const { chatId } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

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

  if (message.senderId !== userId) {
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

  // Emit socket event for real-time update
  if (global.io && message.receiverId) {
    global.io.to(`user:${message.receiverId}`).emit('message:edited', updatedMessage);
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

  if (message.senderId !== userId) {
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
      global.io.to(`user:${message.receiverId}`).emit('message:deleted', { messageId, forEveryone: true });
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
  if (message.senderId !== userId && message.receiverId !== userId) {
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
  if (message.senderId !== userId && message.receiverId !== userId) {
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

  // Mark all unread messages from the other user as read
  const result = await prisma.message.updateMany({
    where: {
      senderId: conversationPartnerId,
      receiverId: userId,
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
      senderId: conversationPartnerId,
      receiverId: userId,
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
  if (message.receiverId !== userId) {
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
    global.io.to(`user:${message.senderId}`).emit('message:read', {
      readBy: userId,
      messageIds: [messageId],
      readAt: now.toISOString()
    });

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

  const count = await prisma.message.count({
    where: {
      receiverId: userId,
      read: false,
      deletedForSender: false
    }
  });

  res.json({ unreadCount: count });
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

  // Fetch matching messages where the current user is a participant
  const messages = await prisma.message.findMany({
    where: {
      content: { contains: searchTerm, mode: 'insensitive' },
      OR: [
        { senderId: userId },
        { receiverId: userId },
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
