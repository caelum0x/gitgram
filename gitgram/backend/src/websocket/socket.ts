import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma';
import logger from '../utils/logger';

/** Parse a cookie header string into a key-value map */
function parseCookies(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    result[key] = decodeURIComponent(val);
  }
  return result;
}

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

const onlineUsers = new Map<string, Set<string>>();
const userTypingInPost = new Map<string, Map<string, NodeJS.Timeout>>();
const userSubscriptions = new Map<string, Set<string>>();
const userTypingInChat = new Map<string, Map<string, NodeJS.Timeout>>();

// ==================
// Rate Limiting
// ==================

const socketRateLimits = new Map<string, Map<string, { count: number; resetAt: number }>>();

const RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  send_message: { max: 30, windowMs: 60000 },
  send_chat_message: { max: 30, windowMs: 60000 },
  'typing:start': { max: 60, windowMs: 60000 },
  'typing:stop': { max: 60, windowMs: 60000 },
  comment_typing: { max: 60, windowMs: 60000 },
  comment_added: { max: 20, windowMs: 60000 },
};

function checkRateLimit(socketId: string, event: string): boolean {
  const limit = RATE_LIMITS[event];
  if (!limit) return true;

  if (!socketRateLimits.has(socketId)) {
    socketRateLimits.set(socketId, new Map());
  }

  const socketLimits = socketRateLimits.get(socketId)!;
  const now = Date.now();
  const entry = socketLimits.get(event);

  if (!entry || now >= entry.resetAt) {
    socketLimits.set(event, { count: 1, resetAt: now + limit.windowMs });
    return true;
  }

  entry.count++;
  return entry.count <= limit.max;
}

// ==================
// Input Validation
// ==================

function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function isValidString(val: unknown, maxLength: number = 5000): val is string {
  return typeof val === 'string' && val.length > 0 && val.length <= maxLength;
}

// ==================
// Map Cleanup
// ==================

const MAX_TYPING_MAP_SIZE = 10000;

function cleanupStaleMaps() {
  // Clean up post typing maps with no active typers
  for (const [postId, typers] of userTypingInPost.entries()) {
    if (typers.size === 0) {
      userTypingInPost.delete(postId);
    }
  }
  // Clean up chat typing maps with no active typers
  for (const [recipientId, typers] of userTypingInChat.entries()) {
    if (typers.size === 0) {
      userTypingInChat.delete(recipientId);
    }
  }
  // Enforce max size
  if (userTypingInPost.size > MAX_TYPING_MAP_SIZE) {
    const toDelete = userTypingInPost.size - MAX_TYPING_MAP_SIZE;
    const keys = Array.from(userTypingInPost.keys()).slice(0, toDelete);
    for (const key of keys) {
      const typers = userTypingInPost.get(key);
      if (typers) {
        for (const timeout of typers.values()) clearTimeout(timeout);
      }
      userTypingInPost.delete(key);
    }
  }
  if (userTypingInChat.size > MAX_TYPING_MAP_SIZE) {
    const toDelete = userTypingInChat.size - MAX_TYPING_MAP_SIZE;
    const keys = Array.from(userTypingInChat.keys()).slice(0, toDelete);
    for (const key of keys) {
      const typers = userTypingInChat.get(key);
      if (typers) {
        for (const timeout of typers.values()) clearTimeout(timeout);
      }
      userTypingInChat.delete(key);
    }
  }
}

