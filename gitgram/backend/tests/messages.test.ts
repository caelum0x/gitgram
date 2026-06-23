import request from 'supertest';
import { createApp } from '../src/index';
import { mockPrisma } from './setup';
import { testFixtures } from './fixtures';
import { generateTestAccessToken, authHeader, TEST_USER_ID, TEST_USER_ID_2 } from './helpers';

// Mock blockService
jest.mock('../src/services/blockService', () => ({
  blockService: {
    hasBlockRelationship: jest.fn().mockResolvedValue(false),
    getAllBlockedIds: jest.fn().mockResolvedValue([]),
    isBlocked: jest.fn().mockResolvedValue(false),
  },
}));

// Mock websocket
jest.mock('../src/websocket/socket', () => ({
  initializeSocket: jest.fn(),
  isUserOnline: jest.fn().mockReturnValue(false),
  emitToUser: jest.fn(),
}));

import { blockService } from '../src/services/blockService';

const mockedBlockService = blockService as jest.Mocked<typeof blockService>;
const getResponseMessage = (body: any) =>
  body.error?.message ?? body.details?.[0]?.msg ?? body.error ?? body.message;

// Helper to create mock Prisma model (mirrors setup.ts)
const createMockPrismaModel = () => ({
  findUnique: jest.fn().mockResolvedValue(null),
  findFirst: jest.fn().mockResolvedValue(null),
  findMany: jest.fn().mockResolvedValue([]),
  create: jest.fn().mockImplementation(({ data }: any) =>
    Promise.resolve({ id: `mock-${Date.now()}`, ...data, createdAt: new Date(), updatedAt: new Date() })
  ),
  createMany: jest.fn().mockResolvedValue({ count: 0 }),
  update: jest.fn().mockImplementation(({ data }: any) =>
    Promise.resolve({ id: 'mock-id', ...data, updatedAt: new Date() })
  ),
  updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  upsert: jest.fn().mockImplementation(({ create }: any) =>
    Promise.resolve({ id: `mock-${Date.now()}`, ...create, createdAt: new Date(), updatedAt: new Date() })
  ),
  delete: jest.fn().mockResolvedValue({ id: 'mock-id' }),
  deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  count: jest.fn().mockResolvedValue(0),
  aggregate: jest.fn().mockResolvedValue({ _count: { id: 0 } }),
  groupBy: jest.fn().mockResolvedValue([]),
});

// Ensure models used by messageController exist on mockPrisma
if (!mockPrisma.chat) mockPrisma.chat = createMockPrismaModel();
if (!mockPrisma.chatMember) mockPrisma.chatMember = createMockPrismaModel();
if (!mockPrisma.moderationLog) mockPrisma.moderationLog = createMockPrismaModel();

