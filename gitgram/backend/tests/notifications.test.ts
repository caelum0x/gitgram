import request from 'supertest';
import { createApp } from '../src/index';
import { mockPrisma } from './setup';
import { testFixtures } from './fixtures';
import { generateTestAccessToken, authHeader, TEST_USER_ID } from './helpers';

// Mock the notificationService functions used by the controller
jest.mock('../src/services/notificationService', () => ({
  markNotificationsAsRead: jest.fn().mockResolvedValue(3),
  getUnreadCount: jest.fn().mockResolvedValue(5),
  createNotification: jest.fn(),
}));

// Mock websocket
jest.mock('../src/websocket/socket', () => ({
  initializeSocket: jest.fn(),
  isUserOnline: jest.fn().mockReturnValue(false),
  emitToUser: jest.fn(),
}));

import {
  markNotificationsAsRead,
  getUnreadCount,
} from '../src/services/notificationService';

const mockedMarkAsRead = markNotificationsAsRead as jest.MockedFunction<typeof markNotificationsAsRead>;
const mockedGetUnreadCount = getUnreadCount as jest.MockedFunction<typeof getUnreadCount>;

describe('Notifications API', () => {
  const app = createApp();
  let token: string;

  beforeEach(() => {
    token = generateTestAccessToken(TEST_USER_ID);
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.post.findMany.mockResolvedValue([]);
  });

  // =========================================================================
  // GET /api/v1/notifications
  // =========================================================================
  describe('GET /api/v1/notifications', () => {
    it('should return paginated notifications', async () => {
      const now = new Date();
      const mockNotifications = [
        {
          id: 'notif-1',
          userId: TEST_USER_ID,
          type: 'LIKE',
          actorId: 'actor-1',
          postId: 'post-1',
          content: 'User liked your post',
          read: false,
          createdAt: now,
        },
        {
          id: 'notif-2',
          userId: TEST_USER_ID,
          type: 'COMMENT',
          actorId: null,
          postId: null,
          content: 'User commented on your post',
          read: true,
          createdAt: now,
        },
      ];

      mockPrisma.notification.findMany.mockResolvedValue(mockNotifications);
      mockPrisma.notification.count.mockResolvedValue(2);
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 'actor-1',
          username: 'alice',
          avatar: 'https://example.com/alice.png',
          displayName: 'Alice',
        },
      ]);
      mockPrisma.post.findMany.mockResolvedValue([
        {
          id: 'post-1',
          mediaUrls: ['https://example.com/post.jpg'],
          content: 'Hello world',
        },
      ]);

      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('notifications');
      expect(res.body).toHaveProperty('pagination');
      expect(res.body.notifications).toHaveLength(2);
      expect(res.body.notifications[0]).toMatchObject({
        title: 'New Like',
        body: 'User liked your post',
        user: {
          id: 'actor-1',
          username: 'alice',
        },
        post: {
          id: 'post-1',
          mediaUrl: 'https://example.com/post.jpg',
        },
      });
      expect(res.body.pagination).toHaveProperty('page', 1);
      expect(res.body.pagination).toHaveProperty('total', 2);
    });

    it('should support pagination parameters', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);
      mockPrisma.notification.count.mockResolvedValue(0);

      const res = await request(app)
        .get('/api/v1/notifications')
        .query({ page: 2, limit: 10 })
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.pagination).toHaveProperty('page', 2);
      expect(res.body.pagination).toHaveProperty('limit', 10);
    });

    it('should filter to unread-only when requested', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);
      mockPrisma.notification.count.mockResolvedValue(0);

      const res = await request(app)
        .get('/api/v1/notifications')
        .query({ unreadOnly: 'true' })
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      // Verify that findMany was called with read: false filter
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: TEST_USER_ID, read: false }),
        })
      );
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/v1/notifications');
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // GET /api/v1/notifications/:id
  // =========================================================================
  describe('GET /api/v1/notifications/:id', () => {
    it('should return one enriched notification', async () => {
      const now = new Date();
      mockPrisma.notification.findFirst.mockResolvedValue({
        id: 'notif-1',
        userId: TEST_USER_ID,
        type: 'FOLLOW',
        actorId: 'actor-2',
        postId: null,
        content: 'bob started following you',
        read: false,
        createdAt: now,
      });
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 'actor-2',
          username: 'bob',
          avatar: null,
          displayName: 'Bob',
        },
      ]);

      const res = await request(app)
        .get('/api/v1/notifications/notif-1')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.notification).toMatchObject({
        id: 'notif-1',
        title: 'New Follower',
        body: 'bob started following you',
        user: {
          id: 'actor-2',
          username: 'bob',
        },
      });
    });

    it('should return 404 when the notification does not exist', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/notifications/missing')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // PUT /api/v1/notifications/read
  // =========================================================================
  describe('PUT /api/v1/notifications/read', () => {
    it('should mark specific notifications as read', async () => {
      mockedMarkAsRead.mockResolvedValue(2);

      const res = await request(app)
        .put('/api/v1/notifications/read')
        .set('Authorization', authHeader(token))
        .send({
          notificationIds: ['notif-1', 'notif-2'],
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'Notifications marked as read');
      expect(res.body).toHaveProperty('count', 2);
    });

    it('should mark all notifications as read when no IDs provided', async () => {
      mockedMarkAsRead.mockResolvedValue(10);

      const res = await request(app)
        .put('/api/v1/notifications/read')
        .set('Authorization', authHeader(token))
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'Notifications marked as read');
      expect(res.body).toHaveProperty('count', 10);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .put('/api/v1/notifications/read')
        .send({ notificationIds: ['notif-1'] });
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // GET /api/v1/notifications/unread/count
  // =========================================================================
  describe('GET /api/v1/notifications/unread/count', () => {
    it('should return the unread notification count', async () => {
      mockedGetUnreadCount.mockResolvedValue(7);

      const res = await request(app)
        .get('/api/v1/notifications/unread/count')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('count', 7);
    });

    it('should return zero when no unread notifications', async () => {
      mockedGetUnreadCount.mockResolvedValue(0);

      const res = await request(app)
        .get('/api/v1/notifications/unread/count')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('count', 0);
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/v1/notifications/unread/count');
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // DELETE /api/v1/notifications/:id
  // =========================================================================
  describe('DELETE /api/v1/notifications/:id', () => {
    it('should delete a notification', async () => {
      mockPrisma.notification.delete.mockResolvedValue({
        id: 'notif-1',
        userId: TEST_USER_ID,
      });

      const res = await request(app)
        .delete('/api/v1/notifications/notif-1')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'Notification deleted');
    });

    it('should call delete with userId ownership check', async () => {
      mockPrisma.notification.delete.mockResolvedValue({ id: 'notif-1' });

      await request(app)
        .delete('/api/v1/notifications/notif-1')
        .set('Authorization', authHeader(token));

      expect(mockPrisma.notification.delete).toHaveBeenCalledWith({
        where: {
          id: 'notif-1',
          userId: TEST_USER_ID,
        },
      });
    });

    it('should return 500 if notification does not exist', async () => {
      mockPrisma.notification.delete.mockRejectedValue(
        new Error('Record not found')
      );

      const res = await request(app)
        .delete('/api/v1/notifications/nonexistent')
        .set('Authorization', authHeader(token));

      expect(res.status).toBe(500);
    });

    it('should require authentication', async () => {
      const res = await request(app).delete('/api/v1/notifications/notif-1');
      expect(res.status).toBe(401);
    });
  });
});
