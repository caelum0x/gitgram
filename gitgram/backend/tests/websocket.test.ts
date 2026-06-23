// Unmock the websocket module so we can test the real implementation
jest.unmock('../src/websocket/socket');

import jwt from 'jsonwebtoken';
import { generateTestAccessToken, TEST_USER_ID, TEST_USER_ID_2 } from './helpers';

// We import `initializeSocket` after mocks are in place (setup.ts runs first)
import { initializeSocket } from '../src/websocket/socket';

// ---------------------------------------------------------------------------
// Helpers to build mock Socket.IO objects
// ---------------------------------------------------------------------------

type EventHandler = (...args: any[]) => void;

/**
 * Creates a mock Socket with an internal event registry so we can simulate
 * the server calling `socket.on(event, handler)` and later trigger those
 * handlers manually via `triggerEvent`.
 */
function createMockSocket(overrides: Record<string, any> = {}) {
  const handlers = new Map<string, EventHandler>();

  const socket: any = {
    id: overrides.id ?? 'test-socket-id',
    handshake: overrides.handshake ?? {
      auth: { token: '' },
      headers: {},
    },
    data: {},
    userId: undefined,

    // Room management
    join: jest.fn(),
    leave: jest.fn(),

    // Emission
    emit: jest.fn(),
    disconnect: jest.fn(),

    // `socket.to(room)` returns an object with `.emit()`
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),

    // `socket.broadcast.emit()`
    broadcast: { emit: jest.fn() },

    // Event registration -- store handlers so we can invoke them in tests
    on: jest.fn((event: string, handler: EventHandler) => {
      handlers.set(event, handler);
    }),

    // ------- Test-only helpers -------
    /** Retrieve registered handler */
    _getHandler: (event: string) => handlers.get(event),
    /** Trigger a registered handler */
    _triggerEvent: async (event: string, ...args: any[]) => {
      const handler = handlers.get(event);
      if (!handler) throw new Error(`No handler registered for event "${event}"`);
      return handler(...args);
    },
    _handlers: handlers,
  };

  return socket;
}

/**
 * Creates a mock socket.io Server whose `.use()` registers middleware and
 * `.on('connection', cb)` stores the connection callback.  We can then
 * manually push sockets through the middleware and connection flow.
 */