describe('Messages API', () => {
  const app = createApp();
  let token: string;

  beforeEach(() => {
    token = generateTestAccessToken(TEST_USER_ID);
    // Reset block service defaults
    (mockedBlockService.hasBlockRelationship as jest.Mock).mockResolvedValue(false);
    (mockedBlockService.getAllBlockedIds as jest.Mock).mockResolvedValue([]);
  });

  // =========================================================================
  // GET /api/v1/messages/conversations
  // =========================================================================
  describe('GET /api/v1/messages/conversations', () => {
    it('should return a list of conversations', async () => {
      const now = new Date();
      const mockMessages = [
        {
          id: 'msg-1',
          senderId: TEST_USER_ID,
          receiverId: TEST_USER_ID_2,
          content: 'Hello!',
          read: false,
          readAt: null,
          deliveredAt: null,
          createdAt: now,
          sender: { id: TEST_USER_ID, username: 'testuser', avatar: null },
          receiver: { id: TEST_USER_ID_2, username: 'testuser2', avatar: null },
        },
      ];

      mockPrisma.message.findMany.mockResolvedValue(mockMessages);
      mockPrisma.message.groupBy.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/messages/conversations')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/v1/messages/conversations');
      expect(res.status).toBe(401);
    });

    it('should exclude conversations with blocked users', async () => {
      const blockedUserId = 'blocked-user-id';
      (mockedBlockService.getAllBlockedIds as jest.Mock).mockResolvedValue([blockedUserId]);

      const now = new Date();
      const mockMessages = [
        {
          id: 'msg-1',
          senderId: blockedUserId,
          receiverId: TEST_USER_ID,
          content: 'Blocked message',
          read: false,
          readAt: null,
          deliveredAt: null,
          createdAt: now,
          sender: { id: blockedUserId, username: 'blockeduser', avatar: null },
          receiver: { id: TEST_USER_ID, username: 'testuser', avatar: null },
        },
      ];

      mockPrisma.message.findMany.mockResolvedValue(mockMessages);
      mockPrisma.message.groupBy.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/messages/conversations')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      // The blocked user's conversation should be filtered out
      expect(res.body).toHaveLength(0);
    });
  });

  // =========================================================================
  // POST /api/v1/messages
  // =========================================================================
  describe('POST /api/v1/messages', () => {
    it('should send a message successfully', async () => {
      const now = new Date();
      const mockMessage = {
        id: 'msg-new',
        senderId: TEST_USER_ID,
        receiverId: TEST_USER_ID_2,
        content: 'Hello there!',
        mediaUrl: null,
        chatId: null,
        read: false,
        readAt: null,
        deliveredAt: null,
        createdAt: now,
        sender: { id: TEST_USER_ID, username: 'testuser', avatar: null },
        receiver: { id: TEST_USER_ID_2, username: 'testuser2', avatar: null },
      };

      mockPrisma.message.create.mockResolvedValue(mockMessage);

      const res = await request(app)
        .post('/api/v1/messages')
        .set('Authorization', authHeader(token))
        .send({
          receiverId: TEST_USER_ID_2,
          content: 'Hello there!',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('senderId', TEST_USER_ID);
      expect(res.body).toHaveProperty('content', 'Hello there!');
      expect(res.body).toHaveProperty('status', 'sent');
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/v1/messages')
        .send({ receiverId: TEST_USER_ID_2, content: 'Hello' });

      expect(res.status).toBe(401);
    });

    it('should return 403 when sending to a blocked user', async () => {
      (mockedBlockService.hasBlockRelationship as jest.Mock).mockResolvedValue(true);

      const res = await request(app)
        .post('/api/v1/messages')
        .set('Authorization', authHeader(token))
        .send({
          receiverId: TEST_USER_ID_2,
          content: 'Hello',
        });

      expect(res.status).toBe(403);
      expect(getResponseMessage(res.body)).toBe('Cannot send message to this user');
    });
  });

  // =========================================================================
  // GET /api/v1/messages/:otherUserId
  // =========================================================================
  describe('GET /api/v1/messages/:otherUserId', () => {
    it('should return messages between two users', async () => {
      const now = new Date();
      const mockMessages = [
        {
          id: 'msg-1',
          senderId: TEST_USER_ID,
          receiverId: TEST_USER_ID_2,
          content: 'Hi',
          read: false,
          readAt: null,
          deliveredAt: null,
          createdAt: now,
          sender: { id: TEST_USER_ID, username: 'testuser', avatar: null },
        },
        {
          id: 'msg-2',
          senderId: TEST_USER_ID_2,
          receiverId: TEST_USER_ID,
          content: 'Hello',
          read: true,
          readAt: now,
          deliveredAt: now,
          createdAt: now,
          sender: { id: TEST_USER_ID_2, username: 'testuser2', avatar: null },
        },
      ];

      mockPrisma.message.findMany.mockResolvedValue(mockMessages);

      const res = await request(app)
        .get(`/api/v1/messages/${TEST_USER_ID_2}`)
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should require authentication', async () => {
      const res = await request(app).get(`/api/v1/messages/${TEST_USER_ID_2}`);
      expect(res.status).toBe(401);
    });

    it('should return 403 if user is blocked', async () => {
      (mockedBlockService.hasBlockRelationship as jest.Mock).mockResolvedValue(true);

      const res = await request(app)
        .get(`/api/v1/messages/${TEST_USER_ID_2}`)
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(403);
      expect(getResponseMessage(res.body)).toBe('Cannot access messages with this user');
    });
  });

  // =========================================================================
  // PUT /api/v1/messages/:otherUserId/read  (legacy markAsRead)
  // =========================================================================
  describe('PUT /api/v1/messages/:otherUserId/read', () => {
    it('should mark messages from a user as read', async () => {
      mockPrisma.message.updateMany.mockResolvedValue({ count: 3 });
      mockPrisma.message.findMany.mockResolvedValue([]);

      const res = await request(app)
        .put(`/api/v1/messages/${TEST_USER_ID_2}/read`)
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'Messages marked as read');
      expect(res.body).toHaveProperty('count', 3);
      expect(res.body).toHaveProperty('readAt');
    });

    it('should require authentication', async () => {
      const res = await request(app).put(`/api/v1/messages/${TEST_USER_ID_2}/read`);
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // POST /api/v1/messages/:id/read  (mark single message as read)
  // =========================================================================
  describe('POST /api/v1/messages/:id/read', () => {
    it('should mark a specific message as read', async () => {
      const now = new Date();
      const mockMessage = {
        id: 'msg-1',
        senderId: TEST_USER_ID_2,
        receiverId: TEST_USER_ID,
        content: 'Hello',
        read: false,
        readAt: null,
        chatId: null,
        createdAt: now,
      };

      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.message.update.mockResolvedValue({
        ...mockMessage,
        read: true,
        readAt: now,
        sender: { id: TEST_USER_ID_2, username: 'testuser2', avatar: null },
        receiver: { id: TEST_USER_ID, username: 'testuser', avatar: null },
      });

      const res = await request(app)
        .post('/api/v1/messages/msg-1/read')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'Message marked as read');
      expect(res.body).toHaveProperty('readAt');
    });

    it('should return 404 for non-existent message', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/messages/nonexistent/read')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(404);
    });

    it('should return 403 if user is not the receiver', async () => {
      const mockMessage = {
        id: 'msg-1',
        senderId: 'other-user',
        receiverId: 'another-user',
        content: 'Hello',
        read: false,
        readAt: null,
        chatId: null,
        createdAt: new Date(),
      };

      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);

      const res = await request(app)
        .post('/api/v1/messages/msg-1/read')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // DELETE /api/v1/messages/:messageId
  // =========================================================================
  describe('DELETE /api/v1/messages/:messageId', () => {
    it('should soft-delete a message for sender', async () => {
      const mockMessage = {
        id: 'msg-1',
        senderId: TEST_USER_ID,
        receiverId: TEST_USER_ID_2,
        content: 'To delete',
        createdAt: new Date(),
      };

      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.message.update.mockResolvedValue({ ...mockMessage, deletedForSender: true });

      const res = await request(app)
        .delete('/api/v1/messages/msg-1')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'Message deleted');
    });

    it('should hard-delete a message when forEveryone=true and message is recent', async () => {
      const mockMessage = {
        id: 'msg-1',
        senderId: TEST_USER_ID,
        receiverId: TEST_USER_ID_2,
        chatId: null,
        content: 'To delete',
        createdAt: new Date(), // Recent message
      };

      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.message.delete.mockResolvedValue(mockMessage);

      const res = await request(app)
        .delete('/api/v1/messages/msg-1?forEveryone=true')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'Message deleted for everyone');
    });

    it('should return 404 for non-existent message', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .delete('/api/v1/messages/nonexistent')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(404);
    });

    it('should return 403 if user is not the sender', async () => {
      const mockMessage = {
        id: 'msg-1',
        senderId: TEST_USER_ID_2,
        receiverId: TEST_USER_ID,
        content: 'Not mine',
        createdAt: new Date(),
      };

      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);

      const res = await request(app)
        .delete('/api/v1/messages/msg-1')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(403);
    });

    it('should return 400 when trying to delete old message for everyone', async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const mockMessage = {
        id: 'msg-1',
        senderId: TEST_USER_ID,
        receiverId: TEST_USER_ID_2,
        content: 'Old message',
        createdAt: twoHoursAgo,
      };

      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);

      const res = await request(app)
        .delete('/api/v1/messages/msg-1?forEveryone=true')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(400);
      expect(getResponseMessage(res.body)).toBe('Message is too old to delete for everyone');
    });

    it('should require authentication', async () => {
      const res = await request(app).delete('/api/v1/messages/msg-1');
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // POST /api/v1/messages/chats  (create group chat)
  // =========================================================================
  describe('POST /api/v1/messages/chats', () => {
    it('should create a group chat', async () => {
      const mockChat = {
        id: 'chat-1',
        name: 'Dev Group',
        isGroup: true,
        members: [
          { userId: TEST_USER_ID, role: 'ADMIN' },
          { userId: TEST_USER_ID_2, role: 'MEMBER' },
        ],
        createdAt: new Date(),
      };

      mockPrisma.chat.create.mockResolvedValue(mockChat);

      const res = await request(app)
        .post('/api/v1/messages/chats')
        .set('Authorization', authHeader(token))
        .send({
          name: 'Dev Group',
          memberIds: [TEST_USER_ID_2],
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('name', 'Dev Group');
      expect(res.body).toHaveProperty('isGroup', true);
      expect(res.body.members).toHaveLength(2);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/v1/messages/chats')
        .send({ name: 'Group', memberIds: [TEST_USER_ID_2] });

      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // GET /api/v1/messages/unread/count
  // =========================================================================
  describe('GET /api/v1/messages/unread/count', () => {
    it('should return unread message count', async () => {
      mockPrisma.message.count.mockResolvedValue(5);

      const res = await request(app)
        .get('/api/v1/messages/unread/count')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('unreadCount', 5);
    });

    it('should return zero when no unread messages', async () => {
      mockPrisma.message.count.mockResolvedValue(0);

      const res = await request(app)
        .get('/api/v1/messages/unread/count')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('unreadCount', 0);
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/v1/messages/unread/count');
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // PUT /api/v1/messages/:messageId  (edit message)
  // =========================================================================
  describe('PUT /api/v1/messages/:messageId', () => {
    it('should edit a message successfully', async () => {
      const now = new Date();
      const mockMessage = {
        id: 'msg-1',
        senderId: TEST_USER_ID,
        receiverId: TEST_USER_ID_2,
        chatId: null,
        content: 'Original content',
        createdAt: now,
      };

      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.message.update.mockResolvedValue({
        ...mockMessage,
        content: 'Updated content',
        editedAt: now,
        sender: { id: TEST_USER_ID, username: 'testuser', avatar: null },
        receiver: { id: TEST_USER_ID_2, username: 'testuser2', avatar: null },
      });

      const res = await request(app)
        .put('/api/v1/messages/msg-1')
        .set('Authorization', authHeader(token))
        .send({ content: 'Updated content' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('content', 'Updated content');
    });

    it('should return 400 when content is empty', async () => {
      const res = await request(app)
        .put('/api/v1/messages/msg-1')
        .set('Authorization', authHeader(token))
        .send({ content: '' });

      expect(res.status).toBe(400);
      expect(getResponseMessage(res.body)).toBe('Content is required');
    });

    it('should return 404 for non-existent message', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .put('/api/v1/messages/nonexistent')
        .set('Authorization', authHeader(token))
        .send({ content: 'Updated' });

      expect(res.status).toBe(404);
    });

    it('should return 403 if user is not the sender', async () => {
      const mockMessage = {
        id: 'msg-1',
        senderId: TEST_USER_ID_2,
        receiverId: TEST_USER_ID,
        content: 'Not mine',
        createdAt: new Date(),
      };

      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);

      const res = await request(app)
        .put('/api/v1/messages/msg-1')
        .set('Authorization', authHeader(token))
        .send({ content: 'Trying to edit' });

      expect(res.status).toBe(403);
    });

    it('should return 400 when message is too old to edit', async () => {
      const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
      const mockMessage = {
        id: 'msg-1',
        senderId: TEST_USER_ID,
        receiverId: TEST_USER_ID_2,
        content: 'Old message',
        createdAt: twoDaysAgo,
      };

      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);

      const res = await request(app)
        .put('/api/v1/messages/msg-1')
        .set('Authorization', authHeader(token))
        .send({ content: 'Updated' });

      expect(res.status).toBe(400);
      expect(getResponseMessage(res.body)).toBe('Message is too old to edit');
    });
  });

  // =========================================================================
  // POST /api/v1/messages/conversations/:id/read
  // =========================================================================
  describe('POST /api/v1/messages/conversations/:id/read', () => {
    it('should mark all messages in a conversation as read', async () => {
      mockPrisma.message.updateMany.mockResolvedValue({ count: 5 });
      mockPrisma.message.findMany.mockResolvedValue([
        { id: 'msg-1' },
        { id: 'msg-2' },
      ]);

      const res = await request(app)
        .post(`/api/v1/messages/conversations/${TEST_USER_ID_2}/read`)
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'Conversation marked as read');
      expect(res.body).toHaveProperty('count', 5);
      expect(res.body).toHaveProperty('readAt');
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post(`/api/v1/messages/conversations/${TEST_USER_ID_2}/read`);
      expect(res.status).toBe(401);
    });
  });
});