export const initializeSocket = (io: Server) => {
  if (process.env.NODE_ENV === 'test') {
    onlineUsers.clear();
    userTypingInPost.clear();
    userSubscriptions.clear();
    userTypingInChat.clear();
    socketRateLimits.clear();
  }

  // Run cleanup every 5 minutes
  const cleanupInterval = setInterval(cleanupStaleMaps, 5 * 60 * 1000);
  cleanupInterval.unref();

  // Configure heartbeat for connection health
  io.engine.opts.pingTimeout = 30000;
  io.engine.opts.pingInterval = 25000;

  io.use((socket: AuthenticatedSocket, next) => {
    // Try auth.token first (legacy), then httpOnly cookie
    let token = socket.handshake.auth.token;
    if (!token) {
      const cookies = parseCookies(socket.handshake.headers.cookie || '');
      token = cookies.token;
    }

    if (!token) {
      return next(new Error('Authentication error'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || '') as { userId: string };
      socket.userId = decoded.userId;
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;
    logger.debug(`User ${userId} connected via WebSocket`);

    // Track online status (support multiple connections per user)
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId)!.add(socket.id);
    socket.join(`user:${userId}`);

    // Initialize subscriptions for this socket
    userSubscriptions.set(socket.id, new Set());

    // Broadcast online status (only if this is the first connection)
    if (onlineUsers.get(userId)!.size === 1) {
      socket.broadcast.emit('user_online', { userId, timestamp: new Date().toISOString() });

      // Mark any pending messages as delivered now that user is online
      (async () => {
        try {
          const now = new Date();
          const undeliveredMessages = await prisma.message.findMany({
            where: {
              receiverId: userId,
              deliveredAt: null
            },
            select: { id: true, senderId: true }
          });

          if (undeliveredMessages.length > 0) {
            await prisma.message.updateMany({
              where: {
                id: { in: undeliveredMessages.map(m => m.id) }
              },
              data: { deliveredAt: now }
            });

            // Group by sender and notify each sender
            const senderGroups = new Map<string, string[]>();
            undeliveredMessages.forEach(msg => {
              if (!senderGroups.has(msg.senderId)) {
                senderGroups.set(msg.senderId, []);
              }
              senderGroups.get(msg.senderId)!.push(msg.id);
            });

            senderGroups.forEach((messageIds, senderId) => {
              io.to(`user:${senderId}`).emit('message:delivered', {
                messageIds,
                deliveredTo: userId,
                deliveredAt: now.toISOString()
              });
            });

            logger.debug(`Marked ${undeliveredMessages.length} messages as delivered to user ${userId}`);
          }
        } catch (error) {
          logger.error('Failed to mark pending messages as delivered', error);
        }
      })();
    }

    // Send current online users to the newly connected user
    const currentOnlineUsers = Array.from(onlineUsers.keys());
    socket.emit('online_users', { users: currentOnlineUsers });

    // Send message
    socket.on('send_message', async (data) => {
      if (!checkRateLimit(socket.id, 'send_message')) {
        socket.emit('error', { message: 'Rate limit exceeded for messages' });
        return;
      }
      const hasContent = isValidString(data?.content, 10000);
      const hasMedia = isValidString(data?.mediaUrl, 10000);
      if (!data || !isValidString(data.receiverId) || (!hasContent && !hasMedia)) {
        socket.emit('error', { message: 'Invalid message data: receiverId and content or mediaUrl are required' });
        return;
      }
      try {
        const message = await prisma.message.create({
          data: {
            senderId: userId,
            receiverId: data.receiverId,
            chatId: data.chatId,
            content: data.content,
            mediaUrl: data.mediaUrl
          },
          include: {
            sender: {
              select: { id: true, username: true, avatar: true }
            }
          }
        });

        // Check if recipient is online - if so, mark as delivered
        const isRecipientOnline = onlineUsers.has(data.receiverId) && onlineUsers.get(data.receiverId)!.size > 0;

        if (isRecipientOnline) {
          const now = new Date();
          await prisma.message.update({
            where: { id: message.id },
            data: { deliveredAt: now }
          });

          // Emit receive_message with delivered status
          io.to(`user:${data.receiverId}`).emit('receive_message', {
            ...message,
            deliveredAt: now.toISOString(),
            status: 'delivered'
          });

          // Notify sender that message was delivered
          socket.emit('message:delivered', {
            messageId: message.id,
            deliveredAt: now.toISOString()
          });
        } else {
          io.to(`user:${data.receiverId}`).emit('receive_message', {
            ...message,
            deliveredAt: null,
            status: 'sent'
          });
        }

        socket.emit('message_sent', {
          ...message,
          deliveredAt: isRecipientOnline ? new Date().toISOString() : null,
          status: isRecipientOnline ? 'delivered' : 'sent'
        });
      } catch (error) {
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Typing indicator (legacy - keeping for backwards compatibility)
    socket.on('typing', (data) => {
      socket.to(`user:${data.recipientId}`).emit('user_typing', {
        userId,
        isTyping: data.isTyping
      });
    });

    // ==================
    // Read Receipts
    // ==================

    // Mark message as read via WebSocket
    socket.on('message:mark_read', async (data: { messageId: string }) => {
      try {
        const { messageId } = data;

        const message = await prisma.message.findUnique({
          where: { id: messageId }
        });

        if (!message || message.receiverId !== userId) {
          socket.emit('error', { message: 'Not authorized to mark this message as read' });
          return;
        }

        if (message.read) {
          // Already read, just acknowledge
          socket.emit('message:read_confirmed', {
            messageId,
            readAt: message.readAt?.toISOString()
          });
          return;
        }

        const now = new Date();
        await prisma.message.update({
          where: { id: messageId },
          data: { read: true, readAt: now }
        });

        // Notify sender that their message was read
        io.to(`user:${message.senderId}`).emit('message:read', {
          readBy: userId,
          messageIds: [messageId],
          readAt: now.toISOString()
        });

        // If it's a chat message, also emit to the chat room
        if (message.chatId) {
          io.to(`chat:${message.chatId}`).emit('message:read', {
            readBy: userId,
            messageIds: [messageId],
            readAt: now.toISOString()
          });
        }

        // Confirm to the reader
        socket.emit('message:read_confirmed', {
          messageId,
          readAt: now.toISOString()
        });

        logger.debug(`User ${userId} marked message ${messageId} as read`);
      } catch (error) {
        socket.emit('error', { message: 'Failed to mark message as read' });
      }
    });

    // Mark all messages in a conversation as read via WebSocket
    socket.on('conversation:mark_read', async (data: { conversationPartnerId: string }) => {
      try {
        const { conversationPartnerId } = data;
        const now = new Date();

        const result = await prisma.message.updateMany({
          where: {
            senderId: conversationPartnerId,
            receiverId: userId,
            read: false
          },
          data: { read: true, readAt: now }
        });

        if (result.count > 0) {
          // Get the IDs of messages that were marked as read
          const readMessages = await prisma.message.findMany({
            where: {
              senderId: conversationPartnerId,
              receiverId: userId,
              readAt: now
            },
            select: { id: true }
          });

          const messageIds = readMessages.map(m => m.id);

          // Notify the conversation partner
          io.to(`user:${conversationPartnerId}`).emit('message:read', {
            readBy: userId,
            messageIds,
            readAt: now.toISOString(),
            conversationId: conversationPartnerId
          });

          // Confirm to the reader
          socket.emit('conversation:read_confirmed', {
            conversationPartnerId,
            count: result.count,
            readAt: now.toISOString()
          });

          logger.debug(`User ${userId} marked ${result.count} messages as read from ${conversationPartnerId}`);
        }
      } catch (error) {
        socket.emit('error', { message: 'Failed to mark conversation as read' });
      }
    });

    // Acknowledge message delivery (client notifies server when they receive a message)
    socket.on('message:acknowledge_delivery', async (data: { messageId: string }) => {
      try {
        const { messageId } = data;

        const message = await prisma.message.findUnique({
          where: { id: messageId }
        });

        if (!message || message.receiverId !== userId) {
          return; // Silently ignore if not the recipient
        }

        if (!message.deliveredAt) {
          const now = new Date();
          await prisma.message.update({
            where: { id: messageId },
            data: { deliveredAt: now }
          });

          // Notify sender that message was delivered
          io.to(`user:${message.senderId}`).emit('message:delivered', {
            messageId,
            deliveredAt: now.toISOString()
          });

          logger.debug(`Message ${messageId} delivered to user ${userId}`);
        }
      } catch (error) {
        logger.error('Failed to acknowledge message delivery', error);
      }
    });

    // ==================
    // Chat Typing Indicators
    // ==================

    // Typing start - user started typing in a chat
    socket.on('typing:start', (data: { recipientId: string }) => {
      if (!checkRateLimit(socket.id, 'typing:start')) return;
      if (!data || !isValidString(data.recipientId)) return;
      const { recipientId } = data;

      if (!userTypingInChat.has(recipientId)) {
        userTypingInChat.set(recipientId, new Map());
      }

      const chatTypers = userTypingInChat.get(recipientId)!;

      // Clear any existing timeout for this user
      const existingTimeout = chatTypers.get(userId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      // Set timeout to auto-clear typing status after 3 seconds (safety fallback)
      const timeout = setTimeout(() => {
        chatTypers.delete(userId);
        io.to(`user:${recipientId}`).emit('typing:status', {
          userId,
          isTyping: false
        });
      }, 3000);

      chatTypers.set(userId, timeout);

      // Emit typing status to the recipient
      io.to(`user:${recipientId}`).emit('typing:status', {
        userId,
        isTyping: true
      });

      logger.debug(`User ${userId} started typing to ${recipientId}`);
    });

    // Typing stop - user stopped typing in a chat
    socket.on('typing:stop', (data: { recipientId: string }) => {
      if (!checkRateLimit(socket.id, 'typing:stop')) return;
      if (!data || !isValidString(data.recipientId)) return;
      const { recipientId } = data;

      const chatTypers = userTypingInChat.get(recipientId);
      if (chatTypers) {
        const existingTimeout = chatTypers.get(userId);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }
        chatTypers.delete(userId);
      }

      // Emit typing stopped status to the recipient
      io.to(`user:${recipientId}`).emit('typing:status', {
        userId,
        isTyping: false
      });

      logger.debug(`User ${userId} stopped typing to ${recipientId}`);
    });

    // Join chat room
    socket.on('join_chat', (chatId) => {
      socket.join(`chat:${chatId}`);
    });

    // Leave chat room
    socket.on('leave_chat', (chatId) => {
      socket.leave(`chat:${chatId}`);
    });

    // Send chat message
    socket.on('send_chat_message', async (data) => {
      if (!checkRateLimit(socket.id, 'send_chat_message')) {
        socket.emit('error', { message: 'Rate limit exceeded for messages' });
        return;
      }
      if (!data || !isValidString(data.chatId) || !isValidString(data.content, 10000)) {
        socket.emit('error', { message: 'Invalid message data: chatId and content are required' });
        return;
      }
      try {
        const account = await prisma.account.findFirst({ where: { userId } });
        if (!account) return;

        const message = await prisma.message.create({
          data: {
            senderId: account.id,
            receiverId: data.receiverId || account.id,
            chatId: data.chatId,
            content: data.content,
            mediaUrl: data.mediaUrl
          },
          include: {
            sender: {
              select: { id: true, username: true, avatar: true }
            }
          }
        });

        // Get chat members to check who is online for delivery status
        const chatMembers = await prisma.chatMember.findMany({
          where: { chatId: data.chatId, userId: { not: userId } },
          select: { userId: true }
        });

        const onlineMemberIds = chatMembers
          .filter(member => member.userId && onlineUsers.has(member.userId) && onlineUsers.get(member.userId)!.size > 0)
          .map(member => member.userId);

        // If any member is online, mark as delivered to them
        if (onlineMemberIds.length > 0) {
          const now = new Date();
          await prisma.message.update({
            where: { id: message.id },
            data: { deliveredAt: now }
          });

          io.to(`chat:${data.chatId}`).emit('receive_chat_message', {
            ...message,
            deliveredAt: now.toISOString(),
            status: 'delivered'
          });

          // Notify sender of delivery
          socket.emit('message:delivered', {
            messageId: message.id,
            deliveredAt: now.toISOString(),
            deliveredTo: onlineMemberIds
          });
        } else {
          io.to(`chat:${data.chatId}`).emit('receive_chat_message', {
            ...message,
            deliveredAt: null,
            status: 'sent'
          });
        }
      } catch (error) {
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Notification (legacy - notifications now sent from notificationService)
    socket.on('send_notification', (data) => {
      io.to(`user:${data.userId}`).emit('receive_notification', data);
    });

    // Mark notifications as read via WebSocket
    socket.on('mark_notifications_read', async (data: { notificationIds?: string[] }) => {
      try {
        const { markNotificationsAsRead } = await import('../services/notificationService');
        const count = await markNotificationsAsRead(userId, data.notificationIds);
        socket.emit('notifications_marked_read', { count });
      } catch (error) {
        socket.emit('error', { message: 'Failed to mark notifications as read' });
      }
    });

    // Get unread notification count
    socket.on('get_unread_count', async () => {
      try {
        const { getUnreadCount } = await import('../services/notificationService');
        const count = await getUnreadCount(userId);
        socket.emit('unread_count', { count });
      } catch (error) {
        socket.emit('error', { message: 'Failed to get unread count' });
      }
    });

    // Post like real-time
    socket.on('like_post', (data) => {
      io.to(`user:${data.postOwnerId}`).emit('post_liked', {
        postId: data.postId,
        userId
      });
    });

    // Comment real-time
    socket.on('new_comment', (data) => {
      io.to(`user:${data.postOwnerId}`).emit('post_commented', {
        postId: data.postId,
        userId,
        comment: data.comment
      });
    });

    // Story view
    socket.on('view_story', (data) => {
      io.to(`user:${data.storyOwnerId}`).emit('story_viewed', {
        storyId: data.storyId,
        userId
      });
    });

    // ==================
    // Real-time Comments
    // ==================

    // Subscribe to post comments
    socket.on('subscribe_post', (postId: string) => {
      socket.join(`post:${postId}`);
      userSubscriptions.get(socket.id)?.add(postId);
      logger.debug(`User ${userId} subscribed to post ${postId}`);
    });

    // Unsubscribe from post comments
    socket.on('unsubscribe_post', (postId: string) => {
      socket.leave(`post:${postId}`);
      userSubscriptions.get(socket.id)?.delete(postId);
      logger.debug(`User ${userId} unsubscribed from post ${postId}`);
    });

    // Typing indicator for comments
    socket.on('comment_typing', (data: { postId: string; isTyping: boolean }) => {
      if (!checkRateLimit(socket.id, 'comment_typing')) return;
      if (!data || !isValidString(data.postId)) return;
      const { postId, isTyping } = data;

      if (!userTypingInPost.has(postId)) {
        userTypingInPost.set(postId, new Map());
      }

      const postTypers = userTypingInPost.get(postId)!;

      if (isTyping) {
        // Clear any existing timeout for this user
        const existingTimeout = postTypers.get(userId);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }

        // Set timeout to auto-clear typing status after 5 seconds
        const timeout = setTimeout(() => {
          postTypers.delete(userId);
          io.to(`post:${postId}`).emit('comment_typing_update', {
            postId,
            userId,
            isTyping: false
          });
        }, 5000);

        postTypers.set(userId, timeout);

        // Broadcast typing status to others viewing this post
        socket.to(`post:${postId}`).emit('comment_typing_update', {
          postId,
          userId,
          isTyping: true
        });
      } else {
        // Clear timeout and typing status
        const existingTimeout = postTypers.get(userId);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }
        postTypers.delete(userId);

        socket.to(`post:${postId}`).emit('comment_typing_update', {
          postId,
          userId,
          isTyping: false
        });
      }
    });

    // New comment added (to broadcast to subscribers)
    socket.on('comment_added', (data: { postId: string; comment: Record<string, unknown> }) => {
      io.to(`post:${data.postId}`).emit('new_comment', {
        postId: data.postId,
        comment: data.comment
      });
    });

    // Comment updated
    socket.on('comment_updated', (data: { postId: string; commentId: string; content: string }) => {
      io.to(`post:${data.postId}`).emit('comment_update', {
        postId: data.postId,
        commentId: data.commentId,
        content: data.content,
        updatedBy: userId
      });
    });

    // Comment deleted
    socket.on('comment_deleted', (data: { postId: string; commentId: string }) => {
      io.to(`post:${data.postId}`).emit('comment_removed', {
        postId: data.postId,
        commentId: data.commentId,
        deletedBy: userId
      });
    });

    // Comment liked/unliked
    socket.on('comment_like_changed', (data: { postId: string; commentId: string; liked: boolean; newCount: number }) => {
      io.to(`post:${data.postId}`).emit('comment_like_update', {
        postId: data.postId,
        commentId: data.commentId,
        liked: data.liked,
        newCount: data.newCount,
        userId
      });
    });

    // ==================
    // Online Status
    // ==================

    // Check if specific users are online
    socket.on('check_online_status', (userIds: string[]) => {
      const statuses = userIds.map(id => ({
        userId: id,
        isOnline: onlineUsers.has(id) && onlineUsers.get(id)!.size > 0
      }));
      socket.emit('online_status_response', { statuses });
    });

    // ==================
    // Notification Badge
    // ==================

    // Subscribe to notification badge updates
    socket.on('subscribe_notifications', () => {
      socket.join(`notifications:${userId}`);
    });

    // Request badge refresh
    socket.on('refresh_notification_badge', async () => {
      try {
        const { getUnreadCount } = await import('../services/notificationService');
        const count = await getUnreadCount(userId);
        socket.emit('notification_badge_update', { count });
      } catch (error) {
        logger.error('Failed to get notification count', error);
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      logger.debug(`User ${userId} disconnected from WebSocket`);

      // Clean up rate limit entries for this socket
      socketRateLimits.delete(socket.id);

      // Clean up subscriptions
      const subs = userSubscriptions.get(socket.id);
      if (subs) {
        for (const postId of subs) {
          // Clean up typing indicators for this user in all posts
          const postTypers = userTypingInPost.get(postId);
          if (postTypers) {
            const timeout = postTypers.get(userId);
            if (timeout) {
              clearTimeout(timeout);
            }
            postTypers.delete(userId);
          }
        }
        userSubscriptions.delete(socket.id);
      }

      // Clean up chat typing indicators for this user
      for (const [recipientId, chatTypers] of userTypingInChat.entries()) {
        const timeout = chatTypers.get(userId);
        if (timeout) {
          clearTimeout(timeout);
          chatTypers.delete(userId);
          // Notify the recipient that this user stopped typing
          io.to(`user:${recipientId}`).emit('typing:status', {
            userId,
            isTyping: false
          });
        }
      }

      // Remove from online users
      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        // Only broadcast offline if this was the last connection
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
          socket.broadcast.emit('user_offline', { userId, timestamp: new Date().toISOString() });
        }
      }
    });
  });
};

export const getIO = () => {
  // This will be set from index.ts
  return global.io;
};

export const emitToUser = (userId: string, event: string, data: unknown) => {
  const io = getIO();
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
};

export const emitToPost = (postId: string, event: string, data: unknown) => {
  const io = getIO();
  if (io) {
    io.to(`post:${postId}`).emit(event, data);
  }
};

export const emitToChat = (chatId: string, event: string, data: unknown) => {
  const io = getIO();
  if (io) {
    io.to(`chat:${chatId}`).emit(event, data);
  }
};

export const isUserOnline = (userId: string): boolean => {
  return onlineUsers.has(userId) && onlineUsers.get(userId)!.size > 0;
};

export const getOnlineUsers = (): string[] => {
  return Array.from(onlineUsers.keys()).filter(userId =>
    onlineUsers.get(userId)!.size > 0
  );
};

export const getOnlineUserCount = (): number => {
  return getOnlineUsers().length;
};

// Broadcast notification badge update to a user
export const emitNotificationBadge = (userId: string, count: number) => {
  const io = getIO();
  if (io) {
    io.to(`user:${userId}`).emit('notification_badge_update', { count });
  }
};

// Broadcast new comment to all post subscribers
export const broadcastNewComment = (postId: string, comment: Record<string, unknown>) => {
  emitToPost(postId, 'new_comment', { postId, comment });
};

// Broadcast comment deletion to all post subscribers
export const broadcastCommentDeleted = (postId: string, commentId: string) => {
  emitToPost(postId, 'comment_removed', { postId, commentId });
};

// Broadcast comment update to all post subscribers
export const broadcastCommentUpdated = (postId: string, commentId: string, content: string) => {
  emitToPost(postId, 'comment_update', { postId, commentId, content });
};

// ==================
// Read Receipt Exports
// ==================

// Emit message read event to a user
export const emitMessageRead = (senderId: string, readBy: string, messageIds: string[], readAt: Date) => {
  const io = getIO();
  if (io) {
    io.to(`user:${senderId}`).emit('message:read', {
      readBy,
      messageIds,
      readAt: readAt.toISOString()
    });
  }
};

// Emit message delivered event to a user
export const emitMessageDelivered = (senderId: string, messageId: string, deliveredAt: Date) => {
  const io = getIO();
  if (io) {
    io.to(`user:${senderId}`).emit('message:delivered', {
      messageId,
      deliveredAt: deliveredAt.toISOString()
    });
  }
};

// Mark undelivered messages as delivered when user comes online
export const markPendingMessagesAsDelivered = async (userId: string) => {
  const io = getIO();
  if (!io) return;

  try {
    const now = new Date();

    // Find all undelivered messages for this user
    const undeliveredMessages = await prisma.message.findMany({
      where: {
        receiverId: userId,
        deliveredAt: null
      },
      select: { id: true, senderId: true }
    });

    if (undeliveredMessages.length === 0) return;

    // Update all as delivered
    await prisma.message.updateMany({
      where: {
        id: { in: undeliveredMessages.map(m => m.id) }
      },
      data: { deliveredAt: now }
    });

    // Group by sender and notify each sender
    const senderGroups = new Map<string, string[]>();
    undeliveredMessages.forEach(msg => {
      if (!senderGroups.has(msg.senderId)) {
        senderGroups.set(msg.senderId, []);
      }
      senderGroups.get(msg.senderId)!.push(msg.id);
    });

    senderGroups.forEach((messageIds, senderId) => {
      io.to(`user:${senderId}`).emit('message:delivered', {
        messageIds,
        deliveredTo: userId,
        deliveredAt: now.toISOString()
      });
    });

    logger.debug(`Marked ${undeliveredMessages.length} messages as delivered to user ${userId}`);
  } catch (error) {
    logger.error('Failed to mark pending messages as delivered', error);
  }
};