function createMockIO() {
  const middlewares: Array<(socket: any, next: (err?: Error) => void) => void> = [];
  let connectionHandler: ((socket: any) => void) | null = null;

  const toEmit = jest.fn();
  const io: any = {
    engine: { opts: { pingTimeout: 20000, pingInterval: 25000 } },
    use: jest.fn((mw: any) => middlewares.push(mw)),
    on: jest.fn((event: string, handler: any) => {
      if (event === 'connection') {
        connectionHandler = handler;
      }
    }),
    to: jest.fn().mockReturnValue({ emit: toEmit }),
    emit: jest.fn(),

    // ------- Test-only helpers -------
    /** Run a socket through all registered middleware */
    _runMiddleware: (socket: any): Promise<void> => {
      return new Promise((resolve, reject) => {
        let idx = 0;
        const next = (err?: Error) => {
          if (err) return reject(err);
          if (idx >= middlewares.length) return resolve();
          const mw = middlewares[idx++];
          mw(socket, next);
        };
        next();
      });
    },
    /** Trigger the connection handler */
    _triggerConnection: (socket: any) => {
      if (connectionHandler) connectionHandler(socket);
    },
    _toEmit: toEmit,
  };

  return io;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebSocket', () => {
  let io: ReturnType<typeof createMockIO>;

  beforeEach(() => {
    io = createMockIO();
    initializeSocket(io as any);
  });

  // ========================================================================
  // 1. Authentication middleware
  // ========================================================================
  describe('Authentication', () => {
    it('should accept a valid JWT in auth.token and set userId on socket', async () => {
      const token = generateTestAccessToken(TEST_USER_ID);
      const socket = createMockSocket({
        handshake: { auth: { token }, headers: {} },
      });

      await io._runMiddleware(socket);
      expect(socket.userId).toBe(TEST_USER_ID);
    });

    it('should accept a valid JWT from httpOnly cookie when auth.token is absent', async () => {
      const token = generateTestAccessToken(TEST_USER_ID);
      const socket = createMockSocket({
        handshake: {
          auth: {},
          headers: { cookie: `token=${token}; other=value` },
        },
      });

      await io._runMiddleware(socket);
      expect(socket.userId).toBe(TEST_USER_ID);
    });

    it('should reject connection when no token is provided', async () => {
      const socket = createMockSocket({
        handshake: { auth: {}, headers: {} },
      });

      await expect(io._runMiddleware(socket)).rejects.toThrow('Authentication error');
    });

    it('should reject connection with an invalid JWT', async () => {
      const socket = createMockSocket({
        handshake: { auth: { token: 'invalid.jwt.token' }, headers: {} },
      });

      await expect(io._runMiddleware(socket)).rejects.toThrow('Authentication error');
    });

    it('should reject connection with an expired JWT', async () => {
      // Create a token that is already expired
      const expiredToken = jwt.sign(
        { userId: TEST_USER_ID },
        process.env.JWT_SECRET || 'test-secret-key-for-testing-at-least-32-chars',
        { expiresIn: '0s' },
      );

      const socket = createMockSocket({
        handshake: { auth: { token: expiredToken }, headers: {} },
      });

      // Small delay to ensure the token is expired
      await new Promise((r) => setTimeout(r, 10));
      await expect(io._runMiddleware(socket)).rejects.toThrow('Authentication error');
    });
  });

  // ========================================================================
  // 2. Connection setup
  // ========================================================================
  describe('Connection', () => {
    it('should join user room, register event handlers, and emit online_users on connect', async () => {
      const token = generateTestAccessToken(TEST_USER_ID);
      const socket = createMockSocket({
        handshake: { auth: { token }, headers: {} },
      });

      await io._runMiddleware(socket);
      io._triggerConnection(socket);

      // Should join user-specific room
      expect(socket.join).toHaveBeenCalledWith(`user:${TEST_USER_ID}`);

      // Should broadcast user_online to others
      expect(socket.broadcast.emit).toHaveBeenCalledWith(
        'user_online',
        expect.objectContaining({ userId: TEST_USER_ID }),
      );

      // Should emit online_users to the connecting socket
      expect(socket.emit).toHaveBeenCalledWith(
        'online_users',
        expect.objectContaining({ users: expect.any(Array) }),
      );

      // Should register all expected event handlers
      const expectedEvents = [
        'send_message',
        'typing',
        'message:mark_read',
        'conversation:mark_read',
        'message:acknowledge_delivery',
        'typing:start',
        'typing:stop',
        'join_chat',
        'leave_chat',
        'send_chat_message',
        'send_notification',
        'mark_notifications_read',
        'get_unread_count',
        'like_post',
        'new_comment',
        'view_story',
        'subscribe_post',
        'unsubscribe_post',
        'comment_typing',
        'comment_added',
        'comment_updated',
        'comment_deleted',
        'comment_like_changed',
        'check_online_status',
        'subscribe_notifications',
        'refresh_notification_badge',
        'disconnect',
      ];

      for (const event of expectedEvents) {
        expect(socket._handlers.has(event)).toBe(true);
      }
    });
  });

  // ========================================================================
  // 3. send_message event handler
  // ========================================================================
  describe('send_message', () => {
    let socket: ReturnType<typeof createMockSocket>;

    beforeEach(async () => {
      const token = generateTestAccessToken(TEST_USER_ID);
      socket = createMockSocket({
        handshake: { auth: { token }, headers: {} },
      });
      await io._runMiddleware(socket);
      io._triggerConnection(socket);
      jest.clearAllMocks();
    });

    it('should create a message and emit message_sent on success', async () => {
      const { prisma } = require('../src/utils/prisma');
      const fakeMessage = {
        id: 'msg-001',
        senderId: TEST_USER_ID,
        receiverId: TEST_USER_ID_2,
        chatId: 'chat-001',
        content: 'Hello!',
        mediaUrl: null,
        sender: { id: TEST_USER_ID, username: 'testuser', avatar: null },
        createdAt: new Date(),
      };
      prisma.message.create.mockResolvedValueOnce(fakeMessage);

      await socket._triggerEvent('send_message', {
        receiverId: TEST_USER_ID_2,
        chatId: 'chat-001',
        content: 'Hello!',
      });

      // Verify prisma.message.create was called with correct data
      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            senderId: TEST_USER_ID,
            receiverId: TEST_USER_ID_2,
            chatId: 'chat-001',
            content: 'Hello!',
          }),
        }),
      );

      // Should emit message_sent back to sender
      expect(socket.emit).toHaveBeenCalledWith(
        'message_sent',
        expect.objectContaining({ id: 'msg-001' }),
      );
    });

    it('should emit an error event when prisma.message.create fails', async () => {
      const { prisma } = require('../src/utils/prisma');
      prisma.message.create.mockRejectedValueOnce(new Error('DB error'));

      await socket._triggerEvent('send_message', {
        receiverId: TEST_USER_ID_2,
        chatId: 'chat-001',
        content: 'Hello!',
      });

      expect(socket.emit).toHaveBeenCalledWith('error', {
        message: 'Failed to send message',
      });
    });

    it('should pass mediaUrl when provided', async () => {
      const { prisma } = require('../src/utils/prisma');
      const fakeMessage = {
        id: 'msg-002',
        senderId: TEST_USER_ID,
        receiverId: TEST_USER_ID_2,
        chatId: 'chat-001',
        content: '',
        mediaUrl: 'https://cdn.example.com/image.png',
        sender: { id: TEST_USER_ID, username: 'testuser', avatar: null },
        createdAt: new Date(),
      };
      prisma.message.create.mockResolvedValueOnce(fakeMessage);

      await socket._triggerEvent('send_message', {
        receiverId: TEST_USER_ID_2,
        chatId: 'chat-001',
        content: '',
        mediaUrl: 'https://cdn.example.com/image.png',
      });

      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mediaUrl: 'https://cdn.example.com/image.png',
          }),
        }),
      );
    });
  });

  // ========================================================================
  // 4. Typing indicators (typing:start / typing:stop)
  // ========================================================================
  describe('typing:start / typing:stop', () => {
    let socket: ReturnType<typeof createMockSocket>;

    beforeEach(async () => {
      const token = generateTestAccessToken(TEST_USER_ID);
      socket = createMockSocket({
        handshake: { auth: { token }, headers: {} },
      });
      await io._runMiddleware(socket);
      io._triggerConnection(socket);
      jest.clearAllMocks();
    });

    it('should emit typing:status with isTyping true to recipient on typing:start', async () => {
      await socket._triggerEvent('typing:start', { recipientId: TEST_USER_ID_2 });

      expect(io.to).toHaveBeenCalledWith(`user:${TEST_USER_ID_2}`);
      expect(io._toEmit).toHaveBeenCalledWith('typing:status', {
        userId: TEST_USER_ID,
        isTyping: true,
      });
    });

    it('should emit typing:status with isTyping false to recipient on typing:stop', async () => {
      await socket._triggerEvent('typing:stop', { recipientId: TEST_USER_ID_2 });

      expect(io.to).toHaveBeenCalledWith(`user:${TEST_USER_ID_2}`);
      expect(io._toEmit).toHaveBeenCalledWith('typing:status', {
        userId: TEST_USER_ID,
        isTyping: false,
      });
    });

    it('should clear previous timeout when typing:start is called again', async () => {
      // Call start twice; should not throw and should reset the timeout
      await socket._triggerEvent('typing:start', { recipientId: TEST_USER_ID_2 });
      await socket._triggerEvent('typing:start', { recipientId: TEST_USER_ID_2 });

      // Both calls should emit to the recipient
      expect(io.to).toHaveBeenCalledWith(`user:${TEST_USER_ID_2}`);
    });
  });

  // ========================================================================
  // 5. message:mark_read event
  // ========================================================================
  describe('message:mark_read', () => {
    let socket: ReturnType<typeof createMockSocket>;

    beforeEach(async () => {
      const token = generateTestAccessToken(TEST_USER_ID);
      socket = createMockSocket({
        handshake: { auth: { token }, headers: {} },
      });
      await io._runMiddleware(socket);
      io._triggerConnection(socket);
      jest.clearAllMocks();
    });

    it('should mark a message as read and notify sender', async () => {
      const { prisma } = require('../src/utils/prisma');
      const fakeMessage = {
        id: 'msg-100',
        senderId: TEST_USER_ID_2,
        receiverId: TEST_USER_ID,
        chatId: null,
        read: false,
        readAt: null,
      };

      prisma.message.findUnique.mockResolvedValueOnce(fakeMessage);
      prisma.message.update.mockResolvedValueOnce({
        ...fakeMessage,
        read: true,
        readAt: new Date(),
      });

      await socket._triggerEvent('message:mark_read', { messageId: 'msg-100' });

      // Should update the message in DB
      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'msg-100' },
          data: expect.objectContaining({ read: true }),
        }),
      );

      // Should notify the sender via io.to()
      expect(io.to).toHaveBeenCalledWith(`user:${TEST_USER_ID_2}`);
      expect(io._toEmit).toHaveBeenCalledWith(
        'message:read',
        expect.objectContaining({
          readBy: TEST_USER_ID,
          messageIds: ['msg-100'],
        }),
      );

      // Should confirm to the reader
      expect(socket.emit).toHaveBeenCalledWith(
        'message:read_confirmed',
        expect.objectContaining({ messageId: 'msg-100' }),
      );
    });

    it('should emit error when the receiver does not own the message', async () => {
      const { prisma } = require('../src/utils/prisma');
      // Message belongs to someone else
      prisma.message.findUnique.mockResolvedValueOnce({
        id: 'msg-101',
        senderId: 'other-user',
        receiverId: 'another-user',
        read: false,
      });

      await socket._triggerEvent('message:mark_read', { messageId: 'msg-101' });

      expect(socket.emit).toHaveBeenCalledWith('error', {
        message: 'Not authorized to mark this message as read',
      });
    });

    it('should return read_confirmed without updating when message is already read', async () => {
      const { prisma } = require('../src/utils/prisma');
      const readAt = new Date('2026-01-15T12:00:00Z');
      prisma.message.findUnique.mockResolvedValueOnce({
        id: 'msg-102',
        senderId: TEST_USER_ID_2,
        receiverId: TEST_USER_ID,
        read: true,
        readAt,
      });

      await socket._triggerEvent('message:mark_read', { messageId: 'msg-102' });

      // Should NOT call update
      expect(prisma.message.update).not.toHaveBeenCalled();

      // Should still confirm
      expect(socket.emit).toHaveBeenCalledWith(
        'message:read_confirmed',
        expect.objectContaining({ messageId: 'msg-102' }),
      );
    });

    it('should emit error when message is not found', async () => {
      const { prisma } = require('../src/utils/prisma');
      prisma.message.findUnique.mockResolvedValueOnce(null);

      await socket._triggerEvent('message:mark_read', { messageId: 'nonexistent' });

      expect(socket.emit).toHaveBeenCalledWith('error', {
        message: 'Not authorized to mark this message as read',
      });
    });

    it('should emit error when database operation fails', async () => {
      const { prisma } = require('../src/utils/prisma');
      prisma.message.findUnique.mockRejectedValueOnce(new Error('DB error'));

      await socket._triggerEvent('message:mark_read', { messageId: 'msg-103' });

      expect(socket.emit).toHaveBeenCalledWith('error', {
        message: 'Failed to mark message as read',
      });
    });
  });

  // ========================================================================
  // 6. Disconnect cleanup
  // ========================================================================
  describe('disconnect', () => {
    it('should remove socket from online users and broadcast user_offline when last connection closes', async () => {
      const token = generateTestAccessToken(TEST_USER_ID);
      const socket = createMockSocket({
        id: 'socket-disconnect-test',
        handshake: { auth: { token }, headers: {} },
      });

      await io._runMiddleware(socket);
      io._triggerConnection(socket);

      // Clear mocks set during connection
      jest.clearAllMocks();

      // Trigger disconnect
      await socket._triggerEvent('disconnect');

      // Should broadcast user_offline to remaining clients
      expect(socket.broadcast.emit).toHaveBeenCalledWith(
        'user_offline',
        expect.objectContaining({ userId: TEST_USER_ID }),
      );
    });

    it('should NOT broadcast user_offline when the user still has other active connections', async () => {
      const token = generateTestAccessToken(TEST_USER_ID);

      // First connection
      const socket1 = createMockSocket({
        id: 'socket-multi-1',
        handshake: { auth: { token }, headers: {} },
      });
      await io._runMiddleware(socket1);
      io._triggerConnection(socket1);

      // Second connection (same user)
      const socket2 = createMockSocket({
        id: 'socket-multi-2',
        handshake: { auth: { token }, headers: {} },
      });
      await io._runMiddleware(socket2);
      io._triggerConnection(socket2);

      jest.clearAllMocks();

      // Disconnect first socket -- user still has socket2 active
      await socket1._triggerEvent('disconnect');

      // Should NOT broadcast user_offline
      expect(socket1.broadcast.emit).not.toHaveBeenCalledWith(
        'user_offline',
        expect.anything(),
      );
    });

    it('should clean up chat typing indicators on disconnect', async () => {
      const token = generateTestAccessToken(TEST_USER_ID);
      const socket = createMockSocket({
        id: 'socket-typing-cleanup',
        handshake: { auth: { token }, headers: {} },
      });

      await io._runMiddleware(socket);
      io._triggerConnection(socket);

      // Start typing to another user
      await socket._triggerEvent('typing:start', { recipientId: TEST_USER_ID_2 });

      jest.clearAllMocks();

      // Disconnect -- typing should be cleaned up and recipient notified
      await socket._triggerEvent('disconnect');

      // Should notify recipient that user stopped typing
      expect(io.to).toHaveBeenCalledWith(`user:${TEST_USER_ID_2}`);
      expect(io._toEmit).toHaveBeenCalledWith('typing:status', {
        userId: TEST_USER_ID,
        isTyping: false,
      });
    });
  });

  // ========================================================================
  // 7. Additional event handlers
  // ========================================================================
  describe('join_chat / leave_chat', () => {
    let socket: ReturnType<typeof createMockSocket>;

    beforeEach(async () => {
      const token = generateTestAccessToken(TEST_USER_ID);
      socket = createMockSocket({
        handshake: { auth: { token }, headers: {} },
      });
      await io._runMiddleware(socket);
      io._triggerConnection(socket);
      jest.clearAllMocks();
    });

    it('should join the chat room on join_chat', async () => {
      await socket._triggerEvent('join_chat', 'chat-room-001');
      expect(socket.join).toHaveBeenCalledWith('chat:chat-room-001');
    });

    it('should leave the chat room on leave_chat', async () => {
      await socket._triggerEvent('leave_chat', 'chat-room-001');
      expect(socket.leave).toHaveBeenCalledWith('chat:chat-room-001');
    });
  });

  describe('subscribe_post / unsubscribe_post', () => {
    let socket: ReturnType<typeof createMockSocket>;

    beforeEach(async () => {
      const token = generateTestAccessToken(TEST_USER_ID);
      socket = createMockSocket({
        handshake: { auth: { token }, headers: {} },
      });
      await io._runMiddleware(socket);
      io._triggerConnection(socket);
      jest.clearAllMocks();
    });

    it('should join the post room on subscribe_post', async () => {
      await socket._triggerEvent('subscribe_post', 'post-001');
      expect(socket.join).toHaveBeenCalledWith('post:post-001');
    });

    it('should leave the post room on unsubscribe_post', async () => {
      await socket._triggerEvent('unsubscribe_post', 'post-001');
      expect(socket.leave).toHaveBeenCalledWith('post:post-001');
    });
  });

  describe('check_online_status', () => {
    let socket: ReturnType<typeof createMockSocket>;

    beforeEach(async () => {
      const token = generateTestAccessToken(TEST_USER_ID);
      socket = createMockSocket({
        handshake: { auth: { token }, headers: {} },
      });
      await io._runMiddleware(socket);
      io._triggerConnection(socket);
      jest.clearAllMocks();
    });

    it('should respond with online status for requested user IDs', async () => {
      await socket._triggerEvent('check_online_status', [TEST_USER_ID, 'unknown-user']);

      expect(socket.emit).toHaveBeenCalledWith(
        'online_status_response',
        expect.objectContaining({
          statuses: expect.arrayContaining([
            expect.objectContaining({ userId: TEST_USER_ID, isOnline: true }),
            expect.objectContaining({ userId: 'unknown-user', isOnline: false }),
          ]),
        }),
      );
    });
  });

  describe('legacy typing event', () => {
    let socket: ReturnType<typeof createMockSocket>;

    beforeEach(async () => {
      const token = generateTestAccessToken(TEST_USER_ID);
      socket = createMockSocket({
        handshake: { auth: { token }, headers: {} },
      });
      await io._runMiddleware(socket);
      io._triggerConnection(socket);
      jest.clearAllMocks();
    });

    it('should relay typing indicator to recipient via socket.to()', async () => {
      const toEmit = jest.fn();
      socket.to.mockReturnValue({ emit: toEmit });

      await socket._triggerEvent('typing', {
        recipientId: TEST_USER_ID_2,
        isTyping: true,
      });

      expect(socket.to).toHaveBeenCalledWith(`user:${TEST_USER_ID_2}`);
      expect(toEmit).toHaveBeenCalledWith('user_typing', {
        userId: TEST_USER_ID,
        isTyping: true,
      });
    });
  });

  describe('conversation:mark_read', () => {
    let socket: ReturnType<typeof createMockSocket>;

    beforeEach(async () => {
      const token = generateTestAccessToken(TEST_USER_ID);
      socket = createMockSocket({
        handshake: { auth: { token }, headers: {} },
      });
      await io._runMiddleware(socket);
      io._triggerConnection(socket);
      jest.clearAllMocks();
    });

    it('should mark all messages from a partner as read and notify them', async () => {
      const { prisma } = require('../src/utils/prisma');

      prisma.message.updateMany.mockResolvedValueOnce({ count: 3 });
      prisma.message.findMany.mockResolvedValueOnce([
        { id: 'msg-a' },
        { id: 'msg-b' },
        { id: 'msg-c' },
      ]);

      await socket._triggerEvent('conversation:mark_read', {
        conversationPartnerId: TEST_USER_ID_2,
      });

      // Should update unread messages
      expect(prisma.message.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            senderId: TEST_USER_ID_2,
            receiverId: TEST_USER_ID,
            read: false,
          }),
        }),
      );

      // Should notify the conversation partner
      expect(io.to).toHaveBeenCalledWith(`user:${TEST_USER_ID_2}`);
      expect(io._toEmit).toHaveBeenCalledWith(
        'message:read',
        expect.objectContaining({
          readBy: TEST_USER_ID,
          messageIds: ['msg-a', 'msg-b', 'msg-c'],
        }),
      );

      // Should confirm to the reader
      expect(socket.emit).toHaveBeenCalledWith(
        'conversation:read_confirmed',
        expect.objectContaining({
          conversationPartnerId: TEST_USER_ID_2,
          count: 3,
        }),
      );
    });

    it('should do nothing when there are no unread messages', async () => {
      const { prisma } = require('../src/utils/prisma');
      prisma.message.updateMany.mockResolvedValueOnce({ count: 0 });

      await socket._triggerEvent('conversation:mark_read', {
        conversationPartnerId: TEST_USER_ID_2,
      });

      // Should NOT notify anyone since count is 0
      expect(socket.emit).not.toHaveBeenCalledWith(
        'conversation:read_confirmed',
        expect.anything(),
      );
    });

    it('should emit error when database operation fails', async () => {
      const { prisma } = require('../src/utils/prisma');
      prisma.message.updateMany.mockRejectedValueOnce(new Error('DB error'));

      await socket._triggerEvent('conversation:mark_read', {
        conversationPartnerId: TEST_USER_ID_2,
      });

      expect(socket.emit).toHaveBeenCalledWith('error', {
        message: 'Failed to mark conversation as read',
      });
    });
  });
});
